import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column, Order, Project } from '../types/kanban';
import KanbanCard from './KanbanCard';
import { Settings, Trash2 } from 'lucide-react';

interface KanbanColumnProps {
  column: Column & { orders: Order[] };
  onEdit: () => void;
  onDelete: () => void;
  onOrderClick: (order: Order) => void;
  onUpdateOrder: (order: Order) => void;
  onQualityControlClick: (order: Order) => void;
  highlightTerm: string;
  compactView: boolean;
  isManagingOrders: boolean;
  selectedOrders: string[];
  customers: any[];
  expandedCards: Set<string>;
  projects: Project[];
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
  expandedCards,
  projects
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  // Verificação de segurança para orders
  const safeOrders = column.orders?.filter(order => 
    order && order.id && order.orderNumber
  ) || [];

  // Função para determinar a cor da borda da coluna
  const getColumnBorderColor = () => {
    if (column.title.toLowerCase().includes('processo')) {
      return 'border-orange-400 bg-orange-50';
    } else if (column.title.toLowerCase().includes('expedi')) {
      return 'border-green-400 bg-green-50';
    } else if (column.title.toLowerCase().includes('paralisa')) {
      return 'border-red-400 bg-red-50';
    }
    return 'border-gray-400 bg-gray-50';
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        flex-shrink-0 w-80 h-fit max-h-[calc(100vh-200px)] overflow-hidden
        bg-white rounded-xl shadow-lg border-2 transition-all duration-200
        ${isOver ? 'ring-2 ring-blue-500 shadow-xl' : ''}
        ${getColumnBorderColor()}
      `}
    >
      {/* Header da Coluna */}
      <div className="p-4 border-b border-gray-200 bg-white rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="font-bold text-lg text-gray-900">
              {column.title}
            </h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {safeOrders.length}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Configurar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <SortableContext items={safeOrders.map(order => order.id)} strategy={verticalListSortingStrategy}>
          {safeOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-sm">Nenhum pedido nesta coluna</p>
            </div>
          ) : (
            safeOrders.map(order => {
              // Verificação adicional de segurança para cada order
              if (!order || !order.id) return null;

              return (
                <KanbanCard
                  key={order.id}
                  order={order}
                  isManaging={isManagingOrders}
                  isSelected={selectedOrders.includes(order.id)}
                  highlight={highlightTerm ? 
                    (order.orderNumber?.toLowerCase().includes(highlightTerm.toLowerCase()) ||
                     order.customer?.toLowerCase().includes(highlightTerm.toLowerCase()) ||
                     order.internalOrderNumber?.toLowerCase().includes(highlightTerm.toLowerCase())) || false
                    : false
                  }
                  compactView={compactView}
                  onOrderClick={onOrderClick}
                  projects={projects}
                  onQualityControlClick={onQualityControlClick}
                />
              );
            })
          )}
        </SortableContext>
      </div>

      {/* Footer da Coluna com Estatísticas */}
      {safeOrders.length > 0 && (
        <div className="p-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Total: {safeOrders.length} pedidos</span>
            <span>
              Peso: {safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
