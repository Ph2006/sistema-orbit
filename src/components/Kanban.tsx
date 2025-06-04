import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';
import { 
  SortableContext, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { 
  RefreshCw, 
  Plus, 
  Settings, 
  Check, 
  Search, 
  BarChart3, 
  Calendar, 
  Package, 
  Edit, 
  Download, 
  FileText, 
  CheckSquare, 
  Square,
  X,
  Weight,
  MoreVertical,
  Target
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// IMPORTS DOS SEUS STORES/TIPOS - AJUSTE OS PATHS CONFORME NECESSÁRIO
import { Order, OrderItem } from '../types/kanban';
import { useOrderStore } from '../store/orderStore';
import { useColumnStore } from '../store/columnStore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Função local para gerar ID único
const generateUniqueId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2);
  return `${timestamp}-${randomPart}`;
};

// Mapeamento de título de coluna para status de pedido
const getStatusFromColumnTitle = (title: string): string => {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('processo')) return 'in-progress';
  if (titleLower.includes('expedido')) return 'shipped';
  if (titleLower.includes('paralisado')) return 'on-hold';
  if (titleLower.includes('concluído') || titleLower.includes('concluido')) return 'completed';
  if (titleLower.includes('atrasado')) return 'delayed';
  if (titleLower.includes('urgente')) return 'urgent';
  if (titleLower.includes('aguardando') || titleLower.includes('docs')) return 'waiting-docs';
  if (titleLower.includes('pronto')) return 'ready';
  
  return titleLower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

// Função para identificar coluna de expedidos
const isShippedColumn = (columnTitle: string): boolean => {
  const titleLower = columnTitle.toLowerCase();
  return titleLower.includes('expedido') || titleLower.includes('shipped');
};

// Função para identificar se o pedido está concluído (baseado nos dados reais)
const isOrderCompleted = (order: Order): boolean => {
  if (!order.items || order.items.length === 0) {
    // Se não tem itens, verifica pelo progresso geral ou status
    return order.progress === 100 || order.status === 'completed';
  }
  
  return order.items.every(item => {
    const progress = item.overallProgress || 0;
    return progress >= 100;
  });
};

interface KanbanProps {
  readOnly?: boolean;
}

// Implementação direta do KanbanCard baseada no seu código original
const KanbanCard: React.FC<{
  order: Order;
  isManaging: boolean;
  isSelected: boolean;
  highlight: boolean;
  compactView: boolean;
  onOrderClick: (order: Order) => void;
  onQualityControlClick?: (order: Order) => void;
  onItemProgressClick?: (item: OrderItem) => void;
  projects: any[];
  selectedForShipping?: boolean;
  onEditClick?: (order: Order) => void;
  onSelectForShipping?: (order: Order) => void;
  onExportItemReport?: (order: Order) => void;
}> = ({
  order,
  isManaging,
  isSelected,
  highlight,
  compactView,
  onOrderClick,
  onQualityControlClick,
  onItemProgressClick,
  projects,
  selectedForShipping = false,
  onEditClick,
  onSelectForShipping,
  onExportItemReport
}) => {
  const [showItemActions, setShowItemActions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  if (!order || typeof order !== 'object' || !order.id) {
    console.warn('KanbanCard: Order inválido recebido:', order);
    return null;
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(order.id),
    disabled: isManaging || showDropdown,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'in-progress':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-blue-500', 
          statusBg: 'bg-blue-900/50 border border-blue-700/50', 
          statusText: 'text-blue-300',
          statusLabel: 'Em Processo',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'delayed':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-red-500', 
          statusBg: 'bg-red-900/50 border border-red-700/50', 
          statusText: 'text-red-300',
          statusLabel: 'Atrasado',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'completed':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-emerald-500', 
          statusBg: 'bg-emerald-900/50 border border-emerald-700/50', 
          statusText: 'text-emerald-300',
          statusLabel: 'Concluído',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'shipped':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-purple-500', 
          statusBg: 'bg-purple-900/50 border border-purple-700/50', 
          statusText: 'text-purple-300',
          statusLabel: 'Expedido',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      default:
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-gray-500', 
          statusBg: 'bg-gray-700/50 border border-gray-600/50', 
          statusText: 'text-gray-300',
          statusLabel: 'Padrão',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
    }
  };

  const formatDeliveryDate = () => {
    try {
      if (!order.deliveryDate) return 'Data não definida';
      const date = new Date(order.deliveryDate);
      if (!isValid(date)) return 'Data inválida';
      return format(date, 'dd/MM/yyyy', { locale: ptBR });
    } catch (error) {
      console.warn('Erro ao formatar data:', error);
      return 'Data inválida';
    }
  };

  const statusInfo = getStatusInfo(order.status || 'default');
  
  const progress = React.useMemo(() => {
    try {
      if (order.progress !== undefined && typeof order.progress === 'number') {
        return Math.max(0, Math.min(100, order.progress));
      }
      
      if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
        return 0;
      }
      
      let totalProgress = 0;
      let validItems = 0;
      
      for (const item of order.items) {
        if (item && typeof item === 'object' && typeof item.overallProgress === 'number') {
          totalProgress += Math.max(0, Math.min(100, item.overallProgress));
          validItems++;
        }
      }
      
      return validItems > 0 ? Math.round(totalProgress / validItems) : 0;
    } catch (error) {
      console.warn('Erro ao calcular progresso:', error);
      return 0;
    }
  }, [order.progress, order.items]);

  const handleCardClick = () => {
    console.log('Card clicado:', order);
    if (typeof onOrderClick === 'function' && !showDropdown) {
      onOrderClick(order);
    }
  };

  const handleSelectForShipping = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectForShipping) {
      onSelectForShipping(order);
    }
  };

  const orderNumber = order.orderNumber || order.id || 'N/A';
  const customer = order.customer || order.customerName || 'Cliente não informado';
  const internalOrderNumber = order.internalOrderNumber || order.serviceOrder || 'OS não informada';
  const itemsCount = Array.isArray(order.items) ? order.items.length : 0;

  return (
    <div className="relative group">
      <div
        ref={setNodeRef}
        style={style}
        {...(showDropdown ? {} : listeners)}
        {...attributes}
        className={`
          ${statusInfo.bgColor} ${statusInfo.borderColor}
          rounded-lg border-l-4 border border-gray-600 shadow-sm hover:shadow-md 
          transition-all duration-200 cursor-pointer backdrop-blur-sm bg-white/5
          ${isDragging ? 'opacity-60 scale-105 shadow-lg' : ''}
          ${highlight ? 'ring-2 ring-blue-500/50' : ''}
          ${isSelected ? 'ring-2 ring-gray-500/50' : ''}
          ${selectedForShipping ? 'ring-2 ring-green-500/50 bg-green-900/20' : ''}
          hover:transform hover:scale-[1.01]
          ${compactView ? 'p-3' : 'p-4'}
          relative
        `}
        onClick={handleCardClick}
      >
        {/* Checkbox para seleção de embarque */}
        <div className="absolute top-2 left-2 z-10">
          <button
            onClick={handleSelectForShipping}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={selectedForShipping ? 'Remover da seleção de embarque' : 'Selecionar para embarque'}
          >
            {selectedForShipping ? (
              <CheckSquare className="h-4 w-4 text-green-400" />
            ) : (
              <Square className="h-4 w-4 text-gray-400 hover:text-white" />
            )}
          </button>
        </div>

        {/* Header com número do pedido e status */}
        <div className="flex justify-between items-start mb-3 mt-6">
          <div className={`${statusInfo.statusBg} ${statusInfo.statusText} px-3 py-1 rounded-md text-xs font-semibold`}>
            {orderNumber}
          </div>
          <div className="flex gap-1 flex-col items-end">
            {order.status === 'completed' && (
              <span className="bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 px-2 py-0.5 rounded text-xs font-medium">
                CONCLUÍDO
              </span>
            )}
            {order.status === 'shipped' && (
              <span className="bg-purple-900/50 border border-purple-700/50 text-purple-300 px-2 py-0.5 rounded text-xs font-medium">
                EXPEDIDO
              </span>
            )}
          </div>
        </div>

        {/* Informações do pedido */}
        <div className={`space-y-2.5 ${compactView ? 'text-xs' : 'text-sm'}`}>
          <div className="flex items-center space-x-3">
            <span className={`${statusInfo.iconColor} text-sm`}>👤</span>
            <span className={`${statusInfo.textColor} truncate font-medium`} title={customer}>
              {customer}
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className={`${statusInfo.iconColor} text-sm`}>📋</span>
            <span className={statusInfo.textColor}>
              OS: <span className="font-mono font-semibold">{internalOrderNumber}</span>
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <span className={`${statusInfo.iconColor} text-sm`}>📅</span>
              <span className={`${statusInfo.textColor} font-medium`}>
                {formatDeliveryDate()}
              </span>
            </div>
            
            {order.totalWeight && 
             typeof order.totalWeight === 'number' && 
             !isNaN(order.totalWeight) && 
             order.totalWeight > 0 && (
              <div className="flex items-center space-x-2">
                <Weight className="h-3 w-3 text-gray-400" />
                <span className={`${statusInfo.textColor} font-semibold text-xs`}>
                  {order.totalWeight.toLocaleString('pt-BR', { 
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1 
                  })} kg
                </span>
              </div>
            )}
          </div>

          {/* Indicação de itens */}
          {!compactView && itemsCount > 0 && (
            <div className="flex items-center mt-1 space-x-2">
              <span className={`${statusInfo.iconColor} text-sm`}>📦</span>
              <span className={`${statusInfo.textColor} text-xs`}>
                {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
              </span>
              {selectedForShipping && (
                <span className="bg-green-900/50 border border-green-700/50 text-green-300 px-2 py-0.5 rounded text-xs font-medium">
                  SELECIONADO
                </span>
              )}
            </div>
          )}
        </div>

        {/* Seção de progresso */}
        {!compactView && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-2 font-medium">
              <span>Progresso</span>
              <span className={statusInfo.textColor}>
                {progress}%
              </span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  progress >= 100 ? 'bg-emerald-500' : 
                  progress >= 75 ? 'bg-blue-500' : 
                  progress >= 50 ? 'bg-amber-500' : 
                  'bg-gray-500'
                }`}
                style={{ width: `${Math.max(progress, 2)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Implementação direta do KanbanColumn baseada no seu código original
const KanbanColumn: React.FC<{
  column: any;
  orders: Order[];
  isManaging: boolean;
  compactView: boolean;
  onOrderClick: (order: Order) => void;
  onQualityControlClick?: (order: Order) => void;
  onItemProgressClick?: (item: OrderItem) => void;
  onEditClick: (order: Order) => void;
  onSelectForShipping?: (order: Order) => void;
  onExportItemReport?: (order: Order) => void;
  selectedForShipping: string[];
  projects: any[];
  highlightTerm?: string;
}> = ({
  column,
  orders,
  isManaging,
  compactView,
  onOrderClick,
  onQualityControlClick,
  onItemProgressClick,
  onEditClick,
  onSelectForShipping,
  onExportItemReport,
  selectedForShipping,
  projects,
  highlightTerm = ''
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const safeOrders = orders?.filter(order => 
    order && order.id && (order.orderNumber || order.id)
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
        </div>
        
        {/* Estatísticas rápidas no header */}
        {safeOrders.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center space-x-2 bg-gray-700/50 rounded-md p-2 border border-gray-600/50">
              <Package className="h-3 w-3 text-gray-400" />
              <span className="text-gray-300 font-medium">{safeOrders.length} pedidos</span>
            </div>
            <div className="flex items-center space-x-2 bg-gray-700/50 rounded-md p-2 border border-gray-600/50">
              <Weight className="h-3 w-3 text-gray-400" />
              <span className="text-gray-300 font-medium">
                {safeOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Cards */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-4 space-y-3">
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
                    isManaging={isManaging}
                    isSelected={selectedForShipping.includes(order.id)}
                    highlight={highlightTerm ? 
                      ((order.orderNumber || order.id)?.toLowerCase().includes(highlightTerm.toLowerCase()) ||
                       (order.customer || order.customerName)?.toLowerCase().includes(highlightTerm.toLowerCase()) ||
                       (order.internalOrderNumber || order.serviceOrder)?.toLowerCase().includes(highlightTerm.toLowerCase())) || false
                      : false
                    }
                    compactView={compactView}
                    onOrderClick={onOrderClick}
                    projects={projects}
                    onQualityControlClick={onQualityControlClick}
                    onItemProgressClick={onItemProgressClick}
                    selectedForShipping={selectedForShipping.includes(order.id)}
                    onEditClick={onEditClick}
                    onSelectForShipping={onSelectForShipping}
                    onExportItemReport={onExportItemReport}
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
                <BarChart3 className="h-3 w-3" />
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

// Componente de Resumo de Pedidos
const OrdersSummary: React.FC<{ orders: Order[] }> = React.memo(({ orders }) => {
  const summaryData = useMemo(() => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const followingMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    
    let currentMonthWeight = 0;
    let nextMonthWeight = 0;
    let followingMonthWeight = 0;
    let totalPendingOrders = 0;
    let totalCompletedOrders = 0;
    let totalWeight = 0;
    
    orders.forEach(order => {
      const deliveryDate = new Date(order.deliveryDate);
      const orderWeight = order.totalWeight || 0;
      
      totalWeight += orderWeight;
      
      if (order.status === 'completed') {
        totalCompletedOrders++;
      } else {
        totalPendingOrders++;
      }
      
      // Peso por mês baseado na data de entrega
      const deliveryMonth = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), 1);
      
      if (deliveryMonth.getTime() === currentMonth.getTime()) {
        currentMonthWeight += orderWeight;
      } else if (deliveryMonth.getTime() === nextMonth.getTime()) {
        nextMonthWeight += orderWeight;
      } else if (deliveryMonth.getTime() === followingMonth.getTime()) {
        followingMonthWeight += orderWeight;
      }
    });
    
    const formatMonth = (date: Date) => {
      return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    };
    
    return {
      currentMonth: {
        name: formatMonth(currentMonth),
        weight: currentMonthWeight
      },
      nextMonth: {
        name: formatMonth(nextMonth),
        weight: nextMonthWeight
      },
      followingMonth: {
        name: formatMonth(followingMonth),
        weight: followingMonthWeight
      },
      totals: {
        pending: totalPendingOrders,
        completed: totalCompletedOrders,
        totalWeight: totalWeight
      }
    };
  }, [orders]);
  
  return (
    <div className="w-80 bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-lg border border-gray-600 p-4 shadow-xl">
      <div className="flex items-center mb-4">
        <BarChart3 className="h-5 w-5 text-blue-400 mr-2" />
        <h3 className="font-semibold text-white">Resumo de Pedidos</h3>
      </div>
      
      {/* Totais Gerais */}
      <div className="mb-4 p-3 bg-gradient-to-r from-gray-700 to-gray-600 rounded-lg shadow-inner">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Totais Gerais</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{summaryData.totals.pending}</div>
            <div className="text-gray-400">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">{summaryData.totals.completed}</div>
            <div className="text-gray-400">Concluídos</div>
          </div>
        </div>
        <div className="mt-2 text-center">
          <div className="text-lg font-bold text-yellow-400">
            {summaryData.totals.totalWeight.toFixed(1)} kg
          </div>
          <div className="text-gray-400">Peso Total</div>
        </div>
      </div>
      
      {/* Peso por Mês */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-300">Peso por Mês (Entrega)</h4>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center p-2 bg-gray-700 rounded">
            <span className="text-sm text-gray-300">{summaryData.currentMonth.name}</span>
            <span className="text-sm font-semibold text-blue-400">
              {summaryData.currentMonth.weight.toFixed(1)} kg
            </span>
          </div>
          
          <div className="flex justify-between items-center p-2 bg-gray-700 rounded">
            <span className="text-sm text-gray-300">{summaryData.nextMonth.name}</span>
            <span className="text-sm font-semibold text-green-400">
              {summaryData.nextMonth.weight.toFixed(1)} kg
            </span>
          </div>
          
          <div className="flex justify-between items-center p-2 bg-gray-700 rounded">
            <span className="text-sm text-gray-300">{summaryData.followingMonth.name}</span>
            <span className="text-sm font-semibold text-yellow-400">
              {summaryData.followingMonth.weight.toFixed(1)} kg
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

// Hook customizado para movimentação automática de pedidos
const useAutoMoveCompletedOrders = (
  orders: Order[], 
  columns: any[], 
  updateOrder: (orderId: string, updates: Partial<Order>) => void
) => {
  useEffect(() => {
    // Encontrar a coluna de expedidos
    const shippedColumn = columns.find(col => isShippedColumn(col.title));
    if (!shippedColumn) return;

    // Verificar pedidos concluídos que não estão na coluna de expedidos
    const completedOrdersToMove = orders.filter(order => 
      isOrderCompleted(order) && 
      order.columnId !== shippedColumn.id &&
      order.status !== 'shipped' &&
      order.status !== 'completed'
    );

    // Mover pedidos concluídos para coluna de expedidos
    completedOrdersToMove.forEach(order => {
      console.log(`Movendo pedido ${order.id} para coluna de expedidos automaticamente`);
      updateOrder(order.id, {
        columnId: shippedColumn.id,
        status: 'shipped'
      });
    });
  }, [orders, columns, updateOrder]);
};

// Componente principal do Kanban
const Kanban: React.FC<KanbanProps> = ({ readOnly = false }) => {
  // USAR STORES REAIS - removendo dados de exemplo
  const {
    orders,
    updateOrder,
    loadOrders,
    loading,
    error
  } = useOrderStore();

  const { columns } = useColumnStore();

  // Estados locais
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [showItemProgressModal, setShowItemProgressModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [showQualityControl, setShowQualityControl] = useState(false);
  const [qualityControlOrder, setQualityControlOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [compactView, setCompactView] = useState(false);
  const [isManaging, setIsManaging] = useState(false);

  // Carregar dados ao montar o componente
  useEffect(() => {
    console.log('🚀 Kanban mounted, loading orders...');
    loadOrders();
  }, [loadOrders]);

  // Debug: verificar se os dados estão sendo carregados
  console.log('📊 Kanban Debug:');
  console.log('- Orders:', orders?.length || 0, 'total');
  console.log('- Columns:', columns?.length || 0, 'total'); 
  console.log('- Loading:', loading);
  console.log('- Error:', error);

  // Simulando selectedOrdersForShipping e toggleOrderForShipping
  const [selectedOrdersForShipping, setSelectedOrdersForShipping] = useState<string[]>([]);
  const toggleOrderForShipping = useCallback((order: Order) => {
    setSelectedOrdersForShipping(prev => 
      prev.includes(order.id) 
        ? prev.filter(id => id !== order.id)
        : [...prev, order.id]
    );
    console.log('Toggle shipping for order:', order.id);
  }, []);

  // Hook para movimentação automática com dados reais
  useAutoMoveCompletedOrders(orders, columns, (orderId: string, updates: Partial<Order>) => {
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (orderToUpdate) {
      updateOrder({ ...orderToUpdate, ...updates });
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
    useSensor(MouseSensor),
    useSensor(TouchSensor)
  );

  // Filtrar pedidos por termo de busca
  const filteredOrders = useMemo(() => {
    if (!orders || !Array.isArray(orders)) return [];
    if (!searchTerm.trim()) return orders;
    
    const term = searchTerm.toLowerCase();
    return orders.filter(order => 
      order.id?.toLowerCase().includes(term) ||
      order.orderNumber?.toLowerCase().includes(term) ||
      order.customer?.toLowerCase().includes(term) ||
      order.customerName?.toLowerCase().includes(term) ||
      order.projectName?.toLowerCase().includes(term) ||
      order.internalOrderNumber?.toLowerCase().includes(term) ||
      order.serviceOrder?.toLowerCase().includes(term) ||
      order.items?.some(item => 
        item.name?.toLowerCase().includes(term) ||
        item.code?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      )
    );
  }, [orders, searchTerm]);

  // Agrupar pedidos por coluna e ordenar por data de entrega
  const ordersByColumn = useMemo(() => {
    if (!columns || !Array.isArray(columns) || !filteredOrders || !Array.isArray(filteredOrders)) {
      return {};
    }

    const grouped: Record<string, Order[]> = {};
    
    columns.forEach(column => {
      const columnOrders = filteredOrders.filter(order => order.columnId === column.id);
      
      // Ordenar pedidos por data de entrega (mais próximos primeiro)
      const sortedOrders = columnOrders.sort((a, b) => {
        const dateA = new Date(a.deliveryDate);
        const dateB = new Date(b.deliveryDate);
        return dateA.getTime() - dateB.getTime();
      });
      
      grouped[column.id] = sortedOrders;
    });
    
    return grouped;
  }, [filteredOrders, columns]);

  // Debug: verificar agrupamento
  console.log('Orders by column:', ordersByColumn);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (readOnly) return;
    setActiveId(event.active.id as string);
  }, [readOnly]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (readOnly) return;
    
    const { active, over } = event;
    setActiveId(null);

    if (!over || !orders || !Array.isArray(orders) || !columns || !Array.isArray(columns)) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Verificar se é movimentação entre colunas
    const activeOrder = orders.find(order => order.id === activeId);
    if (!activeOrder) return;

    const targetColumn = columns.find(col => col.id === overId);
    if (targetColumn && activeOrder.columnId !== overId) {
      const newStatus = getStatusFromColumnTitle(targetColumn.title);
      
      // Atualizar usando o store real
      const updatedOrder = {
        ...activeOrder,
        columnId: overId,
        status: newStatus
      };
      updateOrder(updatedOrder);
    }
  }, [readOnly, orders, columns, updateOrder]);

  const handleOrderClick = useCallback((order: Order) => {
    console.log('Clicou no pedido:', order);
    // Se você tem um modal de detalhes do pedido, descomente a linha abaixo:
    // setEditingOrder(order);
    // setShowOrderModal(true);
    
    // Por enquanto, vamos apenas logar os dados do pedido
    alert(`Pedido: ${order.orderNumber || order.id}\nCliente: ${order.customer || order.customerName}\nOS: ${order.internalOrderNumber || order.serviceOrder}\nStatus: ${order.status}\nProgresso: ${order.progress || 0}%`);
  }, []);

  const handleCreateOrder = useCallback(() => {
    console.log('Criando novo pedido');
    // Se você tem um modal de criação, descomente as linhas abaixo:
    // setEditingOrder(null);
    // setShowOrderModal(true);
    
    // Por enquanto, vamos apenas logar
    alert('Funcionalidade de criar novo pedido será implementada');
  }, []);

  const handleEditOrder = useCallback((order: Order) => {
    console.log('Editando pedido:', order);
    // Se você tem um modal de edição, descomente as linhas abaixo:
    // setEditingOrder(order);
    // setShowOrderModal(true);
    
    // Por enquanto, vamos apenas logar
    alert(`Editando pedido: ${order.orderNumber || order.id}`);
  }, []);

  const handleQualityControlClick = useCallback((order: Order) => {
    setQualityControlOrder(order);
    setShowQualityControl(true);
  }, []);

  const handleItemProgressClick = useCallback((item: OrderItem) => {
    setSelectedItem(item);
    setShowItemProgressModal(true);
  }, []);

  const handleExportItemReport = useCallback((order: Order) => {
    // Lógica para exportar relatório do item
    console.log('Exportando relatório para pedido:', order.id);
  }, []);

  const activeOrder = activeId && orders && Array.isArray(orders) ? 
    orders.find(order => order.id === activeId) : null;

  return (
    <div className="h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex">
      {/* Área principal do Kanban */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800 border-b border-gray-600 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-white">Kanban</h1>
              
              {/* Barra de busca */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar pedidos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Botão de view compacta */}
              <button
                onClick={() => setCompactView(!compactView)}
                className={`p-2 rounded-lg transition-colors ${
                  compactView
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                title="Vista compacta"
              >
                <Package className="h-4 w-4" />
              </button>

              {/* Botão de gerenciamento */}
              <button
                onClick={() => setIsManaging(!isManaging)}
                className={`p-2 rounded-lg transition-colors ${
                  isManaging
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                title="Modo gerenciamento"
              >
                <Settings className="h-4 w-4" />
              </button>

              {/* Botão de novo pedido */}
              <button
                onClick={handleCreateOrder}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Novo Pedido
              </button>
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-6 p-6 h-full min-w-max">
              {loading ? (
                <div className="text-white text-center">
                  <p>Carregando pedidos...</p>
                </div>
              ) : error ? (
                <div className="text-red-400 text-center">
                  <p>Erro: {error}</p>
                  <button 
                    onClick={loadOrders}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : columns && Array.isArray(columns) ? columns.map(column => (
                <div key={column.id} className="flex-shrink-0 w-80">
                  <SortableContext
                    items={ordersByColumn[column.id]?.map(order => order.id) || []}
                    strategy={verticalListSortingStrategy}
                  >
                    <KanbanColumn
                      column={column}
                      orders={ordersByColumn[column.id] || []}
                      isManaging={isManaging}
                      compactView={compactView}
                      onOrderClick={handleOrderClick}
                      onQualityControlClick={handleQualityControlClick}
                      onItemProgressClick={handleItemProgressClick}
                      onEditClick={handleEditOrder}
                      onSelectForShipping={toggleOrderForShipping}
                      onExportItemReport={handleExportItemReport}
                      selectedForShipping={selectedOrdersForShipping || []}
                      projects={[]}
                      highlightTerm={searchTerm}
                    />
                  </SortableContext>
                </div>
              )) : (
                <div className="text-white text-center">
                  <p>Nenhuma coluna configurada</p>
                </div>
              )}
            </div>

            <DragOverlay>
              {activeOrder ? (
                <KanbanCard
                  order={activeOrder}
                  isManaging={isManaging}
                  isSelected={false}
                  highlight={false}
                  compactView={compactView}
                  onOrderClick={() => {}}
                  projects={[]}
                  onEditClick={() => {}}
                  onSelectForShipping={() => {}}
                  onExportItemReport={() => {}}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Sidebar com resumo */}
      <div className="w-96 bg-gray-800 border-l border-gray-600 p-4 overflow-y-auto">
        <OrdersSummary orders={orders || []} />
      </div>

      {/* Modais comentados para evitar erros de compilação */}
      {/*
      {showOrderModal && (
        <OrderModal
          isOpen={showOrderModal}
          onClose={() => setShowOrderModal(false)}
          order={editingOrder}
          onSave={(orderData) => {
            if (editingOrder) {
              updateOrder(editingOrder.id, orderData);
            } else {
              const newOrder: Order = {
                ...orderData,
                id: generateUniqueId(),
                columnId: columns[0]?.id || '',
                status: getStatusFromColumnTitle(columns[0]?.title || ''),
                createdAt: new Date(),
                updatedAt: new Date()
              };
              createOrder(newOrder);
            }
            setShowOrderModal(false);
            setEditingOrder(null);
          }}
          columns={columns}
        />
      )}

      {showItemProgressModal && selectedItem && (
        <ItemProgressModal
          isOpen={showItemProgressModal}
          onClose={() => setShowItemProgressModal(false)}
          item={selectedItem}
          onSave={(updatedItem) => {
            console.log('Item atualizado:', updatedItem);
            setShowItemProgressModal(false);
            setSelectedItem(null);
          }}
        />
      )}

      {showQualityControl && qualityControlOrder && (
        <QualityControl
          isOpen={showQualityControl}
          onClose={() => setShowQualityControl(false)}
          order={qualityControlOrder}
          onSave={(updatedOrder) => {
            updateOrder(qualityControlOrder.id, updatedOrder);
            setShowQualityControl(false);
            setQualityControlOrder(null);
          }}
        />
      )}
      */}
    </div>
  );
};

export default Kanban;
