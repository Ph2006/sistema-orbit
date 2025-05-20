import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, QrCode, Save, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, OrderItem } from '../types/kanban';
import QRCodeScanner from './QRCodeScanner';

interface ScanResultProps {
  success: boolean;
  message: string;
  onDismiss: () => void;
}

const ScanResult: React.FC<ScanResultProps> = ({ success, message, onDismiss }) => (
  <div className={`p-6 rounded-lg shadow-lg ${
    success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
  }`}>
    <div className="flex justify-between items-start">
      <div className="flex items-center">
        {success ? (
          <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
        ) : (
          <AlertTriangle className="h-6 w-6 text-red-500 mr-2" />
        )}
        <div className={`font-medium ${success ? 'text-green-800' : 'text-red-800'}`}>
          {success ? 'Sucesso!' : 'Erro!'}
        </div>
      </div>
      <button 
        onClick={onDismiss} 
        className="text-gray-500 hover:text-gray-700"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
    <p className={`mt-2 ${success ? 'text-green-700' : 'text-red-700'}`}>
      {message}
    </p>
  </div>
);

const QRProgressScan: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = (url: string) => { window.location.href = url; };
  
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [item, setItem] = useState<OrderItem | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [newProgress, setNewProgress] = useState<number>(0);
  const [stagesList, setStagesList] = useState<string[]>([]);

  useEffect(() => {
    if (code) {
      processCode(code);
    }
    
    // Load available manufacturing stages
    const loadAvailableStages = async () => {
      try {
        const stagesQuery = query(collection(db, 'manufacturingStages'), orderBy('order', 'asc'));
        const stagesSnapshot = await getDocs(stagesQuery);
        
        if (!stagesSnapshot.empty) {
          const stages = stagesSnapshot.docs
            .map(doc => doc.data().name as string)
            .filter(Boolean);
          setStagesList(stages);
        }
      } catch (error) {
        console.error('Error loading manufacturing stages:', error);
      }
    };
    
    loadAvailableStages();
  }, [code]);

  const handleManualCodeEntry = (manualCode: string) => {
    processCode(manualCode);
  };

  const processCode = async (codeStr: string) => {
    try {
      // Code format: OP_UPDATE|orderId|itemId|stage
      if (!codeStr.startsWith('OP_UPDATE|')) {
        setScanResult({
          success: false,
          message: "Código QR inválido. Formato não reconhecido."
        });
        return;
      }

      const parts = codeStr.split('|');
      if (parts.length !== 4) {
        setScanResult({
          success: false,
          message: "Código QR malformatado. Informações insuficientes."
        });
        return;
      }

      const [_, orderId, itemId, stageName] = parts;

      // Get the order
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await getDoc(orderRef);
      if (!orderDoc.exists()) {
        setScanResult({
          success: false,
          message: "Pedido não encontrado."
        });
        return;
      }

      const orderData = orderDoc.data() as Order;
      const foundItem = orderData.items.find(i => i.id === itemId);
      
      if (!foundItem) {
        setScanResult({
          success: false,
          message: "Item não encontrado no pedido."
        });
        return;
      }

      // Set state
      setOrder({...orderData, id: orderId});
      setItem(foundItem);
      setStage(stageName);
      setCurrentProgress(foundItem.progress?.[stageName] || 0);
      setNewProgress(foundItem.progress?.[stageName] || 0);
      
    } catch (error) {
      console.error("Error processing QR code:", error);
      setScanResult({
        success: false,
        message: "Erro ao processar código QR. Por favor, tente novamente."
      });
    }
  };

  const handleScanSuccess = (scannedCode: string) => {
    setShowScanner(false);
    processCode(scannedCode);
  };

  const handleScanError = (errorMessage: string) => {
    setScanResult({
      success: false,
      message: errorMessage
    });
  };

  const handleSaveProgress = async () => {
    if (!order || !item || !stage) return;

    try {
      // Update the item progress
      const updatedItems = order.items.map(i => {
        if (i.id === item.id) {
          // Update progress for this stage
          const progress = i.progress || {};
          progress[stage] = newProgress;
          
          // Add completedDate if all stages are 100% complete
          let isFullyComplete = true;
          for (const stageProgress of Object.values(progress)) {
            if (stageProgress !== 100) {
              isFullyComplete = false;
              break;
            }
          }
          
          return {
            ...i,
            progress,
            completedDate: isFullyComplete ? new Date().toISOString() : i.completedDate
          };
        }
        return i;
      });

      // Update the order in Firestore
      await updateDoc(doc(db, 'orders', order.id), {
        items: updatedItems
      });

      setScanResult({
        success: true,
        message: `Progresso da etapa "${stage}" do item ${item.itemNumber} (${item.code}) atualizado com sucesso para ${newProgress}%.`
      });
      
      // Reset for new scan
      setItem(null);
      setStage(null);
      setCurrentProgress(0);
      setNewProgress(0);
      
    } catch (error) {
      console.error("Error updating progress:", error);
      setScanResult({
        success: false,
        message: "Erro ao atualizar progresso. Por favor, tente novamente."
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-bold">Atualização de Progresso</h1>
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>

          {scanResult && (
            <div className="mb-6">
              <ScanResult 
                success={scanResult.success} 
                message={scanResult.message}
                onDismiss={() => setScanResult(null)} 
              />
            </div>
          )}

          {!item && !stage && !scanResult && (
            <div className="space-y-6">
              <div className="text-center p-8">
                <QrCode className="h-16 w-16 text-blue-500 mx-auto mb-4" />
                <h2 className="text-lg font-medium mb-2">Escaneie o QR Code</h2>
                <p className="text-gray-600">
                  Escaneie o código QR da etapa de produção para atualizar o progresso.
                </p>
              </div>
              
              <div className="flex flex-col space-y-4">
                <button
                  onClick={() => setShowScanner(true)}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                >
                  Abrir Scanner
                </button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">ou digite manualmente</span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  <input
                    type="text"
                    id="manual-code-input"
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    placeholder="OP_UPDATE|orderId|itemId|stage"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('manual-code-input') as HTMLInputElement;
                      if (input?.value) handleManualCodeEntry(input.value);
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Processar
                  </button>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-blue-800 mb-2">Etapas de Fabricação Disponíveis:</h3>
                <div className="text-sm text-blue-700">
                  {stagesList.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {stagesList.map((stageName, index) => (
                        <div key={index} className="p-1 rounded bg-blue-100 text-blue-800">
                          {stageName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Carregando etapas disponíveis...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {item && stage && (
            <div className="space-y-6">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium mb-2">Informações do Item</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-600">Pedido:</span> #{order?.orderNumber} - {order?.customer}</p>
                  <p><span className="text-gray-600">Item:</span> {item.itemNumber} - {item.code}</p>
                  <p><span className="text-gray-600">Descrição:</span> {item.description}</p>
                  <p><span className="text-gray-600">Etapa:</span> {stage}</p>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-4">Atualizar Progresso</h3>
                <div className="flex items-center mb-2">
                  <span className="text-sm text-gray-600 w-32">Progresso Atual:</span>
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className={`h-2.5 rounded-full ${
                          currentProgress === 100 ? 'bg-green-500' :
                          currentProgress >= 70 ? 'bg-blue-500' :
                          currentProgress >= 30 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${currentProgress}%` }}
                      ></div>
                    </div>
                    <div className="text-right text-xs mt-1 text-gray-600">{currentProgress}%</div>
                  </div>
                </div>

                <div className="mt-8">
                  <label className="font-medium text-gray-700 mb-2 block">
                    Novo Progresso: {newProgress}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newProgress}
                    onChange={(e) => setNewProgress(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button
                    onClick={() => {
                      setItem(null);
                      setStage(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={handleSaveProgress}
                    disabled={newProgress === currentProgress}
                    className={`flex items-center px-4 py-2 rounded-lg ${
                      newProgress === currentProgress
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <Save className="h-5 w-5 mr-2" />
                    Salvar Progresso
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scanner Modal */}
        {showScanner && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Scanner QR Code</h3>
                <button 
                  onClick={() => setShowScanner(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <QRCodeScanner
                onSuccess={handleScanSuccess}
                onError={handleScanError}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRProgressScan;