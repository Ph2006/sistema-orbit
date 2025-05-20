import { create } from 'zustand';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  onSnapshot, 
  query, 
  where,
  getDoc,
  orderBy
} from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { 
  ProductionOrder, 
  ProductionOrderStatus, 
  POFilterOptions 
} from '../types/productionOrder';
import { useAuthStore } from './authStore';

interface ProductionOrderState {
  orders: ProductionOrder[];
  loading: boolean;
  error: string | null;
  addProductionOrder: (order: Omit<ProductionOrder, 'id'>) => Promise<string>;
  updateProductionOrder: (order: ProductionOrder) => Promise<void>;
  deleteProductionOrder: (id: string) => Promise<void>;
  loadProductionOrders: (orderId?: string) => Promise<void>;
  subscribeToProductionOrders: (orderId?: string) => () => void;
  startProductionOrder: (id: string, startCode: string) => Promise<boolean>;
  completeProductionOrder: (id: string, endCode: string) => Promise<boolean>;
  getProductionOrdersByQRCode: (code: string) => Promise<ProductionOrder | null>;
  applyFilters: (options: POFilterOptions) => void;
  filteredOrders: ProductionOrder[];
  filterOptions: POFilterOptions;
  filterLoading: boolean;
}

export const useProductionOrderStore = create<ProductionOrderState>((set, get) => ({
  orders: [],
  loading: true,
  error: null,
  filteredOrders: [],
  filterOptions: {},
  filterLoading: false,

  addProductionOrder: async (orderData) => {
    try {
      const { user } = useAuthStore.getState();
      const email = user?.email || 'system';

      // Generate unique QR codes
      const startCode = crypto.randomUUID();
      const endCode = crypto.randomUUID();
      
      const timestamp = new Date().toISOString();
      
      const data = {
        ...orderData,
        status: 'pending' as ProductionOrderStatus,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: email,
        startCode,
        endCode,
        actualStartDate: null,
        actualEndDate: null,
        history: [
          {
            action: 'created',
            timestamp,
            user: email
          }
        ]
      };

      const docRef = await addDoc(collection(db, getCompanyCollection('productionOrders')), data);
      
      // Update local state
      set(state => ({
        orders: [...state.orders, { ...data, id: docRef.id }]
      }));

      return docRef.id;
    } catch (error) {
      console.error('Error adding production order:', error);
      set({ error: 'Failed to add production order' });
      throw error;
    }
  },

  updateProductionOrder: async (order) => {
    try {
      const { user } = useAuthStore.getState();
      const email = user?.email || 'system';
      
      // Get the current order to compare changes
      const orderRef = doc(db, getCompanyCollection('productionOrders'), order.id);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        throw new Error('Production order not found');
      }
      
      const currentOrder = orderDoc.data() as ProductionOrder;
      const timestamp = new Date().toISOString();
      
      // Check if status has changed
      const statusChanged = currentOrder.status !== order.status;
      
      // Prepare history entry
      const historyEntry = {
        action: 'updated',
        timestamp,
        user: email,
      } as any;
      
      if (statusChanged) {
        historyEntry.action = 'updated';
        historyEntry.previousStatus = currentOrder.status;
        historyEntry.newStatus = order.status;
        historyEntry.notes = 'Status updated';
      }
      
      // Prepare update data
      const updateData = {
        ...order,
        updatedAt: timestamp,
        history: [...order.history, historyEntry]
      };
      
      await updateDoc(orderRef, updateData);
      
      // Update local state
      set(state => ({
        orders: state.orders.map(o => 
          o.id === order.id ? { ...updateData, id: order.id } : o
        )
      }));

      // Apply filters again to update filtered list
      get().applyFilters(get().filterOptions);
    } catch (error) {
      console.error('Error updating production order:', error);
      set({ error: 'Failed to update production order' });
      throw error;
    }
  },

  deleteProductionOrder: async (id) => {
    try {
      await deleteDoc(doc(db, getCompanyCollection('productionOrders'), id));
      
      // Update local state
      set(state => ({
        orders: state.orders.filter(o => o.id !== id),
        filteredOrders: state.filteredOrders.filter(o => o.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting production order:', error);
      set({ error: 'Failed to delete production order' });
      throw error;
    }
  },

  loadProductionOrders: async (orderId) => {
    try {
      set({ loading: true, error: null });
      
      let productionOrdersQuery;
      
      const productionOrdersRef = collection(db, getCompanyCollection('productionOrders'));
      
      if (orderId) {
        // Load only production orders for a specific order
        productionOrdersQuery = query(
          productionOrdersRef, 
          where('orderId', '==', orderId),
          orderBy('plannedStartDate', 'asc')
        );
      } else {
        // Load all production orders
        productionOrdersQuery = query(
          productionOrdersRef,
          orderBy('plannedStartDate', 'desc')  
        );
      }
      
      const snapshot = await getDocs(productionOrdersQuery);
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProductionOrder[];
      
      set({ 
        orders,
        filteredOrders: orders,
        loading: false 
      });
    } catch (error) {
      console.error('Error loading production orders:', error);
      set({ 
        error: 'Failed to load production orders', 
        loading: false 
      });
      throw error;
    }
  },

  subscribeToProductionOrders: (orderId) => {
    try {
      let productionOrdersQuery;
      
      const productionOrdersRef = collection(db, getCompanyCollection('productionOrders'));
      
      if (orderId) {
        productionOrdersQuery = query(
          productionOrdersRef,
          where('orderId', '==', orderId),
          orderBy('plannedStartDate', 'asc')
        );
      } else {
        productionOrdersQuery = query(
          productionOrdersRef,
          orderBy('plannedStartDate', 'desc') 
        );
      }
      
      const unsubscribe = onSnapshot(
        productionOrdersQuery,
        (snapshot) => {
          const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ProductionOrder[];
          
          set({ 
            orders,
            loading: false 
          });
          
          // Apply any existing filters
          get().applyFilters(get().filterOptions);
        },
        (error) => {
          console.error('Error in production orders subscription:', error);
          set({ 
            error: 'Failed to subscribe to production orders',
            loading: false 
          });
        }
      );
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up production orders subscription:', error);
      set({ error: 'Failed to subscribe to production orders' });
      return () => {}; // Return empty function as fallback
    }
  },

  startProductionOrder: async (id, startCode) => {
    try {
      const orderRef = doc(db, getCompanyCollection('productionOrders'), id);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        set({ error: 'Production order not found' });
        return false;
      }
      
      const order = orderDoc.data() as ProductionOrder;
      
      // Verify the start code
      if (order.startCode !== startCode) {
        set({ error: 'Invalid start code' });
        return false;
      }
      
      // Verify order is in pending state
      if (order.status !== 'pending') {
        set({ error: `Production order is already ${order.status}` });
        return false;
      }
      
      const { user } = useAuthStore.getState();
      const email = user?.email || 'scanner';
      const timestamp = new Date().toISOString();
      
      const updateData = {
        status: 'in-progress' as ProductionOrderStatus,
        actualStartDate: timestamp,
        updatedAt: timestamp,
        history: [
          ...order.history,
          {
            action: 'started',
            timestamp,
            user: email,
            previousStatus: order.status,
            newStatus: 'in-progress'
          }
        ]
      };
      
      await updateDoc(orderRef, updateData);
      
      // Update local state
      set(state => ({
        orders: state.orders.map(o => 
          o.id === id ? { ...o, ...updateData } : o
        ),
        error: null
      }));
      
      return true;
    } catch (error) {
      console.error('Error starting production order:', error);
      set({ error: 'Failed to start production order' });
      return false;
    }
  },

  completeProductionOrder: async (id, endCode) => {
    try {
      const orderRef = doc(db, getCompanyCollection('productionOrders'), id);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        set({ error: 'Production order not found' });
        return false;
      }
      
      const order = orderDoc.data() as ProductionOrder;
      
      // Verify the end code
      if (order.endCode !== endCode) {
        set({ error: 'Invalid completion code' });
        return false;
      }
      
      // Verify order is in progress
      if (order.status !== 'in-progress') {
        set({ error: `Production order must be in progress to complete, current status: ${order.status}` });
        return false;
      }
      
      const { user } = useAuthStore.getState();
      const email = user?.email || 'scanner';
      const timestamp = new Date().toISOString();
      
      const updateData = {
        status: 'completed' as ProductionOrderStatus,
        actualEndDate: timestamp,
        updatedAt: timestamp,
        history: [
          ...order.history,
          {
            action: 'completed',
            timestamp,
            user: email,
            previousStatus: order.status,
            newStatus: 'completed'
          }
        ]
      };
      
      await updateDoc(orderRef, updateData);
      
      // Update local state
      set(state => ({
        orders: state.orders.map(o => 
          o.id === id ? { ...o, ...updateData } : o
        ),
        error: null
      }));
      
      // Update the main order's progress
      // Get main order and item
      const orderMainRef = doc(db, getCompanyCollection('orders'), order.orderId);
      const orderMainDoc = await getDoc(orderMainRef);
      
      if (orderMainDoc.exists()) {
        const mainOrder = orderMainDoc.data();
        if (mainOrder.items && Array.isArray(mainOrder.items)) {
          const updatedItems = mainOrder.items.map(item => {
            if (item.id === order.itemId) {
              // Update progress for this stage
              const progress = item.progress || {};
              progress[order.stageName] = 100; // Mark as 100% complete
              
              return {
                ...item,
                progress
              };
            }
            return item;
          });
          
          // Update the main order
          await updateDoc(orderMainRef, { items: updatedItems });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error completing production order:', error);
      set({ error: 'Failed to complete production order' });
      return false;
    }
  },

  getProductionOrdersByQRCode: async (code) => {
    try {
      // Try to find by start code
      let productionOrdersQuery = query(
        collection(db, getCompanyCollection('productionOrders')),
        where('startCode', '==', code)
      );
      
      let snapshot = await getDocs(productionOrdersQuery);
      
      if (!snapshot.empty) {
        return {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data()
        } as ProductionOrder;
      }
      
      // Try to find by end code
      productionOrdersQuery = query(
        collection(db, getCompanyCollection('productionOrders')),
        where('endCode', '==', code)
      );
      
      snapshot = await getDocs(productionOrdersQuery);
      
      if (!snapshot.empty) {
        return {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data()
        } as ProductionOrder;
      }
      
      return null;
    } catch (error) {
      console.error('Error finding production order by QR code:', error);
      set({ error: 'Failed to find production order by QR code' });
      return null;
    }
  },

  applyFilters: (options: POFilterOptions) => {
    set({ filterLoading: true, filterOptions: options });
    
    const { orders } = get();
    let filtered = [...orders];
    
    // Filter by status
    if (options.status && options.status.length > 0) {
      filtered = filtered.filter(order => 
        options.status?.includes(order.status)
      );
    }
    
    // Filter by stage
    if (options.stages && options.stages.length > 0) {
      filtered = filtered.filter(order => 
        options.stages?.includes(order.stageName)
      );
    }
    
    // Filter by priority
    if (options.priority && options.priority.length > 0) {
      filtered = filtered.filter(order => 
        options.priority?.includes(order.priority)
      );
    }
    
    // Filter by date range
    if (options.dateRange) {
      const { start, end } = options.dateRange;
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      filtered = filtered.filter(order => {
        const plannedStart = new Date(order.plannedStartDate);
        const plannedEnd = new Date(order.plannedEndDate);
        
        // Check if planned dates overlap with filter range
        return (plannedStart <= endDate && plannedEnd >= startDate);
      });
    }
    
    set({ 
      filteredOrders: filtered,
      filterLoading: false
    });
  }
}));