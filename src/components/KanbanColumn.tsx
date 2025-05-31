import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Plus, 
  ChevronDown, 
  Calendar,
  Users,
  Clock,
  Package,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { Column, Order } from '../types/kanban';
import { Customer } from '../types/customer';
import KanbanCard from './KanbanCard';
import { format, isAfter, isBefore, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ColumnWithOrders extends Column {
  orders: Order[];
}

interface KanbanColumnProps {
  column: ColumnWithOrders;
  onEdit: () => void;
  onDelete: () => void;
  onOrderClick: (order: Order) => void;
  onUpdateOrder: (order: Order) => void;
  onQualityControlClick: (order: Order) => void;
  highlightTerm: string;
  compactView: boolean;
  isManagingOrders: boolean;
  selectedOrders: string[];
  customers: Customer[];
  expandedCards: Set<string>;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  onEdit,
  onDelete,
  onOrderClick,
  onUpdateOrder,
  onQualityControlClick,
  highlightTerm,
  compactView,
  isManagingOrders,
  selectedOrders,
  customers,
  expandedCards
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  // Calculate column statistics
  const totalOrders = column.orders.length;
  const totalWeight = column.orders.reduce((sum, order) => sum + (order.totalWeight || 0), 0);
  const avgProgress = totalOrders > 0 
    ? column.orders.reduce((sum, order) => {
        if (order.items && order.items.length > 0) {
          const orderProgress = order.items.reduce((itemSum, item) => itemSum + (item.overallProgress || 0), 0) / order.items.length;
          return sum + orderProgress;
        }
        return sum;
      }, 0) / totalOrders 
    : 0;

  // Count orders by urgency/status
  const urgentOrders = column.orders.filter(order => {
    const deliveryDate = new Date(order.deliveryDate);
    const today = new Date();
    return isBefore(deliveryDate, today) && order.status !== 'completed';
  }).length;

  const todayOrders = column.orders.filter(order => 
    isToday(new Date(order.deliveryDate))
  ).length;

  const completedOrders = column.orders.filter(order => 
    order.status === 'completed'
  ).length;

  // Get color scheme based on column title/type
  const getColumnColor = () => {
    if (column.title.toLowerCase().includes('processo')) {
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        header: 'bg-blue-100',
        text: 'text-blue-800',
        accent: 'text-blue-600'
      };
    } else if (column.title.toLowerCase().includes('expedi')) {
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        header: 'bg-green-100',
        text: 'text-green-800',
        accent: 'text-green-600'
      };
    } else if (column.title.toLowerCase().includes('parali')) {
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        header: 'bg-orange-100',
        text: 'text-orange-800',
        accent: 'text-orange-600'
      };
    } else {
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        header: 'bg-gray-100',
        text: 'text-gray-800',
        accent: 'text-gray-600'
      };
    }
  };

  const colors = getColumnColor();

  // Handle card selection for managing mode
  const handleCardSelect = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // This would be handled by parent component
  };

  return (
    <div className="flex flex-col h-full min-w-[320px] max-w-[380px]">
      {/* Column Header */}
      <div className={`${colors.header} ${colors.border} border rounded-t-lg p-4 flex-shrink-0`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <h3 className={`font-semibold ${colors.text}`}>
              {column.title}
            </h3>
            <span className={`px-2 py-1 text-xs font-medium ${colors.bg} ${colors.text} rounded-full`}>
              {totalOrders}
            </span>
          </div>
          
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`p-1 hover:bg-white/50 rounded ${colors.text}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border z-10 py-1 min-w-[150px]">
                <button
                  onClick={() => {
                    onEdit();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </button>
                <button
                  onClick={() => {
                    setShowStats(!showStats);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center"
                >
                  <ChevronDown className="h-4 w-4 mr-2" />
                  {showStats ? 'Ocultar' : 'Mostrar'} Estatísticas
                </button>
                <button
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-red-600 flex items-center"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column Statistics */}
        {showStats && (
          <div className="mt-3 pt-3 border-t border-white/30">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center">
                <Package className="h-3 w-3 mr-1" />
                <span>{totalWeight.toFixed(1)} kg</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-3 w-3 mr-1" />
                <span>{avgProgress.toFixed(0)}% médio</span>
              </div>
              {urgentOrders > 0 && (
                <div className="flex items-center text-red-600">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  <span>{urgentOrders} atrasados</span>
                </div>
              )}
              {todayOrders > 0 && (
                <div className="flex items-center text-yellow-600">
                  <Calendar className="h-3 w-3 mr-1" />
                  <span>{todayOrders} hoje</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Column Body - Droppable Area */}
      <div 
        ref={setNodeRef}
        className={`flex-1 ${colors.bg} ${colors.border} border-l border-r border-b rounded-b-lg p-3 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar ${
          isOver ? 'ring-2 ring-blue-400 ring-opacity-50' : ''
        }`}
      >
        {column.orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Package className="h-8 w-8 mb-2" />
            <p className="text-sm text-center">
              Nenhum pedido nesta coluna
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {column.orders.map((order) => {
              const shouldHighlight = highlightTerm && (
                order.orderNumber.toLowerCase().includes(highlightTerm.toLowerCase()) ||
                order.customer.toLowerCase().includes(highlightTerm.toLowerCase()) ||
                order.internalOrderNumber.toLowerCase().includes(highlightTerm.toLowerCase())
              );

              return (
                <KanbanCard
                  key={order.id}
                  order={order}
                  isManaging={isManagingOrders}
                  isSelected={selectedOrders.includes(order.id)}
                  highlight={!!shouldHighlight}
                  compactView={compactView}
                  onOrderClick={onOrderClick}
                  onQualityControlClick={onQualityControlClick}
                  onUpdateOrder={onUpdateOrder}
                  onSelect={(orderId) => handleCardSelect(orderId, {} as React.MouseEvent)}
                  customers={customers}
                  isExpanded={expandedCards.has(order.id)}
                />
              );
            })}
          </div>
        )}

        {/* Drop indicator when dragging */}
        {isOver && (
          <div className="mt-3 p-4 border-2 border-dashed border-blue-400 rounded-lg bg-blue-50/50">
            <p className="text-center text-blue-600 text-sm">
              Solte o pedido aqui
            </p>
          </div>
        )}
      </div>

      {/* Column Footer with Summary */}
      {!compactView && totalOrders > 0 && (
        <div className={`${colors.bg} ${colors.border} border-t-0 border-l border-r border-b rounded-b-lg px-3 py-2`}>
          <div className={`flex justify-between items-center text-xs ${colors.accent}`}>
            <span>Total: {totalOrders} pedidos</span>
            <span>{totalWeight.toFixed(1)} kg</span>
          </div>
          
          {/* Progress bar for column completion */}
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div 
                className={`h-1 rounded-full transition-all duration-300 ${
                  avgProgress >= 80 ? 'bg-green-500' :
                  avgProgress >= 50 ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}
                style={{ width: `${avgProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
