import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { checkMigratedData } from '../utils/migrateData';
import { useAuthStore } from '../store/authStore';

const MigrationNotification: React.FC = () => {
  const [needsMigration, setNeedsMigration] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { companyId } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Skip migration notification for Brasmold
    if (companyId === 'brasmold') {
      setIsChecking(false);
      setNeedsMigration(false);
      return;
    }
    
    const checkMigration = async () => {
      try {
        // Check if the company's data has already been migrated
        const isMigrated = await checkMigratedData(companyId || 'mecald');
        setNeedsMigration(!isMigrated);
      } catch (error) {
        console.error('Error checking migration status:', error);
        setNeedsMigration(true); // Assume migration is needed if check fails
      } finally {
        setIsChecking(false);
      }
    };
    
    checkMigration();
  }, [companyId]);

  if (isChecking) {
    return null; // Don't show anything while checking
  }

  if (!needsMigration) {
    return null; // Don't show if migration is not needed
  }

  // Never show migration notification for Brasmold
  if (companyId === 'brasmold') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow-lg z-50">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="ml-3">
          <p className="text-sm text-yellow-700">
            <strong>Migração de dados necessária:</strong> Seus dados precisam ser migrados para a nova estrutura.
          </p>
          <div className="mt-2">
            <button
              onClick={() => navigate('/migrate')}
              className="px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
            >
              Migrar agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MigrationNotification;