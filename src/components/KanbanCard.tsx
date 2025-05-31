import React, { useState } from 'react';
import { Order } from '../types/kanban';
import { CheckCircle, Clock, AlertTriangle, Flag, Calendar, Package, Eye, User, ClipboardCheck, Truck, FileText, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface KanbanCardProps {
  order: Order;
  onOrderClick: (order: Order) => void;
  onQualityControlClick: (order: Order) => void;
  onUpdateOrder: (order: Order) => void;
  isManaging: boolean;
  isSelected: boolean;
  highlight: boolean;
  compactView: boolean;
  customers: any[];
  isExpanded: boolean;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  order,
  onOrderClick,
  onQualityControlClick,
  onUpdateOrder,
  isManaging,
  isSelected,
  highlight,
  compactView,
  customers,
  isExpanded
}) => {
  
  const [showItemDetails, setShowItemDetails] = useState(false);

  const handleQualityControlClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQualityControlClick(order);
  };

  const handleCardClick = () => {
    if (!isManaging) {
      onOrderClick(order);
    }
  };

  // Atualizar dados de expedição de um item específico
  const handleItemShippingUpdate = (itemId: string, field: string, value: string) => {
    const updatedItems = order.items?.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          [field]: value
        };
      }
      return item;
    });

    const updatedOrder = {
      ...order,
      items: updatedItems
    };
    
    onUpdateOrder(updatedOrder);
  };

  // Calcular progresso geral do pedido
  const overallProgress = order.items && order.items.length > 0
    ? Math.round(order.items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / order.items.length)
    : 0;

  // Verificar se o pedido está atrasado
  const today = new Date();
  const deliveryDate = new Date(order.deliveryDate);
  const isOverdue = isBefore(deliveryDate, today) && order.status !== 'completed';

  // Verificar quantos itens estão 100% concluídos
  const completedItems = order.items?.filter(item => (item.overallProgress || 0) >= 100) || [];
  const hasCompletedItems = completedItems.length > 0;

  return (
    <div 
      className={`bg-gray-800/80 backdrop-blur-sm rounded-lg border p-4 mb-3 cursor-pointer hover:bg-gray-700/80 transition-all duration-200 ${
        isSelected ? 'border-blue-400 bg-blue-900/30' : 'border-gray-600/50'
      } ${highlight ? 'ring-2 ring-yellow-400' : ''} ${isOverdue ? 'border-l-4 border-l-red-500' : ''} ${hasCompletedItems ? 'border-l-4 border-l-green-500' : ''}`}
      onClick={handleCardClick}
    >
      {/* Header do card */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-white">#{order.orderNumber}</h4>
            {/* Mostrar badge de atrasado apenas se atrasado */}
            {isOverdue && (
              <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">
                Atrasado
              </span>
            )}
          </div>
          <p className="text-sm text-gray-300">{order.customer}</p>
          <p className="text-xs text-gray-400">OS: {order.internalOrderNumber}</p>
        </div>
        
        {/* Status badge - sem duplicação */}
        <div className={`px-2 py-1 rounded-full text-xs font-medium border ${
          order.status === 'completed' 
            ? 'bg-green-500/20 text-green-400 border-green-500/30' :
          order.status === 'in-progress' 
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
          order.status === 'waiting-docs' 
            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
          order.status === 'ready'
            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' :
          'bg-gray-500/20 text-gray-400 border-gray-500/30'
        }`}>
          {order.status === 'completed' ? 'Concluído' :
           order.status === 'in-progress' ? 'Em Processo' :
           order.status === 'waiting-docs' ? 'Aguard. Docs' :
           order.status === 'ready' ? 'Pronto' :
           'Pendente'}
        </div>
      </div>

      {/* Informações do pedido */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center text-gray-300">
          <Calendar className="h-4 w-4 mr-2 text-gray-400" />
          <span>Entrega: {format(deliveryDate, 'dd/MM/yyyy', { locale: ptBR })}</span>
        </div>

        {order.totalWeight && (
          <div className="flex items-center text-gray-300">
            <Package className="h-4 w-4 mr-2 text-gray-400" />
            <span>Peso: {order.totalWeight.toFixed(2)} kg</span>
          </div>
        )}

        {order.items && order.items.length > 0 && (
          <div className="flex items-center justify-between text-gray-300">
            <div className="flex items-center">
              <Flag className="h-4 w-4 mr-2 text-gray-400" />
              <span>Progresso: {overallProgress}%</span>
            </div>
            {hasCompletedItems && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowItemDetails(!showItemDetails);
                }}
                className="text-xs text-green-400 hover:text-green-300 flex items-center"
              >
                {completedItems.length} item(s) concluído(s)
                {showItemDetails ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra de progresso */}
      {!compactView && order.items && order.items.length > 0 && (
        <div className="mt-3">
          <div className="w-full bg-gray-700/50 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                overallProgress >= 100 ? 'bg-green-500' :
                overallProgress >= 75 ? 'bg-blue-500' :
                overallProgress >= 50 ? 'bg-yellow-500' :
                overallProgress >= 25 ? 'bg-orange-500' :
                'bg-red-500'
              }`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1 text-xs text-gray-400">
            <span>Progresso</span>
            <span>{overallProgress}%</span>
          </div>
        </div>
      )}

      {/* Detalhes dos itens concluídos com campos de expedição */}
      {showItemDetails && hasCompletedItems && (
        <div className="mt-4 pt-3 border-t border-gray-600/30">
          <h5 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
            <Truck className="h-4 w-4 mr-2" />
            Itens Prontos para Expedição
          </h5>
          
          <div className="space-y-3">
            {completedItems.map((item, index) => (
              <div key={item.id || index} className="bg-gray-700/30 rounded-lg p-3 border border-gray-600/30">
                <div className="text-xs text-gray-300 mb-2">
                  <div className="font-medium">{item.description || item.name}</div>
                  <div className="text-gray-400">Código: {item.code} | Qtd: {item.quantity}</div>
                </div>
                
                {/* Campos de expedição por item */}
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div>
                    <label className="block text-gray-400 mb-1">LE (Lista de Embarque)</label>
                    <input
                      type="text"
                      value={item.le || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleItemShippingUpdate(item.id, 'le', e.target.value);
                      }}
                      className="w-full px-2 py-1 bg-gray-800/50 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                      placeholder="Digite o número da LE"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 mb-1">NF (Nota Fiscal)</label>
                    <input
                      type="text"
                      value={item.nf || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleItemShippingUpdate(item.id, 'nf', e.target.value);
                      }}
                      className="w-full px-2 py-1 bg-gray-800/50 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                      placeholder="Digite o número da NF"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 mb-1">Data de Envio</label>
                    <input
                      type="date"
                      value={item.shippingDate || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleItemShippingUpdate(item.id, 'shippingDate', e.target.value);
                      }}
                      className="w-full px-2 py-1 bg-gray-800/50 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Status da expedição do item */}
                {(item.le || item.nf || item.shippingDate) && (
                  <div className="mt-2 pt-2 border-t border-gray-600/30">
                    <div className="text-xs text-gray-400">
                      {item.le && <div>LE: {item.le}</div>}
                      {item.nf && <div>NF: {item.nf}</div>}
                      {item.shippingDate && <div>Envio: {format(new Date(item.shippingDate), 'dd/MM/yyyy', { locale: ptBR })}</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botão Controle de Qualidade */}
      <div className="mt-4 pt-3 border-t border-gray-600/30">
        <button
          onClick={handleQualityControlClick}
          className="w-full px-3 py-2 bg-purple-600/20 text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-600/30 transition-colors flex items-center justify-center border border-purple-500/30"
          title="Controle de Qualidade"
        >
          <ClipboardCheck className="h-4 w-4 mr-2" />
          Controle de Qualidade
        </button>
      </div>

      {/* Informações extras no modo expandido */}
      {isExpanded && !compactView && (
        <div className="mt-3 pt-3 border-t border-gray-600/30">
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
            {order.items && (
              <div>
                <span className="font-medium">Itens:</span> {order.items.length}
              </div>
            )}
            {order.projectId && (
              <div>
                <span className="font-medium">Projeto:</span> Sim
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanCard;
