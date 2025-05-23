import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { useAuthStore } from '../store/authStore';

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
// For WebContainer environments, we'll default to production services
const useEmulators = false; // Set this to true only when you're running emulators locally

// Only connect to emulators if explicitly enabled
if (useEmulators) {
  try {
    // Connect to Firestore emulator
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('Connected to Firestore emulator');
    
    // Connect to Auth emulator (uncomment if needed)
    // connectAuthEmulator(auth, 'http://localhost:9099');
    
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
export const getCompanyCollection = (collectionName: string) => {
  // Get companyId directly from the auth store
  const { companyId } = useAuthStore.getState();
  
  // Fallback to localStorage if auth store is not yet initialized or companyId is null
  // This might still happen during initial load, but relying on auth state is better.
  const finalCompanyId = companyId || localStorage.getItem('companyId');

  if (!finalCompanyId) {
    // Handle the case where companyId is still not available
    console.error('Company ID is not available when trying to access collection:', collectionName);
    // You might want to return an invalid path or throw an error here
    // Returning a path that likely won't exist will prevent unintentional data access
    return `invalid/company/collection/${collectionName}`;
  }
  
  // Log which collection we're accessing
  console.log(`Accessing collection: companies/${finalCompanyId}/${collectionName}`);
  
  // Return the company-specific path structure
  return `companies/${finalCompanyId}/${collectionName}`;
};

// Export initialized services
export { auth, db, storage, functions };