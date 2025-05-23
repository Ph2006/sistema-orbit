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
  setDoc
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
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  loading: false,
  error: null,

  loadOrders: async () => {
    set({ loading: true, error: null });
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      set({ error: 'Company ID not available', loading: false });
      return;
    }

    try {
      const ordersRef = collection(db, getCompanyCollection('orders'));
      const ordersQuery = query(ordersRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(ordersQuery);
      
      const ordersPromises = querySnapshot.docs.map(async doc => {
        const orderData = doc.data() as Order;
        
        // Fetch items subcollection
        const itemsSnapshot = await getDocs(collection(doc.ref, 'items'));
        const items = itemsSnapshot.docs.map(itemDoc => ({
          ...itemDoc.data() as OrderItem,
          id: itemDoc.id,
        })) as OrderItem[];

        // Calculate overallProgress and overallStatus for the order
        const totalItems = items.length;
        const overallProgress = totalItems > 0 ? Math.round(items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / totalItems) : 0;
        const overallStatus = overallProgress === 100 ? 'Concluído' : (overallProgress > 0 ? 'Em Andamento' : 'Não Iniciado');

        return {
          id: doc.id,
          ...orderData,
          startDate: new Date(orderData.startDate).toISOString(),
          deliveryDate: new Date(orderData.deliveryDate).toISOString(),
          columnId: orderData.columnId || null,
          items: items,
          overallProgress,
          overallStatus,
        } as Order;
      });

      const orders = await Promise.all(ordersPromises);
      set({ orders, loading: false });

    } catch (error) {
      console.error('Error loading orders:', error);
      set({ error: 'Failed to load orders', loading: false });
    }
  },

  getOrder: async (orderId: string) => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      console.error('Company ID not available');
      return null;
    }

    try {
      const orderRef = doc(db, getCompanyCollection('orders'), orderId);
      const orderDoc = await getDoc(orderRef);
      if (!orderDoc.exists()) return null;
      
      const data = orderDoc.data() as Order;

      // Fetch items subcollection for this single order
      const itemsSnapshot = await getDocs(collection(orderRef, 'items'));
      const items = itemsSnapshot.docs.map(itemDoc => ({
        ...itemDoc.data() as OrderItem,
        id: itemDoc.id,
      })) as OrderItem[];
      
      // Calculate overallProgress and overallStatus for the order
      const totalItems = items.length;
      const overallProgress = totalItems > 0 ? Math.round(items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / totalItems) : 0;
      const overallStatus = overallProgress === 100 ? 'Concluído' : (overallProgress > 0 ? 'Em Andamento' : 'Não Iniciado');

      return {
        id: orderDoc.id,
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        deliveryDate: new Date(data.deliveryDate).toISOString(),
        columnId: data.columnId || null,
        items: items,
        overallProgress,
        overallStatus,
      } as Order;

    } catch (error) {
      console.error('Error getting order:', error);
      return null;
    }
  },

  addOrder: async (order: Order) => {
    try {
      // Get column data needed for initializing an order
      const { columns } = useColumnStore.getState();
      
      // Find the "Pedidos em processo" column
      const processColumn = columns.find(col => col.title === 'Pedidos em processo');
      
      // If no columns exist, try to initialize them
      if (columns.length === 0) {
        console.log("No columns found, initializing default columns...");
        await useColumnStore.getState().initializeDefaultColumns();
        
        // Try to get columns again after initialization
        const freshColumns = useColumnStore.getState().columns;
        console.log(`After initialization, found ${freshColumns.length} columns`);
        
        // If still no columns, throw an error
        if (freshColumns.length === 0) {
          throw new Error('No columns available even after initialization. Please set up Kanban board first.');
        }
      }
      
      // Find default column again (in case we just initialized them)
      const defaultColumn = processColumn || 
                           useColumnStore.getState().columns.find(col => col.title === 'Pedidos em processo') ||
                           useColumnStore.getState().columns[0]; // Fallback to first available column
                           
      console.log("Using column for new order:", defaultColumn?.title || "No column found");

      // Ensure checklist is properly defined
      const checklist = order.checklist || {
        drawings: false,
        inspectionTestPlan: false,
        paintPlan: false
      };

      // All orders start in the listing column
      const orderData = {
        ...order,
        columnId: order.columnId || (defaultColumn?.id || null),
        createdAt: new Date().toISOString(),
        startDate: new Date(order.startDate).toISOString(),
        deliveryDate: new Date(order.deliveryDate).toISOString(),
        deleted: false,
        checklist: {
          drawings: !!checklist.drawings,
          inspectionTestPlan: !!checklist.inspectionTestPlan,
          paintPlan: !!checklist.paintPlan
        },
        statusHistory: order.statusHistory || [],
        items: [],
        overallProgress: 0, 
        overallStatus: 'Não Iniciado',
      };

      // Remove nulls and undefineds for clean Firestore document
      const sanitizedData = JSON.parse(JSON.stringify(orderData));
      console.log("Adding order with data:", JSON.stringify(sanitizedData, null, 2));

      // Remove id to avoid document ID conflict
      const { id, ...orderWithoutId } = sanitizedData;
      
      // Use orderId if provided, otherwise let Firestore generate one
      let docRef;
      if (order.id && order.id !== 'new' && order.id !== crypto.randomUUID()) {
        docRef = doc(db, getCompanyCollection('orders'), order.id);
        await setDoc(docRef, orderWithoutId);
      } else {
        docRef = await addDoc(collection(db, getCompanyCollection('orders')), orderWithoutId);
      }
      
      // Add to history collection
      await addDoc(collection(db, getCompanyCollection('orderHistory')), {
        orderId: docRef.id,
        timestamp: new Date().toISOString(),
        user: useAuthStore.getState().user?.email || 'sistema',
        action: 'create',
        changes: []
      });
      
      // Update local state immediately so UI reflects the change
      const newOrder = { ...sanitizedData, id: docRef.id, items: order.items || [] };
      set(state => ({ 
        orders: [...state.orders.filter(o => o.id !== docRef.id), newOrder] 
      }));
      
      console.log("Order added with ID:", docRef.id);
      
      // Save items as a subcollection after creating the order document
      if (order.items && order.items.length > 0) {
        console.log(`Saving ${order.items.length} items to subcollection for order ${docRef.id}`);
        const itemsCollectionRef = collection(docRef, 'items');
        const addItemPromises = order.items.map(item => {
           // Use setDoc with a generated ID to add each item
           const itemDocRef = doc(itemsCollectionRef);
           const itemDataToSave = {
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
           return setDoc(itemDocRef, itemDataToSave);
        });
        await Promise.all(addItemPromises);
        console.log(`Added ${addItemPromises.length} new items.`);
      }

      return docRef.id;
    } catch (error) {
      console.error('Error adding order:', error);
      set({ error: 'Failed to add order' });
      throw error;
    }
  },

  updateOrder: async (order: Order) => {
    try {
      console.log('Updating order:', order.id);
      
      // Verify the order exists
      const orderRef = doc(db, getCompanyCollection('orders'), order.id);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        throw new Error('Order not found');
      }

      // Get the original data to compare changes
      const originalData = orderDoc.data() as Order;
      
      // Get column IDs from the store for automatic column assignment
      const { columns } = useColumnStore.getState();
      const columnIds = {
        listing: columns.find(c => c.title === 'Listagem de materiais')?.id,
        purchasing: columns.find(c => c.title === 'Compra e recebimento de materiais')?.id,
        preparation: columns.find(c => c.title === 'Preparação')?.id,
        production: columns.find(c => c.title === 'Em Produção')?.id,
        quality: columns.find(c => c.title === 'Controle de Qualidade')?.id,
        shipping: columns.find(c => c.title === 'Expedição')?.id,
      };
      
      // Only determine appropriate column if columnId is not explicitly set
      const appropriateColumn = order.columnId === undefined ? 
        determineOrderColumn(order, columnIds) : 
        order.columnId;
      
      // Check if status has changed and add to history if needed
      let statusHistory = order.statusHistory || originalData.statusHistory || [];
      if (order.status !== originalData.status && originalData.createdAt) {
         const lastHistoryEntry = statusHistory.length > 0 ? statusHistory[statusHistory.length - 1] : null;
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

      // Ensure checklist is fully defined
      const checklist = order.checklist || originalData.checklist || {
        drawings: false,
        inspectionTestPlan: false,
        paintPlan: false
      };

      // Calculate overallProgress and overallStatus based on updated items
      const totalItems = order.items.length;
      const overallProgress = totalItems > 0 ? Math.round(order.items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / totalItems) : 0;
      const overallStatus = overallProgress === 100 ? 'Concluído' : (overallProgress > 0 ? 'Em Andamento' : 'Não Iniciado');


      // Ensure dates are properly formatted and columnId is never undefined
      const formattedData = {
        ...order,
        columnId: appropriateColumn,
        startDate: new Date(order.startDate).toISOString(),
        deliveryDate: new Date(order.deliveryDate).toISOString(),
        deleted: order.deleted === true ? true : false,
        statusHistory,
        checklist: {
          drawings: !!checklist.drawings,
          inspectionTestPlan: !!checklist.inspectionTestPlan,
          paintPlan: !!checklist.paintPlan
        },
        items: [],
        overallProgress,
        overallStatus,
      };

      // Remove nulls and undefineds for clean Firestore document update
      const sanitizedData = JSON.parse(JSON.stringify(formattedData));
      
      // Remove id from the update payload
      const { id, ...updatePayload } = sanitizedData;

      await updateDoc(orderRef, updatePayload);

      // Handle items subcollection: delete existing items and add the new ones
      console.log(`Deleting existing items for order ${order.id}`);
      const existingItemsSnapshot = await getDocs(collection(orderRef, 'items'));
      const deleteItemPromises = existingItemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deleteItemPromises);
      console.log(`Deleted ${deleteItemPromises.length} existing items.`);

      if (order.items && order.items.length > 0) {
        console.log(`Adding ${order.items.length} new items for order ${order.id}`);
        const itemsCollectionRef = collection(orderRef, 'items');
        const addItemPromises = order.items.map(item => {
           // Use setDoc with a generated ID to add each item
           const itemDocRef = doc(itemsCollectionRef);
           const itemDataToSave = {
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
           return setDoc(itemDocRef, itemDataToSave);
        });
        await Promise.all(addItemPromises);
        console.log(`Added ${addItemPromises.length} new items.`);
      }

      // Update local state
      set(state => ({
        orders: state.orders.map(o => o.id === order.id ? order : o)
      }));

      console.log('Order updated successfully.');

    } catch (error) {
      console.error('Error updating order:', error);
      set({ error: 'Failed to update order' });
      throw error;
    }
  },

  deleteOrder: async (orderId: string) => {
    try {
      console.log('Deleting order:', orderId);
      
      // Instead of deleting the document, mark it as deleted
      const orderRef = doc(db, getCompanyCollection('orders'), orderId);
      await updateDoc(orderRef, { deleted: true });

      // Add to history collection
      await addDoc(collection(db, getCompanyCollection('orderHistory')), {
        orderId: orderId,
        timestamp: new Date().toISOString(),
        user: useAuthStore.getState().user?.email || 'sistema',
        action: 'delete',
        changes: [{ field: 'deleted', oldValue: false, newValue: true }]
      });
      
      // Update local state to reflect deletion
      set(state => ({
        orders: state.orders.map(order => 
          order.id === orderId ? { ...order, deleted: true } : order
        )
      }));

      console.log('Order marked as deleted successfully.');

    } catch (error) {
      console.error('Error deleting order:', error);
      set({ error: 'Failed to delete order' });
      throw error;
    }
  },

  subscribeToOrders: () => {
    const companyId = useAuthStore.getState().companyId;
    if (!companyId) {
      console.error('Company ID not available, cannot subscribe to orders');
      return () => {};
    }

    const ordersRef = collection(db, getCompanyCollection('orders'));
    const ordersQuery = query(ordersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(ordersQuery, async (snapshot) => {
      set({ loading: true, error: null });
      try {
        const ordersPromises = snapshot.docs.map(async doc => {
          const orderData = doc.data() as Order;

          // Fetch items subcollection
          const itemsSnapshot = await getDocs(collection(doc.ref, 'items'));
          const items = itemsSnapshot.docs.map(itemDoc => ({
            ...itemDoc.data() as OrderItem,
            id: itemDoc.id,
          })) as OrderItem[];

          // Calculate overallProgress and overallStatus
          const totalItems = items.length;
          const overallProgress = totalItems > 0 ? Math.round(items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / totalItems) : 0;
          const overallStatus = overallProgress === 100 ? 'Concluído' : (overallProgress > 0 ? 'Em Andamento' : 'Não Iniciado');

          return {
            id: doc.id,
            ...orderData,
            startDate: new Date(orderData.startDate).toISOString(),
            deliveryDate: new Date(orderData.deliveryDate).toISOString(),
            columnId: orderData.columnId || null,
            items: items,
            overallProgress,
            overallStatus,
          } as Order;
        });

        const orders = await Promise.all(ordersPromises);
        set({ orders, loading: false });
      } catch (error) {
        console.error('Error fetching orders in real-time:', error);
        set({ error: 'Failed to fetch orders in real-time', loading: false });
      }
    });

    return unsubscribe;
  },

}));