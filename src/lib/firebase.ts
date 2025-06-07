import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
// REMOVA esta importação para quebrar a dependência circular
// import { useAuthStore } from '../store/authStore';

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

// Initialize Firestore
const db = getFirestore(app);

// Initialize Storage
const storage = getStorage(app);

// Initialize Functions
const functions = getFunctions(app);

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

// Helper function to get company-specific collection path
// MODIFICADA para não depender de authStore
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

// Export initialized services
export { auth, db, storage, functions };
