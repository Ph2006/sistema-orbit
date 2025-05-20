import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Column, Order } from '../types/kanban';
import KanbanCard from './KanbanCard';
import { Edit, Trash2 } from 'lucide-react';

interface KanbanColumnProps {
  column: Column;
  onEdit: () => void;
  onDelete: () => void;
  onOrderClick: (order: Order) => void;
  highlightTerm?: string;
  compactView?: boolean;
  isManagingOrders?: boolean;
  selectedOrders?: Set<string>;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  onEdit,
  onDelete,
  onOrderClick,
  highlightTerm = '',
  compactView = false,
  isManagingOrders = false,
  selectedOrders = new Set(),
}) => {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  // Calculate total weight for the column
  const totalWeight = column.orders.reduce((sum, order) => sum + order.totalWeight, 0);

  // Format number with dots for thousands and comma for decimals
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Check if an order should be highlighted based on search term
  const shouldHighlight = (order: Order) => {
    if (!highlightTerm) return false;
    
    const searchTerm = highlightTerm.toLowerCase().trim();
    return (
      order.orderNumber.toLowerCase().includes(searchTerm) ||
      order.customer.toLowerCase().includes(searchTerm) ||
      order.internalOrderNumber.toLowerCase().includes(searchTerm)
    );
  };

  // Determine if this is the "Pedidos expedidos" column
  const isExpedidosColumn = column.title.toLowerCase().includes('expedi');

  // Sort orders based on column type
  const sortedOrders = [...column.orders].sort((a, b) => {
    if (isExpedidosColumn) {
      // For "Pedidos expedidos", sort by lastExportDate (most recent first)
      // If lastExportDate is not available, fallback to completedDate, then deliveryDate
      const dateA = a.lastExportDate ? new Date(a.lastExportDate) : 
                  a.completedDate ? new Date(a.completedDate) : 
                  new Date(a.deliveryDate);
                  
      const dateB = b.lastExportDate ? new Date(b.lastExportDate) : 
                  b.completedDate ? new Date(b.completedDate) : 
                  new Date(b.deliveryDate);
                  
      return dateB.getTime() - dateA.getTime(); // Descending order - newest first
    } else {
      // For other columns, sort by delivery date (closest first)
      const dateA = new Date(a.deliveryDate);
      const dateB = new Date(b.deliveryDate);
      return dateA.getTime() - dateB.getTime(); // Ascending order - closest first
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={`bg-white/30 backdrop-blur-sm p-4 rounded-lg border border-white/30 shadow-lg ${
        compactView ? 'min-w-[250px] max-w-[250px]' : 'min-w-[300px] max-w-[300px]'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg text-white">{column.title}</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={onEdit}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            <Edit className="h-4 w-4 text-white" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            <Trash2 className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      {/* Total weight display */}
      <div className="mb-4 p-2 bg-white/20 backdrop-blur rounded-md shadow-sm border border-white/30">
        <div className="text-sm text-white/80">Peso Total</div>
        <div className="font-medium text-white">{formatNumber(totalWeight)} kg</div>
        <div className="text-sm text-white/80 mt-1">Pedidos: {column.orders.length}</div>
      </div>

      <div 
        className={`space-y-2 pr-1 ${
          compactView ? 'max-h-[calc(100vh-150px)]' : 'max-h-[calc(100vh-210px)]'
        } overflow-y-auto custom-scrollbar`}
      >
        {sortedOrders.map(order => (
          <div
            key={order.id}
            className={`relative ${
              isManagingOrders ? 'cursor-pointer' : ''
            } ${
              shouldHighlight(order) ? 'ring-2 ring-blue-300 shadow-md' : ''
            }`}
            onClick={() => onOrderClick(order)}
          >
            {isManagingOrders && (
              <div className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded border-2 z-10 ${
                selectedOrders.has(order.id)
                  ? 'bg-blue-500 border-blue-600'
                  : 'bg-white/50 border-gray-400'
              }`} />
            )}
            <KanbanCard
              order={order}
              isManaging={isManagingOrders}
              isSelected={selectedOrders.has(order.id)}
              highlight={shouldHighlight(order)}
              compactView={compactView}
              columnTitle={column.title}
            />
          </div>
        ))}
        
        {column.orders.length === 0 && (
          <div className="h-20 flex items-center justify-center text-white/70 border border-dashed border-white/30 rounded-lg">
            Nenhum pedido nesta coluna
          </div>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;