import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  writeBatch, 
  query,
  limit 
} from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';

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
    console.log(`🔄 Migrating collection ${collectionName} for company ${companyId}...`);
    
    // Get source collection reference
    const sourceRef = collection(db, collectionName);
    
    // CORREÇÃO: Usar a estrutura correta companies/{companyId}/{collection}
    const targetPath = `companies/${companyId}/${collectionName}`;
    console.log(`📍 Target path: ${targetPath}`);
    
    // Get documents from the source collection
    const snapshot = await getDocs(sourceRef);
    
    if (snapshot.empty) {
      console.log(`📭 Collection ${collectionName} is empty, skipping migration.`);
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
        console.log(`✅ Committed batch of ${batchCount} documents for ${collectionName}`);
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    }
    
    // Commit any remaining documents
    if (batchCount > 0) {
      await currentBatch.commit();
      console.log(`✅ Committed final batch of ${batchCount} documents for ${collectionName}`);
    }
    
    console.log(`🎉 Successfully migrated ${processedCount} documents from ${collectionName} to ${targetPath}`);
    return processedCount;
  } catch (error: any) {
    console.error(`❌ Error migrating collection ${collectionName}:`, error);
    console.error('❌ Error code:', error?.code);
    console.error('❌ Error message:', error?.message);
    throw error;
  }
};

// Function to migrate all collections for a specific company
export const migrateDataForCompany = async (companyId: string): Promise<Record<string, number>> => {
  const results: Record<string, number> = {};
  
  try {
    console.log(`🚀 Starting migration for company: ${companyId}`);
    
    for (const collectionName of COLLECTIONS_TO_MIGRATE) {
      try {
        const count = await migrateCollection(collectionName, companyId);
        results[collectionName] = count;
      } catch (collectionError: any) {
        console.error(`❌ Failed to migrate ${collectionName} for ${companyId}:`, collectionError);
        results[collectionName] = -1; // Mark as failed
        
        // Continue with other collections instead of stopping completely
        if (collectionError?.code === 'permission-denied') {
          console.warn(`⚠️ Permission denied for ${collectionName}, continuing with next collection...`);
          continue;
        }
        
        // For other critical errors, you might want to stop
        // throw collectionError;
      }
    }
    
    console.log(`🎯 Migration completed for company ${companyId}`, results);
    return results;
  } catch (error: any) {
    console.error(`❌ Critical error in migration for company ${companyId}:`, error);
    throw error;
  }
};

// Main migration function to migrate data for all companies
export const migrateAllData = async (): Promise<Record<string, Record<string, number>>> => {
  const companyIds = ['mecald', 'brasmold'];
  const allResults: Record<string, Record<string, number>> = {};
  
  console.log('🌟 Starting full data migration...');
  
  for (const companyId of companyIds) {
    try {
      allResults[companyId] = await migrateDataForCompany(companyId);
    } catch (companyError) {
      console.error(`❌ Failed to migrate data for company ${companyId}:`, companyError);
      allResults[companyId] = {}; // Empty result for failed company
    }
  }
  
  console.log('🏁 Full migration completed:', allResults);
  return allResults;
};

// CORREÇÃO: Função mais robusta para verificar dados migrados
export const checkMigratedData = async (companyId: string): Promise<boolean> => {
  try {
    console.log(`🔍 Checking migrated data for company: ${companyId}`);
    
    // CORREÇÃO: Usar a estrutura correta
    const targetPath = `companies/${companyId}/customers`;
    console.log(`📍 Checking path: ${targetPath}`);
    
    const testQuery = query(collection(db, targetPath), limit(1));
    const snapshot = await getDocs(testQuery);
    
    const hasData = !snapshot.empty;
    console.log(`📊 Migration check result for ${companyId}: ${hasData ? 'Data exists' : 'No data found'}`);
    
    return hasData;
  } catch (error: any) {
    console.error('❌ Error checking migrated data:', error);
    console.error('❌ Error code:', error?.code);
    console.error('❌ Error message:', error?.message);
    
    // CORREÇÃO: Melhor tratamento de erro de permissão
    if (error?.code === 'permission-denied') {
      console.warn('⚠️ Permission denied when checking migration status');
      console.warn('⚠️ This might be due to Firestore rules or missing authentication');
      
      // DECISÃO: Retornar true para evitar tentativas de migração desnecessárias
      // quando há problemas de permissão
      return true;
    }
    
    // Para outros erros, assumir que não há dados migrados
    console.warn('⚠️ Assuming no migrated data due to error');
    return false;
  }
};

// NOVA: Função para verificar se a migração é necessária de forma mais segura
export const isMigrationNeeded = async (companyId: string): Promise<boolean> => {
  try {
    // Verificar apenas se conseguimos acessar a estrutura companies
    const companiesRef = collection(db, 'companies');
    const testQuery = query(companiesRef, limit(1));
    await getDocs(testQuery);
    
    // Se conseguir acessar, verificar se há dados para a empresa específica
    return !(await checkMigratedData(companyId));
  } catch (error: any) {
    console.error('❌ Error checking if migration is needed:', error);
    
    if (error?.code === 'permission-denied') {
      console.warn('⚠️ Cannot check migration status due to permissions');
      return false; // Não tentar migrar se não conseguir verificar
    }
    
    return false;
  }
};

// NOVA: Função para executar migração de forma segura
export const safeMigrateData = async (companyId: string): Promise<boolean> => {
  try {
    console.log(`🔒 Safe migration check for company: ${companyId}`);
    
    // Verificar se a migração é necessária
    const needsMigration = await isMigrationNeeded(companyId);
    
    if (!needsMigration) {
      console.log(`✅ No migration needed for company: ${companyId}`);
      return true;
    }
    
    console.log(`🔄 Starting safe migration for company: ${companyId}`);
    await migrateDataForCompany(companyId);
    
    console.log(`✅ Safe migration completed for company: ${companyId}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Safe migration failed for company ${companyId}:`, error);
    return false;
  }
};