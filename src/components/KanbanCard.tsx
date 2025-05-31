import React from 'react';
import { Order } from '../types/kanban';
import { CheckCircle, Clock, AlertTriangle, Flag, Calendar, Package, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface KanbanCardProps {
  order: Order;
  onOrderClick: (order: Order) => void;
  onQualityControlClick: (order: Order) => void; // Nova prop
  isManaging: boolean;
  isSelected: boolean;
  highlight: boolean;
  compactView: boolean;
  // ... outras props
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  order,
  onOrderClick,
  onQualityControlClick, // Nova prop
  isManaging,
  isSelected,
  highlight,
  compactView,
  // ... outras props
}) => {
  
  const handleQualityControlClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Evita que o click do card seja acionado
    onQualityControlClick(order);
  };

  return (
    <div 
      className={`bg-white rounded-lg shadow-sm border p-4 mb-3 cursor-pointer hover:shadow-md transition-shadow ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      } ${highlight ? 'ring-2 ring-yellow-400' : ''}`}
      onClick={() => onOrderClick(order)}
    >
      {/* Header do card */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-semibold text-gray-900">#{order.orderNumber}</h4>
          <p className="text-sm text-gray-600">{order.customer}</p>
        </div>
        
        {/* Status badge */}
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${
          order.status === 'completed' ? 'bg-green-100 text-green-800' :
          order.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
          order.status === 'delayed' ? 'bg-red-100 text-red-800' :
          order.status === 'waiting-docs' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {order.status === 'completed' ? 'Concluído' :
           order.status === 'in-progress' ? 'Em Andamento' :
           order.status === 'delayed' ? 'Atrasado' :
           order.status === 'waiting-docs' ? 'Aguard. Docs' :
           'Pendente'}
        </div>
      </div>

      {/* Informações do pedido */}
      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center">
          <Calendar className="h-4 w-4 mr-2" />
          <span>Entrega: {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
        </div>
        
        <div className="flex items-center">
          <Package className="h-4 w-4 mr-2" />
          <span>OS: {order.internalOrderNumber}</span>
        </div>

        {order.totalWeight && (
          <div className="flex items-center">
            <span className="text-xs">Peso: {order.totalWeight.toFixed(2)} kg</span>
          </div>
        )}
      </div>

      {/* Botões de ação */}
      <div className="mt-3 flex justify-between items-center">
        <div className="flex space-x-2">
          {/* Botão Controle de Qualidade */}
          <button
            onClick={handleQualityControlClick}
            className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium hover:bg-purple-200 transition-colors flex items-center"
            title="Controle de Qualidade"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Controle de Qualidade
          </button>
        </div>

        {/* Indicador de progresso se existir */}
        {order.items && order.items.length > 0 && (
          <div className="text-xs text-gray-500">
            Progresso: {Math.round((order.items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / order.items.length))}%
          </div>
        )}
      </div>

      {/* Barra de progresso visual se não for compactView */}
      {!compactView && order.items && order.items.length > 0 && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div 
              className="bg-blue-600 h-1 rounded-full transition-all duration-300"
              style={{ 
                width: `${Math.round((order.items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / order.items.length))}%` 
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default KanbanCard;
