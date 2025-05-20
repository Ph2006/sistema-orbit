import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, RefreshCw, ArrowLeft, Info } from 'lucide-react';
import { migrateDataForCompany, checkMigratedData } from '../utils/migrateData';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const MecaldDataRestore: React.FC = () => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const [migrationResults, setMigrationResults] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setCompanyId } = useAuthStore();
  
  // Check if migration has already been done
  useEffect(() => {
    const checkMigration = async () => {
      try {
        const mecaldMigrated = await checkMigratedData('mecald');
        setMigrationComplete(mecaldMigrated);
      } catch (error) {
        console.error('Error checking migration status:', error);
      }
    };
    
    checkMigration();
  }, []);
  
  const handleRestoreMecald = async () => {
    try {
      setIsMigrating(true);
      setError(null);
      
      // Make sure company ID is set to mecald
      setCompanyId('mecald');
      localStorage.setItem('companyId', 'mecald');
      
      // Run the migration
      const results = await migrateDataForCompany('mecald');
      setMigrationResults(results);
      setMigrationComplete(true);
      setIsMigrating(false);
    } catch (error) {
      console.error('Migration error:', error);
      setError('Erro durante a migração. Por favor, tente novamente.');
      setIsMigrating(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl w-full mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Restaurar Dados da Mecald</h1>
        <button 
          onClick={() => navigate('/dashboard')}
          className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
      
      <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
        <div className="flex">
          <Info className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Sobre a Restauração de Dados</h3>
            <p className="text-sm text-blue-700 mt-1">
              Esta ferramenta irá migrar os dados existentes nas coleções principais para 
              coleções específicas da empresa Mecald. Este processo é necessário para utilizar
              corretamente o sistema.
            </p>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="p-6 border rounded-lg bg-white shadow-sm">
        <div className="flex items-center mb-4">
          {migrationComplete ? (
            <CheckCircle2 className="h-8 w-8 text-green-500 mr-4" />
          ) : isMigrating ? (
            <Clock className="h-8 w-8 text-blue-500 mr-4 animate-pulse" />
          ) : (
            <RefreshCw className="h-8 w-8 text-blue-500 mr-4" />
          )}
          <div>
            <h3 className="text-lg font-medium">
              {migrationComplete 
                ? 'Dados da Mecald Restaurados' 
                : isMigrating 
                ? 'Restaurando Dados da Mecald...'
                : 'Restaurar Dados da Mecald'}
            </h3>
            <p className="text-gray-600 mt-1">
              {migrationComplete 
                ? 'Os dados foram migrados com sucesso para a estrutura específica da empresa.' 
                : isMigrating 
                ? 'Processo de migração em andamento. Não feche ou recarregue esta página.' 
                : 'Clique no botão para iniciar o processo de restauração dos dados da Mecald.'}
            </p>
          </div>
        </div>
        
        {migrationResults && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-800 mb-2">Resultados da Restauração</h4>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
              {Object.entries(migrationResults)
                .filter(([_, count]) => count > 0)
                .map(([collection, count]) => (
                  <li key={collection} className="flex justify-between">
                    <span className="text-gray-700">{collection}:</span>
                    <span className="font-medium">{count} documentos</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
        
        <div className="mt-6">
          <button
            onClick={handleRestoreMecald}
            disabled={isMigrating || migrationComplete}
            className={`w-full py-2 px-4 rounded-md font-medium flex items-center justify-center ${
              migrationComplete
                ? 'bg-green-100 text-green-800 cursor-not-allowed'
                : isMigrating
                ? 'bg-blue-300 text-white cursor-wait'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isMigrating ? (
              <>
                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                Restaurando dados...
              </>
            ) : migrationComplete ? (
              <>
                <CheckCircle2 className="h-5 w-5 mr-2" />
                Restauração Concluída
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5 mr-2" />
                Restaurar Dados da Mecald
              </>
            )}
          </button>
          
          {migrationComplete && (
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full mt-4 py-2 px-4 rounded-md font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              Voltar para o Dashboard
            </button>
          )}
        </div>
      </div>
      
      <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              <strong>Importante:</strong> Este processo copiará os dados existentes para 
              a nova estrutura específica da empresa Mecald. Certifique-se de que deseja
              restaurar ou reconfigurar o sistema para a empresa Mecald antes de prosseguir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MecaldDataRestore;