import { create } from 'zustand';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { ClientProject } from '../types/kanban';

interface ProjectState {
  projects: ClientProject[];
  loading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  addProject: (project: ClientProject) => Promise<string>;
  updateProject: (project: ClientProject) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  subscribeToProjects: () => () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projectsRef = collection(db, getCompanyCollection('projects'));
      const projectsQuery = query(projectsRef);
      const querySnapshot = await getDocs(projectsQuery);
      const projects = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ClientProject[];
      set({ projects, loading: false });
    } catch (error) {
      console.error('Error loading projects:', error);
      set({ error: 'Failed to load projects', loading: false });
    }
  },

  addProject: async (project: ClientProject) => {
    try {
      const { id, ...projectData } = project;
      const docRef = await addDoc(collection(db, getCompanyCollection('projects')), {
        ...projectData,
        createdAt: new Date().toISOString(),
      });
      
      // Update local state
      set(state => ({
        projects: [...state.projects, { ...project, id: docRef.id }]
      }));
      
      return docRef.id;
    } catch (error) {
      console.error('Error adding project:', error);
      set({ error: 'Failed to add project' });
      throw error;
    }
  },

  updateProject: async (project: ClientProject) => {
    try {
      const { id, ...projectData } = project;
      await updateDoc(doc(db, getCompanyCollection('projects'), id), projectData);
      
      // Update local state
      set(state => ({
        projects: state.projects.map(p => p.id === id ? project : p)
      }));
    } catch (error) {
      console.error('Error updating project:', error);
      set({ error: 'Failed to update project' });
      throw error;
    }
  },

  deleteProject: async (projectId: string) => {
    try {
      await deleteDoc(doc(db, getCompanyCollection('projects'), projectId));
      
      // Update local state
      set(state => ({
        projects: state.projects.filter(p => p.id !== projectId)
      }));
    } catch (error) {
      console.error('Error deleting project:', error);
      set({ error: 'Failed to delete project' });
      throw error;
    }
  },

  subscribeToProjects: () => {
    try {
      const projectsRef = collection(db, getCompanyCollection('projects'));
      const projectsQuery = query(projectsRef);
      
      const unsubscribe = onSnapshot(
        projectsQuery,
        (snapshot) => {
          const projects = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ClientProject[];
          set({ projects, loading: false });
        },
        (error) => {
          console.error('Error in projects subscription:', error);
          set({ error: 'Failed to subscribe to projects', loading: false });
        }
      );
      
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up projects subscription:', error);
      set({ error: 'Failed to subscribe to projects' });
      return () => {}; // Return empty function as fallback
    }
  },
}));