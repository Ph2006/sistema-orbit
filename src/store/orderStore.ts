import { create } from 'zustand';
import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from './authStore';

// Definição interna de tipo Order para evitar problemas de referência circular
interface OrderItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  weight: number;
  progress: number;
}

type OrderStatus = 'in-progress' | 'completed' | 'on-hold' | 'cancelled' | string;

interface Order {
  id: string;
  customerId?: string;
  customerName?: string;
  customer?: string; // Campo de compatibilidade
  project?: string;
  projectName?: string; // Campo de compatibilidade
  orderNumber?: string;
  internalOS?: string;
  internalOrderNumber?: string; // Campo de compatibilidade
  serviceOrder?: string; // Campo de compatibilidade
  startDate?: string;
  deliveryDate?: string;
  completionDate?: string;
  status?: OrderStatus;
  observations?: string;
  notes?: string; // Campo de compatibilidade
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface OrderState {
  orders: Order[];
  selectedOrder: Order | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchOrders: () => Promise<void>;
  getOrderById: (id: string) => Promise<Order | null>;
  addOrder: (order: Omit<Order, 'id'>) => Promise<string>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  setSelectedOrder: (order: Order | null) => void;
  subscribeToOrders: () => () => void;
  clearError: () => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  selectedOrder: null,
  loading: false,
  error: null,

  // Buscar todos os pedidos
  fetchOrders: async () => {
    try {
      set({ loading: true, error: null });
      
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }

      console.log(`Fetching orders for company: ${companyId}`);
      const ordersRef = collection(db, 'companies', companyId, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));
      
      const querySnapshot = await getDocs(q);
      const orders: Order[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        orders.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          startDate: data.startDate?.toDate?.()?.toISOString() || data.startDate,
          deliveryDate: data.deliveryDate?.toDate?.()?.toISOString() || data.deliveryDate,
          completionDate: data.completionDate?.toDate?.()?.toISOString() || data.completionDate,
        } as Order);
      });

      console.log(`Fetched ${orders.length} orders`);
      set({ orders, loading: false });
    } catch (error: any) {
      console.error('Erro ao buscar pedidos:', error);
      set({ 
        error: error.message || 'Erro ao buscar pedidos', 
        loading: false 
      });
    }
  },

  // Buscar pedido por ID
  getOrderById: async (id: string) => {
    try {
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }

      const orderRef = doc(db, 'companies', companyId, 'orders', id);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        return null;
      }

      const data = orderSnap.data();
      const order: Order = {
        id: orderSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        startDate: data.startDate?.toDate?.()?.toISOString() || data.startDate,
        deliveryDate: data.deliveryDate?.toDate?.()?.toISOString() || data.deliveryDate,
        completionDate: data.completionDate?.toDate?.()?.toISOString() || data.completionDate,
      } as Order;

      return order;
    } catch (error: any) {
      console.error('Erro ao buscar pedido:', error);
      throw error;
    }
  },

  // Adicionar novo pedido
  addOrder: async (orderData: Omit<Order, 'id'>) => {
    try {
      set({ loading: true, error: null });
      
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }

      const ordersRef = collection(db, 'companies', companyId, 'orders');
      
      // Converter valores undefined para null
      const cleanedData = { ...orderData };
      Object.keys(cleanedData).forEach(key => {
        if (cleanedData[key as keyof typeof cleanedData] === undefined) {
          cleanedData[key as keyof typeof cleanedData] = null;
        }
      });
      
      // Converter datas para Timestamp do Firebase
      const dataToSave: any = {
        ...cleanedData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: user.uid,
        company: companyId
      };

      // Converter datas se existirem e não forem null
      if (orderData.startDate) {
        dataToSave.startDate = Timestamp.fromDate(new Date(orderData.startDate));
      }
      if (orderData.deliveryDate) {
        dataToSave.deliveryDate = Timestamp.fromDate(new Date(orderData.deliveryDate));
      }
      if (orderData.completionDate) {
        dataToSave.completionDate = Timestamp.fromDate(new Date(orderData.completionDate));
      }

      console.log("Adding order with data:", dataToSave);
      const docRef = await addDoc(ordersRef, dataToSave);
      console.log("Order added with ID:", docRef.id);
      
      // Atualizar lista local
      await get().fetchOrders();
      
      set({ loading: false });
      return docRef.id;
    } catch (error: any) {
      console.error('Erro ao adicionar pedido:', error);
      set({ 
        error: error.message || 'Erro ao adicionar pedido', 
        loading: false 
      });
      throw error;
    }
  },

  // Atualizar pedido existente
  updateOrder: async (id: string, updates: Partial<Order>) => {
    try {
      set({ loading: true, error: null });
      
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }

      const orderRef = doc(db, 'companies', companyId, 'orders', id);
      
      // Converter datas para Timestamp do Firebase e substituir undefined por null
      const updatesToSave: any = { ...updates, updatedAt: Timestamp.now(), updatedBy: user.uid };

      // Converter undefined para null em todos os campos
      Object.keys(updatesToSave).forEach(key => {
        if (updatesToSave[key] === undefined) {
          updatesToSave[key] = null;
        }
      });

      // Converter datas se existirem
      if (updates.startDate) {
        updatesToSave.startDate = Timestamp.fromDate(new Date(updates.startDate));
      }
      if (updates.deliveryDate) {
        updatesToSave.deliveryDate = Timestamp.fromDate(new Date(updates.deliveryDate));
      }
      if (updates.completionDate) {
        updatesToSave.completionDate = Timestamp.fromDate(new Date(updates.completionDate));
      } else {
        // Garante que completionDate seja null e não undefined
        updatesToSave.completionDate = null;
      }

      console.log("Updating order with data:", updatesToSave);
      await updateDoc(orderRef, updatesToSave);
      console.log("Order updated successfully");
      
      // Atualizar lista local
      await get().fetchOrders();
      
      set({ loading: false });
    } catch (error: any) {
      console.error('Erro ao atualizar pedido:', error);
      set({ 
        error: error.message || 'Erro ao atualizar pedido', 
        loading: false 
      });
      throw error;
    }
  },

  // Deletar pedido
  deleteOrder: async (id: string) => {
    try {
      set({ loading: true, error: null });
      
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }

      const orderRef = doc(db, 'companies', companyId, 'orders', id);
      await deleteDoc(orderRef);
      
      // Remover da lista local
      set(state => ({
        orders: state.orders.filter(order => order.id !== id),
        selectedOrder: state.selectedOrder?.id === id ? null : state.selectedOrder,
        loading: false
      }));
    } catch (error: any) {
      console.error('Erro ao deletar pedido:', error);
      set({ 
        error: error.message || 'Erro ao deletar pedido', 
        loading: false 
      });
      throw error;
    }
  },

  // Definir pedido selecionado
  setSelectedOrder: (order: Order | null) => {
    set({ selectedOrder: order });
  },

  // Subscrever a mudanças em tempo real
  subscribeToOrders: () => {
    const { user, companyId } = useAuthStore.getState();
    if (!user || !companyId) {
      console.warn('Usuário não autenticado para subscrição');
      return () => {};
    }

    console.log(`Subscribing to orders for company: ${companyId}`);
    const ordersRef = collection(db, 'companies', companyId, 'orders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const orders: Order[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          orders.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
            startDate: data.startDate?.toDate?.()?.toISOString() || data.startDate,
            deliveryDate: data.deliveryDate?.toDate?.()?.toISOString() || data.deliveryDate,
            completionDate: data.completionDate?.toDate?.()?.toISOString() || data.completionDate,
          } as Order);
        });
        console.log(`Got ${orders.length} orders from subscription`);
        set({ orders });
      },
      (error) => {
        console.error('Erro na subscrição de pedidos:', error);
        set({ error: error.message });
      }
    );

    return unsubscribe;
  },

  // Limpar erro
  clearError: () => {
    set({ error: null });
  }
}));
