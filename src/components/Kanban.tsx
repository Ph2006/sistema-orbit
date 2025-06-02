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
import { Order, OrderItem, KanbanColumn as KanbanColumnType } from '../types/kanban';
import { useOrderStore } from '../store/orderStore';
import { useColumnStore } from '../store/columnStore';

// Função local para gerar ID único
const generateUniqueId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2);
  return `${timestamp}-${randomPart}`;
};

const DEFAULT_COLUMNS: KanbanColumnType[] = [
  {
    id: 'in-process',
    title: 'Pedidos em processo',
    status: 'in-progress',
    limit: 0,
    color: 'blue',
    orders: [],
  },
  {
    id: 'pending-approval',
    title: 'Pedidos expedidos',
    status: 'waiting-docs',
    limit: 0,
    color: 'amber',
    orders: [],
  },
  {
    id: 'completed',
    title: 'Pedidos paralisados',
    status: 'completed',
    limit: 0,
    color: 'emerald',
    orders: [],
  },
];

interface KanbanProps {
  readOnly?: boolean;
}

const Kanban: React.FC<KanbanProps> = ({ readOnly = false }) => {
  // Debug: Vamos verificar se os stores existem
  console.log('🔍 Kanban: Iniciando componente...');
  
  let orderStore, columnStore;
  try {
    orderStore = useOrderStore();
    console.log('✅ OrderStore carregado:', orderStore);
  } catch (error) {
    console.error('❌ Erro ao carregar OrderStore:', error);
  }

  try {
    columnStore = useColumnStore();
    console.log('✅ ColumnStore carregado:', columnStore);
  } catch (error) {
    console.error('❌ Erro ao carregar ColumnStore:', error);
  }

  // Se os stores não existem, usar dados mockados
  const [mockOrders] = useState<Order[]>([
    {
      id: '1',
      orderNumber: '2024-001',
      customer: 'Cliente Teste',
      internalOrderNumber: 'OS-001',
      status: 'in-progress',
      startDate: '2024-01-01',
      deliveryDate: '2024-02-01',
      progress: 50,
      items: [],
      createdAt: new Date().toISOString()
    },
    {
      id: '2',
      orderNumber: '2024-002',
      customer: 'Cliente Teste 2',
      internalOrderNumber: 'OS-002',
      status: 'waiting-docs',
      startDate: '2024-01-02',
      deliveryDate: '2024-02-02',
      progress: 25,
      items: [],
      createdAt: new Date().toISOString()
    }
  ]);

  // Usar dados dos stores ou mock
  const orders = orderStore?.orders || mockOrders || [];
  const columns = columnStore?.columns || [];
  
  console.log('📊 Dados carregados:', {
    orders: orders.length,
    columns: columns.length,
    orderStore: !!orderStore,
    columnStore: !!columnStore
  });
  
  const [compactView, setCompactView] = useState(false);
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnType[]>(DEFAULT_COLUMNS);
  
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
    console.log('🔄 useEffect: Configurando subscriptions...');
    
    // Se os stores existem, subscribir
    if (orderStore?.subscribeToOrders) {
      console.log('📡 Subscribing to orders...');
      const unsubscribeOrders = orderStore.subscribeToOrders();
      
      if (columnStore?.subscribeToColumns) {
        console.log('📡 Subscribing to columns...');
        const unsubscribeColumns = columnStore.subscribeToColumns();
        
        // Initialize columns if needed
        if (columns.length === 0 && columnStore.initializeDefaultColumns) {
          console.log('🏗️ Initializing default columns...');
          columnStore.initializeDefaultColumns().catch(console.error);
        }
        
        return () => {
          unsubscribeOrders();
          unsubscribeColumns();
        };
      }
      
      return () => unsubscribeOrders();
    }
  }, []);

  const activeColumns = useMemo(() => {
    console.log('🔄 Recalculando colunas ativas...');
    const columnsData = columns.length > 0 ? columns : kanbanColumns;
    console.log('📋 Colunas sendo usadas:', columnsData);
    
    let filteredOrders = orders;
    if (searchTerm.trim() !== '') {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filteredOrders = orders.filter(order =>
        order.orderNumber?.toString().toLowerCase().includes(lowerSearchTerm) ||
        order.customer?.toLowerCase().includes(lowerSearchTerm) ||
        order.internalOrderNumber?.toLowerCase().includes(lowerSearchTerm) ||
        order.notes?.toLowerCase().includes(lowerSearchTerm) ||
        order.items?.some(item => 
          item.code?.toLowerCase().includes(lowerSearchTerm) || 
          item.description?.toLowerCase().includes(lowerSearchTerm)
        )
      );
    }
    
    console.log('🔍 Pedidos filtrados:', filteredOrders.length);
    
    const result = columnsData.map(column => {
      const columnOrders = filteredOrders.filter(order => order.status === column.status);
      console.log(`📂 Coluna ${column.title}: ${columnOrders.length} pedidos`);
      return { ...column, orders: columnOrders };
    });
    
    console.log('📊 Resultado final das colunas:', result);
    return result;
  }, [orders, columns, kanbanColumns, searchTerm]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const targetColumnId = over.id.toString().includes('column:') 
      ? over.id.toString().replace('column:', '') 
      : null;
      
    if (targetColumnId && orderStore?.updateOrder) {
      const targetColumn = activeColumns.find(col => col.id === targetColumnId);
      if (targetColumn) {
        const orderId = active.id.toString();
        const orderToUpdate = orders.find(o => o.id === orderId);
        
        if (orderToUpdate) {
          const updatedOrder = { 
            ...orderToUpdate, 
            status: targetColumn.status 
          };
          orderStore.updateOrder(updatedOrder);
        }
      }
    }

    setActiveId(null);
  }, [activeColumns, orders, orderStore]);

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

  const handleAddNewOrder = useCallback(() => {
    const newOrder: Order = {
      id: generateUniqueId(),
      orderNumber: `${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
      customer: 'Novo Cliente',
      internalOrderNumber: `OS-${Math.floor(Math.random() * 10000)}`,
      status: 'in-progress',
      startDate: new Date().toISOString().split('T')[0],
      deliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      progress: 0,
      items: [],
      createdAt: new Date().toISOString()
    };
    
    if (orderStore?.addOrder) {
      orderStore.addOrder(newOrder);
    }
    setSelectedOrder(newOrder);
  }, [orderStore]);

  // Debug: Mostrar informações no console sempre que dados mudarem
  useEffect(() => {
    console.log('📊 Dados atualizados:', {
      totalOrders: orders.length,
      totalColumns: activeColumns.length,
      ordersPerColumn: activeColumns.map(col => ({
        title: col.title,
        count: col.orders.length,
        orders: col.orders.map(o => ({ id: o.id, orderNumber: o.orderNumber, status: o.status }))
      }))
    });
  }, [orders, activeColumns]);

  const activeOrder = useMemo(() => {
    if (!activeId) return null;
    return orders.find(order => order.id === activeId) || null;
  }, [activeId, orders]);

  // Se não há dados, mostrar indicador
  if (orders.length === 0 && !isLoading) {
    console.log('⚠️ Nenhum pedido encontrado, mostrando estado vazio');
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Debug info - remover em produção */}
        <div className="bg-yellow-100 p-2 text-xs text-yellow-800 border-b">
          <strong>Debug:</strong> Orders: {orders.length} | Columns: {activeColumns.length} | 
          Store Orders: {orderStore ? 'OK' : 'FAIL'} | Store Columns: {columnStore ? 'OK' : 'FAIL'}
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
                className="flex-shrink-0 w-80 rounded-lg border border-gray-600 bg-gray-800"
              >
                <div className="p-4 border-b border-gray-600">
                  <h3 className="font-semibold text-white">{column.title}</h3>
                  <span className="text-sm text-gray-400">({column.orders.length})</span>
                </div>
                
                <div className="p-4 space-y-3 min-h-[400px]">
                  {column.orders.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <div className="text-4xl mb-2">📋</div>
                      <p>Nenhum pedido nesta coluna</p>
                      {column.status === 'in-progress' && orders.length === 0 && (
                        <button 
                          onClick={handleAddNewOrder}
                          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Adicionar Primeiro Pedido
                        </button>
                      )}
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
            if (orderStore?.updateOrder) {
              orderStore.updateOrder(order);
            }
            setSelectedOrder(null);
          }}
          onDeleteOrder={(orderId) => {
            if (orderStore?.deleteOrder) {
              orderStore.deleteOrder(orderId);
            }
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
            // Handle save
            setIsItemProgressModalOpen(false);
            setSelectedItem(null);
          }}
        />
      )}
    </>
  );
};

export default Kanban;
