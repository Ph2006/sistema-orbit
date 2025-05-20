import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const cleanupDatabase = async () => {
  try {
    // Get all collections we need to clean
    const collections = ['orders', 'tasks', 'taskAssignments', 'columns'];
    const batch = writeBatch(db);
    
    // Delete documents from each collection
    for (const collectionName of collections) {
      const snapshot = await getDocs(collection(db, collectionName));
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
    }
    
    // Commit the batch
    await batch.commit();
    
    console.log('Database cleanup completed successfully');
    return true;
  } catch (error) {
    console.error('Error cleaning up database:', error);
    return false;
  }
};