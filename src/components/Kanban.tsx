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
import { RefreshCw, Plus, Settings, Check, Search, BarChart3, Calendar, Package, Edit } from 'lucide-react';

import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import OrderModal from './OrderModal';
import ItemProgressModal from './ItemProgressModal';
import QualityControl from './QualityControl';
import { Order, OrderItem } from '../types/kanban';
import { useOrderStore } from '../store/orderStore';
import { useColumnStore } from '../store/columnStore';

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
  projects
}) => {
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditClick(order);
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
      />
      
      {/* Botão de Edição - aparece no hover */}
      <button
        onClick={handleEditClick}
        className="absolute top-2 right-2 p-1 bg-blue-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-blue-700 z-10"
        title="Editar pedido"
      >
        <Edit className="h-3 w-3" />
      </button>
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
        <h4 className="text-sm font-medium text-gray-300 flex items-center">
          <Calendar className="h-4 w-4 mr-1" />
          Peso por Mês (Entrega)
        </h4>
        
        {[summaryData.currentMonth, summaryData.nextMonth, summaryData.followingMonth].map((month, index) => (
          <div key={month.name} className="p-3 bg-gradient-to-r from-gray-700 to-gray-600 rounded-lg shadow-inner">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-white">{month.name}</span>
            </div>
            <div className="flex items-center">
              <Package className="h-4 w-4 text-gray-400 mr-2" />
              <span className="text-lg font-bold text-white">{month.weight.toFixed(1)} kg</span>
            </div>
            <div className="mt-2 w-full bg-gray-600 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  index === 0 ? 'bg-gradient-to-r from-blue-500 to-blue-400' : 
                  index === 1 ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gradient-to-r from-yellow-500 to-yellow-400'
                }`}
                style={{ 
                  width: `${summaryData.totals.totalWeight > 0 ? 
                    Math.max((month.weight / summaryData.totals.totalWeight) * 100, 2) : 0}%` 
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

OrdersSummary.displayName = 'OrdersSummary';

const Kanban: React.FC<KanbanProps> = ({ readOnly = false }) => {
  const [mounted, setMounted] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderForQC, setSelectedOrderForQC] = useState<Order | null>(null);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManagingColumns, setIsManagingColumns] = useState(false);
  const [isItemProgressModalOpen, setIsItemProgressModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Stores
  const orderStore = useOrderStore();
  const columnStore = useColumnStore();

  const { orders, updateOrder, deleteOrder, addOrder, subscribeToOrders } = orderStore;
  const { columns, initializeDefaultColumns, subscribeToColumns } = columnStore;

  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { distance: 8 } 
    }),
    useSensor(MouseSensor, { 
      activationConstraint: { distance: 8 } 
    }),
    useSensor(TouchSensor, { 
      activationConstraint: { delay: 200, tolerance: 8 } 
    }),
    useSensor(KeyboardSensor)
  );

  // Initialize component
  useEffect(() => {
    let unsubscribeOrders: (() => void) | null = null;
    let unsubscribeColumns: (() => void) | null = null;

    const initializeStores = async () => {
      try {
        setIsLoading(true);
        
        // Subscribe to data
        unsubscribeOrders = subscribeToOrders();
        unsubscribeColumns = subscribeToColumns();
        
        // Initialize columns if needed
        if (columns.length === 0) {
          await initializeDefaultColumns();
        }
        
        setMounted(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing stores:', error);
        setIsLoading(false);
      }
    };

    initializeStores();

    return () => {
      if (unsubscribeOrders) unsubscribeOrders();
      if (unsubscribeColumns) unsubscribeColumns();
    };
  }, []);

  const activeColumns = useMemo(() => {
    if (!mounted || columns.length === 0) return [];
    
    // Filtrar pedidos com base no termo de busca
    let filteredOrders = orders || [];
    if (searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredOrders = filteredOrders.filter(order =>
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
      
      // Combinar resultados
      const combinedIds = new Set([
        ...ordersByColumnId.map(o => o.id),
        ...ordersByStatus.map(o => o.id)
      ]);
      
      columnOrders = filteredOrders.filter(order => combinedIds.has(order.id));
      
      // Ordenar por data de entrega (mais próxima primeiro)
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
  }, [mounted, orders, columns, searchTerm]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveId(null);
    
    if (!over || !active) return;

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
  }, [activeColumns, orders, updateOrder]);

  const handleOrderClick = useCallback((order: Order) => {
    setSelectedOrder(order);
  }, []);

  const handleEditClick = useCallback((order: Order) => {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
        <div className="flex flex-col items-center">
          <RefreshCw className="animate-spin w-10 h-10 text-blue-300 mb-4" />
          <p className="text-blue-200">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  if (!mounted) {
    return null;
  }

  return (
    <div className="h-full min-h-screen relative">
      {/* Background com degradê */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900"></div>
      
      {/* Imagem de fundo da Terra com transparência */}
      <div 
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'url("https://wallpapers.com/images/hd/space-1920-x-1080-picture-3vdyz7zdnmqk3uzw.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      ></div>
      
      {/* Overlay adicional para melhor contraste */}
      <div className="absolute inset-0 bg-blue-900/30"></div>
      
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-center mb-4 px-4 pt-4">
          <div className="relative w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar pedidos..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-white/60" />
          </div>
          
          <div className="flex space-x-2">
            {!readOnly && (
              <>
                <button
                  onClick={() => setShowSummary(!showSummary)}
                  className={`px-3 py-2 rounded-lg flex items-center backdrop-blur-sm border border-white/20 ${
                    showSummary ? 'bg-blue-600/80 hover:bg-blue-700/80' : 'bg-white/10 hover:bg-white/20'
                  } text-white transition-all duration-200`}
                >
                  <BarChart3 className="mr-2 h-5 w-5" />
                  <span>Resumo</span>
                </button>
                
                <button
                  onClick={() => setIsManagingColumns(!isManagingColumns)}
                  className={`px-3 py-2 rounded-lg flex items-center backdrop-blur-sm border border-white/20 ${
                    isManagingColumns ? 'bg-green-600/80 hover:bg-green-700/80' : 'bg-white/10 hover:bg-white/20'
                  } text-white transition-all duration-200`}
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
                  className="px-3 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-700/80 text-white flex items-center backdrop-blur-sm border border-white/20 transition-all duration-200"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  <span>Novo Pedido</span>
                </button>
              </>
            )}
          </div>
        </div>
        
        <div className="flex-1 flex gap-6 pb-8 overflow-hidden px-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className={`flex ${compactView ? 'gap-3' : 'gap-6'} flex-1 overflow-x-auto`}>
              {activeColumns.map(column => (
                <div
                  key={column.id}
                  id={`droppable-${column.id}`}
                  className="flex-shrink-0 w-80 rounded-lg border border-white/20 bg-white/5 backdrop-blur-sm shadow-xl"
                >
                  <div className="p-4 border-b border-white/20 bg-gradient-to-r from-white/10 to-transparent">
                    <h3 className="font-semibold text-white">{column.title}</h3>
                    <span className="text-sm text-white/60">({column.orders.length})</span>
                  </div>
                  
                  <div className="p-4 space-y-3 h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar">
                    {column.orders.length === 0 ? (
                      <div className="text-center text-white/50 py-8">
                        <div className="text-4xl mb-2">📋</div>
                        <p>Nenhum pedido nesta coluna</p>
                      </div>
                    ) : (
                      <SortableContext
                        items={column.orders.map(order => order.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {column.orders.map(order => (
                          <EnhancedKanbanCard
                            key={order.id}
                            order={order}
                            isManaging={isManagingColumns}
                            isSelected={selectedOrder?.id === order.id}
                            highlight={false}
                            compactView={compactView}
                            onOrderClick={handleOrderClick}
                            onQualityControlClick={handleQualityControlClick}
                            onItemProgressClick={handleItemProgressClick}
                            onEditClick={handleEditClick}
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
          {showSummary && <OrdersSummary orders={orders} />}
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
      
      <style jsx>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) rgba(255, 255, 255, 0.1);
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
};

export default Kanban;
