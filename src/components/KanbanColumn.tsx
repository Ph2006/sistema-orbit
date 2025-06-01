import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column, Order, Project } from '../types/kanban';
import KanbanCard from './KanbanCard';
import { Settings, Trash2, Package, Scale, TrendingUp, BarChart3 } from 'lucide-react';

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

  const safeOrders = column.orders?.filter(order => 
    order && order.id && order.orderNumber
  ) || [];

  const getColumnTheme = () => {
    if (column.title.toLowerCase().includes('processo')) {
      return {
        borderColor: 'border-blue-700',
        headerBg: 'bg-gradient-to-r from-gray-800 to-gray-700',
        headerBorder: 'border-blue-700/50',
        glowColor: 'shadow-blue-900/25',
        iconColor: 'text-blue-400',
        accentColor: 'blue-500',
        dotColor: 'bg-blue-400',
        textColor: 'text-gray-200'
      };
    } else if (column.title.toLowerCase().includes('expedi')) {
      return {
        borderColor: 'border-emerald-700',
        headerBg: 'bg-gradient-to-r from-gray-800 to-gray-700',
        headerBorder: 'border-emerald-700/50',
        glowColor: 'shadow-emerald-900/25',
        iconColor: 'text-emerald-400',
        accentColor: 'emerald-500',
        dotColor: 'bg-emerald-400',
        textColor: 'text-gray-200'
      };
    } else if (column.title.toLowerCase().includes('paralisa')) {
      return {
        borderColor: 'border-red-700',
        headerBg: 'bg-gradient-to-r from-gray-800 to-gray-700',
        headerBorder: 'border-red-700/50',
        glowColor: 'shadow-red-900/25',
        iconColor: 'text-red-400',
        accentColor: 'red-500',
        dotColor: 'bg-red-400',
        textColor: 'text-gray-200'
      };
    }
    return {
      borderColor: 'border-gray-700',
      headerBg: 'bg-gradient-to-r from-gray-800 to-gray-700',
      headerBorder: 'border-gray-700',
      glowColor: 'shadow-gray-900/25',
      iconColor: 'text-gray-400',
      accentColor: 'blue-500',
      dotColor: 'bg-gray-400',
      textColor: 'text-gray-200'
    };
  };

  const theme = getColumnTheme();

  return (
    <div
      ref={setNodeRef}
      className={`
        flex-shrink-0 w-80 h-[calc(100vh-180px)] flex flex-col
        bg-gray-800 rounded-lg shadow-md border-2 transition-all duration-200
        ${isOver ? 'ring-2 ring-blue-500 shadow-lg scale-[1.01] ' + theme.glowColor : theme.glowColor}
        ${theme.borderColor}
      `}
    >
      {/* Header da Coluna */}
      <div className={`
        ${theme.headerBg} rounded-t-lg border-b ${theme.headerBorder} p-4
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-2 h-2 rounded-full ${theme.dotColor}`}></div>
            <h3 className={`font-semibold text-lg ${theme.textColor}`}>
              {column.title}
            </h3>
            <span className={`
              inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold
              bg-gray-700 ${theme.textColor} border border-gray-600
              min-w-[2.5rem] justify-center
            `}>
              {safeOrders.length}
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            <button
              onClick={onEdit}
              className={`
                p-1.5 text-gray-400 hover:${theme.iconColor} hover:bg-gray-700 
                rounded-md transition-all duration-200
              `}
              title="Configurar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/50 rounded-md transition-all duration-200"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Estatísticas rápidas no header */}
        {safeOrders.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-2 bg-gray-700/50 rounded-md p-2 border border-gray-600/50">
              <Package className="h-3 w-3 text-gray-400" />
              <span className="text-gray-300 font-medium">{safeOrders.length} pedidos</span>
            </div>
            <div className="flex items-center space-x-2 bg-gray-700/50 rounded-md p-2 border border-gray-600/50">
              <Scale className="h-3 w-3 text-gray-400" />
              <span className="text-gray-300 font-medium">
                {safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Cards */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-gray-700 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500">
          <SortableContext items={safeOrders.map(order => order.id)} strategy={verticalListSortingStrategy}>
            {safeOrders.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <div className="text-4xl mb-4 opacity-30">📋</div>
                <p className="text-sm font-medium text-gray-400">Nenhum pedido nesta coluna</p>
                <p className="text-xs text-gray-500 mt-1">
                  Arraste pedidos aqui para organizá-los
                </p>
              </div>
            ) : (
              safeOrders.map(order => {
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

      {/* Footer da Coluna */}
      {safeOrders.length > 0 && (
        <div className={`
          ${theme.headerBg} rounded-b-lg border-t ${theme.headerBorder} p-3
        `}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="text-center bg-gray-700/60 rounded-md p-2 border border-gray-600/50">
              <div className="text-gray-400 font-medium mb-1">Total Pedidos</div>
              <div className={`${theme.textColor} font-bold text-lg`}>{safeOrders.length}</div>
            </div>
            <div className="text-center bg-gray-700/60 rounded-md p-2 border border-gray-600/50">
              <div className="text-gray-400 font-medium mb-1">Peso Total</div>
              <div className={`${theme.textColor} font-bold text-lg`}>
                {safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
              </div>
            </div>
          </div>
          
          {/* Barra de progresso geral da coluna */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span className="flex items-center gap-1 font-medium">
                <TrendingUp className="h-3 w-3" />
                Progresso Médio
              </span>
              <span className="font-semibold text-gray-300">
                {Math.round(
                  safeOrders.reduce((total, order) => {
                    const progress = order.progress || 0;
                    return total + progress;
                  }, 0) / safeOrders.length
                )}%
              </span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 bg-${theme.accentColor}`}
                style={{ 
                  width: `${Math.max(
                    safeOrders.reduce((total, order) => {
                      const progress = order.progress || 0;
                      return total + progress;
                    }, 0) / safeOrders.length, 
                    3
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
