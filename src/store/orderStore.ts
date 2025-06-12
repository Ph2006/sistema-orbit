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
import { db, firestoreOperation, debugFirestoreData, withRetry } from '../lib/firebase';
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
  overallProgress?: number;
  itemNumber?: number;
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDays?: number;
  startDate?: string;
  endDate?: string;
  responsible?: string;
}

type OrderStatus = 'in-progress' | 'completed' | 'on-hold' | 'cancelled' | string;

interface Order {
  id: string;
  customerId?: string;
  customerName?: string;
  customer?: string;
  project?: string;
  projectName?: string;
  orderNumber?: string;
  internalOS?: string;
  internalOrderNumber?: string;
  serviceOrder?: string;
  startDate?: string;
  deliveryDate?: string;
  completionDate?: string;
  status?: OrderStatus;
  observations?: string;
  notes?: string;
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
  googleDriveLink?: string;
  value?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  [key: string]: any;
}

interface OrderState {
  orders: Order[];
  selectedOrder: Order | null;
  loading: boolean;
  error: string | null;
  connectionRetries: number;
  
  // Actions
  fetchOrders: () => Promise<void>;
  getOrderById: (id: string) => Promise<Order | null>;
  addOrder: (order: Omit<Order, 'id'>) => Promise<string>;
  updateOrder: (orderData: Order) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  setSelectedOrder: (order: Order | null) => void;
  subscribeToOrders: () => () => void;
  clearError: () => void;
  retryConnection: () => void;
}

// Função utilitária para processar itens de forma segura
const processOrderItems = (items: any[]): OrderItem[] => {
  if (!Array.isArray(items)) {
    console.warn('Items is not an array:', items);
    return [];
  }

  return items.map((item, index) => {
    // Processar weight de forma robusta
    let processedWeight = 0;
    if (typeof item.weight === 'number' && !isNaN(item.weight)) {
      processedWeight = item.weight;
    } else if (typeof item.weight === 'string') {
      const weightStr = item.weight.replace(',', '.').trim();
      const parsedWeight = parseFloat(weightStr);
      processedWeight = isNaN(parsedWeight) ? 0 : parsedWeight;
    } else if (item.unitWeight !== undefined) {
      // Fallback para unitWeight se weight não estiver disponível
      const unitWeight = typeof item.unitWeight === 'number' ? item.unitWeight : parseFloat(item.unitWeight) || 0;
      processedWeight = unitWeight;
    }

    // Processar quantity de forma robusta
    let processedQuantity = 1;
    if (typeof item.quantity === 'number' && !isNaN(item.quantity)) {
      processedQuantity = item.quantity;
    } else if (typeof item.quantity === 'string') {
      const quantityStr = item.quantity.replace(',', '.').trim();
      const parsedQuantity = parseFloat(quantityStr);
      processedQuantity = isNaN(parsedQuantity) ? 1 : parsedQuantity;
    }

    // Processar progress
    let processedProgress = 0;
    if (typeof item.progress === 'number' && !isNaN(item.progress)) {
      processedProgress = Math.max(0, Math.min(100, item.progress));
    } else if (typeof item.overallProgress === 'number' && !isNaN(item.overallProgress)) {
      processedProgress = Math.max(0, Math.min(100, item.overallProgress));
    }

    // Processar overallProgress
    let processedOverallProgress = processedProgress;
    if (typeof item.overallProgress === 'number' && !isNaN(item.overallProgress)) {
      processedOverallProgress = Math.max(0, Math.min(100, item.overallProgress));
    }

    const processedItem: OrderItem = {
      id: item.id || `item-${index}-${Date.now()}`,
      code: item.code || '',
      description: item.description || item.name || '',
      quantity: processedQuantity,
      unit: item.unit || 'un',
      weight: processedWeight,
      progress: processedProgress,
      overallProgress: processedOverallProgress,
      itemNumber: item.itemNumber || (index + 1),
      notes: item.notes || item.specifications || '',
      priority: item.priority || 'medium',
      estimatedDays: typeof item.estimatedDays === 'number' ? item.estimatedDays : 1,
      startDate: item.startDate || '',
      endDate: item.endDate || '',
      responsible: item.responsible || ''
    };

    console.log(`Processed item ${index + 1}:`, {
      original: { weight: item.weight, quantity: item.quantity },
      processed: { weight: processedItem.weight, quantity: processedItem.quantity }
    });

    return processedItem;
  });
};

// Função utilitária para processar dados do documento
const processOrderData = (doc: any): Order => {
  const data = doc.data();
  
  // Processar datas
  const processDate = (dateField: any) => {
    if (!dateField) return undefined;
    if (dateField.toDate) return dateField.toDate().toISOString();
    if (typeof dateField === 'string') return dateField;
    return undefined;
  };

  // Processar itens
  const processedItems = data.items ? processOrderItems(data.items) : [];

  const processedOrder: Order = {
    id: doc.id,
    customerId: data.customerId || '',
    customerName: data.customerName || data.customer || '',
    customer: data.customer || data.customerName || '',
    project: data.project || data.projectName || '',
    projectName: data.projectName || data.project || '',
    orderNumber: data.orderNumber || '',
    internalOS: data.internalOS || data.internalOrderNumber || data.serviceOrder || '',
    internalOrderNumber: data.internalOrderNumber || data.internalOS || '',
    serviceOrder: data.serviceOrder || data.internalOS || '',
    startDate: processDate(data.startDate),
    deliveryDate: processDate(data.deliveryDate),
    completionDate: processDate(data.completionDate),
    status: data.status || 'in-progress',
    observations: data.observations || data.notes || '',
    notes: data.notes || data.observations || '',
    items: processedItems,
    createdAt: processDate(data.createdAt),
    updatedAt: processDate(data.updatedAt),
    googleDriveLink: data.googleDriveLink || '',
    value: typeof data.value === 'number' ? data.value : 0,
    priority: data.priority || 'medium'
  };

  console.log(`Processed order ${doc.id} with ${processedItems.length} items`);
  return processedOrder;
};

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  selectedOrder: null,
  loading: false,
  error: null,
  connectionRetries: 0,

  // Retry connection logic
  retryConnection: () => {
    const { connectionRetries } = get();
    if (connectionRetries < 3) {
      set({ connectionRetries: connectionRetries + 1 });
      setTimeout(() => {
        get().fetchOrders();
      }, 1000 * Math.pow(2, connectionRetries)); // Exponential backoff
    }
  },

  // Buscar todos os pedidos
  fetchOrders: async () => {
    try {
      set({ loading: true, error: null });
      
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }

      console.log(`Fetching orders for company: ${companyId}`);
      
      // Usar firestoreOperation.withRetry para retry automático
      const orders = await firestoreOperation.withRetry(async () => {
        const ordersRef = collection(db, 'companies', companyId, 'orders');
        const q = query(ordersRef, orderBy('createdAt', 'desc'));
        
        const querySnapshot = await getDocs(q);
        const orders: Order[] = [];
        
        querySnapshot.forEach((doc) => {
          try {
            debugFirestoreData('Fetching Order', doc.data());
            const processedOrder = processOrderData(doc);
            orders.push(processedOrder);
          } catch (error) {
            console.error(`Error processing order ${doc.id}:`, error);
          }
        });

        return orders;
      });

      console.log(`Successfully fetched and processed ${orders.length} orders`);
      set({ orders, loading: false, connectionRetries: 0 });
    } catch (error: any) {
      console.error('Erro ao buscar pedidos:', error);
      set({ 
        error: error.message || 'Erro ao buscar pedidos', 
        loading: false 
      });
      
      // Retry logic para problemas de conexão
      if (error.code === 'unavailable' || error.message.includes('QUIC')) {
        get().retryConnection();
      }
    }
  },

  // Buscar pedido por ID
  getOrderById: async (id: string) => {
    try {
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }

      return await firestoreOperation.withRetry(async () => {
        const orderRef = doc(db, 'companies', companyId, 'orders', id);
        const orderSnap = await getDoc(orderRef);
        
        if (!orderSnap.exists()) {
          return null;
        }

        debugFirestoreData('Fetching Single Order', orderSnap.data());
        return processOrderData(orderSnap);
      });
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

      return await firestoreOperation.withRetry(async () => {
        const ordersRef = collection(db, 'companies', companyId, 'orders');
        
        // Processar itens antes de salvar
        const processedItems = orderData.items ? processOrderItems(orderData.items) : [];
        
        // Preparar dados para salvar
        const dataToSave: any = {
          ...orderData,
          items: processedItems,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: user.uid,
          company: companyId
        };

        // Converter undefined para null
        Object.keys(dataToSave).forEach(key => {
          if (dataToSave[key] === undefined) {
            dataToSave[key] = null;
          }
        });

        // Converter datas para Timestamp do Firebase
        if (orderData.startDate) {
          dataToSave.startDate = Timestamp.fromDate(new Date(orderData.startDate));
        }
        if (orderData.deliveryDate) {
          dataToSave.deliveryDate = Timestamp.fromDate(new Date(orderData.deliveryDate));
        }
        if (orderData.completionDate) {
          dataToSave.completionDate = Timestamp.fromDate(new Date(orderData.completionDate));
        }

        debugFirestoreData('Adding Order', dataToSave);
        console.log("Processed items:", processedItems);
        
        const docRef = await addDoc(ordersRef, dataToSave);
        console.log("Order added with ID:", docRef.id);
        
        return docRef.id;
      });
    } catch (error: any) {
      console.error('Erro ao adicionar pedido:', error);
      set({ 
        error: error.message || 'Erro ao adicionar pedido', 
        loading: false 
      });
      throw error;
    } finally {
      // Atualizar lista local após sucesso
      try {
        await get().fetchOrders();
        set({ loading: false });
      } catch (fetchError) {
        console.error('Error refreshing orders after add:', fetchError);
        set({ loading: false });
      }
    }
  },

  // Atualizar pedido existente
  updateOrder: async (orderData: Order) => {
    try {
      set({ loading: true, error: null });
      
      const { user, companyId } = useAuthStore.getState();
      if (!user || !companyId) {
        throw new Error('Usuário não autenticado ou empresa não selecionada');
      }
      
      if (!orderData.id) {
        throw new Error('ID do pedido é obrigatório para atualização');
      }
      
      await firestoreOperation.withRetry(async () => {
        const orderRef = doc(db, 'companies', companyId, 'orders', orderData.id);
        
        // Extrair o ID e preparar os dados para atualização
        const { id, ...updates } = orderData;
        
        // Processar itens antes de salvar
        const processedItems = updates.items ? processOrderItems(updates.items) : [];
        
        // Preparar dados para atualização
        const updatesToSave: any = { 
          ...updates,
          items: processedItems,
          updatedAt: Timestamp.now(), 
          updatedBy: user.uid 
        };
        
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
          updatesToSave.completionDate = null;
        }

        debugFirestoreData('Updating Order', updatesToSave);
        console.log("Processed items being saved:", processedItems);
        
        await updateDoc(orderRef, updatesToSave);
        console.log("Order updated successfully");
      });
    } catch (error: any) {
      console.error('Erro ao atualizar pedido:', error);
      set({ 
        error: error.message || 'Erro ao atualizar pedido', 
        loading: false 
      });
      throw error;
    } finally {
      // Atualizar lista local após sucesso
      try {
        await get().fetchOrders();
        set({ loading: false });
      } catch (fetchError) {
        console.error('Error refreshing orders after update:', fetchError);
        set({ loading: false });
      }
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

  // Subscrever a mudanças em tempo real com retry logic
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
        try {
          const orders: Order[] = [];
          querySnapshot.forEach((doc) => {
            try {
              const processedOrder = processOrderData(doc);
              orders.push(processedOrder);
            } catch (error) {
              console.error(`Error processing order ${doc.id} in subscription:`, error);
            }
          });
          
          console.log(`Got ${orders.length} orders from subscription`);
          set({ orders, connectionRetries: 0, error: null });
        } catch (error: any) {
          console.error('Error processing subscription data:', error);
          set({ error: error.message });
        }
      },
      (error) => {
        console.error('Erro na subscrição de pedidos:', error);
        set({ error: error.message });
        
        // Retry logic for subscription errors
        if (error.code === 'unavailable' || error.message.includes('QUIC')) {
          get().retryConnection();
        }
      }
    );

    return unsubscribe;
  },

  // Limpar erro
  clearError: () => {
    set({ error: null, connectionRetries: 0 });
  }
}));
