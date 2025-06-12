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

// Utilitário para retry de operações com problemas de conectividade
const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      console.log(`Attempt ${attempt} failed:`, error.code, error.message);
      
      // Não fazer retry para erros de permissão ou dados inválidos
      if (
        error.code === 'permission-denied' ||
        error.code === 'invalid-argument' ||
        error.code === 'not-found' ||
        error.code === 'already-exists'
      ) {
        throw error;
      }
      
      // Para erros de conectividade, fazer retry
      if (
        error.code === 'unavailable' ||
        error.code === 'deadline-exceeded' ||
        error.code === 'cancelled' ||
        error.message.includes('QUIC') ||
        error.message.includes('network') ||
        error.message.includes('fetch')
      ) {
        if (attempt < maxRetries) {
          const waitTime = delay * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`🔄 Retry attempt ${attempt}/${maxRetries} after ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      
      throw error;
    }
  }
  
  throw lastError!;
};

// Utilitário para operações Firestore com retry automático
const firestoreOperation = {
  withRetry: <T>(operation: () => Promise<T>) => withRetry(operation, 3, 1000)
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

// Helper function to get company-specific collection path
export const getCompanyCollection = (collectionName: string, companyId?: string) => {
  // Obter companyId do parâmetro ou do localStorage, mas NÃO do authStore
  const finalCompanyId = companyId || localStorage.getItem('companyId') || 'mecald';
  
  if (!finalCompanyId) {
    console.error('Company ID is not available when trying to access collection:', collectionName);
    return `invalid/company/collection/${collectionName}`;
  }
  
  console.log(`Accessing collection: companies/${finalCompanyId}/${collectionName}`);
  return `companies/${finalCompanyId}/${collectionName}`;
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
