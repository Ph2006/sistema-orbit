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
  getDoc
} from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Supplier } from '../types/materials';

interface SupplierState {
  suppliers: Supplier[];
  loading: boolean;
  error: string | null;
  loadSuppliers: () => Promise<void>;
  getSupplier: (supplierId: string) => Promise<Supplier | null>;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<string>;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  deleteSupplier: (supplierId: string) => Promise<void>;
  subscribeToSuppliers: () => () => void;
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  loading: false,
  error: null,

  loadSuppliers: async () => {
    try {
      set({ loading: true, error: null });
      const querySnapshot = await getDocs(collection(db, getCompanyCollection('suppliers')));
      const suppliersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Supplier[];
      set({ suppliers: suppliersData, loading: false });
    } catch (error) {
      console.error('Error loading suppliers:', error);
      set({ error: 'Failed to load suppliers', loading: false });
    }
  },
  
  getSupplier: async (supplierId: string) => {
    try {
      // First check if the supplier exists in the state
      const { suppliers } = get();
      const supplier = suppliers.find(s => s.id === supplierId);
      if (supplier) return supplier;
      
      // If not found in state, fetch from Firestore
      const supplierDoc = await getDoc(doc(db, getCompanyCollection('suppliers'), supplierId));
      if (!supplierDoc.exists()) return null;
      
      return { id: supplierDoc.id, ...supplierDoc.data() } as Supplier;
    } catch (error) {
      console.error('Error fetching supplier:', error);
      return null;
    }
  },

  addSupplier: async (supplier: Omit<Supplier, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, getCompanyCollection('suppliers')), {
        ...supplier,
        createdAt: new Date().toISOString()
      });
      
      // Add to local state
      set(state => ({
        suppliers: [...state.suppliers, { ...supplier, id: docRef.id }]
      }));
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding supplier:', error);
      set({ error: 'Failed to add supplier' });
      throw error;
    }
  },

  updateSupplier: async (supplier: Supplier) => {
    try {
      await updateDoc(doc(db, getCompanyCollection('suppliers'), supplier.id), supplier);
      
      // Update local state
      set(state => ({
        suppliers: state.suppliers.map(s => 
          s.id === supplier.id ? supplier : s
        )
      }));
    } catch (error) {
      console.error('Error updating supplier:', error);
      set({ error: 'Failed to update supplier' });
      throw error;
    }
  },

  deleteSupplier: async (supplierId: string) => {
    try {
      await deleteDoc(doc(db, getCompanyCollection('suppliers'), supplierId));
      
      // Update local state
      set(state => ({
        suppliers: state.suppliers.filter(s => s.id !== supplierId)
      }));
    } catch (error) {
      console.error('Error deleting supplier:', error);
      set({ error: 'Failed to delete supplier' });
      throw error;
    }
  },

  subscribeToSuppliers: () => {
    try {
      const suppliersRef = collection(db, getCompanyCollection('suppliers'));
      const suppliersQuery = query(suppliersRef, orderBy('name', 'asc'));
      
      const unsubscribe = onSnapshot(suppliersQuery, (snapshot) => {
        const suppliers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Supplier[];
        set({ suppliers, loading: false });
      }, (error) => {
        console.error('Error in suppliers subscription:', error);
        set({ error: 'Failed to subscribe to suppliers', loading: false });
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up suppliers subscription:', error);
      set({ error: 'Failed to subscribe to suppliers' });
      return () => {}; // Return empty function as fallback
    }
  },
}));