import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronRight, Clock, CheckCircle, AlertCircle, QrCode, Download, User, Calendar } from 'lucide-react';
import { ProductionOrder } from '../types/productionOrder';
import { Order, OrderItem } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import QRCodeDisplay from './QRCodeDisplay';

interface ProductionOrderDetailProps {
  order: ProductionOrder;
  mainOrder: Order | null;
  onBack: () => void;
  onExport: (order: ProductionOrder) => void;
}

const ProductionOrderDetail: React.FC<ProductionOrderDetailProps> = ({
  order,
  mainOrder,
  onBack,
  onExport
}) => {
  const [item, setItem] = useState<OrderItem | null>(null);
  const [showQR, setShowQR] = useState<'start' | 'complete' | null>(null);
  
  useEffect(() => {
    if (mainOrder && order.itemId) {
      const foundItem = mainOrder.items.find(i => i.id === order.itemId);
      if (foundItem) {
        setItem(foundItem);
      }
    }
  }, [mainOrder, order]);
  
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-gray-600 bg-gray-100';
      case 'in-progress':
        return 'text-blue-600 bg-blue-100';
      case 'completed':
        return 'text-green-600 bg-green-100';
      case 'on-hold':
        return 'text-yellow-600 bg-yellow-100';
      case 'delayed':
        return 'text-red-600 bg-red-100';
      case 'cancelled':
        return 'text-gray-600 bg-gray-200';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };
  
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'in-progress':
        return 'Em Andamento';
      case 'completed':
        return 'Concluído';
      case 'on-hold':
        return 'Em Espera';
      case 'delayed':
        return 'Atrasado';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5" />;
      case 'in-progress':
        return <Clock className="h-5 w-5" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5" />;
      case 'on-hold':
        return <PauseCircle className="h-5 w-5" />;
      case 'delayed':
        return <AlertCircle className="h-5 w-5" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };
  
  const hasStarted = order.actualStartDate !== null;
  const hasCompleted = order.actualEndDate !== null;
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold">Ordem de Produção: {order.stageName}</h2>
            {mainOrder && (
              <p className="text-gray-600">
                Pedido #{mainOrder.orderNumber} - {mainOrder.customer}
              </p>
            )}
          </div>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowQR('start')}
            className={`p-2 rounded-full ${
              order.status === 'pending' 
                ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            disabled={order.status !== 'pending'}
            title="QR Code para Iniciar"
          >
            <QrCode className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowQR('complete')}
            className={`p-2 rounded-full ${
              order.status === 'in-progress' 
                ? 'bg-green-100 text-green-600 hover:bg-green-200'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
            disabled={order.status !== 'in-progress'}
            title="QR Code para Finalizar"
          >
            <QrCode className="h-5 w-5" />
          </button>
          <button
            onClick={() => onExport(order)}
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"
            title="Exportar PDF"
          >
            <Download className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      {/* Production Order Status */}
      <div className={`mb-6 p-4 rounded-lg ${getStatusColor(order.status)}`}>
        <div className="flex items-center">
          {getStatusIcon(order.status)}
          <span className="ml-2 font-medium">{getStatusText(order.status)}</span>
        </div>
      </div>
      
      {/* Order Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Detalhes da Ordem</h3>
          <div className="space-y-3">
            <div>
              <div className="text-sm text-gray-500 mb-1">Etapa de Produção</div>
              <div className="font-medium">{order.stageName}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Prioridade</div>
              <div className="font-medium">
                {order.priority === 'critical' 
                  ? 'Crítica' 
                  : order.priority === 'high'
                  ? 'Alta'
                  : order.priority === 'medium'
                  ? 'Média'
                  : 'Baixa'
                }
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Responsável</div>
              <div className="font-medium">{order.assignedTo || 'Não atribuído'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Observações</div>
              <div>{order.notes || 'Nenhuma observação'}</div>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Datas e Prazos</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Data Planejada Início</div>
                <div className="font-medium">{formatDate(order.plannedStartDate)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Data Planejada Término</div>
                <div className="font-medium">{formatDate(order.plannedEndDate)}</div>
              </div>
            </div>
            <div className="flex justify-between">
              <div>
                <div className="text-sm text-gray-500 mb-1">Data Real Início</div>
                <div className={`font-medium ${hasStarted ? 'text-green-600' : 'text-gray-400'}`}>
                  {hasStarted ? formatDate(order.actualStartDate) : 'Não iniciado'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Data Real Término</div>
                <div className={`font-medium ${hasCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                  {hasCompleted ? formatDate(order.actualEndDate) : 'Não concluído'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Item Details */}
      {item && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-4">Detalhes do Item</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">Código</div>
              <div className="font-medium">{item.code}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-gray-500 mb-1">Descrição</div>
              <div className="font-medium">{item.description}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Quantidade</div>
              <div className="font-medium">{item.quantity}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Peso Unitário</div>
              <div className="font-medium">{item.unitWeight.toLocaleString('pt-BR')} kg</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Peso Total</div>
              <div className="font-medium">{item.totalWeight.toLocaleString('pt-BR')} kg</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Materials Required */}
      {order.materialsRequired && order.materialsRequired.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-4">Materiais Necessários</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Material
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantidade
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unidade
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Disponibilidade
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {order.materialsRequired.map(material => (
                  <tr key={material.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{material.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{material.quantity}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{material.unit}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                        material.available 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {material.available ? 'Disponível' : 'Indisponível'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Work Instructions */}
      {order.workInstructions && order.workInstructions.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-4">Instruções de Trabalho</h3>
          <ol className="list-decimal pl-5 space-y-2">
            {order.workInstructions.map((instruction, index) => (
              <li key={index} className="text-gray-800">{instruction}</li>
            ))}
          </ol>
        </div>
      )}
      
      {/* Quality Checklist */}
      {order.qualityChecklist && order.qualityChecklist.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-4">Checklist de Qualidade</h3>
          <div className="space-y-2">
            {order.qualityChecklist.map(item => (
              <div key={item.id} className="flex items-center">
                <input
                  type="checkbox"
                  checked={item.checked}
                  readOnly
                  className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="ml-3">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* History Timeline */}
      {order.history && order.history.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium mb-4">Histórico</h3>
          <div className="relative pl-8 before:absolute before:left-4 before:top-2 before:border-l-2 before:h-full before:border-gray-300">
            {order.history.map((entry, index) => (
              <div key={index} className="mb-4 relative">
                <div className="absolute left-[-18px] top-2 h-3 w-3 rounded-full bg-blue-500"></div>
                <div className="text-sm text-gray-500">
                  {format(new Date(entry.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </div>
                <div className="font-medium">
                  {entry.action === 'created' && 'Ordem criada'}
                  {entry.action === 'started' && 'Ordem iniciada'}
                  {entry.action === 'completed' && 'Ordem concluída'}
                  {entry.action === 'updated' && 'Ordem atualizada'}
                  {entry.action === 'reassigned' && 'Responsável alterado'}
                </div>
                {entry.notes && <div className="text-sm mt-1">{entry.notes}</div>}
                {entry.user && <div className="text-xs text-gray-600 mt-1">Por: {entry.user}</div>}
                {entry.previousStatus && entry.newStatus && (
                  <div className="text-xs mt-1">
                    Status alterado de{' '}
                    <span className={getStatusColor(entry.previousStatus)}>
                      {getStatusText(entry.previousStatus)}
                    </span>
                    {' '}para{' '}
                    <span className={getStatusColor(entry.newStatus)}>
                      {getStatusText(entry.newStatus)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                {showQR === 'start' ? 'QR Code para Iniciar' : 'QR Code para Finalizar'}
              </h3>
              <button 
                onClick={() => setShowQR(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="flex justify-center">
              <QRCodeDisplay
                value={showQR === 'start' ? order.startCode : order.endCode}
                size={250}
                title={`Código para ${showQR === 'start' ? 'iniciar' : 'finalizar'} tarefa`}
                subtitle={`${order.stageName}`}
                downloadFileName={`op-${order.id.slice(0, 8)}-${showQR}`}
                color={showQR === 'start' ? '#1d4ed8' : '#15803d'}
              />
            </div>
            
            <div className="text-center mt-4">
              <p className="text-gray-600">
                Escaneie este código com um dispositivo móvel para {showQR === 'start' ? 'iniciar' : 'finalizar'} a ordem de produção.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Component icons
const PauseCircle = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="10" x2="10" y1="15" y2="9" />
    <line x1="14" x2="14" y1="15" y2="9" />
  </svg>
);

const XCircle = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" x2="9" y1="9" y2="15" />
    <line x1="9" x2="15" y1="9" y2="15" />
  </svg>
);

const X = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export default ProductionOrderDetail;