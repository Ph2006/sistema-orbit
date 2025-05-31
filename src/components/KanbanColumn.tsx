import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { MoreHorizontal, Edit, Trash2, Plus } from 'lucide-react';
import { Column, Order } from '../types/kanban';
import { Customer } from '../types/customer';
import KanbanCard from './KanbanCard';

interface ColumnWithOrders extends Column {
  orders: Order[];
}

interface KanbanColumnProps {
  column: ColumnWithOrders;
  onEdit: () => void;
  onDelete: () => void;
  onOrderClick: (order: Order) => void;
  onUpdateOrder: (order: Order) => void;
  onQualityControlClick: (order: Order) => void; // Única adição necessária
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
  onQualityControlClick, // Nova prop
  highlightTerm,
  compactView,
  isManagingOrders,
  selectedOrders,
  customers,
  expandedCards
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 min-w-[300px] max-w-[350px] h-fit">
      {/* Header da coluna - tema escuro */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-white">{column.title}</h3>
          <span className="bg-gray-700/50 text-gray-300 text-xs px-2 py-1 rounded-full">
            {column.orders.length}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={onEdit}
            className="p-1 hover:bg-gray-700/50 rounded"
            title="Editar coluna"
          >
            <Edit className="h-4 w-4 text-gray-300" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-gray-700/50 rounded"
            title="Excluir coluna"
          >
            <Trash2 className="h-4 w-4 text-gray-300" />
          </button>
        </div>
      </div>

      {/* Área dos cards - tema escuro */}
      <div 
        ref={setNodeRef}
        className={`space-y-3 min-h-[200px] ${isOver ? 'bg-blue-900/30 border-2 border-dashed border-blue-400 rounded-lg p-2' : ''}`}
      >
        {column.orders.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">Nenhum pedido nesta coluna</p>
          </div>
        ) : (
          column.orders.map((order) => {
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
                onQualityControlClick={onQualityControlClick} // Passando a nova prop
                onUpdateOrder={onUpdateOrder}
                customers={customers}
                isExpanded={expandedCards.has(order.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
