import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import KanbanCard from './KanbanCard';
import { Column, Order } from '../types/kanban';
import { Settings, Trash2, Plus } from 'lucide-react';
import { formatNumber } from '../utils/format';

interface KanbanColumnProps {
  column: Column;
  onEdit: () => void;
  onDelete: () => void;
  onOrderClick: (order: Order) => void;
  highlightTerm?: string;
  compactView?: boolean;
  isManagingOrders?: boolean;
  selectedOrders?: string[];
  customers: any[];
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  onEdit,
  onDelete,
  onOrderClick,
  highlightTerm = '',
  compactView = false,
  isManagingOrders = false,
  selectedOrders = [],
  customers,
}) => {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const totalWeight = column.orders.reduce((sum, order) => {
    return sum + (order.totalWeight || 0);
  }, 0);

  const shouldHighlight = (order: Order) => {
    if (!highlightTerm) return false;
    const searchTerm = highlightTerm.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(searchTerm) ||
      order.customer.toLowerCase().includes(searchTerm) ||
      order.project?.toLowerCase().includes(searchTerm) ||
      order.description?.toLowerCase().includes(searchTerm)
    );
  };

  const isInProgress = column.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'pedidos em progresso';
  const sortedOrders = isInProgress
    ? [...column.orders].sort((a, b) => {
        const dateA = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Infinity;
        const dateB = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Infinity;
        
        if (dateA !== Infinity && dateB !== Infinity) {
          return dateA - dateB;
        }
        
        if (dateA !== Infinity) return -1;
        if (dateB !== Infinity) return 1;
        
        return 0;
      })
    : column.orders;

  return (
    <div className="flex flex-col w-full sm:w-80 min-w-[280px] max-w-full shrink-0">
      {/* Cabeçalho da Coluna */}
      <div className="bg-gray-800/50 backdrop-blur-lg rounded-t-xl p-4 border border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">{column.title}</h3>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
              title="Editar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded-lg transition-colors"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Informações da Coluna */}
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{column.orders.length} pedido(s)</span>
          <span>{formatNumber(totalWeight)} kg</span>
        </div>
      </div>

      {/* Lista de Pedidos */}
      <div
        ref={setNodeRef}
        className="flex-1 bg-gray-800/30 backdrop-blur-sm rounded-b-xl p-2 border-x border-b border-gray-700/50 overflow-y-auto custom-scrollbar min-h-[200px] max-h-[70vh]"
      >
        <div className="space-y-2">
          {sortedOrders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              onClick={() => onOrderClick(order)}
              highlight={shouldHighlight(order)}
              compactView={compactView}
              isManaging={isManagingOrders}
              isSelected={selectedOrders.includes(order.id)}
              customers={customers}
            />
          ))}
        </div>
      </div>
    </div>
  );
};