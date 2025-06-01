import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column, Order, Project } from '../types/kanban';
import KanbanCard from './KanbanCard';
import { Settings, Trash2, MoreVertical } from 'lucide-react';

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

  // Função para determinar a cor da borda e tema da coluna
  const getColumnTheme = () => {
    if (column.title.toLowerCase().includes('processo')) {
      return {
        borderColor: 'border-orange-500/50',
        headerBg: 'bg-gradient-to-r from-orange-900/50 to-orange-800/50',
        headerBorder: 'border-orange-500/30',
        glowColor: 'shadow-orange-500/20',
        iconColor: 'text-orange-400'
      };
    } else if (column.title.toLowerCase().includes('expedi')) {
      return {
        borderColor: 'border-green-500/50',
        headerBg: 'bg-gradient-to-r from-green-900/50 to-green-800/50',
        headerBorder: 'border-green-500/30',
        glowColor: 'shadow-green-500/20',
        iconColor: 'text-green-400'
      };
    } else if (column.title.toLowerCase().includes('paralisa')) {
      return {
        borderColor: 'border-red-500/50',
        headerBg: 'bg-gradient-to-r from-red-900/50 to-red-800/50',
        headerBorder: 'border-red-500/30',
        glowColor: 'shadow-red-500/20',
        iconColor: 'text-red-400'
      };
    }
    return {
      borderColor: 'border-gray-500/50',
      headerBg: 'bg-gradient-to-r from-gray-800/50 to-gray-700/50',
      headerBorder: 'border-gray-500/30',
      glowColor: 'shadow-gray-500/20',
      iconColor: 'text-gray-400'
    };
  };

  const theme = getColumnTheme();

  return (
    <div
      ref={setNodeRef}
      className={`
        flex-shrink-0 w-80 h-[calc(100vh-180px)] flex flex-col
        bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm 
        rounded-xl shadow-2xl border-2 transition-all duration-300
        ${isOver ? 'ring-2 ring-blue-500/60 shadow-2xl scale-[1.02] ' + theme.glowColor : theme.glowColor}
        ${theme.borderColor}
      `}
    >
      {/* Header da Coluna */}
      <div className={`
        ${theme.headerBg} backdrop-blur-sm rounded-t-xl
        border-b-2 ${theme.headerBorder} p-4
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${theme.borderColor.replace('border-', 'bg-').replace('/50', '')}`}></div>
            <h3 className="font-bold text-lg text-white tracking-wide">
              {column.title}
            </h3>
            <span className={`
              inline-flex items-center px-3 py-1 rounded-full text-xs font-bold
              bg-gray-700/50 text-gray-200 border border-gray-600/50
              min-w-[2rem] justify-center
            `}>
              {safeOrders.length}
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            <button
              onClick={onEdit}
              className={`
                p-2 ${theme.iconColor} hover:text-white hover:bg-gray-700/50 
                rounded-lg transition-all duration-200 hover:scale-110
                border border-transparent hover:border-gray-600/50
              `}
              title="Configurar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-all duration-200 hover:scale-110 border border-transparent hover:border-red-500/50"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Estatísticas rápidas no header */}
        {safeOrders.length > 0 && (
          <div className="mt-3 flex justify-between text-xs text-gray-300">
            <span className="flex items-center space-x-1">
              <span>📦</span>
              <span>{safeOrders.length} pedidos</span>
            </span>
            <span className="flex items-center space-x-1">
              <span>⚖️</span>
              <span>{safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg</span>
            </span>
          </div>
        )}
      </div>

      {/* Lista de Cards - SCROLL CORRIGIDO */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500">
          <SortableContext items={safeOrders.map(order => order.id)} strategy={verticalListSortingStrategy}>
            {safeOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-6xl mb-4 opacity-50">📋</div>
                <p className="text-sm font-medium">Nenhum pedido nesta coluna</p>
                <p className="text-xs text-gray-500 mt-1">
                  Arraste pedidos aqui para organizá-los
                </p>
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
      </div>

      {/* Footer da Coluna com Estatísticas Detalhadas */}
      {safeOrders.length > 0 && (
        <div className={`
          ${theme.headerBg} backdrop-blur-sm rounded-b-xl
          border-t-2 ${theme.headerBorder} p-3
        `}>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="text-center">
              <div className="text-gray-400 font-medium">Total Pedidos</div>
              <div className="text-white font-bold text-lg">{safeOrders.length}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 font-medium">Peso Total</div>
              <div className="text-white font-bold text-lg">
                {safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
              </div>
            </div>
          </div>
          
          {/* Barra de progresso geral da coluna */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progresso Médio</span>
              <span>
                {Math.round(
                  safeOrders.reduce((total, order) => {
                    const progress = order.progress || 0;
                    return total + progress;
                  }, 0) / safeOrders.length
                )}%
              </span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-2 border border-gray-600/50">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${theme.borderColor.replace('border-', 'bg-').replace('/50', '/80')}`}
                style={{ 
                  width: `${Math.max(
                    safeOrders.reduce((total, order) => {
                      const progress = order.progress || 0;
                      return total + progress;
                    }, 0) / safeOrders.length, 
                    5
                  )}%` 
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
