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
  where,
  getDoc,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { 
  Quotation, 
  QuotationStats, 
  CustomerApprovalRate 
} from '../types/quotation';
import { addDays, differenceInDays } from 'date-fns';
import { useOrderStore } from './orderStore';
import { useColumnStore } from './columnStore';

interface QuotationState {
  quotations: Quotation[];
  stats: QuotationStats | null;
  customerStats: CustomerApprovalRate[];
  loading: boolean;
  error: string | null;
  lastQuoteNumber: string;
  loadQuotations: () => Promise<void>;
  addQuotation: (quotation: Quotation) => Promise<string>;
  updateQuotation: (quotation: Quotation) => Promise<void>;
  deleteQuotation: (quotationId: string) => Promise<void>;
  subscribeToQuotations: () => () => void;
  getNextQuoteNumber: () => Promise<string>;
  approveQuotation: (quotationId: string) => Promise<void>;
  rejectQuotation: (quotationId: string) => Promise<void>;
  convertToOrder: (quotationId: string) => Promise<string>;
  calculateStats: () => void;
}

export const useQuotationStore = create<QuotationState>((set, get) => ({
  quotations: [],
  stats: null,
  customerStats: [],
  loading: false,
  error: null,
  lastQuoteNumber: "000",

  loadQuotations: async () => {
    try {
      set({ loading: true, error: null });
      
      const quotationsRef = collection(db, getCompanyCollection('quotations'));
      const quotationsQuery = query(quotationsRef, orderBy('createdAt', 'desc'));
      const quotationsSnapshot = await getDocs(quotationsQuery);
      const quotationsData = quotationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Quotation[];
      
      set({ quotations: quotationsData, loading: false });
      
      // Calculate stats
      get().calculateStats();
      
      // Get the last quote number to ensure we always generate incremental numbers
      await get().getNextQuoteNumber();
      
    } catch (error) {
      console.error('Error loading quotations:', error);
      set({ error: 'Erro ao carregar orçamentos', loading: false });
    }
  },

  getNextQuoteNumber: async () => {
    try {
      // Query the last quote to get its number
      const quotationsRef = collection(db, getCompanyCollection('quotations'));
      const quotationsQuery = query(
        quotationsRef,
        orderBy('number', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(quotationsQuery);
      
      let nextNumber = "001"; // Start with 001 if no quotes exist
      
      if (!snapshot.empty) {
        const lastQuote = snapshot.docs[0].data() as Quotation;
        const lastNumber = parseInt(lastQuote.number);
        
        if (!isNaN(lastNumber)) {
          // Increment and format with leading zeros
          nextNumber = (lastNumber + 1).toString().padStart(3, '0');
        }
      }
      
      set({ lastQuoteNumber: nextNumber });
      return nextNumber;
      
    } catch (error) {
      console.error('Error getting next quote number:', error);
      set({ error: 'Erro ao gerar número do orçamento' });
      return get().lastQuoteNumber;
    }
  },

  addQuotation: async (quotation: Quotation) => {
    try {
      const { id, ...quotationData } = quotation;
      
      // Get next quote number if not provided
      if (!quotationData.number || quotationData.number === "000") {
        quotationData.number = await get().getNextQuoteNumber();
      }
      
      // Calculate expiration date if validity days is provided
      if (quotationData.validityDays && !quotationData.expiresAt) {
        const expirationDate = addDays(new Date(), quotationData.validityDays);
        quotationData.expiresAt = expirationDate.toISOString();
      }
      
      const docRef = await addDoc(collection(db, getCompanyCollection('quotations')), {
        ...quotationData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Update local state
      set(state => ({
        quotations: [{ ...quotationData, id: docRef.id }, ...state.quotations],
        lastQuoteNumber: quotationData.number,
      }));
      
      // Recalculate stats
      get().calculateStats();
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding quotation:', error);
      set({ error: 'Erro ao adicionar orçamento' });
      throw error;
    }
  },

  updateQuotation: async (quotation: Quotation) => {
    try {
      const { id, ...quotationData } = quotation;
      
      await updateDoc(doc(db, getCompanyCollection('quotations'), id), {
        ...quotationData,
        updatedAt: new Date().toISOString()
      });
      
      // Update local state
      set(state => ({
        quotations: state.quotations.map(q => q.id === id ? quotation : q)
      }));
      
      // Recalculate stats
      get().calculateStats();
      
    } catch (error) {
      console.error('Error updating quotation:', error);
      set({ error: 'Erro ao atualizar orçamento' });
      throw error;
    }
  },

  deleteQuotation: async (quotationId: string) => {
    try {
      await deleteDoc(doc(db, getCompanyCollection('quotations'), quotationId));
      
      // Update local state
      set(state => ({
        quotations: state.quotations.filter(q => q.id !== quotationId)
      }));
      
      // Recalculate stats
      get().calculateStats();
      
    } catch (error) {
      console.error('Error deleting quotation:', error);
      set({ error: 'Erro ao excluir orçamento' });
      throw error;
    }
  },

  subscribeToQuotations: () => {
    try {
      const quotationsRef = collection(db, getCompanyCollection('quotations'));
      const quotationsQuery = query(quotationsRef, orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(quotationsQuery, (snapshot) => {
        const quotationsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Quotation[];
        
        set({ quotations: quotationsData });
        
        // Calculate stats when quotations change
        get().calculateStats();
        
      }, (error) => {
        console.error('Error in quotations subscription:', error);
        set({ error: 'Erro na atualização de orçamentos em tempo real' });
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up quotations subscription:', error);
      set({ error: 'Failed to subscribe to quotations' });
      return () => {}; // Return empty function as fallback
    }
  },
  
  approveQuotation: async (quotationId: string) => {
    try {
      const quotationRef = doc(db, getCompanyCollection('quotations'), quotationId);
      const quotationDoc = await getDoc(quotationRef);
      
      if (!quotationDoc.exists()) {
        throw new Error('Orçamento não encontrado');
      }
      
      const quotation = quotationDoc.data() as Quotation;
      
      if (quotation.status !== 'sent') {
        throw new Error('Apenas orçamentos enviados podem ser aprovados');
      }
      
      await updateDoc(quotationRef, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Update local state
      set(state => ({
        quotations: state.quotations.map(q => 
          q.id === quotationId 
            ? { 
                ...q, 
                status: 'approved', 
                approvedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              } 
            : q
        )
      }));
      
      // Recalculate stats
      get().calculateStats();
      
    } catch (error) {
      console.error('Error approving quotation:', error);
      set({ error: 'Erro ao aprovar orçamento' });
      throw error;
    }
  },
  
  rejectQuotation: async (quotationId: string) => {
    try {
      const quotationRef = doc(db, getCompanyCollection('quotations'), quotationId);
      const quotationDoc = await getDoc(quotationRef);
      
      if (!quotationDoc.exists()) {
        throw new Error('Orçamento não encontrado');
      }
      
      const quotation = quotationDoc.data() as Quotation;
      
      if (quotation.status !== 'sent') {
        throw new Error('Apenas orçamentos enviados podem ser rejeitados');
      }
      
      await updateDoc(quotationRef, {
        status: 'rejected',
        rejectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Update local state
      set(state => ({
        quotations: state.quotations.map(q => 
          q.id === quotationId 
            ? { 
                ...q, 
                status: 'rejected', 
                rejectedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              } 
            : q
        )
      }));
      
      // Recalculate stats
      get().calculateStats();
      
    } catch (error) {
      console.error('Error rejecting quotation:', error);
      set({ error: 'Erro ao rejeitar orçamento' });
      throw error;
    }
  },
  
  convertToOrder: async (quotationId: string) => {
    try {
      const quotationRef = doc(db, getCompanyCollection('quotations'), quotationId);
      const quotationDoc = await getDoc(quotationRef);
      
      if (!quotationDoc.exists()) {
        throw new Error('Orçamento não encontrado');
      }
      
      const quotation = quotationDoc.data() as Quotation;
      
      if (quotation.status !== 'approved') {
        throw new Error('Apenas orçamentos aprovados podem ser convertidos em pedidos');
      }
      
      if (quotation.convertedToOrderId) {
        throw new Error('Este orçamento já foi convertido em pedido');
      }
      
      // Create order from quotation
      const orderStore = useOrderStore.getState();
      const columnStore = useColumnStore.getState();
      
      // Make sure there are columns initialized
      if (columnStore.columns.length === 0) {
        await columnStore.initializeDefaultColumns();
      }
      
      // Even after initialization, verify columns exist
      if (columnStore.columns.length === 0) {
        throw new Error("Columns were not properly initialized. Please set up your Kanban board first.");
      }
      
      // Find the "Pedidos em processo" column specifically
      const processColumn = columnStore.columns.find(col => col.title === 'Pedidos em processo');
      if (!processColumn) {
        console.warn("Couldn't find 'Pedidos em processo' column, falling back to the first available column");
      }
      
      // Get column ID to use, prioritizing "Pedidos em processo"
      const columnId = processColumn?.id || columnStore.columns[0].id;
      
      // Map quotation items to order items
      const orderItems = quotation.items.map((item, index) => ({
        id: crypto.randomUUID(),
        itemNumber: index + 1,
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unitWeight: item.unitWeight || 0,
        totalWeight: (item.unitWeight || 0) * item.quantity, 
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      }));
      
      // Calculate total weight
      const totalWeight = orderItems.reduce((sum, item) => sum + item.totalWeight, 0);
      
      // Create the order, EXPLICITLY setting the columnId
      const orderId = await orderStore.addOrder({
        id: 'new',
        orderNumber: quotation.number, // Use the quote number as the order number
        startDate: new Date().toISOString(),
        deliveryDate: addDays(new Date(), 30).toISOString(), // Default to 30 days
        internalOrderNumber: `OS/${quotation.number}`,
        customer: quotation.customerName,
        totalWeight: totalWeight,
        status: 'in-progress',
        items: orderItems,
        driveLinks: [],
        columnId: columnId, // EXPLICITLY set to "Pedidos em processo" column ID
        checklist: {
          drawings: false,
          inspectionTestPlan: false,
          paintPlan: false
        },
        deleted: false
      });
      
      // Update the quotation with the order ID
      await updateDoc(quotationRef, {
        convertedToOrderId: orderId,
        updatedAt: new Date().toISOString()
      });
      
      // Update local state
      set(state => ({
        quotations: state.quotations.map(q => 
          q.id === quotationId 
            ? { 
                ...q, 
                convertedToOrderId: orderId,
                updatedAt: new Date().toISOString()
              } 
            : q
        )
      }));
      
      // Recalculate stats
      get().calculateStats();
      
      return orderId;
      
    } catch (error) {
      console.error('Error converting quotation to order:', error);
      set({ error: 'Erro ao converter orçamento em pedido: ' + (error instanceof Error ? error.message : 'Erro desconhecido') });
      throw error;
    }
  },
  
  calculateStats: () => {
    const { quotations } = get();
    
    if (quotations.length === 0) {
      set({
        stats: {
          totalQuotes: 0,
          approvedQuotes: 0,
          rejectedQuotes: 0,
          pendingQuotes: 0,
          approvalRate: 0,
          averageResponseTime: 0,
          totalQuoteValue: 0,
          approvedQuoteValue: 0
        },
        customerStats: []
      });
      return;
    }
    
    // Calculate overall stats
    const totalQuotes = quotations.length;
    const approvedQuotes = quotations.filter(q => q.status === 'approved').length;
    const rejectedQuotes = quotations.filter(q => q.status === 'rejected').length;
    const pendingQuotes = quotations.filter(q => q.status === 'sent' || q.status === 'draft').length;
    
    const decidedQuotes = approvedQuotes + rejectedQuotes;
    const approvalRate = decidedQuotes > 0 ? (approvedQuotes / decidedQuotes) * 100 : 0;
    
    // Calculate response times for quotes that have been approved or rejected
    const responseTimes = quotations
      .filter(q => (q.status === 'approved' && q.approvedAt) || (q.status === 'rejected' && q.rejectedAt))
      .map(q => {
        const sentDate = q.sentAt ? new Date(q.sentAt) : new Date(q.createdAt);
        const responseDate = q.status === 'approved' && q.approvedAt 
          ? new Date(q.approvedAt)
          : q.rejectedAt
          ? new Date(q.rejectedAt)
          : new Date();
        
        return differenceInDays(responseDate, sentDate);
      });
    
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, days) => sum + days, 0) / responseTimes.length
      : 0;
    
    const totalQuoteValue = quotations.reduce((sum, q) => sum + q.totalWithTaxes, 0);
    const approvedQuoteValue = quotations
      .filter(q => q.status === 'approved')
      .reduce((sum, q) => sum + q.totalWithTaxes, 0);
    
    // Calculate stats by customer
    const customerMap = new Map<string, {
      customerName: string;
      totalQuotes: number;
      approvedQuotes: number;
      totalValue: number;
      approvedValue: number;
    }>();
    
    quotations.forEach(q => {
      const customerStats = customerMap.get(q.customerId) || {
        customerName: q.customerName,
        totalQuotes: 0,
        approvedQuotes: 0,
        totalValue: 0,
        approvedValue: 0
      };
      
      customerStats.totalQuotes++;
      customerStats.totalValue += q.totalWithTaxes;
      
      if (q.status === 'approved') {
        customerStats.approvedQuotes++;
        customerStats.approvedValue += q.totalWithTaxes;
      }
      
      customerMap.set(q.customerId, customerStats);
    });
    
    const customerStats: CustomerApprovalRate[] = Array.from(customerMap.entries()).map(([customerId, stats]) => ({
      customerId,
      customerName: stats.customerName,
      totalQuotes: stats.totalQuotes,
      approvedQuotes: stats.approvedQuotes,
      approvalRate: stats.totalQuotes > 0 ? (stats.approvedQuotes / stats.totalQuotes) * 100 : 0,
      totalValue: stats.totalValue,
      approvedValue: stats.approvedValue
    }));
    
    // Sort by approval rate (highest first)
    customerStats.sort((a, b) => b.approvalRate - a.approvalRate);
    
    set({
      stats: {
        totalQuotes,
        approvedQuotes,
        rejectedQuotes,
        pendingQuotes,
        approvalRate,
        averageResponseTime,
        totalQuoteValue,
        approvedQuoteValue
      },
      customerStats
    });
  }
}));