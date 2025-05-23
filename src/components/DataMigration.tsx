import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, ArrowRight, Loader } from 'lucide-react';
import { migrateAllData, migrateDataForCompany, checkMigratedData } from '../utils/migrateData';

const DataMigration: React.FC = () => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState({
    mecald: false,
    brasmold: false
  });
  const [migrationResults, setMigrationResults] = useState<Record<string, Record<string, number>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Check if migration has already been done
  useEffect(() => {
    // const checkMigration = async () => {
    //   try {
    //     const mecaldMigrated = await checkMigratedData('mecald');
    //     const brasmoldMigrated = await checkMigratedData('brasmold');
    //     
    //     setMigrationComplete({
    //       mecald: mecaldMigrated,
    //       brasmold: brasmoldMigrated
    //     });
    //   } catch (error) {
    //     console.error('Error checking migration status:', error);
    //   }
    // };
    // 
    // checkMigration();
  }, []);
  
  const handleMigrateAll = async () => {
    try {
      setIsMigrating(true);
      setError(null);
      
      // const results = await migrateAllData();
      setMigrationResults(results);
      
      setMigrationComplete({
        mecald: true,
        brasmold: true
      });
      
      setIsMigrating(false);
    } catch (error) {
      console.error('Migration error:', error);
      setError('Erro durante a migração. Por favor, tente novamente.');
      setIsMigrating(false);
    }
  };
  
  const handleMigrateCompany = async (companyId: 'mecald' | 'brasmold') => {
    try {
      setIsMigrating(true);
      setError(null);
      
      const results = await migrateDataForCompany(companyId);
      setMigrationResults(prev => ({
        ...prev,
        [companyId]: results
      }));
      
      setMigrationComplete(prev => ({
        ...prev,
        [companyId]: true
      }));
      
      setIsMigrating(false);
    } catch (error) {
      console.error(`Migration error for ${companyId}:`, error);
      setError(`Erro durante a migração para ${companyId}. Por favor, tente novamente.`);
      setIsMigrating(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl w-full mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Migração de Dados</h1>
        <p className="text-gray-600">
          Esta ferramenta irá migrar os dados existentes nas coleções principais para 
          coleções específicas de empresa, separando os dados da Mecald e da Brasmold.
        </p>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className={`border rounded-lg p-6 ${
          migrationComplete.mecald ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
        }`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Mecald</h2>
            {migrationComplete.mecald ? (
              <span className="flex items-center text-green-600 font-medium">
                <CheckCircle className="h-5 w-5 mr-2" />
                Migração Completa
              </span>
            ) : (
              <span className="text-gray-500">Não migrado</span>
            )}
          </div>
          
          <p className="text-gray-600 mb-4">
            Migrar todos os dados para a coleção empresa/mecald/...
          </p>
          
          <button
            onClick={() => handleMigrateCompany('mecald')}
            disabled={isMigrating || migrationComplete.mecald}
            className={`w-full py-2 px-4 rounded-md font-medium flex items-center justify-center ${
              migrationComplete.mecald
                ? 'bg-green-100 text-green-800 cursor-not-allowed'
                : isMigrating
                ? 'bg-blue-300 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isMigrating ? (
              <>
                <Loader className="h-5 w-5 mr-2 animate-spin" />
                Migrando...
              </>
            ) : migrationComplete.mecald ? (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Já Migrado
              </>
            ) : (
              <>
                <ArrowRight className="h-5 w-5 mr-2" />
                Migrar Mecald
              </>
            )}
          </button>
          
          {migrationResults?.mecald && (
            <div className="mt-4 text-sm">
              <p className="font-medium">Resultados da migração:</p>
              <ul className="mt-2 space-y-1">
                {Object.entries(migrationResults.mecald)
                  .filter(([_, count]) => count > 0)
                  .map(([collection, count]) => (
                    <li key={collection}>
                      {collection}: <span className="font-semibold">{count}</span> documentos
                    </li>
                  ))
                }
              </ul>
            </div>
          )}
        </div>
        
        <div className={`border rounded-lg p-6 ${
          migrationComplete.brasmold ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
        }`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Brasmold</h2>
            {migrationComplete.brasmold ? (
              <span className="flex items-center text-green-600 font-medium">
                <CheckCircle className="h-5 w-5 mr-2" />
                Migração Completa
              </span>
            ) : (
              <span className="text-gray-500">Não migrado</span>
            )}
          </div>
          
          <p className="text-gray-600 mb-4">
            Migrar todos os dados para a coleção empresa/brasmold/...
          </p>
          
          <button
            onClick={() => handleMigrateCompany('brasmold')}
            disabled={isMigrating || migrationComplete.brasmold}
            className={`w-full py-2 px-4 rounded-md font-medium flex items-center justify-center ${
              migrationComplete.brasmold
                ? 'bg-green-100 text-green-800 cursor-not-allowed'
                : isMigrating
                ? 'bg-blue-300 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isMigrating ? (
              <>
                <Loader className="h-5 w-5 mr-2 animate-spin" />
                Migrando...
              </>
            ) : migrationComplete.brasmold ? (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Já Migrado
              </>
            ) : (
              <>
                <ArrowRight className="h-5 w-5 mr-2" />
                Migrar Brasmold
              </>
            )}
          </button>
          
          {migrationResults?.brasmold && (
            <div className="mt-4 text-sm">
              <p className="font-medium">Resultados da migração:</p>
              <ul className="mt-2 space-y-1">
                {Object.entries(migrationResults.brasmold)
                  .filter(([_, count]) => count > 0)
                  .map(([collection, count]) => (
                    <li key={collection}>
                      {collection}: <span className="font-semibold">{count}</span> documentos
                    </li>
                  ))
                }
              </ul>
            </div>
          )}
        </div>
      </div>
      
      <button
        onClick={handleMigrateAll}
        disabled={isMigrating || (migrationComplete.mecald && migrationComplete.brasmold)}
        className={`w-full py-3 px-4 rounded-md font-medium mt-4 flex items-center justify-center ${
          migrationComplete.mecald && migrationComplete.brasmold
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : isMigrating
            ? 'bg-purple-300 text-white cursor-wait'
            : 'bg-purple-600 text-white hover:bg-purple-700'
        }`}
      >
        {isMigrating ? (
          <>
            <Loader className="h-5 w-5 mr-2 animate-spin" />
            Migrando todas as empresas...
          </>
        ) : migrationComplete.mecald && migrationComplete.brasmold ? (
          <>
            <CheckCircle className="h-5 w-5 mr-2" />
            Todas as migrações concluídas
          </>
        ) : (
          <>
            <ArrowRight className="h-5 w-5 mr-2" />
            Migrar todas as empresas
          </>
        )}
      </button>
      
      <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              <strong>Importante:</strong> Esta migração copiará os dados existentes para 
              a nova estrutura, mas não os excluirá da estrutura antiga. Após confirmar que 
              tudo está funcionando corretamente, você pode excluir manualmente as coleções 
              antigas no Firebase Console.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataMigration;