import React from 'react';
import { format, isBefore, isAfter, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Edit, Trash2, History, Clock, Package, User, Calendar, Weight, CheckCircle, AlertTriangle, Circle } from 'lucide-react';
import { Order } from '../types/kanban';

interface KanbanCardProps {
  order: Order;
  isManaging?: boolean;
  isSelected?: boolean;
  highlight?: boolean;
  compactView?: boolean;
  isExpanded?: boolean;
  onOrderClick?: (order: Order) => void;
  onOrderEdit?: (order: Order, e?: React.MouseEvent) => void;
  onSelect?: (orderId: string) => void;
  onViewHistory?: (order: Order, e: React.MouseEvent) => void;
  onDelete?: (order: Order, e: React.MouseEvent) => void;
  onStatusChange?: (order: Order, newStatus: string, e: React.MouseEvent) => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  order,
  isManaging = false,
  isSelected = false,
  highlight = false,
  compactView = false,
  isExpanded = false,
  onOrderClick,
  onOrderEdit,
  onSelect,
  onViewHistory,
  onDelete,
  onStatusChange,
}) => {
  const today = new Date();
  const deliveryDate = new Date(order.deliveryDate);
  const isOverdue = isBefore(deliveryDate, today) && order.status !== 'completed';
  const daysUntilDelivery = differenceInDays(deliveryDate, today);

  const getStatusColor = () => {
    if (isOverdue) return 'border-l-red-500 bg-red-50/10';
    
    switch (order.status) {
      case 'in-progress':
        return 'border-l-orange-500 bg-orange-50/10';
      case 'waiting-docs':
        return 'border-l-yellow-500 bg-yellow-50/10';
      case 'completed':
        return 'border-l-green-500 bg-green-50/10';
      case 'ready':
        return 'border-l-blue-500 bg-blue-50/10';
      case 'urgent':
        return 'border-l-purple-500 bg-purple-50/10';
      default:
        return 'border-l-gray-500 bg-gray-50/10';
    }
  };

  const getStatusIcon = () => {
    switch (order.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'urgent':
        return <AlertTriangle className="h-4 w-4 text-purple-400" />;
      case 'waiting-docs':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      default:
        return <Circle className="h-4 w-4 text-orange-400" />;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isManaging) {
      e.stopPropagation();
      onSelect?.(order.id);
      return;
    }
    onOrderClick?.(order);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOrderEdit?.(order, e);
  };

  const progressPercentage = order.progress || 0;

  return (
    <div
      className={`
        border-l-4 rounded-lg p-4 mb-3 shadow-sm cursor-pointer
        transition-all duration-200 hover:shadow-md hover:scale-[1.02]
        ${getStatusColor()}
        ${highlight ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}
        ${isSelected ? 'ring-2 ring-purple-500' : ''}
        ${compactView ? 'p-3' : 'p-4'}
        bg-gray-800/50 border-gray-700
      `}
      onClick={handleCardClick}
    >
      {/* Header do Card */}
      <div className={`${compactView ? 'mb-2' : 'mb-3'}`}>
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-gray-100 text-sm">
            #{order.orderNumber}
          </h3>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            {isOverdue && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                {Math.abs(daysUntilDelivery)}d atrasado
              </span>
            )}
          </div>
        </div>
        
        <div className={`text-xs text-gray-300 space-y-1 ${compactView ? 'space-y-0.5' : 'space-y-1'}`}>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-gray-500" />
            <span className="truncate">{order.customer}</span>
          </div>
          
          {!compactView && (
            <>
              <div className="flex items-center gap-1">
                <Package className="h-3 w-3 text-gray-500" />
                <span>OS: {order.internalOrderNumber}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-gray-500" />
                <span>Entrega: {format(deliveryDate, 'dd/MM/yyyy', { locale: ptBR })}</span>
              </div>
              <div className="flex items-center gap-1">
                <Weight className="h-3 w-3 text-gray-500" />
                <span>Peso: {(order.totalWeight || 0).toFixed(2)} kg</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Itens do Pedido - Mostrar quando expandido */}
      {isExpanded && order.items && order.items.length > 0 && (
        <div className="border-t border-gray-700 pt-3 mb-3">
          <h4 className="font-medium text-gray-300 mb-2 text-sm flex items-center gap-1">
            <Package className="h-4 w-4" />
            Itens do Pedido ({order.items.length})
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
            {order.items.map((item, index) => (
              <div 
                key={item.id || index} 
                className="bg-gray-700/30 p-2 rounded border border-gray-600 text-xs"
              >
                <div className="flex justify-between items-center">
                  <span className="text-gray-200 truncate">{item.description || item.name}</span>
                  <span className="text-gray-400 ml-2 flex-shrink-0">
                    Qtd: {item.quantity}
                  </span>
                </div>
                {item.specifications && (
                  <div className="text-gray-500 mt-1 truncate">
                    {item.specifications}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CORREÇÃO: Controle de Qualidade - agora para todos os pedidos */}
      {!isManaging && (
        <div className="border-t border-gray-700 pt-3 mb-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange?.(order, 'quality-control', e);
            }}
            className="w-full bg-purple-700/30 text-purple-300 py-2 px-3 rounded text-sm font-medium hover:bg-purple-700/50 transition-colors border border-purple-600/30"
          >
            🔍 Controle de Qualidade
          </button>
        </div>
      )}

      {/* Barra de Progresso */}
      <div className="border-t border-gray-700 pt-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Progresso</span>
          <span>{progressPercentage}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              progressPercentage === 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Indicador de clique */}
      {!isManaging && (
        <div className="flex justify-center mt-2">
          <span className="text-xs text-gray-500">
            {isExpanded ? '▲ Clique para recolher' : '▼ Clique para ver itens'}
          </span>
        </div>
      )}

      {/* Ações Administrativas - visíveis apenas quando em modo gerenciamento */}
      {isManaging && (
        <div className="border-t border-gray-700 pt-3 mt-3 flex gap-2">
          <button
            onClick={(e) => onViewHistory?.(order, e)}
            className="flex-1 bg-blue-700/30 text-blue-300 py-1 px-2 rounded text-xs hover:bg-blue-700/50 transition-colors flex items-center gap-1 justify-center"
          >
            <History className="h-3 w-3" />
            Histórico
          </button>
          <button
            onClick={(e) => onDelete?.(order, e)}
            className="flex-1 bg-red-700/30 text-red-300 py-1 px-2 rounded text-xs hover:bg-red-700/50 transition-colors flex items-center gap-1 justify-center"
          >
            <Trash2 className="h-3 w-3" />
            Excluir
          </button>
        </div>
      )}
    </div>
  );
};

export default KanbanCard;
