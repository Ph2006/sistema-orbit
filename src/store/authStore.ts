import { create } from 'zustand';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
  loading: boolean;
  error: string | null;
  companyId: string;
  
  // Actions compatíveis com o App.tsx existente
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setCompanyId: (companyId: string) => void;
  hasPermission: (module: string, action?: string) => boolean;
  refreshUserData: () => Promise<void>;
  clearError: () => void;
}

// Permissões padrão
const defaultPermissions = {
  dashboard: {
    read: true
  },
  orders: {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  quotations: {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  customers: {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  kanban: {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  team: {
    read: true,
    create: false,
    update: false,
    delete: false,
    manage: false
  },
  quality: {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  materials: {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  production: {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  financial: {
    read: false,
    create: false,
    update: false,
    delete: false
  },
  occupation: {
    read: true
  },
  'material-requisitions': {
    read: true,
    create: true,
    update: true,
    delete: false
  },
  'supplier-portal': {
    read: true,
    create: true,
    update: true,
    delete: false
  }
};

// Permissões de administrador
const adminPermissions = {
  dashboard: {
    read: true
  },
  orders: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  quotations: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  customers: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  kanban: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  team: {
    read: true,
    create: true,
    update: true,
    delete: true,
    manage: true
  },
  quality: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  materials: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  production: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  financial: {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  occupation: {
    read: true
  },
  'material-requisitions': {
    read: true,
    create: true,
    update: true,
    delete: true
  },
  'supplier-portal': {
    read: true,
    create: true,
    update: true,
    delete: true
  }
};

// Função para inicializar usuário
async function initializeUserInCompany(
  user: User, 
  companyId: string, 
  isAdmin: boolean = false
) {
  try {
    const userRef = doc(db, 'companies', companyId, 'users', user.uid);
    
    // Verificar se o usuário já existe
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      // Criar novo usuário na empresa
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Usuário',
        photoURL: user.photoURL || null,
        companyId: companyId,
        permissions: isAdmin ? adminPermissions : defaultPermissions,
        role: isAdmin ? 'admin' : 'user',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isActive: true,
        lastLogin: Timestamp.now()
      };

      await setDoc(userRef, userData);
      console.log('Usuário inicializado na empresa:', userData);
      return userData;
    } else {
      // Atualizar último login
      const existingData = userDoc.data();
      await setDoc(userRef, {
        ...existingData,
        lastLogin: Timestamp.now(),
        photoURL: user.photoURL || existingData.photoURL,
        displayName: user.displayName || existingData.displayName
      }, { merge: true });
      
      return existingData;
    }
  } catch (error) {
    console.error('Erro ao inicializar usuário na empresa:', error);
    throw error;
  }
}

// Função para inicializar empresa
async function initializeCompanyIfNeeded(companyId: string, companyName: string) {
  try {
    const companyRef = doc(db, 'companies', companyId);
    const companyDoc = await getDoc(companyRef);
    
    if (!companyDoc.exists()) {
      const companyData = {
        id: companyId,
        name: companyName,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isActive: true,
        settings: {
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
          dateFormat: 'dd/MM/yyyy',
          language: 'pt-BR'
        }
      };

      await setDoc(companyRef, companyData);
      console.log('Empresa inicializada:', companyData);
      return companyData;
    }
    
    return companyDoc.data();
  } catch (error) {
    console.error('Erro ao inicializar empresa:', error);
    throw error;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  userData: null,
  loading: false,
  error: null,
  companyId: 'mecald', // Empresa padrão

  // Função setUser compatível com o App.tsx
  setUser: async (user: User | null) => {
    set({ user });
    
    if (user) {
      // Automaticamente carregar dados do usuário quando logado
      await get().refreshUserData();
    } else {
      set({ userData: null });
    }
  },

  // Função setLoading compatível
  setLoading: (loading: boolean) => {
    set({ loading });
  },

  // Função para definir empresa
  setCompanyId: (companyId: string) => {
    set({ companyId });
    // Recarregar dados do usuário para a nova empresa
    const { user } = get();
    if (user) {
      get().refreshUserData();
    }
  },

  // Verificar permissões - compatível com PrivateRoute
  hasPermission: (module: string, action: string = 'read') => {
    const { userData } = get();
    if (!userData) return false;
    
    try {
      // Se for apenas o módulo sem ação específica
      if (!action || action === module) {
        return userData.permissions[module]?.read === true;
      }
      
      return userData.permissions[module]?.[action] === true;
    } catch {
      return false;
    }
  },

  // Atualizar dados do usuário
  refreshUserData: async () => {
    try {
      const { user, companyId } = get();
      if (!user || !companyId) return;

      // Inicializar empresa se necessário
      const companyName = companyId === 'mecald' ? 'Mecald' : 'Brasmold';
      await initializeCompanyIfNeeded(companyId, companyName);

      // Buscar dados do usuário na empresa
      const userRef = doc(db, 'companies', companyId, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Converter timestamps para strings se necessário
        const processedUserData = {
          ...userData,
          createdAt: userData.createdAt?.toDate?.()?.toISOString() || userData.createdAt,
          updatedAt: userData.updatedAt?.toDate?.()?.toISOString() || userData.updatedAt,
          lastLogin: userData.lastLogin?.toDate?.()?.toISOString() || userData.lastLogin,
        } as UserData;
        
        // Verificar se as permissões estão completas
        if (!userData.permissions || Object.keys(userData.permissions).length === 0) {
          // Reparar permissões
          const repairedPermissions = { ...defaultPermissions };
          await setDoc(userRef, {
            ...userData,
            permissions: repairedPermissions,
            updatedAt: Timestamp.now()
          }, { merge: true });
          
          processedUserData.permissions = repairedPermissions;
        }
        
        set({ userData: processedUserData });
      } else {
        // Criar usuário se não existir
        const newUserData = await initializeUserInCompany(user, companyId);
        const processedUserData = {
          ...newUserData,
          createdAt: newUserData.createdAt?.toDate?.()?.toISOString() || newUserData.createdAt,
          updatedAt: newUserData.updatedAt?.toDate?.()?.toISOString() || newUserData.updatedAt,
          lastLogin: newUserData.lastLogin?.toDate?.()?.toISOString() || newUserData.lastLogin,
        } as UserData;
        
        set({ userData: processedUserData });
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados do usuário:', error);
      set({ error: error.message });
    }
  },

  // Limpar erro
  clearError: () => {
    set({ error: null });
  }
}));

// Manter compatibilidade com exports antigos se necessário
export const { hasPermission } = useAuthStore.getState();
