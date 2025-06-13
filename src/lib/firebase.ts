import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { 
  getFirestore, 
  connectFirestoreEmulator, 
  enableNetwork, 
  disableNetwork,
  enableMultiTabIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase with error handling
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase:", error);
  throw error;
}

// Initialize Auth and set persistence
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Error setting auth persistence:", error);
});

// Initialize Firestore com configurações melhoradas
const db = getFirestore(app);

// Configurar persistência offline para melhor performance
let offlinePersistenceEnabled = false;

const enableOfflinePersistence = async () => {
  if (offlinePersistenceEnabled) return;
  
  try {
    await enableMultiTabIndexedDbPersistence(db);
    offlinePersistenceEnabled = true;
    console.log('✅ Firestore offline persistence enabled');
  } catch (error: any) {
    if (error.code === 'failed-precondition') {
      console.warn('⚠️ Multiple tabs open, persistence can only be enabled in one tab at a time');
    } else if (error.code === 'unimplemented') {
      console.warn('⚠️ The current browser does not support offline persistence');
    } else {
      console.error('❌ Error enabling offline persistence:', error);
    }
  }
};

// Initialize Storage
const storage = getStorage(app);

// Initialize Functions
const functions = getFunctions(app);

// Monitoramento de conectividade
let isOnline = navigator.onLine;
let connectionListeners: ((online: boolean) => void)[] = [];

const addConnectionListener = (callback: (online: boolean) => void) => {
  connectionListeners.push(callback);
  return () => {
    connectionListeners = connectionListeners.filter(cb => cb !== callback);
  };
};

const notifyConnectionChange = (online: boolean) => {
  isOnline = online;
  connectionListeners.forEach(callback => callback(online));
};

// Event listeners para mudanças de conectividade
window.addEventListener('online', () => {
  console.log('🌐 Connection restored');
  notifyConnectionChange(true);
  enableNetwork(db).catch(console.error);
});

window.addEventListener('offline', () => {
  console.log('📶 Connection lost - switching to offline mode');
  notifyConnectionChange(false);
  disableNetwork(db).catch(console.error);
});

// Função melhorada para operações com retry
export const firestoreOperationWithRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string = 'operation'
): Promise<T> => {
  const maxRetries = 3;
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempting ${operationName} (${attempt}/${maxRetries})`);
      const result = await operation();
      console.log(`✅ ${operationName} completed successfully`);
      return result;
    } catch (error: any) {
      lastError = error;
      
      console.error(`❌ ${operationName} failed (attempt ${attempt}):`, {
        code: error.code,
        message: error.message,
        details: error
      });
      
      // Não fazer retry para erros específicos
      const noRetryErrors = [
        'permission-denied',
        'invalid-argument', 
        'not-found',
        'already-exists',
        'unauthenticated'
      ];
      
      if (noRetryErrors.includes(error.code)) {
        console.error(`🚫 No retry for error: ${error.code}`);
        throw error;
      }
      
      // Para erros de conectividade, fazer retry
      const retryableErrors = [
        'unavailable',
        'deadline-exceeded',
        'cancelled',
        'aborted'
      ];
      
      if (retryableErrors.includes(error.code) || 
          error.message.includes('network') ||
          error.message.includes('fetch') ||
          error.message.includes('QUIC')) {
        
        if (attempt < maxRetries) {
          const waitTime = 1000 * Math.pow(2, attempt - 1);
          console.warn(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
      throw error;
    }
  }
  
  throw lastError!;
};

// Utilitário para retry de operações com problemas de conectividade (mantido para compatibilidade)
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  return firestoreOperationWithRetry(operation, 'legacy-retry-operation');
};

// Utilitário para operações Firestore com retry automático
const firestoreOperation = {
  withRetry: <T>(operation: () => Promise<T>) => firestoreOperationWithRetry(operation, 'firestore-operation')
};

// Função para verificar a saúde da conexão
const checkFirestoreHealth = async (): Promise<boolean> => {
  try {
    // Teste simples de conectividade
    await db.app;
    return true;
  } catch (error) {
    console.error('❌ Firestore health check failed:', error);
    return false;
  }
};

// Função para reinicializar conexão em caso de problemas persistentes
const reinitializeConnection = async (): Promise<void> => {
  try {
    console.log('🔄 Reinitializing Firestore connection...');
    await disableNetwork(db);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await enableNetwork(db);
    console.log('✅ Firestore connection reinitialized');
  } catch (error) {
    console.error('❌ Error reinitializing connection:', error);
    throw error;
  }
};

// Check if we're in development mode AND emulators are explicitly enabled
const useEmulators = false; // Set this to true only when you're running emulators locally

// Only connect to emulators if explicitly enabled
if (useEmulators) {
  try {
    // Connect to Firestore emulator
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('Connected to Firestore emulator');
    
    // Connect to Storage emulator
    connectStorageEmulator(storage, 'localhost', 9199);
    console.log('Connected to Storage emulator');
    
    // Connect to Functions emulator
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.log('Connected to Functions emulator');
  } catch (error) {
    console.error('Error connecting to Firebase emulators:', error);
    console.log('Using production Firebase services instead');
  }
} else {
  console.log('Using production Firebase services');
}

// Inicializar persistência offline quando a aplicação carrega
if (typeof window !== 'undefined') {
  // Aguardar um pouco para evitar conflitos de inicialização
  setTimeout(() => {
    enableOfflinePersistence();
  }, 1000);
}

// Helper function to get company-specific collection path - VERSÃO CORRIGIDA
export const getCompanyCollection = (collectionName: string, companyId?: string) => {
  // Obter companyId de forma mais robusta
  const finalCompanyId = companyId || 
                        localStorage.getItem('companyId') || 
                        sessionStorage.getItem('companyId') || 
                        'mecald';
  
  if (!finalCompanyId) {
    console.error('Company ID is not available when trying to access collection:', collectionName);
    throw new Error(`Company ID is required for collection: ${collectionName}`);
  }
  
  const collectionPath = `companies/${finalCompanyId}/${collectionName}`;
  console.log(`✅ Accessing collection: ${collectionPath}`);
  return collectionPath;
};

// Função para validar dados antes de salvar
export const validateOrderData = (orderData: any): string[] => {
  const errors: string[] = [];
  
  if (!orderData) {
    errors.push('Order data is required');
    return errors;
  }
  
  // Validações obrigatórias
  if (!orderData.customerName && !orderData.customerId) {
    errors.push('Customer information is required');
  }
  
  if (!orderData.project) {
    errors.push('Project name is required');
  }
  
  if (!orderData.orderNumber) {
    errors.push('Order number is required');
  }
  
  // Validar items se existirem
  if (orderData.items && Array.isArray(orderData.items)) {
    orderData.items.forEach((item: any, index: number) => {
      if (!item.code) {
        errors.push(`Item ${index + 1}: Code is required`);
      }
      if (!item.description) {
        errors.push(`Item ${index + 1}: Description is required`);
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors.push(`Item ${index + 1}: Valid quantity is required`);
      }
      if (typeof item.weight !== 'number' || item.weight < 0) {
        errors.push(`Item ${index + 1}: Valid weight is required`);
      }
    });
  }
  
  return errors;
};

// Função para sanitizar dados antes de salvar
export const sanitizeOrderData = (orderData: any): any => {
  const sanitized = { ...orderData };
  
  // Remover campos undefined ou null desnecessários
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] === undefined) {
      delete sanitized[key];
    }
  });
  
  // Garantir que items seja um array válido
  if (sanitized.items && Array.isArray(sanitized.items)) {
    sanitized.items = sanitized.items.map((item: any) => ({
      ...item,
      id: item.id || `item-${Date.now()}-${Math.random()}`,
      quantity: parseFloat(item.quantity) || 1,
      weight: parseFloat(item.weight) || 0,
      progress: parseFloat(item.progress) || 0,
      overallProgress: parseFloat(item.overallProgress) || parseFloat(item.progress) || 0,
      itemNumber: parseInt(item.itemNumber) || 1
    }));
  } else {
    sanitized.items = [];
  }
  
  // Adicionar timestamps
  const now = new Date();
  if (!sanitized.createdAt) {
    sanitized.createdAt = now;
  }
  sanitized.updatedAt = now;
  
  return sanitized;
};

// Função auxiliar para debug de dados
const debugFirestoreData = (operation: string, data: any) => {
  if (import.meta.env.DEV) {
    console.group(`🔍 Firestore Debug - ${operation}`);
    console.log('Data:', data);
    if (data && typeof data === 'object') {
      console.log('Data keys:', Object.keys(data));
      if (data.items && Array.isArray(data.items)) {
        console.log('Items count:', data.items.length);
        console.log('Sample item:', data.items[0]);
      }
    }
    console.groupEnd();
  }
};

// Export initialized services
export { 
  auth, 
  db, 
  storage, 
  functions,
  isOnline,
  addConnectionListener,
  enableOfflinePersistence,
  firestoreOperation,
  checkFirestoreHealth,
  reinitializeConnection,
  withRetry,
  debugFirestoreData
};

export default app;
