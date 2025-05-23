import { create } from 'zustand';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, writeBatch, getDoc } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Column } from '../types/kanban';
import { useAuthStore } from './authStore';

const defaultColumns: Omit<Column, 'id' | 'orders'>[] = [
  { title: 'Pedidos em processo', order: 1 },
  { title: 'Pedidos expedidos', order: 2 },
  { title: 'Pedidos paralisados', order: 3 },
];

interface ColumnState {
  columns: Column[];
  loading: boolean;
  error: string | null;
  setColumns: (columns: Column[]) => void;
  addColumn: (column: Column) => Promise<void>;
  updateColumn: (column: Column) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
  subscribeToColumns: () => () => void;
  initializeDefaultColumns: () => Promise<void>;
}

export const useColumnStore = create<ColumnState>((set, get) => ({
  columns: [],
  loading: false,
  error: null,

  setColumns: (columns) => set({ columns }),

  addColumn: async (column) => {
    try {
      const companyId = useAuthStore.getState().companyId;
      if (!companyId) {
        console.error('Cannot add column: companyId is not available');
        set({ error: 'Company ID is not available' });
        return;
      }

      const { id, orders, ...columnData } = column;
      await addDoc(collection(db, getCompanyCollection('columns')), columnData);
    } catch (error) {
      console.error('Error adding column:', error);
      set({ error: 'Failed to add column' });
      throw error;
    }
  },

  updateColumn: async (column) => {
    try {
      const companyId = useAuthStore.getState().companyId;
      if (!companyId) {
        console.error('Cannot update column: companyId is not available');
        set({ error: 'Company ID is not available' });
        return;
      }

      const { id, orders, ...columnData } = column;
      
      // Check if the column exists before updating
      const columnRef = doc(db, getCompanyCollection('columns'), id);
      const columnDoc = await getDoc(columnRef);
      
      if (!columnDoc.exists()) {
        await addDoc(collection(db, getCompanyCollection('columns')), columnData);
      } else {
        await updateDoc(columnRef, columnData);
      }
    } catch (error) {
      console.error('Error updating column:', error);
      set({ error: 'Failed to update column' });
      throw error;
    }
  },

  deleteColumn: async (columnId) => {
    try {
      const companyId = useAuthStore.getState().companyId;
      if (!companyId) {
        console.error('Cannot delete column: companyId is not available');
        set({ error: 'Company ID is not available' });
        return;
      }

      await deleteDoc(doc(db, getCompanyCollection('columns'), columnId));
    } catch (error) {
      console.error('Error deleting column:', error);
      set({ error: 'Failed to delete column' });
      throw error;
    }
  },

  subscribeToColumns: () => {
    try {
      const companyId = useAuthStore.getState().companyId;
      if (!companyId) {
        console.error('Cannot subscribe to columns: companyId is not available');
        set({ error: 'Company ID is not available' });
        return () => {};
      }

      const columnsRef = collection(db, getCompanyCollection('columns'));
      const columnsQuery = query(columnsRef, orderBy('order', 'asc'));
      const unsubscribe = onSnapshot(
        columnsQuery, 
        (snapshot) => {
          const columns = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            orders: [],
          })) as Column[];
          set({ columns });
        },
        (error) => {
          console.error('Error in columns subscription:', error);
          set({ error: 'Falha ao escutar atualizações de colunas' });
        }
      );
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up columns subscription:', error);
      set({ error: 'Failed to subscribe to columns' });
      return () => {}; // Return empty function as fallback
    }
  },

  initializeDefaultColumns: async () => {
    try {
      const companyId = useAuthStore.getState().companyId;
      if (!companyId) {
        console.error('Cannot initialize columns: companyId is not available');
        set({ error: 'Company ID is not available', loading: false });
        return;
      }

      set({ loading: true, error: null });
      
      // Check if columns already exist
      const columnsRef = collection(db, getCompanyCollection('columns'));
      const snapshot = await getDocs(columnsRef);
      
      if (snapshot.empty) {
        // Create a batch for atomic operation
        const batch = writeBatch(db);
        
        // Add default columns
        defaultColumns.forEach(column => {
          const newDocRef = doc(collection(db, getCompanyCollection('columns')));
          batch.set(newDocRef, column);
        });
        
        await batch.commit();
        console.log('Default columns created successfully');
        
        // Get freshly created columns
        const newSnapshot = await getDocs(columnsRef);
        const columns = newSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          orders: [],
        })) as Column[];
        
        set({ columns, loading: false });
      } else {
        console.log(`${snapshot.docs.length} columns already exist`);
        const columns = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          orders: [],
        })) as Column[];
        
        set({ columns, loading: false });
      }
    } catch (error) {
      console.error('Error initializing columns:', error);
      set({ error: 'Failed to initialize columns', loading: false });
      throw error;
    }
  },
}));