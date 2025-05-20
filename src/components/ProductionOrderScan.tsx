import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, XCircle, QrCode } from 'lucide-react';
import { useProductionOrderStore } from '../store/productionOrderStore';
import { useOrderStore } from '../store/orderStore';

interface ScanResultProps {
  success: boolean;
  message: string;
}

const ScanResult: React.FC<ScanResultProps> = ({ success, message }) => (
  <div className={`p-6 rounded-lg shadow-lg ${
    success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
  }`}>
    <div className="flex items-center justify-center mb-4">
      {success ? (
        <CheckCircle2 className="h-16 w-16 text-green-500" />
      ) : (
        <XCircle className="h-16 w-16 text-red-500" />
      )}
    </div>
    <p className={`text-center text-lg font-medium ${
      success ? 'text-green-800' : 'text-red-800'
    }`}>
      {message}
    </p>
  </div>
);

const ProductionOrderScan: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { 
    getProductionOrdersByQRCode,
    startProductionOrder,
    completeProductionOrder 
  } = useProductionOrderStore();
  
  const { getOrder } = useOrderStore();
  
  useEffect(() => {
    const processCode = async () => {
      if (!code) {
        setResult({
          success: false,
          message: "Código QR inválido ou não fornecido."
        });
        setLoading(false);
        return;
      }
      
      try {
        // Find the production order by QR code
        const productionOrder = await getProductionOrdersByQRCode(code);
        
        if (!productionOrder) {
          setResult({
            success: false,
            message: "Código QR não corresponde a nenhuma ordem de produção."
          });
          setLoading(false);
          return;
        }
        
        // Determine action type (start or complete)
        const isStartCode = productionOrder.startCode === code;
        const isCompleteCode = productionOrder.endCode === code;
        
        if (!isStartCode && !isCompleteCode) {
          setResult({
            success: false,
            message: "Código QR não reconhecido."
          });
          setLoading(false);
          return;
        }
        
        let actionSuccess;
        let actionMessage;
        
        if (isStartCode) {
          // Try to start the production order
          actionSuccess = await startProductionOrder(productionOrder.id, code);
          actionMessage = actionSuccess
            ? "Tarefa iniciada com sucesso!"
            : "Não foi possível iniciar a tarefa. Verifique o status atual.";
        } else {
          // Try to complete the production order
          actionSuccess = await completeProductionOrder(productionOrder.id, code);
          actionMessage = actionSuccess
            ? "Tarefa concluída com sucesso!"
            : "Não foi possível concluir a tarefa. Verifique o status atual.";
        }
        
        if (actionSuccess) {
          // Get additional info about main order for success message
          const mainOrder = await getOrder(productionOrder.orderId);
          const orderInfo = mainOrder 
            ? `Pedido #${mainOrder.orderNumber} - ${mainOrder.customer}`
            : `Ordem #${productionOrder.id.slice(0, 8)}`;
          
          setResult({
            success: true,
            message: `${actionMessage}\n\n${orderInfo}\nEtapa: ${productionOrder.stageName}`
          });
        } else {
          setResult({
            success: false,
            message: actionMessage
          });
        }
        
      } catch (error) {
        console.error("Error processing QR code:", error);
        setResult({
          success: false,
          message: "Erro ao processar código QR. Por favor, tente novamente."
        });
      } finally {
        setLoading(false);
      }
    };
    
    processCode();
  }, [code, getProductionOrdersByQRCode, startProductionOrder, completeProductionOrder, getOrder]);
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <Clock className="h-16 w-16 text-blue-500 animate-pulse mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Processando...</h2>
          <p className="text-gray-600">Verificando o código QR e atualizando a ordem de produção.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {result ? (
          <ScanResult success={result.success} message={result.message} />
        ) : (
          <div className="p-6 rounded-lg shadow-lg bg-white">
            <div className="text-center">
              <QrCode className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Código QR Inválido</h2>
              <p className="text-gray-600">O código fornecido não pôde ser processado.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductionOrderScan;