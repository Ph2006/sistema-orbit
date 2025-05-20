import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, CheckCircle, Loader, FileX, ArrowLeft } from 'lucide-react';
import { cleanAllBrasmoldData, brasmoldHasData } from '../utils/cleanBrasmoldData';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const BrasmoldCleanup: React.FC = () => {
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleaningComplete, setCleaningComplete] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [cleaningResults, setCleaningResults] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const { companyId } = useAuthStore();
  
  const navigate = useNavigate();
  
  // Check if Brasmold has any data
  useEffect(() => {
    const checkForData = async () => {
      try {
        const dataExists = await brasmoldHasData();
        setHasData(dataExists);
      } catch (error) {
        console.error('Error checking for data:', error);
        setError('Erro ao verificar dados da Brasmold.');
      }
    };
    
    checkForData();
  }, []);

  // Redirect if not Brasmold company
  useEffect(() => {
    if (companyId !== 'brasmold') {
      navigate('/dashboard');
    }
  }, [companyId, navigate]);
  
  const handleCleanData = async () => {
    // Verify the confirmation text
    if (confirmText !== 'LIMPAR BRASMOLD') {
      setError('Por favor, digite "LIMPAR BRASMOLD" para confirmar a exclusão.');
      return;
    }
    
    try {
      setIsCleaning(true);
      setError(null);
      
      const results = await cleanAllBrasmoldData();
      setCleaningResults(results);
      setCleaningComplete(true);
      setHasData(false);
      
      setIsCleaning(false);
    } catch (error) {
      console.error('Cleaning error:', error);
      setError('Erro durante a limpeza dos dados. Por favor, tente novamente.');
      setIsCleaning(false);
    }
  };
  
  const totalDeletedDocuments = cleaningResults 
    ? Object.values(cleaningResults).reduce((sum, count) => sum + count, 0)
    : 0;
  
  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl w-full mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Limpar Dados da Brasmold</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
        
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 font-medium">
                ATENÇÃO: Esta operação irá excluir PERMANENTEMENTE todos os dados da empresa Brasmold.
              </p>
              <p className="text-sm text-red-700 mt-2">
                Esta ação é irreversível e não pode ser desfeita. Certifique-se de que você tem backups
                de qualquer dado importante antes de prosseguir.
              </p>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {!hasData && !cleaningComplete && (
          <div className="mb-6 p-4 bg-gray-50 border-l-4 border-gray-500 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <FileX className="h-5 w-5 text-gray-500" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-gray-700">
                  Não foram encontrados dados da Brasmold para limpar. A empresa Brasmold parece já estar vazia.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {cleaningComplete ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <div className="flex items-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
              <h2 className="text-xl font-semibold text-green-800">Limpeza Concluída com Sucesso</h2>
            </div>
            
            <p className="text-green-700 mb-4">
              Todos os dados da empresa Brasmold foram removidos com sucesso.
            </p>
            
            {cleaningResults && (
              <div>
                <p className="font-medium text-green-800 mb-2">Resumo da limpeza:</p>
                <div className="bg-white rounded-md p-4 border border-green-200">
                  <p className="font-bold text-green-800 mb-2">
                    Total de documentos excluídos: {totalDeletedDocuments}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {Object.entries(cleaningResults)
                      .filter(([_, count]) => count > 0)
                      .map(([collection, count]) => (
                        <div key={collection} className="flex justify-between">
                          <span>{collection}:</span>
                          <span className="font-semibold">{count} documentos</span>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            )}
            
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-6 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Voltar para o Dashboard
            </button>
          </div>
        ) : (
          <>
            {hasData && (
              <>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Para confirmar a exclusão, digite "LIMPAR BRASMOLD":
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="w-full rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring focus:ring-red-200"
                    placeholder="LIMPAR BRASMOLD"
                    autoCapitalize="characters"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Esta confirmação garante que você está ciente das consequências dessa ação.
                  </p>
                </div>
                
                <button
                  onClick={handleCleanData}
                  disabled={isCleaning || confirmText !== 'LIMPAR BRASMOLD'}
                  className={`w-full py-3 px-4 rounded-md font-medium mt-4 flex items-center justify-center ${
                    confirmText !== 'LIMPAR BRASMOLD'
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : isCleaning
                      ? 'bg-red-300 text-white cursor-wait'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {isCleaning ? (
                    <>
                      <Loader className="h-5 w-5 mr-2 animate-spin" />
                      Limpando dados da Brasmold...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-5 w-5 mr-2" />
                      Limpar Todos os Dados da Brasmold
                    </>
                  )}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BrasmoldCleanup;