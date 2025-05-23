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
  getDoc,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Order, OrderItem } from '../types/kanban';
import { useColumnStore } from './columnStore';
import { determineOrderColumn } from '../utils/kanban';
import { useAuthStore } from './authStore';

interface OrderState {
  orders: Order[];
  loading: boolean;
  error: string | null;
  loadOrders: () => Promise<void>;
  addOrder: (order: Order) => Promise<string>;
  updateOrder: (order: Order) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  subscribeToOrders: () => () => void;
  getOrder: (orderId: string) => Promise<Order | null>;
  clearError: () => void;
}

// Helper function to validate and format dates
const formatDate = (date: string | Date): string => {
  try {
    return new Date(date).toISOString();
  } catch (error) {
    console.error('Invalid date format:', date);
    return new Date().toISOString();
  }
};

// Helper function to calculate order progress
const calculateOrderProgress = (items: OrderItem[]) => {
  const totalItems = items.length;
  if (totalItems === 0) {
    return { overallProgress: 0, overallStatus: 'Não Iniciado' };
  }
  
  const overallProgress = Math.round(
    items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / totalItems
  );
  
  let overallStatus: string;
  if (overallProgress === 100) {
    overallStatus = 'Concluído';
  } else if (overallProgress > 0) {
    overallStatus = 'Em Andamento';
  } else {
    overallStatus = 'Não Iniciado';
  }
  
  return { overallProgress, overallStatus };
};

// Helper function to sanitize order data
const sanitizeOrderData = (order: Order, isUpdate = false) => {
  const sanitized = {
    ...order,
    startDate: formatDate(order.startDate),
    deliveryDate: formatDate(order.deliveryDate),
    deleted: Boolean(order.deleted),
    checklist: {
      drawings: Boolean(order.checklist?.drawings),
      inspectionTestPlan: Boolean(order.checklist?.inspectionTestPlan),
      paintPlan: Boolean(order.checklist?.paintPlan)
    },
    statusHistory: order.statusHistory || [],
    // ✅ CORREÇÃO: Manter items no documento principal
    items: order.items || [],
  };
  
  // Remove undefined values
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key as keyof typeof sanitized] === undefined) {
      delete sanitized[key as keyof typeof sanitized];
    }
  });
  
  return sanitized;
};

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  loadOrders: async () => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      console.log("loadOrders: Company ID not available, skipping fetch.");
      set({ error: 'Company ID not available', loading: false });
      return;
    }

    set({ loading: true, error: null });

    try {
      console.log('🔍 LoadOrders: Starting to load orders...');
      
      const ordersRef = collection(db, getCompanyCollection('orders'));
      const ordersQuery = query(ordersRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(ordersQuery);
      
      console.log(`📊 Found ${querySnapshot.docs.length} total orders in Firestore`);
      
      const ordersPromises = querySnapshot.docs
        .filter(docSnapshot => !docSnapshot.data().deleted)
        .map(async (docSnapshot) => {
          const orderData = docSnapshot.data() as Order;
          
          console.log(`🔍 Processing order ${docSnapshot.id} (${orderData.orderNumber})...`);
          
          // ✅ CORREÇÃO: Items estão no documento, não em subcoleção
          const items = (orderData.items || []) as OrderItem[];
          
          console.log(`✅ Found ${items.length} items in order ${orderData.orderNumber}`);
          if (items.length > 0) {
            console.log(`📦 First item:`, {
              id: items[0].id,
              code: items[0].code,
              description: items[0].description,
              quantity: items[0].quantity || 0
            });
          }

          // Calculate progress
          const { overallProgress, overallStatus } = calculateOrderProgress(items);

          return {
            id: docSnapshot.id,
            ...orderData,
            startDate: formatDate(orderData.startDate),
            deliveryDate: formatDate(orderData.deliveryDate),
            columnId: orderData.columnId || null,
            items, // ✅ Items já estão aqui
            overallProgress,
            overallStatus,
          } as Order;
        });

      const orders = await Promise.all(ordersPromises);
      
      console.log(`🎉 LoadOrders completed: ${orders.length} orders loaded`);
      console.log('📋 Orders summary:', orders.map(order => ({
        orderNumber: order.orderNumber,
        itemsCount: order.items?.length || 0
      })));
      
      set({ orders, loading: false });

    } catch (error: any) {
      console.error('❌ Error loading orders:', error);
      set({ 
        error: `Failed to load orders: ${error.message}`, 
        loading: false 
      });
    }
  },

  getOrder: async (orderId: string) => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      console.error('getOrder: Company ID not available');
      return null;
    }

    try {
      console.log(`🔍 GetOrder: Loading single order ${orderId}...`);
      
      const orderRef = doc(db, getCompanyCollection('orders'), orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        console.log(`❌ Order ${orderId} not found`);
        return null;
      }
      
      const data = orderDoc.data() as Order;

      // ✅ CORREÇÃO: Items estão no documento
      const items = (data.items || []) as OrderItem[];
      
      console.log(`✅ GetOrder: Found ${items.length} items for order ${orderId}`);
      
      // Calculate progress
      const { overallProgress, overallStatus } = calculateOrderProgress(items);

      return {
        id: orderDoc.id,
        ...data,
        startDate: formatDate(data.startDate),
        deliveryDate: formatDate(data.deliveryDate),
        columnId: data.columnId || null,
        items, // ✅ Items do documento
        overallProgress,
        overallStatus,
      } as Order;

    } catch (error: any) {
      console.error('❌ Error getting order:', error);
      return null;
    }
  },

  addOrder: async (order: Order) => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      const errorMsg = 'Company ID not available';
      console.error('addOrder:', errorMsg);
      set({ error: errorMsg });
      throw new Error(errorMsg);
    }

    try {
      // Ensure columns are loaded
      const { columns } = useColumnStore.getState();
      
      if (columns.length === 0) {
        console.log("No columns found, initializing default columns...");
        await useColumnStore.getState().initializeDefaultColumns();
        
        const freshColumns = useColumnStore.getState().columns;
        if (freshColumns.length === 0) {
          throw new Error('No columns available. Please set up Kanban board first.');
        }
      }
      
      // Find appropriate column
      const processColumn = useColumnStore.getState().columns.find(col => 
        col.title === 'Pedidos em processo'
      );
      const defaultColumn = processColumn || useColumnStore.getState().columns[0];
      
      console.log("Using column for new order:", defaultColumn?.title);

      // Calculate progress for new order
      const { overallProgress, overallStatus } = calculateOrderProgress(order.items || []);

      // Prepare order data
      const orderData = {
        ...order,
        columnId: order.columnId || defaultColumn?.id || null,
        createdAt: new Date().toISOString(),
        overallProgress,
        overallStatus,
      };

      // Sanitize data - items ficam no documento principal
      const sanitizedData = sanitizeOrderData(orderData);
      const { id, ...orderWithoutId } = sanitizedData;
      
      // Create order document
      let docRef;
      const ordersCollectionPath = getCompanyCollection('orders');
      
      if (order.id && order.id !== 'new' && !order.id.includes('temp-')) {
        docRef = doc(db, ordersCollectionPath, order.id);
        await setDoc(docRef, orderWithoutId);
      } else {
        docRef = await addDoc(collection(db, ordersCollectionPath), orderWithoutId);
      }
      
      console.log(`✅ Order added with ${order.items?.length || 0} items`);

      // Add to history
      try {
        await addDoc(collection(db, getCompanyCollection('orderHistory')), {
          orderId: docRef.id,
          timestamp: new Date().toISOString(),
          user: useAuthStore.getState().user?.email || 'sistema',
          action: 'create',
          changes: []
        });
      } catch (historyError) {
        console.warn('Failed to add to history:', historyError);
      }
      
      // Update local state
      const newOrder = { 
        ...sanitizedData, 
        id: docRef.id,
        overallProgress,
        overallStatus
      };
      
      set(state => ({ 
        orders: [newOrder, ...state.orders.filter(o => o.id !== docRef.id)]
      }));
      
      console.log("Order added successfully with ID:", docRef.id);
      return docRef.id;

    } catch (error: any) {
      console.error('Error adding order:', error);
      const errorMsg = `Failed to add order: ${error.message}`;
      set({ error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  updateOrder: async (order: Order) => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      const errorMsg = 'Company ID not available';
      console.error('updateOrder:', errorMsg);
      set({ error: errorMsg });
      throw new Error(errorMsg);
    }

    try {
      console.log('Updating order:', order.id);
      
      const orderRef = doc(db, getCompanyCollection('orders'), order.id);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        throw new Error(`Order ${order.id} not found`);
      }

      const originalData = orderDoc.data() as Order;
      
      // Handle column assignment
      const { columns } = useColumnStore.getState();
      const columnIds = {
        listing: columns.find(c => c.title === 'Listagem de materiais')?.id,
        purchasing: columns.find(c => c.title === 'Compra e recebimento de materiais')?.id,
        preparation: columns.find(c => c.title === 'Preparação')?.id,
        production: columns.find(c => c.title === 'Em Produção')?.id,
        quality: columns.find(c => c.title === 'Controle de Qualidade')?.id,
        shipping: columns.find(c => c.title === 'Expedição')?.id,
      };
      
      const appropriateColumn = order.columnId === undefined ? 
        determineOrderColumn(order, columnIds) : 
        order.columnId;
      
      // Handle status history
      let statusHistory = order.statusHistory || originalData.statusHistory || [];
      if (order.status !== originalData.status && originalData.createdAt) {
        const lastHistoryEntry = statusHistory[statusHistory.length - 1];
        if (!lastHistoryEntry || lastHistoryEntry.status !== order.status) {
          statusHistory = [
            ...statusHistory,
            {
              status: order.status,
              date: new Date().toISOString(),
              user: useAuthStore.getState().user?.email || 'sistema'
            }
          ];
        }
      }

      // Calculate progress
      const { overallProgress, overallStatus } = calculateOrderProgress(order.items || []);

      // Prepare update data
      const updateData = {
        ...order,
        columnId: appropriateColumn,
        statusHistory,
        overallProgress,
        overallStatus,
      };

      // Sanitize data - items ficam no documento
      const sanitizedData = sanitizeOrderData(updateData, true);
      const { id, ...updatePayload } = sanitizedData;

      // Update document with items included
      await updateDoc(orderRef, updatePayload);

      console.log(`✅ Order updated with ${order.items?.length || 0} items`);

      // Update local state
      set(state => ({
        orders: state.orders.map(o => 
          o.id === order.id ? { ...order, overallProgress, overallStatus } : o
        )
      }));

      console.log('Order updated successfully');

    } catch (error: any) {
      console.error('Error updating order:', error);
      const errorMsg = `Failed to update order: ${error.message}`;
      set({ error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  deleteOrder: async (orderId: string) => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      const errorMsg = 'Company ID not available';
      console.error('deleteOrder:', errorMsg);
      set({ error: errorMsg });
      throw new Error(errorMsg);
    }

    try {
      console.log('Soft deleting order:', orderId);
      
      const orderRef = doc(db, getCompanyCollection('orders'), orderId);
      await updateDoc(orderRef, { 
        deleted: true,
        deletedAt: new Date().toISOString()
      });

      // Add to history
      try {
        await addDoc(collection(db, getCompanyCollection('orderHistory')), {
          orderId,
          timestamp: new Date().toISOString(),
          user: useAuthStore.getState().user?.email || 'sistema',
          action: 'delete',
          changes: [{ field: 'deleted', oldValue: false, newValue: true }]
        });
      } catch (historyError) {
        console.warn('Failed to add to history:', historyError);
      }
      
      // Update local state
      set(state => ({
        orders: state.orders.filter(order => order.id !== orderId)
      }));

      console.log('Order soft deleted successfully');

    } catch (error: any) {
      console.error('Error deleting order:', error);
      const errorMsg = `Failed to delete order: ${error.message}`;
      set({ error: errorMsg });
      throw new Error(errorMsg);
    }
  },

  subscribeToOrders: () => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      console.log('subscribeToOrders: Company ID not available');
      return () => {};
    }

    try {
      const ordersRef = collection(db, getCompanyCollection('orders'));
      const ordersQuery = query(ordersRef, orderBy('createdAt', 'desc'));

      let isInitialLoad = true;
      
      const unsubscribe = onSnapshot(
        ordersQuery, 
        async (snapshot) => {
          if (isInitialLoad) {
            set({ loading: true, error: null });
            isInitialLoad = false;
          }
          
          try {
            console.log(`🔄 SubscribeToOrders: Processing ${snapshot.docs.length} orders...`);
            
            const ordersPromises = snapshot.docs
              .filter(docSnapshot => !docSnapshot.data().deleted)
              .map(async (docSnapshot) => {
                const orderData = docSnapshot.data() as Order;

                console.log(`🔍 Real-time: Processing order ${orderData.orderNumber}...`);
                
                // ✅ CORREÇÃO: Items estão no documento
                const items = (orderData.items || []) as OrderItem[];

                console.log(`✅ Real-time: Found ${items.length} items for ${orderData.orderNumber}`);

                // Calculate progress
                const { overallProgress, overallStatus } = calculateOrderProgress(items);

                return {
                  id: docSnapshot.id,
                  ...orderData,
                  startDate: formatDate(orderData.startDate),
                  deliveryDate: formatDate(orderData.deliveryDate),
                  columnId: orderData.columnId || null,
                  items, // ✅ Items do documento
                  overallProgress,
                  overallStatus,
                } as Order;
              });

            const orders = await Promise.all(ordersPromises);
            
            console.log(`🎉 SubscribeToOrders: ${orders.length} orders loaded with real-time update`);
            console.log('📋 Real-time summary:', orders.map(order => ({
              orderNumber: order.orderNumber,
              itemsCount: order.items?.length || 0
            })));
            
            set({ orders, loading: false });
            
          } catch (error: any) {
            console.error('❌ Error in orders real-time update:', error);
            set({ 
              error: `Failed to get real-time updates: ${error.message}`, 
              loading: false 
            });
          }
        },
        (error) => {
          console.error('❌ Orders subscription error:', error);
          set({ 
            error: `Subscription error: ${error.message}`, 
            loading: false 
          });
        }
      );

      return unsubscribe;
      
    } catch (error: any) {
      console.error('❌ Error setting up orders subscription:', error);
      set({ 
        error: `Failed to subscribe to orders: ${error.message}`, 
        loading: false 
      });
      return () => {};
    }
  },
}));