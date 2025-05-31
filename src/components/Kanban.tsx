import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Settings, ListX, Search, Filter, ChevronDown, Calendar, Users, Flag, LayoutGrid, LayoutList, Clipboard, LayoutList as StagedList, BarChart, Download } from 'lucide-react';
import { Column, Order, OrderStatus } from '../types/kanban';
import { useOrderStore } from '../store/orderStore';
import { useColumnStore } from '../store/columnStore';
import { useProjectStore } from '../store/projectStore';
import { useCustomerStore } from '../store/customerStore';
import { KanbanColumn } from './KanbanColumn';
import KanbanCard from './KanbanCard';
import ColumnModal from './ColumnModal';
import ManageOrdersModal from './ManageOrdersModal';
import OrderModal from './OrderModal';
import ManufacturingStages from './ManufacturingStages';
import OccupationRateTab from './OccupationRateTab';
import { format, isAfter, isBefore, addDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import { jsPDF } from 'jspdf';

const statusLegend = [
  { status: 'in-progress', color: 'bg-orange-100/80', borderColor: 'border-orange-400', label: 'Em Processo' },
  { status: 'delayed', color: 'bg-red-100/80', borderColor: 'border-red-400', label: 'Atrasado' },
  { status: 'waiting-docs', color: 'bg-yellow-100/80', borderColor: 'border-yellow-400', label: 'Aguardando Validação de Documentação' },
  { status: 'completed', color: 'bg-green-100/80', borderColor: 'border-green-400', label: 'Documentação Validada' },
  { status: 'ready', color: 'bg-blue-100/80', borderColor: 'border-blue-400', label: 'Aguardando Embarque' },
  { status: 'urgent', color: 'bg-purple-100/80', borderColor: 'border-purple-400', label: 'Pedido Urgente' },
];

// Helper function to sanitize objects for Firestore
// Replaces undefined values with null to prevent Firestore errors
const sanitizeForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      sanitized[key] = null;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForFirestore(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

const getMonthlyOrderStats = (orders) => {
  // Agrupa pedidos por mês de entrega (YYYY-MM)
  const stats = {};
  orders.forEach(order => {
    if (order.status === 'completed' || order.deleted) return;
    const month = format(new Date(order.deliveryDate), 'yyyy-MM');
    if (!stats[month]) {
      stats[month] = { count: 0, totalWeight: 0 };
    }
    stats[month].count += 1;
    stats[month].totalWeight += order.totalWeight || 0;
  });
  return stats;
};

const Kanban: React.FC = () => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isManageOrdersModalOpen, setIsManageOrdersModalOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<Column | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isManufacturingStagesOpen, setIsManufacturingStagesOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  
  // Estados para filtros
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterByCustomer, setFilterByCustomer] = useState<string[]>([]);
  const [filterByStatus, setFilterByStatus] = useState<string[]>([]);
  const [filterByProject, setFilterByProject] = useState<string[]>([]);
  const [filterByDeadline, setFilterByDeadline] = useState<string>('all');
  const [availableCustomers, setAvailableCustomers] = useState<string[]>([]);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);

  // Estado para visualização compacta
  const [compactView, setCompactView] = useState(false);
  
  // Estado para tabs da interface
  const [activeTab, setActiveTab] = useState<'kanban' | 'stages' | 'occupation'>('kanban');

  // NOVO ESTADO: Para controlar cards expandidos
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const { orders, subscribeToOrders, updateOrder, addOrder, deleteOrder } = useOrderStore();
  const { 
    columns, 
    updateColumn, 
    deleteColumn,
    subscribeToColumns,
    initializeDefaultColumns 
  } = useColumnStore();
  const { projects, subscribeToProjects } = useProjectStore();
  const { companyLogo } = useSettingsStore();
  const { customers, loadCustomers, subscribeToCustomers } = useCustomerStore();

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('🔍 Kanban: Iniciando inicialização...');
        
        // Tentar inicializar colunas com tratamento específico de erro
        try {
          console.log('🔍 Kanban: Chamando initializeDefaultColumns...');
          await initializeDefaultColumns();
          console.log('✅ Kanban: Colunas padrão inicializadas com sucesso');
        } catch (columnError: any) {
          console.error('❌ Kanban: Erro ao inicializar colunas:', columnError);
          console.error('❌ Código do erro:', columnError?.code);
          console.error('❌ Mensagem do erro:', columnError?.message);
          
          if (columnError?.code === 'permission-denied') {
            console.warn('⚠️ Permissão negada para colunas, continuando mesmo assim...');
          } else {
            throw columnError;
          }
        }
        
        // Subscrições em tempo real
        console.log('🔍 Kanban: Configurando subscrições...');
        const unsubscribeColumns = subscribeToColumns();
        const unsubscribeOrders = subscribeToOrders();
        const unsubscribeProjects = subscribeToProjects();
        
        console.log('✅ Kanban: Todas as subscrições configuradas com sucesso');
        
        return () => {
          console.log('🔍 Kanban: Limpando subscrições...');
          unsubscribeColumns();
          unsubscribeOrders();
          unsubscribeProjects();
        };
      } catch (error: any) {
        console.error('❌ Kanban: Erro crítico durante inicialização:', error);
        console.error('❌ Detalhes do erro:', JSON.stringify(error, null, 2));
        setError('Erro ao carregar o quadro Kanban. Por favor, recarregue a página.');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [initializeDefaultColumns, subscribeToColumns, subscribeToOrders, subscribeToProjects]);

  // Coletar clientes e projetos disponíveis para filtragem
  useEffect(() => {
    console.log('📊 Kanban: Atualizando clientes e projetos disponíveis...');
    const uniqueCustomers = [...new Set(orders.map(order => order.customer))];
    setAvailableCustomers(uniqueCustomers.sort());
    
    const projectIds = [...new Set(orders.filter(o => o.projectId).map(o => o.projectId))];
    const projectNames = projectIds.map(id => {
      const project = projects.find(p => p.id === id);
      return project ? project.name : 'Projeto não encontrado';
    });
    setAvailableProjects(projectNames.sort());
    console.log('✅ Kanban: Clientes e projetos atualizados');
  }, [orders, projects]);

  // Efeito para garantir que todos os pedidos tenham uma coluna válida
  useEffect(() => {
    const ensureOrdersHaveColumn = async () => {
      if (columns.length > 0 && orders.length > 0) {
        const defaultColumn = columns.find(col => col.title === 'Pedidos em processo') || columns[0];
        const ordersWithoutColumn = orders.filter(order => 
          !order.deleted && (
            order.columnId === null || 
            order.columnId === undefined ||
            !columns.some(col => col.id === order.columnId)
          )
        );
        
        if (ordersWithoutColumn.length > 0) {
          console.log(`Corrigindo ${ordersWithoutColumn.length} pedidos sem coluna válida`);
          try {
            for (const order of ordersWithoutColumn) {
              await updateOrder({
                ...order,
                columnId: defaultColumn.id
              });
            }
          } catch (updateError: any) {
            console.error('Error updating orders with column:', updateError);
          }
        }
      }
    };
    
    ensureOrdersHaveColumn();
  }, [columns, orders, updateOrder]);

  // Adicionar após o useEffect de ensureOrdersHaveColumn
  React.useEffect(() => {
    if (!columns.length || !orders.length) return;
    const expedidosColumn = columns.find(col => col.title.toLowerCase().includes('expedi'));
    if (!expedidosColumn) return;

    orders.forEach(order => {
      const isCompleted = order.status === 'completed' || !!order.completedDate;
      if (isCompleted && order.columnId !== expedidosColumn.id) {
        updateOrder({ ...order, columnId: expedidosColumn.id });
      }
    });
  }, [columns, orders, updateOrder]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 100,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event: DragEndEvent) => {
    const { active } = event;
    const draggedOrder = orders.find(order => order.id === active.id);
    if (draggedOrder) {
      setDraggedOrder(draggedOrder);
      setActiveId(active.id as string);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    try {
      const { active, over } = event;
      
      // Verificação básica de segurança
      if (!over || !active) {
        console.log('Drag end: No valid over or active element');
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }

      const activeOrderId = active.id as string;
      const overColumnId = over.id as string;

      console.log(`Movendo pedido ${activeOrderId} para coluna ${overColumnId}`);

      // Verificação adicional de segurança - pedido existe?
      const order = orders.find(o => o.id === activeOrderId);
      if (!order) {
        console.error(`Pedido ${activeOrderId} não encontrado`);
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }

      // Verificação adicional - mesma coluna?
      if (order.columnId === overColumnId) {
        console.log('Pedido já está nesta coluna');
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }

      // VERIFICAÇÃO CRÍTICA - a coluna de destino existe?
      // Obter uma snapshot mais recente das colunas diretamente do estado
      const availableColumns = [...columns];
      
      if (availableColumns.length === 0) {
        console.error('Erro crítico: Nenhuma coluna disponível');
        alert('Não foi possível mover o pedido: nenhuma coluna disponível.');
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }
      
      // Verificar se a coluna de destino existe
      const targetColumn = availableColumns.find(col => col.id === overColumnId);
      
      if (!targetColumn) {
        console.error(`Coluna de destino ${overColumnId} não encontrada.`);
        
        // Melhorar o logging para facilitar a depuração
        console.log('Colunas disponíveis:', availableColumns.map(c => `${c.id} - ${c.title}`));
        
        // Fallback - mover para a primeira coluna disponível (preferencialmente "Pedidos em processo")
        const fallbackColumn = availableColumns.find(col => col.title === 'Pedidos em processo') || availableColumns[0];
        
        // CORREÇÃO: verificação adicional para garantir que fallbackColumn não é undefined
        if (!fallbackColumn || typeof fallbackColumn.id !== 'string') {
          console.error('Erro crítico: Coluna fallback indefinida ou com ID inválido mesmo com colunas disponíveis');
          alert('Erro ao mover o pedido. Por favor, recarregue a página e tente novamente.');
          setDraggedOrder(null);
          setActiveId(null);
          return;
        }
        
        console.log(`Usando coluna fallback: ${fallbackColumn.id} - ${fallbackColumn.title}`);
        
        try {
          const updatedOrder = {
            ...order,
            columnId: fallbackColumn.id
          };
          
          // Sanitizar para garantir que não há valores undefined
          const sanitizedOrder = sanitizeForFirestore(updatedOrder);
          
          // Verificar novamente se columnId está definido
          if (!sanitizedOrder.columnId) {
            throw new Error('columnId é null ou undefined após sanitização');
          }
          
          await updateOrder(sanitizedOrder);
          alert(`A coluna de destino não está mais disponível. O pedido foi movido para "${fallbackColumn.title}"`);
        } catch (updateError) {
          console.error('Erro ao atualizar pedido com coluna fallback:', updateError);
          alert('Erro ao mover o pedido. As colunas podem ter sido modificadas. Por favor, recarregue a página.');
        }
        
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }

      // Check if the column is "Pedidos expedidos"
      const isExpedited = targetColumn.title.toLowerCase().includes('expedi');

      // Se chegou aqui, tudo está validado. Atualizar o pedido.
      const updatedOrder = {
        ...order,
        columnId: overColumnId,
        // If moving to "Pedidos expedidos", update status to reflect this
        status: isExpedited ? 'waiting-docs' : order.status,
        // Se movendo para pedidos expedidos, também registre a data de exportação
        lastExportDate: isExpedited ? new Date().toISOString() : order.lastExportDate
      };

      console.log('Atualizando pedido:', updatedOrder);
      await updateOrder(sanitizeForFirestore(updatedOrder));
      console.log('Pedido atualizado com sucesso');
    } catch (error) {
      console.error('Error updating order position:', error);
      alert('Erro ao mover o pedido. Por favor, tente novamente.');
    } finally {
      setDraggedOrder(null);
      setActiveId(null);
    }
  };

  const handleEditColumn = (column: Column) => {
    setSelectedColumn(column);
    setIsColumnModalOpen(true);
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta coluna?')) {
      return;
    }

    try {
      // Encontrar os pedidos nesta coluna
      const ordersInColumn = orders.filter(order => order.columnId === columnId);
      
      // Encontrar outra coluna para mover os pedidos (exceto a que será excluída)
      const alternativeColumn = columns.find(col => col.id !== columnId && col.title === 'Pedidos em processo') || 
                               columns.find(col => col.id !== columnId);
      
      if (alternativeColumn && ordersInColumn.length > 0) {
        if (!window.confirm(`Esta coluna contém ${ordersInColumn.length} pedido(s). Deseja movê-los para a coluna "${alternativeColumn.title}"?`)) {
          return;
        }
        
        // Mover todos os pedidos para a coluna alternativa
        const movePromises = ordersInColumn.map(order => 
          updateOrder(sanitizeForFirestore({ ...order, columnId: alternativeColumn.id }))
        );
        await Promise.all(movePromises);
      }
      
      await deleteColumn(columnId);
    } catch (error) {
      console.error('Error deleting column:', error);
      alert('Erro ao excluir coluna. Por favor, tente novamente.');
    }
  };

  // Adding the missing handleSaveColumn function
  const handleSaveColumn = async (column: Column) => {
    try {
      await updateColumn(sanitizeForFirestore(column));
      setIsColumnModalOpen(false);
      setSelectedColumn(null);
    } catch (error) {
      console.error('Error saving column:', error);
      alert('Erro ao salvar coluna. Por favor, tente novamente.');
    }
  };

  const handleDeleteSelectedOrders = async (orderIds: string[]) => {
    if (!window.confirm(`Tem certeza que deseja excluir ${orderIds.length} pedido(s)?`)) {
      return;
    }

    if (columns.length === 0) {
      alert('Não há colunas disponíveis para mover os pedidos.');
      return;
    }

    try {
      // Remover os pedidos selecionados
      const updatePromises = orderIds.map(orderId => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          // Marcar como excluído em vez de remover da coluna
          return updateOrder(sanitizeForFirestore({ 
            ...order, 
            deleted: true,
            columnId: null // Definir como null para indicar que não está em nenhuma coluna
          }));
        }
        return Promise.resolve();
      });
      await Promise.all(updatePromises);
      setIsManageOrdersModalOpen(false);
    } catch (error) {
      console.error('Error removing orders:', error);
      alert('Erro ao remover pedidos. Por favor, tente novamente.');
    }
  };

  // FUNÇÃO MODIFICADA: Agora controla a expansão dos cards
  const handleOrderClick = (order: Order) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(order.id)) {
        newSet.delete(order.id);
      } else {
        newSet.add(order.id);
      }
      return newSet;
    });
  };

  // NOVA FUNÇÃO: Para abrir o modal de edição do pedido
  const handleOrderEdit = (order: Order, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Evita que o card expanda quando clicar em editar
    }
    setSelectedOrder(order);
    setIsOrderModalOpen(true);
  };

  const handleViewHistory = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    // Implementation for viewing order history
  };

  const handleDeleteOrder = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir este pedido?')) {
      try {
        await deleteOrder(order.id);
      } catch (error) {
        console.error('Error deleting order:', error);
        alert('Erro ao excluir pedido. Por favor, tente novamente.');
      }
    }
  };

  const handleStatusChange = async (order: Order, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateOrder({
        ...order,
        status: newStatus as any,
        statusChangedAt: new Date().toISOString(),
        statusHistory: [
          ...((order.statusHistory || []) as any[]),
          {
            status: order.status,
            date: new Date().toISOString(),
            user: 'usuario@atual.com' // Idealmente, usar o usuário logado
          }
        ]
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Erro ao atualizar status. Por favor, tente novamente.');
    }
  };

  const handleSaveOrder = async (order: Order) => {
    try {
      // Make sure we have columns available
      if (columns.length === 0) {
        console.log("No columns available, initializing default columns...");
        try {
          await initializeDefaultColumns();
          
          // Get fresh columns from the store after initialization
          const freshColumns = useColumnStore.getState().columns;
          
          // If still no columns after initialization, show error
          if (freshColumns.length === 0) {
            throw new Error('No columns available');
          }
          
          // Use the first column as default
          order.columnId = freshColumns[0].id;
        } catch (initError) {
          console.error('Error initializing columns:', initError);
          throw new Error('Unable to initialize columns');
        }
      } else if (!order.columnId || !columns.some(c => c.id === order.columnId)) {
        // If order doesn't have a valid columnId, assign the first available column
        order.columnId = columns[0].id;
      }
      
      // Sanitize the order object to replace undefined values with null
      // This prevents Firestore from rejecting documents with undefined values
      const sanitizedOrder = sanitizeForFirestore({
        ...order,
        columnId: order.columnId
      });
      
      console.log('Saving order with columnId:', sanitizedOrder.columnId);
      
      // Check if this is a new order or an existing order
      const isNewOrder = order.id === 'new' || !orders.some(o => o.id === order.id);
      
      if (isNewOrder) {
        // Use addOrder for new orders
        await addOrder(sanitizedOrder);
      } else {
        // Use updateOrder for existing orders
        await updateOrder(sanitizedOrder);
      }
      
      setIsOrderModalOpen(false);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error saving order:', error);
      alert('Erro ao salvar pedido. Por favor, tente novamente.');
    }
  };

  // Função para filtrar por status, data e termo de busca
  const getFilteredOrders = () => {
    return orders.filter(order => {
      // Filtrar pedidos excluídos
      if (order.deleted) return false;
      
      // Filtro por status
      if (filterByStatus.length > 0 && !filterByStatus.includes(order.status)) {
        return false;
      }

      // Filtro por data
      const today = new Date();
      const deliveryDate = new Date(order.deliveryDate);
      
      if (filterByDeadline === 'late') {
        // Check if the order is late (past delivery date and not completed)
        if (order.status === 'completed' || order.completedDate) return false;
        return isBefore(deliveryDate, today);
      } else if (filterByDeadline === 'today') {
        return isToday(deliveryDate);
      } else if (filterByDeadline === 'week') {
        const nextWeek = addDays(today, 7);
        if (isBefore(deliveryDate, today) || !isBefore(deliveryDate, nextWeek)) {
          return false;
        }
      }

      // Filtro por projeto
      if (filterByProject.length > 0 && !filterByProject.some(projectName => {
        const project = projects.find(p => p.name === projectName);
        return project && project.id === order.projectId;
      })) {
        return false;
      }

      // Filtro por cliente
      if (filterByCustomer.length > 0 && !filterByCustomer.includes(order.customer)) {
        return false;
      }

      // Filtro por termo de busca
      const searchLower = searchTerm.toLowerCase().trim();
      if (searchLower) {
        return (
          order.orderNumber.toLowerCase().includes(searchLower) ||
          order.customer.toLowerCase().includes(searchLower) ||
          order.internalOrderNumber.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  };

  const filteredOrders = getFilteredOrders();
  
  // Montar columnsWithOrders respeitando o status do pedido
  const columnsWithOrders = columns.map(column => {
    let ordersForColumn = [];
    if (column.title === 'Pedidos em processo') {
      ordersForColumn = filteredOrders.filter(order => order.status === 'in-progress' && !order.deleted);
    } else if (column.title === 'Pedidos expedidos') {
      ordersForColumn = filteredOrders.filter(order => (order.status === 'waiting-docs' || order.status === 'completed') && !order.deleted);
    } else {
      // Outras colunas recebem pedidos pelo columnId
      ordersForColumn = filteredOrders.filter(order => order.columnId === column.id && !order.deleted);
    }
    return {
      ...column,
      orders: ordersForColumn
    };
  });

  const ordersWithoutColumn = filteredOrders.filter(
    order => order.columnId === null || order.columnId === undefined || !columns.some(col => col.id === order.columnId)
  );

  // Contagem total de pedidos visíveis
  const totalDisplayedOrders = columnsWithOrders.reduce(
    (total, column) => total + column.orders.length, 0
  ) + ordersWithoutColumn.length;

  // Contagem de pedidos filtrados vs. total (para mostrar efetividade dos filtros)
  const activeFilters = (filterByCustomer.length > 0 ? 1 : 0) + 
                        (filterByStatus.length > 0 ? 1 : 0) +
                        (filterByProject.length > 0 ? 1 : 0) + 
                        (filterByDeadline !== 'all' ? 1 : 0) +
                        (searchTerm ? 1 : 0);

  const resetAllFilters = () => {
    setSearchTerm('');
    setFilterByCustomer([]);
    setFilterByStatus([]);
    setFilterByProject([]);
    setFilterByDeadline('all');
  };

  // Marca se existem filtros ativos
  const hasActiveFilters = activeFilters > 0;

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      }
      return [...prev, orderId];
    });
  };

  // LOG DE DEBUG para IDs de colunas e pedidos
  console.log('columns:', columns.map(c => ({ id: c.id, title: c.title })));
  console.log('orders:', filteredOrders.map(o => ({ id: o.id, columnId: o.columnId, deleted: o.deleted })));

  useEffect(() => {
    loadCustomers();
    const unsubscribe = subscribeToCustomers();
    return () => unsubscribe();
  }, [loadCustomers, subscribeToCustomers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-lg font-medium text-white">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-lg font-medium text-red-400">{error}</div>
      </div>
    );
  }

  console.log('🎯 Kanban: Renderizando componente...', {
    columns: columns.length,
    orders: orders.length,
    projects: projects.length,
    activeTab,
    isLoading,
    error
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-row w-full h-full">
      {/* Kanban principal */
