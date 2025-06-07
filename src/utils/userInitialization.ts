// utils/userInitialization.ts
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';

// Estrutura de permissões padrão
export const defaultPermissions = {
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
  admin: {
    manage: false
  }
};

// Permissões de administrador
export const adminPermissions = {
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
  admin: {
    manage: true
  }
};

// Função para inicializar usuário na empresa
export async function initializeUserInCompany(
  user: User, 
  companyId: string, 
  isAdmin: boolean = false,
  customPermissions?: any
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
        permissions: customPermissions || (isAdmin ? adminPermissions : defaultPermissions),
        role: isAdmin ? 'admin' : 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        lastLogin: new Date().toISOString()
      };

      await setDoc(userRef, userData);
      console.log('Usuário inicializado na empresa:', userData);
      return userData;
    } else {
      // Atualizar último login
      const existingData = userDoc.data();
      await setDoc(userRef, {
        ...existingData,
        lastLogin: new Date().toISOString(),
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

// Função para criar empresa padrão se não existir
export async function initializeCompanyIfNeeded(companyId: string, companyName: string) {
  try {
    const companyRef = doc(db, 'companies', companyId);
    const companyDoc = await getDoc(companyRef);
    
    if (!companyDoc.exists()) {
      const companyData = {
        id: companyId,
        name: companyName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

// Função para verificar e reparar permissões
export async function repairUserPermissions(userId: string, companyId: string) {
  try {
    const userRef = doc(db, 'companies', companyId, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const currentPermissions = userData.permissions || {};
      
      // Mesclar com permissões padrão para garantir que todas existem
      const repairedPermissions = { ...defaultPermissions };
      
      // Manter permissões existentes
      Object.keys(currentPermissions).forEach(module => {
        if (repairedPermissions[module]) {
          repairedPermissions[module] = {
            ...repairedPermissions[module],
            ...currentPermissions[module]
          };
        }
      });
      
      // Atualizar se necessário
      await setDoc(userRef, {
        ...userData,
        permissions: repairedPermissions,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      console.log('Permissões reparadas para usuário:', userId);
      return repairedPermissions;
    }
  } catch (error) {
    console.error('Erro ao reparar permissões:', error);
    throw error;
  }
}
