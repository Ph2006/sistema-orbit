import { create } from 'zustand';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Task } from '../types/gantt';

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  loadTasks: () => Promise<void>;
  addTask: (task: Task) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  subscribeToTasks: () => () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  loading: false,
  error: null,

  loadTasks: async () => {
    set({ loading: true, error: null });
    try {
      const tasksRef = collection(db, getCompanyCollection('tasks'));
      const tasksQuery = query(tasksRef, orderBy('order', 'asc'));
      const querySnapshot = await getDocs(tasksQuery);
      const tasks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      set({ tasks, loading: false });
    } catch (error) {
      console.error('Error loading tasks:', error);
      set({ error: 'Failed to load tasks', loading: false });
    }
  },

  addTask: async (task: Task) => {
    try {
      const { id, ...taskData } = task;
      await addDoc(collection(db, getCompanyCollection('tasks')), taskData);
      await set.getState().loadTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      set({ error: 'Failed to add task' });
    }
  },

  updateTask: async (task: Task) => {
    try {
      const { id, ...taskData } = task;
      await updateDoc(doc(db, getCompanyCollection('tasks'), id), taskData);
      await set.getState().loadTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      set({ error: 'Failed to update task' });
    }
  },

  deleteTask: async (taskId: string) => {
    try {
      await deleteDoc(doc(db, getCompanyCollection('tasks'), taskId));
      await set.getState().loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      set({ error: 'Failed to delete task' });
    }
  },

  subscribeToTasks: () => {
    try {
      const tasksRef = collection(db, getCompanyCollection('tasks'));
      const tasksQuery = query(tasksRef, orderBy('order', 'asc'));
      const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Task[];
        set({ tasks });
      });
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up tasks subscription:', error);
      set({ error: 'Failed to subscribe to tasks' });
      return () => {}; // Return empty function as fallback
    }
  },
}));