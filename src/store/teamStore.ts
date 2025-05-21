import { create } from 'zustand';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { TeamMember } from '../types/team';

interface TeamState {
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  loadMembers: () => Promise<void>;
  addMember: (member: Omit<TeamMember, 'id'>) => Promise<void>;
  updateMember: (member: TeamMember) => Promise<void>;
  deleteMember: (memberId: string) => Promise<void>;
  subscribeToMembers: () => () => void;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  members: [],
  loading: false,
  error: null,

  loadMembers: async () => {
    try {
      set({ loading: true, error: null });
      const teamMembersRef = collection(db, getCompanyCollection('teamMembers'));
      const teamMembersQuery = query(teamMembersRef, orderBy('name', 'asc'));
      const snapshot = await getDocs(teamMembersQuery);
      
      const members = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TeamMember[];
      
      set({ members, loading: false });
    } catch (error) {
      console.error('Error loading team members:', error);
      set({ error: 'Erro ao carregar membros da equipe', loading: false });
    }
  },

  addMember: async (member) => {
    try {
      set({ loading: true, error: null });
      const docRef = await addDoc(collection(db, getCompanyCollection('teamMembers')), {
        ...member,
        createdAt: new Date().toISOString()
      });
      
      const newMember = { ...member, id: docRef.id };
      set(state => ({ members: [...state.members, newMember], loading: false }));
    } catch (error) {
      console.error('Error adding team member:', error);
      set({ error: 'Erro ao adicionar membro da equipe', loading: false });
    }
  },

  updateMember: async (member) => {
    try {
      set({ loading: true, error: null });
      await updateDoc(doc(db, getCompanyCollection('teamMembers'), member.id), member);
      set(state => ({
        members: state.members.map(m => m.id === member.id ? member : m),
        loading: false
      }));
    } catch (error) {
      console.error('Error updating team member:', error);
      set({ error: 'Erro ao atualizar membro da equipe', loading: false });
    }
  },

  deleteMember: async (memberId) => {
    try {
      set({ loading: true, error: null });
      await deleteDoc(doc(db, getCompanyCollection('teamMembers'), memberId));
      set(state => ({
        members: state.members.filter(m => m.id !== memberId),
        loading: false
      }));
    } catch (error) {
      console.error('Error deleting team member:', error);
      set({ error: 'Erro ao excluir membro da equipe', loading: false });
    }
  },

  subscribeToMembers: () => {
    const teamMembersRef = collection(db, getCompanyCollection('teamMembers'));
    const teamMembersQuery = query(teamMembersRef, orderBy('name', 'asc'));
    
    const unsubscribe = onSnapshot(teamMembersQuery, (snapshot) => {
      const members = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TeamMember[];
      
      set({ members });
    }, (error) => {
      console.error('Error subscribing to team members:', error);
      set({ error: 'Erro ao sincronizar membros da equipe' });
    });

    return unsubscribe;
  }
})); 