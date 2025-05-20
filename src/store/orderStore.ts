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
import { Order } from '../types/kanban';
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
    try {
      const ordersRef = collection(db, getCompanyCollection('orders'));
      const ordersQuery = query(ordersRef);
      const querySnapshot = await getDocs(ordersQuery);
      const orders = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: new Date(doc.data().startDate).toISOString(),
        deliveryDate: new Date(doc.data().deliveryDate).toISOString(),
        columnId: doc.data().columnId || null, // Ensure columnId is never undefined
      })) as Order[];
      set({ orders, loading: false });
    } catch (error) {
      console.error('Error loading orders:', error);
      set({ error: 'Failed to load orders', loading: false });
    }
  },

  getOrder: async (orderId: string) => {
    try {
      const orderRef = doc(db, getCompanyCollection('orders'), orderId);
      const orderDoc = await getDoc(orderRef);
      if (!orderDoc.exists()) return null;
      
      const data = orderDoc.data();
      return {
        id: orderDoc.id,
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        deliveryDate: new Date(data.deliveryDate).toISOString(),
        columnId: data.columnId || null, // Ensure columnId is never undefined
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
        columnId: order.columnId || (defaultColumn?.id || null), // Use provided columnId or default
        createdAt: new Date().toISOString(),
        startDate: new Date(order.startDate).toISOString(),
        deliveryDate: new Date(order.deliveryDate).toISOString(),
        deleted: false, // Explicitly mark as not deleted
        checklist: {
          drawings: !!checklist.drawings,
          inspectionTestPlan: !!checklist.inspectionTestPlan,
          paintPlan: !!checklist.paintPlan
        },
        statusHistory: [{
          status: order.status,
          date: new Date().toISOString(),
          user: useAuthStore.getState().user?.email || 'sistema'
        }]
      };

      // Remove nulls and undefineds for clean Firestore document
      const sanitizedData = JSON.parse(JSON.stringify(orderData));
      console.log("Adding order with data:", JSON.stringify(sanitizedData, null, 2));

      // Remove id to avoid document ID conflict
      const { id, ...orderWithoutId } = sanitizedData;
      
      // Use orderId if provided, otherwise let Firestore generate one
      let docRef;
      if (id && id !== 'new' && id !== crypto.randomUUID()) {
        docRef = doc(db, getCompanyCollection('orders'), id);
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
      const newOrder = { ...sanitizedData, id: docRef.id };
      set(state => ({ 
        orders: [...state.orders.filter(o => o.id !== docRef.id), newOrder] 
      }));
      
      console.log("Order added with ID:", docRef.id);
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
      const originalData = orderDoc.data();
      
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
      if (order.status !== originalData.status && !order.statusChangedAt) {
        statusHistory = [
          ...statusHistory,
          {
            status: order.status,
            date: new Date().toISOString(),
            user: useAuthStore.getState().user?.email || 'sistema'
          }
        ];
      }

      // Ensure checklist is fully defined
      const checklist = order.checklist || originalData.checklist || {
        drawings: false,
        inspectionTestPlan: false,
        paintPlan: false
      };

      // Ensure dates are properly formatted and columnId is never undefined
      const formattedData = {
        ...order,
        columnId: appropriateColumn, // Will be null if no appropriate column found
        startDate: new Date(order.startDate).toISOString(),
        deliveryDate: new Date(order.deliveryDate).toISOString(),
        deleted: order.deleted === true ? true : false, // Ensure deleted is a boolean
        statusHistory,
        checklist: {
          drawings: !!checklist.drawings,
          inspectionTestPlan: !!checklist.inspectionTestPlan,
          paintPlan: !!checklist.paintPlan
        },
        // Ensure items array is properly included and formatted
        items: order.items.map(item => ({
          ...item,
          // Ensure numeric values are numbers, not strings
          quantity: Number(item.quantity),
          unitWeight: Number(item.unitWeight),
          totalWeight: Number(item.totalWeight),
          unitPrice: Number(item.unitPrice || 0),
          totalPrice: Number(item.totalPrice || 0)
        }))
      };
      
      // Remove all undefined values for clean Firestore document
      const cleanData = JSON.parse(JSON.stringify(formattedData));
      console.log('Formatted data for update:', JSON.stringify(cleanData, null, 2));
      
      // Update the order document in Firestore
      await updateDoc(orderRef, cleanData);
      
      // Detect changes and add to history
      const changes = [];
      for (const [key, newValue] of Object.entries(cleanData)) {
        const oldValue = originalData[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
          changes.push({ field: key, oldValue, newValue });
        }
      }
      
      if (changes.length > 0) {
        // Make sure we don't have undefined values in changes
        const cleanChanges = changes.map(change => ({
          field: change.field,
          oldValue: change.oldValue === undefined ? null : change.oldValue,
          newValue: change.newValue === undefined ? null : change.newValue
        }));
        
        await addDoc(collection(db, getCompanyCollection('orderHistory')), {
          orderId: order.id,
          timestamp: new Date().toISOString(),
          user: useAuthStore.getState().user?.email || 'sistema',
          action: 'update',
          changes: cleanChanges
        });
      }

      // Update local state
      set(state => ({
        orders: state.orders.map(o => 
          o.id === order.id ? { ...formattedData, id: order.id } : o
        )
      }));
      
      console.log('Order updated successfully');
    } catch (error) {
      console.error('Error updating order:', error);
      set({ error: 'Failed to update order' });
      throw error;
    }
  },

  deleteOrder: async (orderId: string) => {
    try {
      const orderRef = doc(db, getCompanyCollection('orders'), orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        throw new Error('Order not found');
      }
      
      const originalData = orderDoc.data();
      
      await deleteDoc(orderRef);
      
      // Add to history
      await addDoc(collection(db, getCompanyCollection('orderHistory')), {
        orderId: orderId,
        timestamp: new Date().toISOString(),
        user: useAuthStore.getState().user?.email || 'sistema',
        action: 'delete',
        changes: [],
        orderData: originalData // Save full order data in case of accidental deletion
      });
      
      // Delete associated task assignments
      const assignmentsSnapshot = await getDocs(
        query(collection(db, getCompanyCollection('taskAssignments')), where('orderId', '==', orderId))
      );
      
      const deletePromises = assignmentsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Update local state
      set(state => ({
        orders: state.orders.filter(o => o.id !== orderId)
      }));
    } catch (error) {
      console.error('Error deleting order:', error);
      set({ error: 'Failed to delete order' });
      throw error;
    }
  },

  subscribeToOrders: () => {
    try {
      // Use a query that excludes deleted orders by default
      const ordersRef = collection(db, getCompanyCollection('orders'));
      
      // Use the appropriate query that handles the company's collection path
      const ordersQuery = query(
        ordersRef,
        where('deleted', '!=', true)
      );

      const unsubscribe = onSnapshot(
        ordersQuery,
        (snapshot) => {
          const orders = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              startDate: new Date(data.startDate).toISOString(),
              deliveryDate: new Date(data.deliveryDate).toISOString(),
              columnId: data.columnId || null, // Ensure columnId is never undefined
              // Ensure checklist is properly defined
              checklist: data.checklist ? {
                drawings: !!data.checklist.drawings,
                inspectionTestPlan: !!data.checklist.inspectionTestPlan,
                paintPlan: !!data.checklist.paintPlan
              } : {
                drawings: false,
                inspectionTestPlan: false,
                paintPlan: false
              }
            };
          }) as Order[];
          console.log(`Received ${orders.length} orders from Firestore`);
          set({ orders });
        },
        (error) => {
          console.error('Error in orders subscription:', error);
          set({ error: 'Failed to subscribe to orders' });
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up orders subscription:', error);
      set({ error: 'Failed to subscribe to orders' });
      return () => {}; // Return empty function as fallback
    }
  },
}));