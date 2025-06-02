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

// CORREÇÃO: Usar imports relativos corretos baseados no Orders.tsx
import { useOrderStore } from '../store/orderStore';
import { useColumnStore } from '../store/columnStore';
// Se settingsStore não existir, remova ou crie o arquivo
// import { useSettingsStore } from '../store/settingsStore';
import { generateUniqueId } from '../utils/helpers';

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
    title: 'Aguardando aprovação',
    status: 'waiting-docs',
    limit: 0,
    color: 'amber',
    orders: [],
  },
  {
    id: 'completed',
    title: 'Concluídos',
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
  // CORREÇÃO: Usar o mesmo padrão do Orders.tsx
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
  
  // Se useSettingsStore não existir, use estado local
  const [compactView, setCompactView] = useState(false);
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumnType[]>(DEFAULT_COLUMNS);
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderForQC, setSelectedOrderForQC] = useState<Order | null>(null);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManagingColumns, setIsManagingColumns] = useState(false);
  const [isItemProgressModalOpen, setIsItemProgressModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  });
  
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 8,
    },
  });
  
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 8,
    },
  });
  
  const keyboardSensor = useSensor(KeyboardSensor);
  
  const sensors = useSensors(
    pointerSensor,
    mouseSensor,
    touchSensor,
    keyboardSensor
  );

  useEffect(() => {
    // Subscribe to orders
    const unsubscribeOrders = subscribeToOrders();
    
    // Initialize columns if needed
    if (columns.length === 0) {
      initializeDefaultColumns().catch(console.error);
    }
    
    // Subscribe to columns
    const unsubscribeColumns = subscribeToColumns();
    
    setIsLoading(false);
    
    return () => {
      unsubscribeOrders();
      unsubscribeColumns();
    };
  }, [subscribeToOrders, subscribeToColumns, initializeDefaultColumns, columns.length]);

  // Use columns from store or default
  const activeColumns = useMemo(() => {
    const columnsData = columns.length > 0 ? columns : kanbanColumns;
    
    // Filter orders based on search term
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
    
    // Distribute orders into columns
    return columnsData.map(column => {
      const columnOrders = filteredOrders.filter(order => order.status === column.status);
      return { ...column, orders: columnOrders };
    });
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

    // Identify target column
    const targetColumnId = over.id.toString().includes('column:') 
      ? over.id.toString().replace('column:', '') 
      : null;
      
    if (targetColumnId) {
      const targetColumn = activeColumns.find(col => col.id === targetColumnId);
      if (targetColumn) {
        // Update order status
        const orderId = active.id.toString();
        const orderToUpdate = orders.find(o => o.id === orderId);
        
        if (orderToUpdate) {
          const updatedOrder = { 
            ...orderToUpdate, 
            status: targetColumn.status 
          };
          updateOrder(updatedOrder);
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

  const handleSaveItemProgress = useCallback((updatedItem: OrderItem) => {
    const orderWithItem = orders.find(order => 
      order.items?.some(item => item.id === updatedItem.id)
    );
    
    if (orderWithItem) {
      const updatedItems = orderWithItem.items?.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      ) || [];
      
      const overallProgress = updatedItems.length > 0
        ? Math.round(updatedItems.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / updatedItems.length)
        : 0;
      
      const updatedOrder = {
        ...orderWithItem,
        items: updatedItems,
        progress: overallProgress
      };
      
      updateOrder(updatedOrder);
    }
    
    setIsItemProgressModalOpen(false);
    setSelectedItem(null);
  }, [orders, updateOrder]);

  const handleUpdateOrder = useCallback((updatedOrder: Order) => {
    updateOrder(updatedOrder);
    setSelectedOrder(null);
  }, [updateOrder]);

  const handleDeleteOrder = useCallback((orderId: string) => {
    deleteOrder(orderId);
    setSelectedOrder(null);
  }, [deleteOrder]);

  const handleGenerateReport = useCallback((selectedItems: OrderItem[]) => {
    console.log('Gerando relatório para os itens selecionados:', selectedItems);
    alert(`Relatório gerado para ${selectedItems.length} itens.`);
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
    
    addOrder(newOrder);
    setSelectedOrder(newOrder);
  }, [addOrder]);

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

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          <h3 className="font-bold mb-2">Erro ao carregar pedidos</h3>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

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
                
                <div className="p-4 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
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
          onUpdateOrder={handleUpdateOrder}
          onDeleteOrder={handleDeleteOrder}
          generateReport={handleGenerateReport}
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
          onSave={handleSaveItemProgress}
        />
      )}
    </>
  );
};

export default Kanban;
