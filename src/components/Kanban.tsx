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
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { RefreshCw, Plus, Trash, Settings, Check, Search } from 'lucide-react';

import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import OrderModal from './OrderModal';
import ItemProgressModal from './ItemProgressModal';
import QualityControl from './QualityControl';
import { Order, OrderItem, KanbanColumn as KanbanColumnType } from '../types/kanban';
import { useOrdersStore } from '../store/ordersStore';
import { useSettingsStore } from '../store/settingsStore';
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
  const { 
    orders, 
    isLoading, 
    error, 
    fetchOrders, 
    updateOrder, 
    deleteOrder,
    addNewOrder
  } = useOrdersStore();
  
  const { 
    kanbanColumns, 
    compactView, 
    setKanbanColumns
  } = useSettingsStore();
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderForQC, setSelectedOrderForQC] = useState<Order | null>(null);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManagingColumns, setIsManagingColumns] = useState(false);
  const [isItemProgressModalOpen, setIsItemProgressModalOpen] = useState(false);
  const [animationParent] = useAutoAnimate();

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
    fetchOrders();
    
    // Configurar colunas padrão se não houver configuração salva
    if (!kanbanColumns || kanbanColumns.length === 0) {
      setKanbanColumns(DEFAULT_COLUMNS);
    }
  }, [fetchOrders, kanbanColumns, setKanbanColumns]);

  const columns = useMemo(() => {
    const columnsData = kanbanColumns || DEFAULT_COLUMNS;
    
    // Filtrar pedidos com base no termo de pesquisa
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
    
    // Distribuir pedidos nas colunas
    return columnsData.map(column => {
      const columnOrders = filteredOrders.filter(order => order.status === column.status);
      return { ...column, orders: columnOrders };
    });
  }, [orders, kanbanColumns, searchTerm]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    // Identificar coluna de destino
    const targetColumnId = over.id.toString().includes('column:') 
      ? over.id.toString().replace('column:', '') 
      : null;
      
    if (targetColumnId) {
      const targetColumn = columns.find(col => col.id === targetColumnId);
      if (targetColumn) {
        // Atualizar status do pedido
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
  }, [columns, orders, updateOrder]);

  const handleOrderClick = useCallback((order: Order) => {
    setSelectedOrder(order);
  }, []);

  const handleQualityControlClick = useCallback((order: Order) => {
    // Abrir o componente de Controle de Qualidade
    setSelectedOrderForQC(order);
  }, []);

  const handleSaveItemProgress = useCallback((updatedItem: OrderItem) => {
    // Encontrar o pedido que contém o item
    const orderWithItem = orders.find(order => 
      order.items?.some(item => item.id === updatedItem.id)
    );
    
    if (orderWithItem) {
      // Atualizar o item dentro do pedido
      const updatedItems = orderWithItem.items?.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      ) || [];
      
      // Calcular o progresso geral do pedido
      const overallProgress = updatedItems.length > 0
        ? Math.round(updatedItems.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / updatedItems.length)
        : 0;
      
      // Atualizar o pedido
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
    // Implemente aqui a funcionalidade de gerar relatório com os itens selecionados
    console.log('Gerando relatório para os itens selecionados:', selectedItems);
    alert(`Relatório gerado para ${selectedItems.length} itens.`);
  }, []);

  const handleAddNewOrder = useCallback(() => {
    // Criar um novo pedido com valores padrão
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
    
    addNewOrder(newOrder);
    setSelectedOrder(newOrder);
  }, [addNewOrder]);

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
            onClick={() => fetchOrders()} 
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
        
        <div 
          className={`flex-1 flex ${compactView ? 'gap-3' : 'gap-6'} pb-8 overflow-x-auto`}
          ref={animationParent}
        >
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {columns.map(column => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                color={column.color}
                orders={column.orders}
                isManaging={isManagingColumns}
                compactView={compactView}
                limit={column.limit}
              >
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
                      projects={[]} // Passar array de projetos disponíveis
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
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
                  projects={[]} // Passar array de projetos disponíveis
                />
              )}
            </DragOverlay>
          </DndContext>
          
          {!readOnly && isManagingColumns && (
            <div className="flex-shrink-0 w-80 rounded-lg border border-dashed border-gray-600 flex flex-col items-center justify-center h-[500px] p-4">
              <Plus className="h-10 w-10 text-gray-500 mb-4" />
              <h3 className="text-gray-500 text-lg font-medium mb-2">Adicionar Coluna</h3>
              <button
                onClick={() => {/* Implementar adição de coluna */}}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Nova Coluna
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal do Pedido */}
      {selectedOrder && (
        <OrderModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateOrder={handleUpdateOrder}
          onDeleteOrder={handleDeleteOrder}
          generateReport={handleGenerateReport}
          customers={[]} // Passar array de clientes disponíveis
          projects={[]} // Passar array de projetos disponíveis
        />
      )}
      
      {/* Modal de Controle de Qualidade */}
      {selectedOrderForQC && (
        <QualityControl
          selectedOrder={selectedOrderForQC}
          onClose={() => setSelectedOrderForQC(null)}
        />
      )}
      
      {/* Modal de Progresso do Item */}
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
