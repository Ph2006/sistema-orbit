import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Settings, Trash2 } from 'lucide-react';
import { Column, Order } from '../types/kanban';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  column: Column & { orders: Order[] };
  onEdit: () => void;
  onDelete: () => void;
  onOrderClick: (order: Order) => void;
  onOrderEdit?: (order: Order, e?: React.MouseEvent) => void;
  onUpdateOrder?: (order: Order) => void; // NOVA PROP
  highlightTerm?: string;
  compactView?: boolean;
  isManagingOrders?: boolean;
  selectedOrders?: string[];
  customers?: any[];
  expandedCards?: Set<string>;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  onEdit,
  onDelete,
  onOrderClick,
  onOrderEdit,
  onUpdateOrder, // NOVA PROP
  highlightTerm = '',
  compactView = false,
  isManagingOrders = false,
  selectedOrders = [],
  customers = [],
  expandedCards = new Set(),
}) => {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const getTotalWeight = () => {
    return column.orders.reduce((total, order) => total + (order.totalWeight || 0), 0);
  };

  const shouldHighlight = (order: Order, term: string) => {
    if (!term) return false;
    const searchTerm = term.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(searchTerm) ||
      order.customer.toLowerCase().includes(searchTerm) ||
      order.internalOrderNumber.toLowerCase().includes(searchTerm)
    );
  };

  const handleOrderSelect = (orderId: string) => {
    console.log('Selecting order:', orderId);
  };

  const handleViewHistory = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Ver histórico do pedido:', order.id);
  };

  const handleDeleteOrder = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir este pedido?')) {
      console.log('Excluir pedido:', order.id);
    }
  };

  const handleStatusChange = (order: Order, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Mudar status do pedido:', order.id, 'para:', newStatus);
  };

  return (
    <div className="flex-shrink-0 w-80 bg-gray-800/30 rounded-lg border border-gray-700/50">
      {/* Header da Coluna */}
      <div className="bg-blue-600 text-white p-4 rounded-t-lg">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">{column.title}</h2>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="Editar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="text-sm opacity-90">
          <div>{column.orders.length} pedido(s)</div>
          <div>{getTotalWeight().toFixed(2)} kg</div>
        </div>
      </div>

      {/* Cards da Coluna */}
      <div
        ref={setNodeRef}
        className="bg-gray-900/20 p-3 min-h-[400px] rounded-b-lg"
      >
        {column.orders.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            Nenhum pedido nesta coluna
          </div>
        ) : (
          column.orders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              isManaging={isManagingOrders}
              isSelected={selectedOrders.includes(order.id)}
              highlight={shouldHighlight(order, highlightTerm)}
              compactView={compactView}
              isExpanded={expandedCards.has(order.id)}
              onOrderClick={onOrderClick}
              onOrderEdit={onOrderEdit}
              onUpdateOrder={onUpdateOrder} // PASSANDO A PROP
              onSelect={handleOrderSelect}
              onViewHistory={handleViewHistory}
              onDelete={handleDeleteOrder}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </div>
  );
}; Order, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Ver histórico do pedido:', order.id);
  };

  const handleDeleteOrder = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir este pedido?')) {
      console.log('Excluir pedido:', order.id);
    }
  };

  const handleStatusChange = (order: Order, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Mudar status do pedido:', order.id, 'para:', newStatus);
  };

  return (
    <div className="flex-shrink-0 w-80 bg-gray-800/30 rounded-lg border border-gray-700/50">
      {/* Header da Coluna */}
      <div className="bg-blue-600 text-white p-4 rounded-t-lg">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">{column.title}</h2>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="Editar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="text-sm opacity-90">
          <div>{column.orders.length} pedido(s)</div>
          <div>{getTotalWeight().toFixed(2)} kg</div>
        </div>
      </div>

      {/* Cards da Coluna */}
      <div
        ref={setNodeRef}
        className="bg-gray-900/20 p-3 min-h-[400px] rounded-b-lg"
      >
        {column.orders.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            Nenhum pedido nesta coluna
          </div>
        ) : (
          column.orders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              isManaging={isManagingOrders}
              isSelected={selectedOrders.includes(order.id)}
              highlight={shouldHighlight(order, highlightTerm)}
              compactView={compactView}
              isExpanded={expandedCards.has(order.id)}
              onOrderClick={onOrderClick}
              onOrderEdit={onOrderEdit}
              onUpdateOrder={onUpdateOrder} // PASSANDO A PROP
              onSelect={handleOrderSelect}
              onViewHistory={handleViewHistory}
              onDelete={handleDeleteOrder}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </div>
  );
}; Order, e: React.MouseEvent) => {
    e.stopPropagation();
    // Implementar visualização de histórico
    console.log('Ver histórico do pedido:', order.id);
  };

  const handleDeleteOrder = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir este pedido?')) {
      // Implementar exclusão do pedido
      console.log('Excluir pedido:', order.id);
    }
  };

  const handleStatusChange = (order: Order, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Implementar mudança de status
    console.log('Mudar status do pedido:', order.id, 'para:', newStatus);
  };

  return (
    <div className="flex-shrink-0 w-80 bg-gray-800/30 rounded-lg border border-gray-700/50">
      {/* Header da Coluna */}
      <div className="bg-blue-600 text-white p-4 rounded-t-lg">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">{column.title}</h2>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="Editar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-black/10 rounded transition-colors"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="text-sm opacity-90">
          <div>{column.orders.length} pedido(s)</div>
          <div>{getTotalWeight().toFixed(2)} kg</div>
        </div>
      </div>

      {/* Cards da Coluna */}
      <div
        ref={setNodeRef}
        className="bg-gray-900/20 p-3 min-h-[400px] rounded-b-lg"
      >
        {column.orders.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            Nenhum pedido nesta coluna
          </div>
        ) : (
          column.orders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              isManaging={isManagingOrders}
              isSelected={selectedOrders.includes(order.id)}
              highlight={shouldHighlight(order, highlightTerm)}
              compactView={compactView}
              isExpanded={expandedCards.has(order.id)}
              onOrderClick={onOrderClick}
              onOrderEdit={onOrderEdit}
              onSelect={handleOrderSelect}
              onViewHistory={handleViewHistory}
              onDelete={handleDeleteOrder}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </div>
  );
};
