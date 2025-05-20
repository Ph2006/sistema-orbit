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
import { Customer } from '../types/customer';

interface CustomerState {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  loadCustomers: () => Promise<void>;
  getCustomer: (customerId: string) => Promise<Customer | null>;
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<string>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (customerId: string) => Promise<void>;
  subscribeToCustomers: () => () => void;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  loading: false,
  error: null,

  loadCustomers: async () => {
    try {
      set({ loading: true, error: null });
      // Use company-specific collection path
      const querySnapshot = await getDocs(collection(db, getCompanyCollection('customers')));
      const customersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      set({ customers: customersData, loading: false });
    } catch (error) {
      console.error('Error loading customers:', error);
      set({ error: 'Failed to load customers', loading: false });
    }
  },
  
  getCustomer: async (customerId: string) => {
    try {
      // First check if the customer exists in the state
      const { customers } = get();
      const customer = customers.find(c => c.id === customerId);
      if (customer) return customer;
      
      // If not found in state, fetch from Firestore using company-specific path
      const customerDoc = await getDoc(doc(db, getCompanyCollection('customers'), customerId));
      if (!customerDoc.exists()) return null;
      
      return { id: customerDoc.id, ...customerDoc.data() } as Customer;
    } catch (error) {
      console.error('Error fetching customer:', error);
      return null;
    }
  },

  addCustomer: async (customer: Omit<Customer, 'id'>) => {
    try {
      // Add to company-specific collection
      const docRef = await addDoc(collection(db, getCompanyCollection('customers')), {
        ...customer,
        createdAt: new Date().toISOString()
      });
      
      // Add to local state
      set(state => ({
        customers: [...state.customers, { ...customer, id: docRef.id }]
      }));
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding customer:', error);
      set({ error: 'Failed to add customer' });
      throw error;
    }
  },

  updateCustomer: async (customer: Customer) => {
    try {
      // Update in company-specific collection
      await updateDoc(doc(db, getCompanyCollection('customers'), customer.id), customer);
      
      // Update local state
      set(state => ({
        customers: state.customers.map(c => 
          c.id === customer.id ? customer : c
        )
      }));
    } catch (error) {
      console.error('Error updating customer:', error);
      set({ error: 'Failed to update customer' });
      throw error;
    }
  },

  deleteCustomer: async (customerId: string) => {
    try {
      // Delete from company-specific collection
      await deleteDoc(doc(db, getCompanyCollection('customers'), customerId));
      
      // Update local state
      set(state => ({
        customers: state.customers.filter(c => c.id !== customerId)
      }));
    } catch (error) {
      console.error('Error deleting customer:', error);
      set({ error: 'Failed to delete customer' });
      throw error;
    }
  },

  subscribeToCustomers: () => {
    try {
      // Use company-specific collection path for subscription
      const customersRef = collection(db, getCompanyCollection('customers'));
      const customersQuery = query(customersRef, orderBy('name', 'asc'));
      
      const unsubscribe = onSnapshot(customersQuery, (snapshot) => {
        const customers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Customer[];
        set({ customers, loading: false });
      }, (error) => {
        console.error('Error in customers subscription:', error);
        set({ error: 'Failed to subscribe to customers', loading: false });
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up customers subscription:', error);
      set({ error: 'Failed to subscribe to customers' });
      return () => {}; // Return empty function as fallback
    }
  },
}));