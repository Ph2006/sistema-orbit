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
import OrderItemsList from './OrderItemsList';
import ManufacturingStages from './ManufacturingStages';
import OccupationRateTab from './OccupationRateTab';
import { format, isAfter, isBefore, addDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useNavigate } from 'react-router-dom';

// Declaração para o TypeScript reconhecer o autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const statusLegend = [
  { status: 'in-progress', color: 'bg-orange-100/80', borderColor: 'border-orange-400', label: 'Em Processo' },
  { status: 'delayed', color: 'bg-red-100/80', borderColor: 'border-red-400', label: 'Atrasado' },
  { status: 'waiting-docs', color: 'bg-yellow-100/80', borderColor: 'border-yellow-400', label: 'Aguardando Validação de Documentação' },
  { status: 'completed', color: 'bg-green-100/80', borderColor: 'border-green-400', label: 'Documentação Validada' },
  { status: 'ready', color: 'bg-blue-100/80', borderColor: 'border-blue-400', label: 'Aguardando Embarque' },
  { status: 'urgent', color: 'bg-purple-100/80', borderColor: 'border-purple-400', label: 'Pedido Urgente' },
];

// Helper function to sanitize objects for Firestore
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

// Função para exportar PDF sem coluna de progresso
const exportOrderToPDF = (order: Order) => {
  const doc = new jsPDF();
  
  doc.setFont('helvetica');
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('ROMANEIO DE EMBARQUE', 105, 30, { align: 'center' });
  
  doc.setLineWidth(0.5);
  doc.line(20, 40, 190, 40);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  
  doc.text(`Pedido: #${order.orderNumber}`, 20, 55);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 120, 55);
  doc.text(`Cliente: ${order.customer}`, 20, 70);
  doc.text(`OS Interna: ${order.internalOrderNumber}`, 120, 70);
  doc.text(`Data de Entrega: ${format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, 20, 85);
  
  const tableData = order.items?.map((item, index) => [
    (index + 1).toString(),
    item.code || '',
    item.description || item.name || '',
    (item.quantity || 0).toString(),
    `${(item.unitWeight || 0).toFixed(3)} kg`,
    `${((item.quantity || 0) * (item.unitWeight || 0)).toFixed(3)} kg`
  ]) || [];
  
  doc.autoTable({
    head: [['Item', 'Código', 'Descrição', 'Qtd', 'Peso Unit.', 'Peso Total']],
    body: tableData,
    startY: 100,
    theme: 'grid',
    styles: {
      fontSize: 10,
      cellPadding: 3,
      halign: 'center',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [52, 152, 219],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'left', cellWidth: 60 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'right', cellWidth: 30 }
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    }
  });
  
  const totalItems = order.items?.length || 0;
  const totalQuantity = order.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
  const totalWeight = order.totalWeight || 0;
  
  const finalY = doc.lastAutoTable.finalY + 20;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  
  doc.text(`Total de Itens:`, 20, finalY);
  doc.setFont('helvetica', 'normal');
  doc.text(totalItems.toString(), 80, finalY);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Quantidade Total:`, 20, finalY + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(totalQuantity.toString(), 80, finalY + 15);
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Peso Total:`, 20, finalY + 30);
  doc.setFont('helvetica', 'normal');
  doc.text(`${totalWeight.toFixed(3)} kg`, 80, finalY + 30);
  
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Documento gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
    105,
    pageHeight - 10,
    { align: 'center' }
  );
  
  const fileName = `romaneio_pedido_${order.orderNumber}_${format(new Date(), 'ddMMyyyy_HHmm')}.pdf`;
  doc.save(fileName);
  
  return fileName;
};

const getMonthlyOrderStats = (orders: Order[]) => {
  const stats: Record<string, { count: number; totalWeight: number }> = {};
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
  const [isOrderItemsListOpen, setIsOrderItemsListOpen] = useState(false);
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

  // Estado para controlar cards expandidos
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
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('🔍 Kanban: Iniciando inicialização...');
        
        try {
          console.log('🔍 Kanban: Chamando initializeDefaultColumns...');
          await initializeDefaultColumns();
          console.log('✅ Kanban: Colunas padrão inicializadas com sucesso');
        } catch (columnError: any) {
          console.error('❌ Kanban: Erro ao inicializar colunas:', columnError);
          if (columnError?.code === 'permission-denied') {
            console.warn('⚠️ Permissão negada para colunas, continuando mesmo assim...');
          } else {
            throw columnError;
          }
        }
        
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
        setError('Erro ao carregar o quadro Kanban. Por favor, recarregue a página.');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [initializeDefaultColumns, subscribeToColumns, subscribeToOrders, subscribeToProjects]);

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
      
      if (!over || !active) {
        console.log('Drag end: No valid over or active element');
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }

      const activeOrderId = active.id as string;
      const overColumnId = over.id as string;

      console.log(`Movendo pedido ${activeOrderId} para coluna ${overColumnId}`);

      const order = orders.find(o => o.id === activeOrderId);
      if (!order) {
        console.error(`Pedido ${activeOrderId} não encontrado`);
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }

      if (order.columnId === overColumnId) {
        console.log('Pedido já está nesta coluna');
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }

      const availableColumns = [...columns];
      
      if (availableColumns.length === 0) {
        console.error('Erro crítico: Nenhuma coluna disponível');
        alert('Não foi possível mover o pedido: nenhuma coluna disponível.');
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }
      
      const targetColumn = availableColumns.find(col => col.id === overColumnId);
      
      if (!targetColumn) {
        console.error(`Coluna de destino ${overColumnId} não encontrada.`);
        console.log('Colunas disponíveis:', availableColumns.map(c => `${c.id} - ${c.title}`));
        
        const fallbackColumn = availableColumns.find(col => col.title === 'Pedidos em processo') || availableColumns[0];
        
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
          
          const sanitizedOrder = sanitizeForFirestore(updatedOrder);
          
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

      const isExpedited = targetColumn.title.toLowerCase().includes('expedi');

      const updatedOrder = {
        ...order,
        columnId: overColumnId,
        status: isExpedited ? 'waiting-docs' : order.status,
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
      const ordersInColumn = orders.filter(order => order.columnId === columnId);
      
      const alternativeColumn = columns.find(col => col.id !== columnId && col.title === 'Pedidos em processo') || 
                               columns.find(col => col.id !== columnId);
      
      if (alternativeColumn && ordersInColumn.length > 0) {
        if (!window.confirm(`Esta coluna contém ${ordersInColumn.length} pedido(s). Deseja movê-los para a coluna "${alternativeColumn.title}"?`)) {
          return;
        }
        
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
      const updatePromises = orderIds.map(orderId => {
        const order = orders.find(o => o.id === orderId);
        if (order) {
          return updateOrder(sanitizeForFirestore({ 
            ...order, 
            deleted: true,
            columnId: null
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
    setIsOrderItemsListOpen(true);
  };

  const handleViewHistory = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
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
            user: 'usuario@atual.com'
          }
        ]
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Erro ao atualizar status. Por favor, tente novamente.');
    }
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    try {
      if (updatedOrder.items && updatedOrder.items.length > 0) {
        const completedItems = updatedOrder.items.filter(item => 
          item.overallProgress === 100 && item.actualDeliveryDate
        );
        
        if (completedItems.length > 0) {
          const latestDeliveryDate = completedItems
            .map(item => new Date(item.actualDeliveryDate!))
            .sort((a, b) => b.getTime() - a.getTime())[0];
          
          updatedOrder.actualDeliveryDate = latestDeliveryDate.toISOString().split('T')[0];
          
          if (updatedOrder.startDate) {
            const startDate = new Date(updatedOrder.startDate);
            const plannedDeliveryDate = new Date(updatedOrder.deliveryDate);
            const actualDeliveryDate = new Date(updatedOrder.actualDeliveryDate);
            
            const plannedDuration = Math.ceil((plannedDeliveryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const actualDuration = Math.ceil((actualDeliveryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            
            updatedOrder.actualDuration = actualDuration;
            updatedOrder.estimatedDuration = plannedDuration;
          }
        }
      }

      await updateOrder(sanitizeForFirestore(updatedOrder));
    } catch (error) {
      console.error('Error updating order:', error);
      alert('Erro ao atualizar pedido. Por favor, tente novamente.');
    }
  };

  const handleSaveOrder = async (order: Order) => {
    try {
      if (columns.length === 0) {
        console.log("No columns available, initializing default columns...");
        try {
          await initializeDefaultColumns();
          
          const freshColumns = useColumnStore.getState().columns;
          
          if (freshColumns.length === 0) {
            throw new Error('No columns available');
          }
          
          order.columnId = freshColumns[0].id;
        } catch (initError) {
          console.error('Error initializing columns:', initError);
          throw new Error('Unable to initialize columns');
        }
      } else if (!order.columnId || !columns.some(c => c.id === order.columnId)) {
        order.columnId = columns[0].id;
      }
      
      const sanitizedOrder = sanitizeForFirestore({
        ...order,
        columnId: order.columnId
      });
      
      console.log('Saving order with columnId:', sanitizedOrder.columnId);
      
      const isNewOrder = order.id === 'new' || !orders.some(o => o.id === order.id);
      
      if (isNewOrder) {
        await addOrder(sanitizedOrder);
      } else {
        await updateOrder(sanitizedOrder);
      }
      
      setIsOrderModalOpen(false);
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error saving order:', error);
      alert('Erro ao salvar pedido. Por favor, tente novamente.');
    }
  };

  const getFilteredOrders = () => {
    return orders.filter(order => {
      if (order.deleted) return false;
      
      if (filterByStatus.length > 0 && !filterByStatus.includes(order.status)) {
        return false;
      }

      const today = new Date();
      const deliveryDate = new Date(order.deliveryDate);
      
      if (filterByDeadline === 'late') {
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

      if (filterByProject.length > 0 && !filterByProject.some(projectName => {
        const project = projects.find(p => p.name === projectName);
        return project && project.id === order.projectId;
      })) {
        return false;
      }

      if (filterByCustomer.length > 0 && !filterByCustomer.includes(order.customer)) {
        return false;
      }

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
  
  const columnsWithOrders = columns.map(column => {
    let ordersForColumn = [];
    
    if (column.title === 'Pedidos em processo') {
      ordersForColumn = filteredOrders
        .filter(order => order.status === 'in-progress' && !order.deleted)
        .sort((a, b) => {
          const dateA = new Date(a.deliveryDate);
          const dateB = new Date(b.deliveryDate);
          return dateA.getTime() - dateB.getTime();
        });
    } else {
      ordersForColumn = filteredOrders
        .filter(order => order.columnId === column.id && !order.deleted)
        .sort((a, b) => {
          const dateA = new Date(a.deliveryDate);
          const dateB = new Date(b.deliveryDate);
          return dateA.getTime() - dateB.getTime();
        });
    }
    
    return {
      ...column,
      orders: ordersForColumn
    };
  });

  const ordersWithoutColumn = filteredOrders.filter(
    order => order.columnId === null || order.columnId === undefined || !columns.some(col => col.id === order.columnId)
  );

  const totalDisplayedOrders = columnsWithOrders.reduce(
    (total, column) => total + column.orders.length, 0
  ) + ordersWithoutColumn.length;

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

  const hasActiveFilters = activeFilters > 0;

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      }
      return [...prev, orderId];
    });
  };

  // FUNÇÃO CORRIGIDA para navegar para o controle de qualidade
  const handleQualityControlClick = (order: Order) => {
    console.log('Navegando para Quality Control com pedido:', order.id);
    
    // ROTA CORRETA: /quality (conforme definido no App.tsx)
    navigate(`/quality?orderId=${order.id}`);
  };

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
      <div className="flex-1 overflow-x-auto">
        <div className="max-w-[2000px] mx-auto mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
              <h1 className="text-2xl font-bold text-white">Quadro de Produção</h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('kanban')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    activeTab === 'kanban'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <LayoutGrid className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setActiveTab('stages')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    activeTab === 'stages'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <StagedList className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setActiveTab('occupation')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    activeTab === 'occupation'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <BarChart className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none">
                <input
                  type="text"
                  placeholder="Buscar pedidos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full lg:w-64 px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    filterMenuOpen
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <Filter className="h-5 w-5" />
                  <span className="hidden sm:inline">Filtros</span>
                </button>

                <button
                  onClick={() => setCompactView(!compactView)}
                  className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    compactView
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <LayoutList className="h-5 w-5" />
                  <span className="hidden sm:inline">Compacto</span>
                </button>

                <button
                  onClick={() => setIsManageOrdersModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2"
                >
                  <Clipboard className="h-5 w-5" />
                  <span className="hidden sm:inline">Gerenciar</span>
                </button>

                {selectedOrder && (
                  <button
                    onClick={() => exportOrderToPDF(selectedOrder)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-500/25 flex items-center gap-2"
                  >
                    <Download className="h-5 w-5" />
                    <span className="hidden sm:inline">Exportar PDF</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {filterMenuOpen && (
            <div className="mt-4 bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cliente</label>
                  <select
                    multiple
                    value={filterByCustomer}
                    onChange={(e) => setFilterByCustomer(Array.from(e.target.selectedOptions, option => option.value))}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    size={5}
                  >
                    {availableCustomers.map(customer => (
                      <option key={customer} value={customer} className="py-1">
                        {customer}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                  <select
                    multiple
                    value={filterByStatus}
                    onChange={(e) => setFilterByStatus(Array.from(e.target.selectedOptions, option => option.value))}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    size={5}
                  >
                    {statusLegend.map(status => (
                      <option key={status.status} value={status.status} className="py-1">
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Projeto</label>
                  <select
                    multiple
                    value={filterByProject}
                    onChange={(e) => setFilterByProject(Array.from(e.target.selectedOptions, option => option.value))}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    size={5}
                  >
                    {availableProjects.map(project => (
                      <option key={project} value={project} className="py-1">
                        {project}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Prazo de Entrega</label>
                  <select
                    value={filterByDeadline}
                    onChange={(e) => setFilterByDeadline(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">Todos</option>
                    <option value="today">Hoje</option>
                    <option value="week">Esta Semana</option>
                    <option value="month">Este Mês</option>
                    <option value="overdue">Atrasados</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={resetAllFilters}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Limpar Filtros
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="max-w-[2000px] mx-auto">
          {activeTab === 'kanban' && (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                {columnsWithOrders.map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    onEdit={() => handleEditColumn(column)}
                    onDelete={() => handleDeleteColumn(column.id)}
                    onOrderClick={handleOrderClick}
                    onUpdateOrder={handleUpdateOrder}
                    onQualityControlClick={handleQualityControlClick}
                    highlightTerm={searchTerm}
                    compactView={compactView}
                    isManagingOrders={isManageOrdersModalOpen}
                    selectedOrders={selectedOrders}
                    customers={customers}
                    expandedCards={expandedCards}
                  />
                ))}
              </div>

              <DragOverlay>
                {draggedOrder && (
                  <KanbanCard
                    order={draggedOrder}
                    isManaging={false}
                    isSelected={false}
                    highlight={false}
                    compactView={compactView}
                    onOrderClick={() => {}}
                  />
                )}
              </DragOverlay>
            </DndContext>
          )}

          {activeTab === 'stages' && (
            <ManufacturingStages />
          )}

          {activeTab === 'occupation' && (
            <OccupationRateTab />
          )}
        </div>

        {isColumnModalOpen && selectedColumn && (
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
            onClose={() => setIsManageOrdersModalOpen(false)}
            onDelete={handleDeleteSelectedOrders}
            orders={orders.filter(order => selectedOrders.includes(order.id))}
          />
        )}

        {isOrderItemsListOpen && selectedOrder && (
          <OrderItemsList
            order={selectedOrder}
            onClose={() => {
              setIsOrderItemsListOpen(false);
              setSelectedOrder(null);
            }}
            onUpdateOrder={handleSaveOrder}
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
      </div>
      
      <div className="hidden lg:block w-72 min-w-[260px] max-w-xs bg-gray-900/80 border-l border-gray-800 p-4 text-white sticky top-0 h-[calc(100vh-64px)] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">Resumo de Entregas</h3>
        <div className="space-y-3">
          {Object.entries(getMonthlyOrderStats(orders))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, data]) => (
              <div key={month} className="bg-gray-800 rounded-lg p-3 flex flex-col">
                <span className="font-semibold text-blue-300">{format(new Date(month + '-01'), 'MMMM/yyyy', { locale: ptBR })}</span>
                <span className="text-sm mt-1">Pedidos: <span className="font-bold">{data.count}</span></span>
                <span className="text-sm">Peso pendente: <span className="font-bold">{data.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg</span></span>
              </div>
            ))}
          {Object.keys(getMonthlyOrderStats(orders)).length === 0 && (
            <div className="text-gray-400 text-sm">Nenhum pedido pendente para os próximos meses.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Kanban;
          const dateA = new Date(a.deliveryDate);
          const dateB = new Date(b.deliveryDate);
          return dateA.getTime() - dateB.getTime();
        });
    } else if (column.title === 'Pedidos expedidos') {
      ordersForColumn = filteredOrders
        .filter(order => (order.status === 'waiting-docs' || order.status === 'completed') && !order.deleted)
        .sort((a, b) => {
