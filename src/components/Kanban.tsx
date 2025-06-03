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
  Weight
} from 'lucide-react';

// IMPORTS DOS SEUS COMPONENTES REAIS - DESCOMENTE E AJUSTE OS PATHS
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
// import OrderModal from './OrderModal';
// import ItemProgressModal from './ItemProgressModal';
// import QualityControl from './QualityControl';
// import ItemProductionReport from './ItemProductionReport';
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

// Função para identificar se o pedido está concluído
const isOrderCompleted = (order: Order): boolean => {
  if (!order.items || order.items.length === 0) {
    // Se não tem itens, verifica pelo progresso geral ou status
    return order.progress === 100 || order.status === 'completed';
  }
  
  return order.items.every(item => {
    const progress = item.overallProgress || item.progress || 0;
    return progress >= 100;
  });
};

interface KanbanProps {
  readOnly?: boolean;
}

// Componente para exibir peso total da coluna
const ColumnWeightSummary: React.FC<{ 
  orders: Order[]; 
  columnTitle: string;
  className?: string;
}> = ({ orders, columnTitle, className = "" }) => {
  const totalWeight = useMemo(() => {
    return orders.reduce((sum, order) => sum + (order.totalWeight || 0), 0);
  }, [orders]);

  const orderCount = orders.length;

  return (
    <div className={`flex items-center justify-between text-sm text-gray-400 px-2 py-1 ${className}`}>
      <div className="flex items-center gap-2">
        <Weight className="h-3 w-3" />
        <span className="font-medium text-white">
          {totalWeight.toFixed(1)} kg
        </span>
      </div>
      <div className="text-xs opacity-75">
        {orderCount} {orderCount === 1 ? 'pedido' : 'pedidos'}
      </div>
    </div>
  );
};

// Componente de Card melhorado com botão de edição
const EnhancedKanbanCard: React.FC<{
  order: Order;
  isManaging: boolean;
  isSelected: boolean;
  highlight: boolean;
  compactView: boolean;
  onOrderClick: (order: Order) => void;
  onQualityControlClick?: (order: Order) => void;
  onItemProgressClick?: (item: OrderItem) => void;
  onEditClick: (order: Order) => void;
  onSelectForShipping?: (order: Order) => void;
  onExportItemReport?: (order: Order) => void;
  selectedForShipping?: boolean;
  projects: any[];
}> = ({
  order,
  isManaging,
  isSelected,
  highlight,
  compactView,
  onOrderClick,
  onQualityControlClick,
  onItemProgressClick,
  onEditClick,
  onSelectForShipping,
  onExportItemReport,
  selectedForShipping = false,
  projects
}) => {
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditClick(order);
  };

  const handleSelectForShipping = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectForShipping?.(order);
  };

  const handleExportReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    onExportItemReport?.(order);
  };

  return (
    <div className="relative group">
      <KanbanCard
        order={order}
        isManaging={isManaging}
        isSelected={isSelected}
        highlight={highlight}
        compactView={compactView}
        onOrderClick={onOrderClick}
        onQualityControlClick={onQualityControlClick}
        onItemProgressClick={onItemProgressClick}
        projects={projects}
        selectedForShipping={selectedForShipping}
        onEditClick={onEditClick}
        onSelectForShipping={onSelectForShipping}
        onExportItemReport={onExportItemReport}
      />
      
      {/* Botões de ação - aparecem no hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        {/* Botão de seleção para embarque */}
        <button
          onClick={handleSelectForShipping}
          className={`p-1 rounded-md transition-colors ${
            selectedForShipping 
              ? 'bg-green-600 text-white hover:bg-green-700' 
              : 'bg-gray-600 text-white hover:bg-gray-700'
          }`}
          title="Selecionar para embarque"
        >
          {selectedForShipping ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        
        {/* Botão de relatório */}
        <button
          onClick={handleExportReport}
          className="p-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          title="Exportar relatório"
        >
          <FileText className="h-3 w-3" />
        </button>
        
        {/* Botão de edição */}
        <button
          onClick={handleEditClick}
          className="p-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          title="Editar pedido"
        >
          <Edit className="h-3 w-3" />
        </button>
      </div>
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
  const {
    orders,
    updateOrder,
    createOrder,
    deleteOrder,
    selectedOrdersForShipping,
    toggleOrderForShipping,
    clearShippingSelection,
    exportShippingList
  } = useOrderStore();

  const { columns, updateColumn, createColumn, deleteColumn } = useColumnStore();

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

  // Hook para movimentação automática com dados reais
  useAutoMoveCompletedOrders(orders, columns, updateOrder);

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

  // Agrupar pedidos por coluna
  const ordersByColumn = useMemo(() => {
    const grouped: Record<string, Order[]> = {};
    
    columns.forEach(column => {
      grouped[column.id] = filteredOrders.filter(order => order.columnId === column.id);
    });
    
    return grouped;
  }, [filteredOrders, columns]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (readOnly) return;
    setActiveId(event.active.id as string);
  }, [readOnly]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (readOnly) return;
    
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Verificar se é movimentação entre colunas
    const activeOrder = orders.find(order => order.id === activeId);
    if (!activeOrder) return;

    const targetColumn = columns.find(col => col.id === overId);
    if (targetColumn && activeOrder.columnId !== overId) {
      const newStatus = getStatusFromColumnTitle(targetColumn.title);
      updateOrder(activeId, {
        columnId: overId,
        status: newStatus
      });
    }
  }, [readOnly, orders, columns, updateOrder]);

  const handleOrderClick = useCallback((order: Order) => {
    setEditingOrder(order);
    setShowOrderModal(true);
  }, []);

  const handleCreateOrder = useCallback(() => {
    setEditingOrder(null);
    setShowOrderModal(true);
  }, []);

  const handleEditOrder = useCallback((order: Order) => {
    setEditingOrder(order);
    setShowOrderModal(true);
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

  const activeOrder = activeId ? orders.find(order => order.id === activeId) : null;

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
              {columns.map(column => (
                <div key={column.id} className="flex-shrink-0 w-80">
                  {/* Header da coluna com peso total */}
                  <div className="bg-gray-800 rounded-t-lg border border-gray-600 border-b-0">
                    <div className="p-4 border-b border-gray-600">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-white">{column.title}</h3>
                        <span className="bg-gray-600 text-white text-sm px-2 py-1 rounded-full">
                          {ordersByColumn[column.id]?.length || 0}
                        </span>
                      </div>
                    </div>
                    
                    {/* Resumo de peso da coluna */}
                    <ColumnWeightSummary 
                      orders={ordersByColumn[column.id] || []} 
                      columnTitle={column.title}
                      className="border-b border-gray-600"
                    />
                  </div>

                  {/* Conteúdo da coluna */}
                  <SortableContext
                    items={ordersByColumn[column.id]?.map(order => order.id) || []}
                    strategy={verticalListSortingStrategy}
                  >
                    <KanbanColumn
                      column={{...column, orders: ordersByColumn[column.id] || []}}
                      onEdit={() => console.log('Edit column')}
                      onDelete={() => console.log('Delete column')}
                      onOrderClick={handleOrderClick}
                      onUpdateOrder={(order) => updateOrder(order.id, order)}
                      onQualityControlClick={handleQualityControlClick}
                      highlightTerm={searchTerm}
                      compactView={compactView}
                      isManagingOrders={isManaging}
                      selectedOrders={selectedOrdersForShipping || []}
                      customers={[]}
                      expandedCards={new Set()}
                      projects={[]}
                    />
                  </SortableContext>
                </div>
              ))}
            </div>

            <DragOverlay>
              {activeOrder ? (
                <EnhancedKanbanCard
                  order={activeOrder}
                  isManaging={isManaging}
                  isSelected={false}
                  highlight={false}
                  compactView={compactView}
                  onOrderClick={() => {}}
                  onEditClick={() => {}}
                  projects={[]}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Sidebar com resumo */}
      <div className="w-96 bg-gray-800 border-l border-gray-600 p-4 overflow-y-auto">
        <OrdersSummary orders={orders} />
      </div>

      {/* Modais - implementação básica comentada para evitar erros */}
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
            // Lógica para atualizar o item
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
