import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  writeBatch, 
  query,
  limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// List of collections to migrate
const COLLECTIONS_TO_MIGRATE = [
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

// Function to migrate a single collection for a company
export const migrateCollection = async (
  collectionName: string, 
  companyId: string,
  batchSize = 100
): Promise<number> => {
  try {
    console.log(`Migrating collection ${collectionName} for company ${companyId}...`);
    
    // Get source collection reference
    const sourceRef = collection(db, collectionName);
    
    // Get target collection reference
    const targetPath = `empresa/${companyId}/${collectionName}`;
    
    // Get documents from the source collection
    const snapshot = await getDocs(sourceRef);
    
    if (snapshot.empty) {
      console.log(`Collection ${collectionName} is empty, skipping migration.`);
      return 0;
    }
    
    let processedCount = 0;
    let currentBatch = writeBatch(db);
    let batchCount = 0;
    
    // Loop through documents and add them to batch
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const targetDocRef = doc(db, targetPath, docSnapshot.id);
      
      currentBatch.set(targetDocRef, data);
      batchCount++;
      processedCount++;
      
      // If batch is full, commit it
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        console.log(`Committed batch of ${batchCount} documents for ${collectionName}`);
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    }
    
    // Commit any remaining documents
    if (batchCount > 0) {
      await currentBatch.commit();
      console.log(`Committed final batch of ${batchCount} documents for ${collectionName}`);
    }
    
    console.log(`Successfully migrated ${processedCount} documents from ${collectionName} to ${targetPath}`);
    return processedCount;
  } catch (error) {
    console.error(`Error migrating collection ${collectionName}:`, error);
    throw error;
  }
};

// Function to migrate all collections for a specific company
export const migrateDataForCompany = async (companyId: string): Promise<Record<string, number>> => {
  const results: Record<string, number> = {};
  
  try {
    for (const collectionName of COLLECTIONS_TO_MIGRATE) {
      const count = await migrateCollection(collectionName, companyId);
      results[collectionName] = count;
    }
    
    console.log(`Migration completed for company ${companyId}`, results);
    return results;
  } catch (error) {
    console.error(`Error in migration for company ${companyId}:`, error);
    throw error;
  }
};

// Main migration function to migrate data for all companies
export const migrateAllData = async (): Promise<Record<string, Record<string, number>>> => {
  const companyIds = ['mecald', 'brasmold'];
  const allResults: Record<string, Record<string, number>> = {};
  
  for (const companyId of companyIds) {
    allResults[companyId] = await migrateDataForCompany(companyId);
  }
  
  return allResults;
};

// Check if data already exists in the new structure
export const checkMigratedData = async (companyId: string): Promise<boolean> => {
  try {
    // Check for any migrated data in a common collection like customers
    const targetPath = `empresa/${companyId}/customers`;
    const testQuery = query(collection(db, targetPath), limit(1));
    const snapshot = await getDocs(testQuery);
    
    return !snapshot.empty;
  } catch (error) {
    // More specific error logging
    console.error('Error checking migrated data:', error);
    
    // Improved permission error detection
    if (error instanceof Error && 
        (error.message.includes('permission') || 
         error.message.includes('permissions') || 
         error.message.includes('Missing or insufficient permissions'))) {
      console.log('Permission error when checking migration status - assuming data is already migrated');
      return true; // Return true to indicate migration is not needed
    }
    
    // For other errors, continue to return false
    return false;
  }
};