import { 
  collection, 
  getDocs, 
  deleteDoc, 
  doc, 
  writeBatch, 
  query, 
  limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// List of collections to clean
const COLLECTIONS_TO_CLEAN = [
  'customers',
  'orders',
  'columns',
  'materialRequisitions',
  'nonConformities',
  'productionOrders',
  'projects',
  'quotations',
  'suppliers',
  'tasks',
  'teamMembers',
  'manufacturingStages',
  'engineeringCalls',
  'inspectionResults',
  'documentTemplates',
  'qualityDocuments',
  'cuttingPlans',
  'costs'
];

// Function to delete all documents in a collection for Brasmold
export const cleanCollectionForBrasmold = async (
  collectionName: string,
  batchSize = 100
): Promise<number> => {
  try {
    console.log(`Cleaning collection ${collectionName} for Brasmold...`);
    
    // Get the company-specific collection reference
    const collectionPath = `empresa/brasmold/${collectionName}`;
    const collectionRef = collection(db, collectionPath);
    
    // Get all documents from this collection
    const snapshot = await getDocs(collectionRef);
    
    if (snapshot.empty) {
      console.log(`Collection ${collectionPath} is empty, nothing to clean.`);
      return 0;
    }
    
    let deletedCount = 0;
    let currentBatch = writeBatch(db);
    let batchCount = 0;
    
    // Process documents in batches
    for (const docSnapshot of snapshot.docs) {
      const docRef = doc(db, collectionPath, docSnapshot.id);
      currentBatch.delete(docRef);
      batchCount++;
      deletedCount++;
      
      // If batch is full, commit it
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        console.log(`Deleted batch of ${batchCount} documents from ${collectionPath}`);
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    }
    
    // Commit any remaining documents
    if (batchCount > 0) {
      await currentBatch.commit();
      console.log(`Deleted final batch of ${batchCount} documents from ${collectionPath}`);
    }
    
    console.log(`Successfully deleted ${deletedCount} documents from ${collectionPath}`);
    return deletedCount;
  } catch (error) {
    console.error(`Error cleaning collection ${collectionName}:`, error);
    throw error;
  }
};

// Function to clean all Brasmold collections
export const cleanAllBrasmoldData = async (): Promise<Record<string, number>> => {
  const results: Record<string, number> = {};
  
  try {
    for (const collectionName of COLLECTIONS_TO_CLEAN) {
      const count = await cleanCollectionForBrasmold(collectionName);
      results[collectionName] = count;
    }
    
    console.log(`Cleaning completed for Brasmold company`, results);
    return results;
  } catch (error) {
    console.error(`Error during data cleaning for Brasmold:`, error);
    throw error;
  }
};

// Check if Brasmold has any data
export const brasmoldHasData = async (): Promise<boolean> => {
  try {
    // Check a few important collections
    const collectionsToCheck = ['customers', 'orders', 'suppliers'];
    
    for (const collectionName of collectionsToCheck) {
      const collectionPath = `empresa/brasmold/${collectionName}`;
      const testQuery = query(collection(db, collectionPath), limit(1));
      const snapshot = await getDocs(testQuery);
      
      if (!snapshot.empty) {
        return true; // Found data in this collection
      }
    }
    
    return false; // No data found in any of the checked collections
  } catch (error) {
    console.error('Error checking Brasmold data:', error);
    return false;
  }
};