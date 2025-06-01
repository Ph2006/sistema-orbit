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
        borderColor: 'border-blue-200',
        headerBg: 'bg-gradient-to-r from-slate-100 to-slate-50',
        headerBorder: 'border-blue-300',
        glowColor: 'shadow-blue-100',
        iconColor: 'text-blue-600',
        accentColor: 'blue-600',
        dotColor: 'bg-blue-500',
        textColor: 'text-slate-700'
      };
    } else if (column.title.toLowerCase().includes('expedi')) {
      return {
        borderColor: 'border-emerald-200',
        headerBg: 'bg-gradient-to-r from-emerald-50 to-slate-50',
        headerBorder: 'border-emerald-300',
        glowColor: 'shadow-emerald-100',
        iconColor: 'text-emerald-600',
        accentColor: 'emerald-600',
        dotColor: 'bg-emerald-500',
        textColor: 'text-slate-700'
      };
    } else if (column.title.toLowerCase().includes('paralisa')) {
      return {
        borderColor: 'border-red-200',
        headerBg: 'bg-gradient-to-r from-red-50 to-slate-50',
        headerBorder: 'border-red-300',
        glowColor: 'shadow-red-100',
        iconColor: 'text-red-600',
        accentColor: 'red-600',
        dotColor: 'bg-red-500',
        textColor: 'text-slate-700'
      };
    }
    return {
      borderColor: 'border-slate-200',
      headerBg: 'bg-gradient-to-r from-slate-100 to-slate-50',
      headerBorder: 'border-slate-300',
      glowColor: 'shadow-slate-100',
      iconColor: 'text-slate-600',
      accentColor: 'slate-600',
      dotColor: 'bg-slate-500',
      textColor: 'text-slate-700'
    };
  };

  const theme = getColumnTheme();

  return (
    <div
      ref={setNodeRef}
      className={`
        flex-shrink-0 w-80 h-[calc(100vh-180px)] flex flex-col
        bg-white rounded-lg shadow-sm border-2 transition-all duration-200
        ${isOver ? 'ring-2 ring-blue-300 shadow-md scale-[1.01] ' + theme.glowColor : theme.glowColor}
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
              bg-slate-100 ${theme.textColor} border border-slate-200
              min-w-[2.5rem] justify-center
            `}>
              {safeOrders.length}
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            <button
              onClick={onEdit}
              className={`
                p-1.5 text-slate-400 hover:${theme.iconColor} hover:bg-slate-100 
                rounded-md transition-all duration-200
              `}
              title="Configurar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all duration-200"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Estatísticas rápidas no header */}
        {safeOrders.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-2 bg-white/50 rounded-md p-2 border border-slate-200/50">
              <Package className="h-3 w-3 text-slate-500" />
              <span className="text-slate-600 font-medium">{safeOrders.length} pedidos</span>
            </div>
            <div className="flex items-center space-x-2 bg-white/50 rounded-md p-2 border border-slate-200/50">
              <Scale className="h-3 w-3 text-slate-500" />
              <span className="text-slate-600 font-medium">
                {safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Cards */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-slate-100 scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400">
          <SortableContext items={safeOrders.map(order => order.id)} strategy={verticalListSortingStrategy}>
            {safeOrders.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <div className="text-4xl mb-4 opacity-30">📋</div>
                <p className="text-sm font-medium text-slate-500">Nenhum pedido nesta coluna</p>
                <p className="text-xs text-slate-400 mt-1">
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
            <div className="text-center bg-white/60 rounded-md p-2 border border-slate-200/50">
              <div className="text-slate-500 font-medium mb-1">Total Pedidos</div>
              <div className={`${theme.textColor} font-bold text-lg`}>{safeOrders.length}</div>
            </div>
            <div className="text-center bg-white/60 rounded-md p-2 border border-slate-200/50">
              <div className="text-slate-500 font-medium mb-1">Peso Total</div>
              <div className={`${theme.textColor} font-bold text-lg`}>
                {safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
              </div>
            </div>
          </div>
          
          {/* Barra de progresso geral da coluna */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span className="flex items-center gap-1 font-medium">
                <TrendingUp className="h-3 w-3" />
                Progresso Médio
              </span>
              <span className="font-semibold text-slate-600">
                {Math.round(
                  safeOrders.reduce((total, order) => {
                    const progress = order.progress || 0;
                    return total + progress;
                  }, 0) / safeOrders.length
                )}%
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
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
