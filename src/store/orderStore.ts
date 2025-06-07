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
import { Order } from '../types/order';
import { useAuthStore } from './authStore';

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
      
      // Converter datas para Timestamp do Firebase
      const dataToSave = {
        ...orderData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        startDate: orderData.startDate ? Timestamp.fromDate(new Date(orderData.startDate)) : null,
        deliveryDate: orderData.deliveryDate ? Timestamp.fromDate(new Date(orderData.deliveryDate)) : null,
        completionDate: orderData.completionDate ? Timestamp.fromDate(new Date(orderData.completionDate)) : null,
        createdBy: user.uid,
        company: companyId
      };

      const docRef = await addDoc(ordersRef, dataToSave);
      
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
      
      // Converter datas para Timestamp do Firebase
      const updatesToSave: any = {
        ...updates,
        updatedAt: Timestamp.now(),
        updatedBy: user.uid
      };

      // Converter datas se existirem
      if (updates.startDate) {
        updatesToSave.startDate = Timestamp.fromDate(new Date(updates.startDate));
      }
      if (updates.deliveryDate) {
        updatesToSave.deliveryDate = Timestamp.fromDate(new Date(updates.deliveryDate));
      }
      if (updates.completionDate) {
        updatesToSave.completionDate = Timestamp.fromDate(new Date(updates.completionDate));
      }

      await updateDoc(orderRef, updatesToSave);
      
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
