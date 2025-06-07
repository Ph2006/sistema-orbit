import { create } from 'zustand';
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { initializeUserInCompany, initializeCompanyIfNeeded, repairUserPermissions } from '../utils/userInitialization';

interface UserData {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  companyId: string;
  permissions: Record<string, Record<string, boolean>>;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLogin: string;
}

interface AuthState {
  user: User | null;
  userData: UserData | null;
  currentCompany: string;
  loading: boolean;
  error: string | null;
  
  // Actions
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setCurrentCompany: (companyId: string) => void;
  hasPermission: (module: string, action: string) => boolean;
  initializeAuth: () => () => void;
  clearError: () => void;
  refreshUserData: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userData: null,
  currentCompany: 'mecald', // Empresa padrão
  loading: false,
  error: null,

  // Login
  signIn: async (email: string, password: string) => {
    try {
      set({ loading: true, error: null });
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Inicializar usuário na empresa atual se necessário
      const { currentCompany } = get();
      await initializeUserInCompany(user, currentCompany);
      
      // Carregar dados do usuário
      await get().refreshUserData();
      
      set({ loading: false });
    } catch (error: any) {
      console.error('Erro no login:', error);
      set({ 
        error: error.message || 'Erro ao fazer login', 
        loading: false 
      });
      throw error;
    }
  },

  // Logout
  signOut: async () => {
    try {
      set({ loading: true, error: null });
      await firebaseSignOut(auth);
      set({ 
        user: null, 
        userData: null,
        loading: false 
      });
    } catch (error: any) {
      console.error('Erro no logout:', error);
      set({ 
        error: error.message || 'Erro ao fazer logout', 
        loading: false 
      });
    }
  },

  // Definir empresa atual
  setCurrentCompany: (companyId: string) => {
    set({ currentCompany: companyId });
    // Recarregar dados do usuário para a nova empresa
    const { user } = get();
    if (user) {
      get().refreshUserData();
    }
  },

  // Verificar permissões
  hasPermission: (module: string, action: string) => {
    const { userData } = get();
    if (!userData) return false;
    
    try {
      return userData.permissions[module]?.[action] === true;
    } catch {
      return false;
    }
  },

  // Atualizar dados do usuário
  refreshUserData: async () => {
    try {
      const { user, currentCompany } = get();
      if (!user || !currentCompany) return;

      // Inicializar empresa se necessário
      const companyName = currentCompany === 'mecald' ? 'Mecald' : 'Brasmold';
      await initializeCompanyIfNeeded(currentCompany, companyName);

      // Buscar dados do usuário na empresa
      const userRef = doc(db, 'companies', currentCompany, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserData;
        
        // Verificar se as permissões estão completas
        if (!userData.permissions || Object.keys(userData.permissions).length === 0) {
          await repairUserPermissions(user.uid, currentCompany);
          // Buscar novamente após o reparo
          const repairedDoc = await getDoc(userRef);
          if (repairedDoc.exists()) {
            set({ userData: repairedDoc.data() as UserData });
          }
        } else {
          set({ userData });
        }
      } else {
        // Criar usuário se não existir
        const newUserData = await initializeUserInCompany(user, currentCompany);
        set({ userData: newUserData as UserData });
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados do usuário:', error);
      set({ error: error.message });
    }
  },

  // Inicializar autenticação
  initializeAuth: () => {
    set({ loading: true });
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          set({ user });
          await get().refreshUserData();
        } else {
          set({ user: null, userData: null });
        }
      } catch (error: any) {
        console.error('Erro na inicialização da auth:', error);
        set({ error: error.message });
      } finally {
        set({ loading: false });
      }
    });

    return unsubscribe;
  },

  // Limpar erro
  clearError: () => {
    set({ error: null });
  }
}));
