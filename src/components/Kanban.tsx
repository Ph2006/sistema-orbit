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
import { RefreshCw, Plus, Trash, Settings, Check, Search } from 'lucide-react';

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
  
  // Fallback: criar status baseado no título
  return titleLower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

// Mapeamento inverso: dado um status, encontrar a coluna apropriada
const getColumnForStatus = (status: string, columns: any[]): any => {
  // Mapeamento direto de status para títulos de coluna
  const statusToTitleMap: Record<string, string[]> = {
    'in-progress': ['processo', 'produção', 'andamento'],
    'shipped': ['expedido', 'enviado', 'embarcado'],
    'on-hold': ['paralisado', 'pausado', 'suspenso'],
    'completed': ['concluído', 'finalizado', 'terminado'],
    'delayed': ['atrasado', 'atraso'],
    'urgent': ['urgente', 'prioridade'],
    'waiting-docs': ['aguardando', 'documentação', 'docs'],
    'ready': ['pronto', 'preparado']
  };
  
  const keywords = statusToTitleMap[status] || [status];
  
  return columns.find(col => {
    const titleLower = col.title.toLowerCase();
    return keywords.some(keyword => titleLower.includes(keyword));
  });
};

interface KanbanProps {
  readOnly?: boolean;
}

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
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderForQC, setSelectedOrderForQC] = useState<Order | null>(null);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManagingColumns, setIsManagingColumns] = useState(false);
  const [isItemProgressModalOpen, setIsItemProgressModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    console.log('🚀 Kanban: Iniciando subscriptions...');
    
    const unsubscribeOrders = subscribeToOrders();
    const unsubscribeColumns = subscribeToColumns();
    
    // Initialize columns if needed
    if (columns.length === 0) {
      console.log('🔧 Inicializando colunas padrão...');
      initializeDefaultColumns().catch(console.error);
    }
    
    return () => {
      unsubscribeOrders();
      unsubscribeColumns();
    };
  }, [subscribeToOrders, subscribeToColumns, initializeDefaultColumns, columns.length]);

  // Debug e análise dos dados
  const dataAnalysis = useMemo(() => {
    const statusCount: Record<string, number> = {};
    const columnIdCount: Record<string, number> = {};
    
    orders.forEach(order => {
      const status = order.status || 'no-status';
      const columnId = order.columnId || 'no-column';
      
      statusCount[status] = (statusCount[status] || 0) + 1;
      columnIdCount[columnId] = (columnIdCount[columnId] || 0) + 1;
    });
    
    console.log('📊 Análise dos Pedidos:', {
      totalOrders: orders.length,
      statusCount,
      columnIdCount,
      columns: columns.map(col => ({ id: col.id, title: col.title }))
    });
    
    return { statusCount, columnIdCount };
  }, [orders, columns]);

  const activeColumns = useMemo(() => {
    if (columns.length === 0) {
      console.log('⚠️ Nenhuma coluna disponível ainda');
      return [];
    }
    
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
    
    // Distribuir pedidos nas colunas usando múltiplas estratégias
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
      
      console.log(`📂 Coluna "${column.title}":`, {
        id: column.id,
        expectedStatus: columnStatus,
        byColumnId: ordersByColumnId.length,
        byStatus: ordersByStatus.length,
        byKeywords: ordersByKeywords.length,
        total: columnOrders.length,
        orders: columnOrders.map(o => ({ 
          orderNumber: o.orderNumber, 
          status: o.status, 
          columnId: o.columnId 
        }))
      });
      
      return { 
        ...column, 
        orders: columnOrders,
        status: columnStatus // Adicionar status para uso no drag & drop
      };
    });
    
    // Se ainda há pedidos sem coluna, adicionar uma coluna "Sem Classificação"
    const assignedOrderIds = new Set(result.flatMap(col => col.orders.map(o => o.id)));
    const unassignedOrders = filteredOrders.filter(order => !assignedOrderIds.has(order.id));
    
    if (unassignedOrders.length > 0) {
      console.log(`🔍 Encontrados ${unassignedOrders.length} pedidos sem classificação:`, 
        unassignedOrders.map(o => ({ 
          orderNumber: o.orderNumber, 
          status: o.status, 
          columnId: o.columnId 
        }))
      );
      
      result.push({
        id: 'unassigned',
        title: 'Sem Classificação',
        order: 999,
        status: 'unassigned',
        orders: unassignedOrders
      });
    }
    
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

    // Extrair ID da coluna de destino
    const targetColumnId = over.id.toString().replace('droppable-', '');
    
    if (targetColumnId) {
      const targetColumn = activeColumns.find(col => col.id === targetColumnId);
      if (targetColumn) {
        const orderId = active.id.toString();
        const orderToUpdate = orders.find(o => o.id === orderId);
        
        if (orderToUpdate) {
          console.log(`🔄 Movendo pedido ${orderToUpdate.orderNumber} para coluna ${targetColumn.title}`);
          
          // Determinar novo status baseado na coluna
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
            console.log(`✅ Pedido movido com sucesso`);
          } catch (error) {
            console.error('❌ Erro ao mover pedido:', error);
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
    // Usar a primeira coluna como padrão
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
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center">
          <RefreshCw className="animate-spin w-10 h-10 text-blue-500 mb-4" />
          <p className="text-gray-600">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Debug info mais detalhado */}
        <div className="bg-green-100 p-2 text-xs text-green-800 border-b">
          <strong>Dados:</strong> {orders.length} pedidos | {columns.length} colunas | 
          Status: {Object.keys(dataAnalysis.statusCount).join(', ')} |
          Distribuição: {activeColumns.map(col => `${col.title}(${col.orders.length})`).join(', ')}
        </div>
        
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
        
        <div className={`flex-1 flex ${compactView ? 'gap-3' : 'gap-6'} pb-8 overflow-x-auto`}>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {activeColumns.map(column => (
              <div
                key={column.id}
                id={`droppable-${column.id}`}
                className="flex-shrink-0 w-80 rounded-lg border border-gray-600 bg-gray-800"
              >
                <div className="p-4 border-b border-gray-600">
                  <h3 className="font-semibold text-white">{column.title}</h3>
                  <span className="text-sm text-gray-400">({column.orders.length})</span>
                  <div className="text-xs text-gray-500 mt-1">
                    Status: {column.status} | ID: {column.id}
                  </div>
                </div>
                
                <div className="p-4 space-y-3 min-h-[400px] max-h-[calc(100vh-200px)] overflow-y-auto">
                  {column.orders.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <div className="text-4xl mb-2">📋</div>
                      <p>Nenhum pedido nesta coluna</p>
                      <div className="text-xs mt-2 text-gray-600">
                        <p>Esta coluna aceita:</p>
                        <p>• Status: {column.status}</p>
                        <p>• ColumnId: {column.id}</p>
                      </div>
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
