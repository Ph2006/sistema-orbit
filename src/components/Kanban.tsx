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
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import ColumnModal from './ColumnModal';
import ManageOrdersModal from './ManageOrdersModal';
import OrderModal from './OrderModal';
import ManufacturingStages from './ManufacturingStages';
import OccupationRateTab from './OccupationRateTab';
import { format, isAfter, isBefore, addDays } from 'date-fns';
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

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Inicializar colunas padrão apenas se não existirem
        await initializeDefaultColumns();
        
        // Subscrições em tempo real para colunas e pedidos
        const unsubscribeColumns = subscribeToColumns();
        const unsubscribeOrders = subscribeToOrders();
        const unsubscribeProjects = subscribeToProjects();
        
        return () => {
          unsubscribeColumns();
          unsubscribeOrders();
          unsubscribeProjects();
        };
      } catch (error) {
        console.error('Error initializing Kanban:', error);
        setError('Erro ao carregar o quadro Kanban. Por favor, recarregue a página.');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [initializeDefaultColumns, subscribeToColumns, subscribeToOrders, subscribeToProjects]);

  // Coletar clientes e projetos disponíveis para filtragem
  useEffect(() => {
    const uniqueCustomers = [...new Set(orders.map(order => order.customer))];
    setAvailableCustomers(uniqueCustomers.sort());
    
    const projectIds = [...new Set(orders.filter(o => o.projectId).map(o => o.projectId))];
    const projectNames = projectIds.map(id => {
      const project = projects.find(p => p.id === id);
      return project ? project.name : 'Projeto não encontrado';
    });
    setAvailableProjects(projectNames.sort());
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
          for (const order of ordersWithoutColumn) {
            await updateOrder({
              ...order,
              columnId: defaultColumn.id
            });
          }
        }
      }
    };
    
    ensureOrdersHaveColumn();
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

  const handleOrderClick = (order: Order) => {
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
        await initializeDefaultColumns();
        
        // Get fresh columns from the store after initialization
        const freshColumns = useColumnStore.getState().columns;
        
        // If still no columns after initialization, show error
        if (freshColumns.length === 0) {
          throw new Error('No columns available');
        }
        
        // Use the first column as default
        order.columnId = freshColumns[0].id;
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
  
  const columnsWithOrders = columns.map(column => ({
    ...column,
    orders: filteredOrders.filter(order => order.columnId === column.id)
  }));

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

  const handleExportGanttPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });

    // Add logo if available
    let y = 20;
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      y = 40;
    }

    // Title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Cronograma de Produção', 210, y, { align: 'center' });
    y += 15;

    // Date range header
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 30); // 30 days before
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 60); // 60 days ahead

    // Create date header
    const dateHeader = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dateHeader.push(format(currentDate, 'dd/MM'));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate column width for dates
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const dateColumnWidth = (pageWidth - 2 * margin) / dateHeader.length;

    // Draw date header
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    let x = margin;
    dateHeader.forEach((date, index) => {
      doc.text(date, x + dateColumnWidth/2, y, { align: 'center' });
      x += dateColumnWidth;
    });
    y += 5;

    // Draw vertical lines for dates
    x = margin;
    for (let i = 0; i <= dateHeader.length; i++) {
      doc.line(x, y, x, y + 200);
      x += dateColumnWidth;
    }

    // Group orders by customer
    const ordersByCustomer = orders.reduce((acc, order) => {
      if (!acc[order.customer]) {
        acc[order.customer] = [];
      }
      acc[order.customer].push(order);
      return acc;
    }, {} as Record<string, Order[]>);

    // Draw Gantt bars
    let rowY = y;
    Object.entries(ordersByCustomer).forEach(([customer, customerOrders]) => {
      // Customer header
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(customer, margin - 5, rowY + 5);
      rowY += 10;

      // Orders for this customer
      customerOrders.forEach(order => {
        // Order info
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        const orderInfo = `#${order.orderNumber} - ${order.projectName || 'Sem projeto'}`;
        doc.text(orderInfo, margin - 5, rowY + 5);

        // Draw Gantt bars for each stage
        Object.entries(order.stagePlanning).forEach(([stage, planning]) => {
          if (planning.startDate && planning.endDate) {
            const startX = margin + (new Date(planning.startDate).getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) * dateColumnWidth;
            const endX = margin + (new Date(planning.endDate).getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) * dateColumnWidth;
            const width = endX - startX;

            // Draw bar
            doc.setFillColor(59, 130, 246); // Blue color
            doc.rect(startX, rowY, width, 8, 'F');

            // Add stage name
            doc.setTextColor(255, 255, 255);
            doc.text(stage, startX + 2, rowY + 5);
            doc.setTextColor(0, 0, 0);
          }
        });

        rowY += 15;
      });

      rowY += 10; // Space between customers
    });

    // Add legend
    const legendY = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.text('Legenda:', margin, legendY);
    doc.setFillColor(59, 130, 246);
    doc.rect(margin + 30, legendY - 3, 10, 5, 'F');
    doc.text('Etapa de Produção', margin + 45, legendY);

    // Add pagination
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${totalPages}`,
        210,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    doc.save('cronograma-producao.pdf');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium text-gray-600">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg font-medium text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-600">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white text-shadow">Quadro Kanban</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('stages')}
            className="flex items-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors duration-200 shadow-lg"
            title="Gerenciar Etapas de Fabricação"
          >
            <Clipboard className="h-5 w-5 mr-2" />
            Etapas de Fabricação
          </button>
          
          {activeTab === 'kanban' && (
            <>
              <button
                onClick={() => setCompactView(!compactView)}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 shadow-lg"
                title={compactView ? "Visualização normal" : "Visualização compacta"}
              >
                {compactView ? (
                  <>
                    <LayoutGrid className="h-5 w-5 mr-2" />
                    Normal
                  </>
                ) : (
                  <>
                    <LayoutList className="h-5 w-5 mr-2" />
                    Compacto
                  </>
                )}
              </button>
              <button
                onClick={() => setIsColumnModalOpen(true)}
                className="flex items-center px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors duration-200 shadow-lg"
              >
                <Settings className="h-5 w-5 mr-2" />
                Gerenciar Colunas
              </button>
              <button
                onClick={() => setIsManageOrdersModalOpen(true)}
                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200 shadow-lg"
              >
                <ListX className="h-5 w-5 mr-2" />
                Gerenciar Pedidos
              </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'occupation' ? (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <OccupationRateTab />
        </div>
      ) : activeTab === 'stages' ? (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <ManufacturingStages />
        </div>
      ) : (
        <>
          {/* Barra de filtros */}
          <div className="mb-6">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg shadow-lg border border-white/30 p-4">
              <div className="flex flex-wrap gap-4 items-center">
                {/* Campo de busca */}
                <div className="relative flex-1 min-w-[250px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/70" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar pedido por número, cliente ou OS..."
                    className="pl-10 pr-4 py-2 w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                </div>
                
                {/* Botão para abrir/fechar menu de filtros */}
                <button 
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                  className="flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                >
                  <Filter className="h-5 w-5 mr-2" />
                  Filtros
                  <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filterMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {hasActiveFilters && (
                  <button 
                    onClick={resetAllFilters}
                    className="text-white/80 hover:text-white underline text-sm"
                  >
                    Limpar filtros
                  </button>
                )}
                
                {/* Contador de resultados */}
                <div className="text-white/80 text-sm ml-auto">
                  {totalDisplayedOrders} pedido(s) {hasActiveFilters ? 'encontrado(s)' : 'ativo(s)'}
                </div>
              </div>

              {/* Menu expandido de filtros */}
              {filterMenuOpen && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Filtro por cliente */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2 flex items-center">
                      <Users className="h-4 w-4 mr-2" />
                      Cliente
                    </label>
                    <select 
                      multiple
                      size={6}
                      className="w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white p-2 focus:outline-none focus:ring-2 focus:ring-white/50"
                      value={filterByCustomer}
                      onChange={(e) => {
                        const options = e.target.options;
                        const selectedValues = [];
                        for (let i = 0; i < options.length; i++) {
                          if (options[i].selected) {
                            selectedValues.push(options[i].value);
                          }
                        }
                        setFilterByCustomer(selectedValues);
                      }}
                    >
                      {availableCustomers.map(customer => (
                        <option key={customer} value={customer} className="py-1">
                          {customer}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-white/70 mt-1">
                      Use Ctrl+clique para selecionar múltiplos
                    </div>
                  </div>
                  
                  {/* Filtro por projeto */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2 flex items-center">
                      <Briefcase className="h-4 w-4 mr-2" />
                      Projeto
                    </label>
                    <select 
                      multiple
                      size={6}
                      className="w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white p-2 focus:outline-none focus:ring-2 focus:ring-white/50"
                      value={filterByProject}
                      onChange={(e) => {
                        const options = e.target.options;
                        const selectedValues = [];
                        for (let i = 0; i < options.length; i++) {
                          if (options[i].selected) {
                            selectedValues.push(options[i].value);
                          }
                        }
                        setFilterByProject(selectedValues);
                      }}
                    >
                      {availableProjects.map(project => (
                        <option key={project} value={project} className="py-1">
                          {project}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-white/70 mt-1">
                      Use Ctrl+clique para selecionar múltiplos
                    </div>
                  </div>
                  
                  {/* Filtro por status */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2 flex items-center">
                      <Flag className="h-4 w-4 mr-2" />
                      Status
                    </label>
                    <select 
                      multiple
                      size={6}
                      className="w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white p-2 focus:outline-none focus:ring-2 focus:ring-white/50"
                      value={filterByStatus}
                      onChange={(e) => {
                        const options = e.target.options;
                        const selectedValues = [];
                        for (let i = 0; i < options.length; i++) {
                          if (options[i].selected) {
                            selectedValues.push(options[i].value);
                          }
                        }
                        setFilterByStatus(selectedValues);
                      }}
                    >
                      {statusLegend.map(status => (
                        <option key={status.status} value={status.status} className="py-1">
                          {status.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-white/70 mt-1">
                      Use Ctrl+clique para selecionar múltiplos
                    </div>
                  </div>
                  
                  {/* Filtro por prazo */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-2 flex items-center">
                      <Calendar className="h-4 w-4 mr-2" />
                      Prazo de Entrega
                    </label>
                    <select
                      value={filterByDeadline}
                      onChange={(e) => setFilterByDeadline(e.target.value)}
                      className="w-full bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white p-2 focus:outline-none focus:ring-2 focus:ring-white/50"
                    >
                      <option value="all">Todos os prazos</option>
                      <option value="late">Atrasados</option>
                      <option value="today">Entrega hoje</option>
                      <option value="week">Próximos 7 dias</option>
                      <option value="month">Próximos 30 dias</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Layout Kanban */}
          <div className="flex gap-6">
            <div className="w-64 shrink-0 bg-white/20 backdrop-blur-sm rounded-lg shadow-lg border border-white/30 p-4 self-start sticky top-6">
              <h3 className="text-base font-semibold mb-3 text-white">Status dos Pedidos</h3>
              <div className="space-y-3">
                {statusLegend.map(({ status, color, borderColor, label }) => (
                  <div key={status} className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-md ${color} border-2 ${borderColor}`}></div>
                    <span className="text-sm font-medium text-white">{label}</span>
                  </div>
                ))}
              </div>
              
              {ordersWithoutColumn.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-base font-semibold mb-3 text-white">Pedidos sem Coluna</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {ordersWithoutColumn.map(order => (
                      <div 
                        key={order.id}
                        className={`p-2 text-white rounded cursor-pointer
                          ${shouldHighlight(order, searchTerm) 
                            ? 'bg-blue-400/40 border border-blue-300/70' 
                            : 'bg-gray-300/30 hover:bg-gray-300/50'
                          }`}
                        onClick={() => handleOrderClick(order)}
                      >
                        #{order.orderNumber} - {order.customer}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-x-auto">
              <div className="flex space-x-4 pb-4">
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex space-x-4">
                    {columnsWithOrders.map((column) => (
                      <KanbanColumn
                        key={column.id}
                        column={column}
                        onEdit={() => handleEditColumn(column)}
                        onDelete={() => handleDeleteColumn(column.id)}
                        onOrderClick={handleOrderClick}
                        highlightTerm={searchTerm}
                        compactView={compactView}
                      />
                    ))}
                  </div>
                  <DragOverlay>
                    {activeId && draggedOrder && (
                      <KanbanCard
                        order={draggedOrder}
                        overlay
                        compactView={compactView}
                      />
                    )}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          </div>

          {isColumnModalOpen && (
            <ColumnModal
              column={selectedColumn}
              onClose={() => {
                setIsColumnModalOpen(false);
                setSelectedColumn(null);
              }}
              onSave={handleSaveColumn}
            />
          )}

          {isManageOrdersModalOpen && (
            <ManageOrdersModal
              orders={orders}
              onClose={() => setIsManageOrdersModalOpen(false)}
              onDelete={handleDeleteSelectedOrders}
            />
          )}

          {isOrderModalOpen && selectedOrder && (
            <OrderModal
              order={selectedOrder}
              onClose={() => {
                setIsOrderModalOpen(false);
                setSelectedOrder(null);
              }}
              onSave={handleSaveOrder}
              projects={projects}
            />
          )}
        </>
      )}

      <div className="mt-6">
        <button
          onClick={handleExportGanttPDF}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Download className="h-5 w-5 mr-2" />
          Exportar Cronograma
        </button>
      </div>
    </div>
  );
};

// Helper to determine if an order should be highlighted based on search term
const shouldHighlight = (order: Order, searchTerm: string) => {
  if (!searchTerm) return false;
  
  const searchTermLower = searchTerm.toLowerCase().trim();
  return (
    order.orderNumber.toLowerCase().includes(searchTermLower) ||
    order.customer.toLowerCase().includes(searchTermLower) ||
    order.internalOrderNumber.toLowerCase().includes(searchTermLower)
  );
};

// Add Briefcase icon component
const Briefcase = (props: any) => {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2"></rect>
      <path d="M16 21V5a2 12 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
    </svg>
  );
};

// Function to check if a date is today
const isToday = (date: Date): boolean => {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

export default Kanban;