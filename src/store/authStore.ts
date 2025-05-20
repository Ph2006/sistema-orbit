import { create } from 'zustand';
import { User } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TeamMember } from '../types/team';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  companyId: string | null;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  teamMember: TeamMember | null;
  loadTeamMember: (email: string) => Promise<void>;
  setCompanyId: (companyId: string | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  teamMember: null,
  companyId: localStorage.getItem('companyId'),
  
  setUser: async (user) => {
    set({ user });
    
    // When user changes, load their team member profile if exists
    if (user) {
      await get().loadTeamMember(user.email || '');
    } else {
      set({ teamMember: null });
    }
  },
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  
  setCompanyId: (companyId) => {
    set({ companyId });
    if (companyId) {
      localStorage.setItem('companyId', companyId);
      console.log(`Company ID set to: ${companyId}`);
    } else {
      localStorage.removeItem('companyId');
      console.log('Company ID removed from storage');
    }
  },
  
  loadTeamMember: async (email) => {
    if (!email) return;
    
    try {
      set({ loading: true });
      const companyId = get().companyId;
      
      if (!companyId) {
        console.error('No company ID found');
        set({ teamMember: null });
        return;
      }
      
      // Query team members collection from the company-specific collection path
      const teamMembersPath = `empresa/${companyId}/teamMembers`;
      const teamMembersRef = collection(db, teamMembersPath);
      const q = query(teamMembersRef, where('email', '==', email));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const memberData = snapshot.docs[0].data() as TeamMember;
        set({ 
          teamMember: {
            id: snapshot.docs[0].id,
            ...memberData
          }
        });
        console.log(`Loaded team member for ${email} in company ${companyId}`);
      } else {
        // If not found in new structure, try looking in the old structure as fallback
        const legacyTeamMembersRef = collection(db, 'teamMembers');
        const legacyQuery = query(legacyTeamMembersRef, where('email', '==', email));
        const legacySnapshot = await getDocs(legacyQuery);
        
        if (!legacySnapshot.empty) {
          const memberData = legacySnapshot.docs[0].data() as TeamMember;
          set({ 
            teamMember: {
              id: legacySnapshot.docs[0].id,
              ...memberData
            }
          });
          console.log(`Loaded team member for ${email} from legacy collection`);
        } else {
          set({ teamMember: null });
          console.log(`No team member found for ${email} in company ${companyId}`);
        }
      }
    } catch (error) {
      console.error('Error loading team member:', error);
      set({ error: 'Failed to load team member data' });
    } finally {
      set({ loading: false });
    }
  }
}));