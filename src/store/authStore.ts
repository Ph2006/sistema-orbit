import { create } from 'zustand';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';

// ... o resto do código permanece igual ...

// Altere as funções que usam o companyId diretamente:

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

// ... o resto do código permanece igual ...

export const useAuthStore = create<AuthState>((set, get) => ({
  // ... restante do código igual ...

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
      
      // ... resto da função permanece igual ...
    } catch (error: any) {
      console.error('Erro ao carregar dados do usuário:', error);
      set({ error: error.message });
    }
  },

  // ... restante do código igual ...
}));

export const { hasPermission } = useAuthStore.getState();
