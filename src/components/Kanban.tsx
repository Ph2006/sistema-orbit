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
} from '@dnd-kit/core';
import { 
  SortableContext, 
  arrayMove,
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { RefreshCw, Plus, Trash, Settings, Check, Search, BarChart3, Calendar, Package } from 'lucide-react';

import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import OrderModal from './OrderModal';
import ItemProgressModal from './ItemProgressModal';
import QualityControl from './QualityControl';
import { Order, OrderItem } from '../types/kanban';
import { useOrderStore } from '../store/orderStore';
import { useColumnStore } from '../store/columnStore';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

interface KanbanProps {
  readOnly?: boolean;
}

// Componente de Resumo de Pedidos
const OrdersSummary: React.FC<{ orders: Order[] }> = ({ orders }) => {
  const summaryData = useMemo(() => {
    const now = new Date();
    const currentMonth = startOfMonth(now);
    const nextMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1));
    const followingMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 2));
    
    const currentMonthEnd = endOfMonth(currentMonth);
    const nextMonthEnd = endOfMonth(nextMonth);
    const followingMonthEnd = endOfMonth(followingMonth);
    
    let currentMonthWeight = 0;
    let nextMonthWeight = 0;
    let followingMonthWeight = 0;
    let currentMonthOrders = 0;
    let nextMonthOrders = 0;
    let followingMonthOrders = 0;
    
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
      if (isWithinInterval(deliveryDate, { start: currentMonth, end: currentMonthEnd })) {
        currentMonthWeight += orderWeight;
        currentMonthOrders++;
      } else if (isWithinInterval(deliveryDate, { start: nextMonth, end: nextMonthEnd })) {
        nextMonthWeight += orderWeight;
        nextMonthOrders++;
      } else if (isWithinInterval(deliveryDate, { start: followingMonth, end: followingMonthEnd })) {
        followingMonthWeight += orderWeight;
        followingMonthOrders++;
      }
    });
    
    return {
      currentMonth: {
        name: format(currentMonth, 'MMM/yyyy', { locale: ptBR }),
        weight: currentMonthWeight,
        orders: currentMonthOrders
      },
      nextMonth: {
        name: format(nextMonth, 'MMM/yyyy', { locale: ptBR }),
        weight: nextMonthWeight,
        orders: nextMonthOrders
      },
      followingMonth: {
        name: format(followingMonth, 'MMM/yyyy', { locale: ptBR }),
        weight: followingMonthWeight,
        orders: followingMonthOrders
      },
      totals: {
        pending: totalPendingOrders,
        completed: totalCompletedOrders,
        totalWeight: totalWeight
      }
    };
  }, [orders]);
  
  return (
    <div className="w-80 bg-gray-800 rounded-lg border border-gray-600 p-4 h-fit">
      <div className="flex items-center mb-4">
        <BarChart3 className="h-5 w-5 text-blue-400 mr-2" />
        <h3 className="font-semibold text-white">Resumo de Pedidos</h3>
      </div>
      
      {/* Totais Gerais */}
      <div className="mb-4 p-3 bg-gray-700 rounded-lg">
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
        <h4 className="text-sm font-medium text-gray-300 flex items-center">
          <Calendar className="h-4 w-4 mr-1" />
          Peso por Mês (Entrega)
        </h4>
        
        {[summaryData.currentMonth, summaryData.nextMonth, summaryData.followingMonth].map((month, index) => (
          <div key={index} className="p-3 bg-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-white">{month.name}</span>
              <span className="text-xs text-gray-400">{month.orders} pedidos</span>
            </div>
            <div className="flex items-center">
              <Package className="h-4 w-4 text-gray-400 mr-2" />
              <span className="text-lg font-bold text-white">{month.weight.toFixed(1)} kg</span>
            </div>
            <div className="mt-2 w-full bg-gray-600 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  index === 0 ? 'bg-blue-500' : 
                  index === 1 ? 'bg-green-500' : 'bg-yellow-500'
                }`}
                style={{ 
                  width: `${summaryData.totals.totalWeight > 0 ? 
                    (month.weight / summaryData.totals.totalWeight) * 100 : 0}%` 
                }}
              />
            </div>
          </div>
        ))}
      </div>
      
      {/* Status dos Pedidos */}
      <div className="mt-4 p-3 bg-gray-700 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Status Distribution</h4>
        <div className="space-y-2">
          {orders.reduce((acc, order) => {
            const status = order.status || 'unknown';
            if (!acc[status]) acc[status] = 0;
            acc[status]++;
            return acc;
          }, {} as Record<string, number>)}
        </div>
      </div>
    </div>
  );
};

const Kanban: React.FC<KanbanProps> = ({ readOnly = false }) => {
  const { 
    orders, 
    updateOrder, 
    deleteOrder,
    addOrder,
    subscribeToOrders
  } = useOrderStore();

  const { 
    columns,
    initializeDefaultColumns,
    subscribeToColumns
  } = useColumnStore();
  
  const [compactView, setCompactView] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderForQC, setSelectedOrderForQC] = useState<Order | null>(null);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManagingColumns, setIsManagingColumns] = useState(false);
  const [isItemProgressModalOpen, setIsItemProgressModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    const unsubscribeOrders = subscribeToOrders();
    const unsubscribeColumns = subscribeToColumns();
    
    if (columns.length === 0) {
      initializeDefaultColumns().catch(console.error);
    }
    
    return () => {
      unsubscribeOrders();
      unsubscribeColumns();
    };
  }, [subscribeToOrders, subscribeToColumns, initializeDefaultColumns, columns.length]);

  const activeColumns = useMemo(() => {
    if (columns.length === 0) return [];
    
    // Filtrar pedidos com base no termo de busca
    let filteredOrders = orders;
    if (searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredOrders = orders.filter(order =>
        order.orderNumber?.toString().toLowerCase().includes(lowerSearchTerm) ||
        order.customer?.toLowerCase().includes(lowerSearchTerm) ||
        order.internalOrderNumber?.toLowerCase().includes(lowerSearchTerm) ||
        order.notes?.toLowerCase().includes(lowerSearchTerm)
      );
    }
    
    // Distribuir pedidos nas colunas
    const result = columns.map(column => {
      let columnOrders: Order[] = [];
      
      // Estratégia 1: Usar columnId (prioridade)
      const ordersByColumnId = filteredOrders.filter(order => order.columnId === column.id);
      
      // Estratégia 2: Usar status mapeado para título da coluna
      const columnStatus = getStatusFromColumnTitle(column.title);
      const ordersByStatus = filteredOrders.filter(order => order.status === columnStatus);
      
      // Estratégia 3: Buscar por palavras-chave no status
      const titleKeywords = column.title.toLowerCase().split(' ');
      const ordersByKeywords = filteredOrders.filter(order => {
        if (!order.status) return false;
        const statusLower = order.status.toLowerCase();
        return titleKeywords.some(keyword => 
          keyword.length > 2 && statusLower.includes(keyword)
        );
      });
      
      // Combinar resultados (prioridade: columnId > status > keywords)
      const combinedIds = new Set([
        ...ordersByColumnId.map(o => o.id),
        ...ordersByStatus.map(o => o.id),
        ...ordersByKeywords.map(o => o.id)
      ]);
      
      columnOrders = filteredOrders.filter(order => combinedIds.has(order.id));
      
      // ✅ ORDENAR por data de entrega (mais próxima primeiro)
      columnOrders.sort((a, b) => {
        const dateA = new Date(a.deliveryDate).getTime();
        const dateB = new Date(b.deliveryDate).getTime();
        return dateA - dateB;
      });
      
      return { 
        ...column, 
        orders: columnOrders,
        status: columnStatus
      };
    });
    
    return result;
  }, [orders, columns, searchTerm]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const targetColumnId = over.id.toString().replace('droppable-', '');
    
    if (targetColumnId) {
      const targetColumn = activeColumns.find(col => col.id === targetColumnId);
      if (targetColumn) {
        const orderId = active.id.toString();
        const orderToUpdate = orders.find(o => o.id === orderId);
        
        if (orderToUpdate) {
          const newStatus = targetColumn.status !== 'unassigned' ? 
            targetColumn.status : 
            getStatusFromColumnTitle(targetColumn.title);
          
          const updatedOrder = { 
            ...orderToUpdate, 
            columnId: targetColumnId !== 'unassigned' ? targetColumnId : null,
            status: newStatus
          };
          
          try {
            await updateOrder(updatedOrder);
          } catch (error) {
            console.error('Erro ao mover pedido:', error);
          }
        }
      }
    }

    setActiveId(null);
  }, [activeColumns, orders, updateOrder]);

  const handleOrderClick = useCallback((order: Order) => {
    setSelectedOrder(order);
  }, []);

  const handleQualityControlClick = useCallback((order: Order) => {
    setSelectedOrderForQC(order);
  }, []);

  const handleItemProgressClick = useCallback((item: OrderItem) => {
    setSelectedItem(item);
    setIsItemProgressModalOpen(true);
  }, []);

  const handleAddNewOrder = useCallback(async () => {
    const defaultColumn = columns[0];
    const defaultStatus = defaultColumn ? getStatusFromColumnTitle(defaultColumn.title) : 'in-progress';
    
    const newOrder: Order = {
      id: generateUniqueId(),
      orderNumber: `${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
      customer: 'Novo Cliente',
      internalOrderNumber: `OS-${Math.floor(Math.random() * 10000)}`,
      status: defaultStatus,
      columnId: defaultColumn?.id || null,
      startDate: new Date().toISOString().split('T')[0],
      deliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      progress: 0,
      items: [],
      createdAt: new Date().toISOString()
    };
    
    try {
      await addOrder(newOrder);
      setSelectedOrder(newOrder);
    } catch (error) {
      console.error('Erro ao criar novo pedido:', error);
    }
  }, [addOrder, columns]);

  const activeOrder = useMemo(() => {
    if (!activeId) return null;
    return orders.find(order => order.id === activeId) || null;
  }, [activeId, orders]);

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-4 px-4">
          <div className="relative w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar pedidos..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          </div>
          
          <div className="flex space-x-2">
            {!readOnly && (
              <>
                <button
                  onClick={() => setShowSummary(!showSummary)}
                  className={`px-3 py-2 rounded-lg flex items-center ${
                    showSummary ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'
                  } text-white`}
                >
                  <BarChart3 className="mr-2 h-5 w-5" />
                  <span>Resumo</span>
                </button>
                
                <button
                  onClick={() => setIsManagingColumns(!isManagingColumns)}
                  className={`px-3 py-2 rounded-lg flex items-center ${
                    isManagingColumns ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
                  } text-white`}
                >
                  {isManagingColumns ? (
                    <>
                      <Check className="mr-2 h-5 w-5" />
                      <span>Concluído</span>
                    </>
                  ) : (
                    <>
                      <Settings className="mr-2 h-5 w-5" />
                      <span>Gerenciar Colunas</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={handleAddNewOrder}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  <span>Novo Pedido</span>
                </button>
              </>
            )}
          </div>
        </div>
        
        <div className="flex-1 flex gap-6 pb-8 overflow-x-auto">
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className={`flex ${compactView ? 'gap-3' : 'gap-6'} flex-1`}>
              {activeColumns.map(column => (
                <div
                  key={column.id}
                  id={`droppable-${column.id}`}
                  className="flex-shrink-0 w-80 rounded-lg border border-gray-600 bg-gray-800"
                >
                  <div className="p-4 border-b border-gray-600">
                    <h3 className="font-semibold text-white">{column.title}</h3>
                    <span className="text-sm text-gray-400">({column.orders.length})</span>
                  </div>
                  
                  <div className="p-4 space-y-3 min-h-[400px] max-h-[calc(100vh-200px)] overflow-y-auto">
                    {column.orders.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        <div className="text-4xl mb-2">📋</div>
                        <p>Nenhum pedido nesta coluna</p>
                      </div>
                    ) : (
                      <SortableContext
                        items={column.orders.map(order => order.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {column.orders.map(order => (
                          <KanbanCard
                            key={order.id}
                            order={order}
                            isManaging={isManagingColumns}
                            isSelected={selectedOrder?.id === order.id}
                            highlight={false}
                            compactView={compactView}
                            onOrderClick={handleOrderClick}
                            onQualityControlClick={handleQualityControlClick}
                            onItemProgressClick={handleItemProgressClick}
                            projects={[]}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            <DragOverlay>
              {activeOrder && (
                <KanbanCard
                  order={activeOrder}
                  isManaging={false}
                  isSelected={false}
                  highlight={true}
                  compactView={compactView}
                  onOrderClick={() => {}}
                  onQualityControlClick={() => {}}
                  onItemProgressClick={() => {}}
                  projects={[]}
                />
              )}
            </DragOverlay>
          </DndContext>
          
          {/* Painel de Resumo */}
          {showSummary && (
            <OrdersSummary orders={orders} />
          )}
        </div>
      </div>
      
      {selectedOrder && (
        <OrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateOrder={(order) => {
            updateOrder(order);
            setSelectedOrder(null);
          }}
          onDeleteOrder={(orderId) => {
            deleteOrder(orderId);
            setSelectedOrder(null);
          }}
          generateReport={() => {}}
          customers={[]}
          projects={[]}
        />
      )}
      
      {selectedOrderForQC && (
        <QualityControl
          selectedOrder={selectedOrderForQC}
          onClose={() => setSelectedOrderForQC(null)}
        />
      )}
      
      {selectedItem && isItemProgressModalOpen && (
        <ItemProgressModal
          item={selectedItem}
          allItems={orders.flatMap(order => order.items || [])}
          onClose={() => {
            setSelectedItem(null);
            setIsItemProgressModalOpen(false);
          }}
          onSave={(item) => {
            setIsItemProgressModalOpen(false);
            setSelectedItem(null);
          }}
        />
      )}
    </>
  );
};

export default Kanban;
