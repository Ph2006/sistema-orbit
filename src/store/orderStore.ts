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
    items: [], // Items are handled separately as subcollection
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
      const ordersRef = collection(db, getCompanyCollection('orders'));
      const ordersQuery = query(
        ordersRef, 
        where('deleted', '!=', true),
        orderBy('deleted'),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(ordersQuery);
      
      const ordersPromises = querySnapshot.docs.map(async (docSnapshot) => {
        const orderData = docSnapshot.data() as Order;
        
        try {
          // Fetch items subcollection
          const itemsSnapshot = await getDocs(collection(docSnapshot.ref, 'items'));
          const items = itemsSnapshot.docs.map(itemDoc => ({
            ...itemDoc.data() as OrderItem,
            id: itemDoc.id,
          })) as OrderItem[];

          // Calculate progress
          const { overallProgress, overallStatus } = calculateOrderProgress(items);

          return {
            id: docSnapshot.id,
            ...orderData,
            startDate: formatDate(orderData.startDate),
            deliveryDate: formatDate(orderData.deliveryDate),
            columnId: orderData.columnId || null,
            items,
            overallProgress,
            overallStatus,
          } as Order;
        } catch (itemError) {
          console.error(`Error loading items for order ${docSnapshot.id}:`, itemError);
          // Return order without items if there's an error
          const { overallProgress, overallStatus } = calculateOrderProgress([]);
          return {
            id: docSnapshot.id,
            ...orderData,
            startDate: formatDate(orderData.startDate),
            deliveryDate: formatDate(orderData.deliveryDate),
            columnId: orderData.columnId || null,
            items: [],
            overallProgress,
            overallStatus,
          } as Order;
        }
      });

      const orders = await Promise.all(ordersPromises);
      set({ orders, loading: false });

    } catch (error: any) {
      console.error('Error loading orders:', error);
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
      const orderRef = doc(db, getCompanyCollection('orders'), orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        console.log(`Order ${orderId} not found`);
        return null;
      }
      
      const data = orderDoc.data() as Order;

      // Fetch items subcollection
      const itemsSnapshot = await getDocs(collection(orderRef, 'items'));
      const items = itemsSnapshot.docs.map(itemDoc => ({
        ...itemDoc.data() as OrderItem,
        id: itemDoc.id,
      })) as OrderItem[];
      
      // Calculate progress
      const { overallProgress, overallStatus } = calculateOrderProgress(items);

      return {
        id: orderDoc.id,
        ...data,
        startDate: formatDate(data.startDate),
        deliveryDate: formatDate(data.deliveryDate),
        columnId: data.columnId || null,
        items,
        overallProgress,
        overallStatus,
      } as Order;

    } catch (error: any) {
      console.error('Error getting order:', error);
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

      // Sanitize data
      const sanitizedData = sanitizeOrderData(orderData);
      const { id, items, ...orderWithoutIdAndItems } = sanitizedData;
      
      // Create order document
      let docRef;
      const ordersCollectionPath = getCompanyCollection('orders');
      
      if (order.id && order.id !== 'new' && !order.id.includes('temp-')) {
        docRef = doc(db, ordersCollectionPath, order.id);
        await setDoc(docRef, orderWithoutIdAndItems);
      } else {
        docRef = await addDoc(collection(db, ordersCollectionPath), orderWithoutIdAndItems);
      }
      
      // Add items as subcollection using batch for better performance
      if (order.items && order.items.length > 0) {
        console.log(`Adding ${order.items.length} items to order ${docRef.id}`);
        
        const batch = writeBatch(db);
        const itemsCollectionRef = collection(docRef, 'items');
        
        order.items.forEach((item) => {
          const itemDocRef = doc(itemsCollectionRef);
          const itemData = {
            ...item,
            id: itemDocRef.id,
            itemNumber: item.itemNumber || 0,
            quantity: item.quantity || 0,
            unitWeight: item.unitWeight || 0,
            totalWeight: item.totalWeight || 0,
            unitPrice: item.unitPrice || 0,
            totalPrice: item.totalPrice || 0,
            unitCost: item.unitCost || 0,
            totalCost: item.totalCost || 0,
            margin: item.margin || 0,
            overallProgress: item.overallProgress || 0,
          };
          batch.set(itemDocRef, itemData);
        });
        
        await batch.commit();
        console.log(`Successfully added ${order.items.length} items`);
      }

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
        // Don't fail the entire operation for history errors
      }
      
      // Update local state
      const newOrder = { 
        ...sanitizedData, 
        id: docRef.id, 
        items: order.items || [],
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

      // Sanitize and remove items (handled separately)
      const sanitizedData = sanitizeOrderData(updateData, true);
      const { id, items, ...updatePayload } = sanitizedData;

      // Update main document
      await updateDoc(orderRef, updatePayload);

      // Update items subcollection using batch
      const batch = writeBatch(db);
      
      // Delete existing items
      const existingItemsSnapshot = await getDocs(collection(orderRef, 'items'));
      existingItemsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Add new items
      if (order.items && order.items.length > 0) {
        const itemsCollectionRef = collection(orderRef, 'items');
        order.items.forEach(item => {
          const itemDocRef = doc(itemsCollectionRef);
          const itemData = {
            ...item,
            id: itemDocRef.id,
            itemNumber: item.itemNumber || 0,
            quantity: item.quantity || 0,
            unitWeight: item.unitWeight || 0,
            totalWeight: item.totalWeight || 0,
            unitPrice: item.unitPrice || 0,
            totalPrice: item.totalPrice || 0,
            unitCost: item.unitCost || 0,
            totalCost: item.totalCost || 0,
            margin: item.margin || 0,
            overallProgress: item.overallProgress || 0,
          };
          batch.set(itemDocRef, itemData);
        });
      }

      await batch.commit();

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
      const ordersQuery = query(
        ordersRef,
        where('deleted', '!=', true),
        orderBy('deleted'),
        orderBy('createdAt', 'desc')
      );

      let isInitialLoad = true;
      
      const unsubscribe = onSnapshot(
        ordersQuery, 
        async (snapshot) => {
          if (isInitialLoad) {
            set({ loading: true, error: null });
            isInitialLoad = false;
          }
          
          try {
            const ordersPromises = snapshot.docs.map(async (docSnapshot) => {
              const orderData = docSnapshot.data() as Order;

              try {
                // Fetch items subcollection
                const itemsSnapshot = await getDocs(collection(docSnapshot.ref, 'items'));
                const items = itemsSnapshot.docs.map(itemDoc => ({
                  ...itemDoc.data() as OrderItem,
                  id: itemDoc.id,
                })) as OrderItem[];

                // Calculate progress
                const { overallProgress, overallStatus } = calculateOrderProgress(items);

                return {
                  id: docSnapshot.id,
                  ...orderData,
                  startDate: formatDate(orderData.startDate),
                  deliveryDate: formatDate(orderData.deliveryDate),
                  columnId: orderData.columnId || null,
                  items,
                  overallProgress,
                  overallStatus,
                } as Order;
              } catch (itemError) {
                console.error(`Error loading items for order ${docSnapshot.id}:`, itemError);
                const { overallProgress, overallStatus } = calculateOrderProgress([]);
                return {
                  id: docSnapshot.id,
                  ...orderData,
                  startDate: formatDate(orderData.startDate),
                  deliveryDate: formatDate(orderData.deliveryDate),
                  columnId: orderData.columnId || null,
                  items: [],
                  overallProgress,
                  overallStatus,
                } as Order;
              }
            });

            const orders = await Promise.all(ordersPromises);
            console.log(`Real-time update: ${orders.length} orders loaded`);
            set({ orders, loading: false });
            
          } catch (error: any) {
            console.error('Error in orders real-time update:', error);
            set({ 
              error: `Failed to get real-time updates: ${error.message}`, 
              loading: false 
            });
          }
        },
        (error) => {
          console.error('Orders subscription error:', error);
          set({ 
            error: `Subscription error: ${error.message}`, 
            loading: false 
          });
        }
      );

      return unsubscribe;
      
    } catch (error: any) {
      console.error('Error setting up orders subscription:', error);
      set({ 
        error: `Failed to subscribe to orders: ${error.message}`, 
        loading: false 
      });
      return () => {};
    }
  },
}));
