import { create } from 'zustand';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  where,
  getDoc
} from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { CostEntry, OrderCostSummary, CostCenterFilter } from '../types/costCenter';
import { useOrderStore } from './orderStore';

interface CostCenterState {
  costs: CostEntry[];
  filteredCosts: CostEntry[];
  orderSummaries: OrderCostSummary[];
  loading: boolean;
  error: string | null;
  currentFilter: CostCenterFilter;
  loadCosts: () => Promise<void>;
  addCost: (cost: Omit<CostEntry, 'id'>) => Promise<string>;
  updateCost: (cost: CostEntry) => Promise<void>;
  deleteCost: (costId: string) => Promise<void>;
  subscribeToCosts: () => () => void;
  applyFilter: (filter: CostCenterFilter) => void;
  calculateOrderSummaries: () => void;
  getOrderSummary: (orderId: string) => OrderCostSummary | null;
}

export const useCostCenterStore = create<CostCenterState>((set, get) => ({
  costs: [],
  filteredCosts: [],
  orderSummaries: [],
  loading: false,
  error: null,
  currentFilter: {},

  loadCosts: async () => {
    try {
      set({ loading: true, error: null });
      
      // Load all costs
      const costsRef = collection(db, getCompanyCollection('costs'));
      const costsQuery = query(costsRef, orderBy('date', 'desc'));
      const querySnapshot = await getDocs(costsQuery);
      const costs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CostEntry[];
      
      set({ costs, filteredCosts: costs, loading: false });
      
      // Calculate order summaries
      get().calculateOrderSummaries();
    } catch (error) {
      console.error('Error loading costs:', error);
      set({ error: 'Failed to load costs', loading: false });
    }
  },

  addCost: async (costData: Omit<CostEntry, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, getCompanyCollection('costs')), costData);
      
      // Update local state
      set(state => {
        const newCost = { ...costData, id: docRef.id } as CostEntry;
        const costs = [...state.costs, newCost];
        
        // Reapply current filter
        const filteredCosts = applyFilterInternal(costs, state.currentFilter);
        
        return { costs, filteredCosts };
      });
      
      // Recalculate summaries
      get().calculateOrderSummaries();
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding cost:', error);
      set({ error: 'Failed to add cost' });
      throw error;
    }
  },

  updateCost: async (cost: CostEntry) => {
    try {
      const costRef = doc(db, getCompanyCollection('costs'), cost.id);
      
      // Check if document exists
      const costDoc = await getDoc(costRef);
      if (!costDoc.exists()) {
        throw new Error('Cost entry not found');
      }
      
      await updateDoc(costRef, {
        orderId: cost.orderId,
        orderNumber: cost.orderNumber,
        purchaseOrderNumber: cost.purchaseOrderNumber,
        supplierName: cost.supplierName,
        description: cost.description,
        category: cost.category,
        amount: cost.amount,
        date: cost.date,
        notes: cost.notes || '',
        attachmentUrl: cost.attachmentUrl || ''
      });
      
      // Update local state
      set(state => {
        const costs = state.costs.map(c => c.id === cost.id ? cost : c);
        
        // Reapply current filter
        const filteredCosts = applyFilterInternal(costs, state.currentFilter);
        
        return { costs, filteredCosts };
      });
      
      // Recalculate summaries
      get().calculateOrderSummaries();
      
    } catch (error) {
      console.error('Error updating cost:', error);
      set({ error: 'Failed to update cost' });
      throw error;
    }
  },

  deleteCost: async (costId: string) => {
    try {
      await deleteDoc(doc(db, getCompanyCollection('costs'), costId));
      
      // Update local state
      set(state => {
        const costs = state.costs.filter(c => c.id !== costId);
        
        // Reapply current filter
        const filteredCosts = applyFilterInternal(costs, state.currentFilter);
        
        return { costs, filteredCosts };
      });
      
      // Recalculate summaries
      get().calculateOrderSummaries();
      
    } catch (error) {
      console.error('Error deleting cost:', error);
      set({ error: 'Failed to delete cost' });
      throw error;
    }
  },

  subscribeToCosts: () => {
    try {
      const costsRef = collection(db, getCompanyCollection('costs'));
      const costsQuery = query(costsRef, orderBy('date', 'desc'));
      
      const unsubscribe = onSnapshot(costsQuery, (snapshot) => {
        const costs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CostEntry[];
        
        set(state => {
          // Reapply current filter
          const filteredCosts = applyFilterInternal(costs, state.currentFilter);
          
          return { costs, filteredCosts, loading: false };
        });
        
        // Calculate order summaries when costs change
        get().calculateOrderSummaries();
        
      }, (error) => {
        console.error('Error in costs subscription:', error);
        set({ error: 'Failed to subscribe to costs', loading: false });
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up costs subscription:', error);
      set({ error: 'Failed to subscribe to costs' });
      return () => {}; // Return empty function as fallback
    }
  },

  applyFilter: (filter: CostCenterFilter) => {
    set(state => {
      // Store the filter and apply it
      const filteredCosts = applyFilterInternal(state.costs, filter);
      return { filteredCosts, currentFilter: filter };
    });
  },

  calculateOrderSummaries: () => {
    const { costs } = get();
    const { orders } = useOrderStore.getState();
    
    // Get all unique order IDs
    const orderIds = [...new Set(costs.map(cost => cost.orderId))];
    
    // Calculate summary for each order
    const summaries: OrderCostSummary[] = orderIds.map(orderId => {
      // Get all costs for this order
      const orderCosts = costs.filter(cost => cost.orderId === orderId);
      
      // Find the corresponding order
      const order = orders.find(o => o.id === orderId);
      
      if (!order) {
        // Order not found, create minimal summary
        return {
          orderId,
          orderNumber: orderCosts[0]?.orderNumber || 'Unknown',
          customerName: 'Unknown',
          totalBudget: 0,
          totalSpent: orderCosts.reduce((sum, cost) => sum + cost.amount, 0),
          materialsCost: orderCosts.filter(c => c.category === 'material').reduce((sum, cost) => sum + cost.amount, 0),
          servicesCost: orderCosts.filter(c => c.category === 'service').reduce((sum, cost) => sum + cost.amount, 0),
          laborCost: orderCosts.filter(c => c.category === 'labor').reduce((sum, cost) => sum + cost.amount, 0),
          logisticsCost: orderCosts.filter(c => c.category === 'logistics').reduce((sum, cost) => sum + cost.amount, 0),
          otherCosts: orderCosts.filter(c => c.category === 'other').reduce((sum, cost) => sum + cost.amount, 0),
          margin: 0,
          marginPercentage: 0
        };
      }
      
      // Calculate total budget/revenue from order items
      const totalBudget = order.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      
      // Calculate total spent
      const totalSpent = orderCosts.reduce((sum, cost) => sum + cost.amount, 0);
      
      // Calculate costs by category
      const materialsCost = orderCosts
        .filter(c => c.category === 'material')
        .reduce((sum, cost) => sum + cost.amount, 0);
        
      const servicesCost = orderCosts
        .filter(c => c.category === 'service')
        .reduce((sum, cost) => sum + cost.amount, 0);
        
      const laborCost = orderCosts
        .filter(c => c.category === 'labor')
        .reduce((sum, cost) => sum + cost.amount, 0);
        
      const logisticsCost = orderCosts
        .filter(c => c.category === 'logistics')
        .reduce((sum, cost) => sum + cost.amount, 0);
        
      const otherCosts = orderCosts
        .filter(c => c.category === 'other')
        .reduce((sum, cost) => sum + cost.amount, 0);
      
      // Calculate margin
      const margin = totalBudget - totalSpent;
      const marginPercentage = totalBudget > 0 ? (margin / totalBudget) * 100 : 0;
      
      return {
        orderId,
        orderNumber: order.orderNumber,
        customerName: order.customer,
        totalBudget,
        totalSpent,
        materialsCost,
        servicesCost,
        laborCost,
        logisticsCost,
        otherCosts,
        margin,
        marginPercentage
      };
    });
    
    set({ orderSummaries: summaries });
  },
  
  getOrderSummary: (orderId: string) => {
    const { orderSummaries } = get();
    return orderSummaries.find(summary => summary.orderId === orderId) || null;
  }
}));

// Helper function to apply filters
function applyFilterInternal(costs: CostEntry[], filter: CostCenterFilter): CostEntry[] {
  return costs.filter(cost => {
    // Date from filter
    if (filter.dateFrom && cost.date < filter.dateFrom) {
      return false;
    }
    
    // Date to filter
    if (filter.dateTo && cost.date > filter.dateTo) {
      return false;
    }
    
    // Supplier filter
    if (filter.supplier && cost.supplierName.toLowerCase() !== filter.supplier.toLowerCase()) {
      return false;
    }
    
    // Category filter
    if (filter.category && cost.category !== filter.category) {
      return false;
    }
    
    // Order number filter
    if (filter.orderNumber && !cost.orderNumber.includes(filter.orderNumber)) {
      return false;
    }
    
    return true;
  });
}