import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
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

const sanitizeForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => sanitizeForFirestore(item));
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
    styles: { fontSize: 10, cellPadding: 3, halign: 'center', valign: 'middle' },
    headStyles: { fillColor: [52, 152, 219], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'left', cellWidth: 60 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'right', cellWidth: 30 }
    },
    alternateRowStyles: { fillColor: [245, 245, 245] }
  });
  
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
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterByCustomer, setFilterByCustomer] = useState<string[]>([]);
  const [filterByStatus, setFilterByStatus] = useState<string[]>([]);
  const [filterByProject, setFilterByProject] = useState<string[]>([]);
  const [filterByDeadline, setFilterByDeadline] = useState<string>('all');
  const [availableCustomers, setAvailableCustomers] = useState<string[]>([]);
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [activeTab, setActiveTab] = useState<'kanban' | 'stages' | 'occupation'>('kanban');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const { orders, subscribeToOrders, updateOrder, addOrder, deleteOrder } = useOrderStore();
  const { columns, updateColumn, deleteColumn, subscribeToColumns, initializeDefaultColumns } = useColumnStore();
  const { projects, subscribeToProjects } = useProjectStore();
  const { customers, loadCustomers, subscribeToCustomers } = useCustomerStore();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await initializeDefaultColumns();
        const unsubscribeColumns = subscribeToColumns();
        const unsubscribeOrders = subscribeToOrders();
        const unsubscribeProjects = subscribeToProjects();
        return () => {
          unsubscribeColumns();
          unsubscribeOrders();
          unsubscribeProjects();
        };
      } catch (error: any) {
        setError('Erro ao carregar o quadro Kanban. Por favor, recarregue a página.');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [initializeDefaultColumns, subscribeToColumns, subscribeToOrders, subscribeToProjects]);

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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } })
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
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }
      const activeOrderId = active.id as string;
      const overColumnId = over.id as string;
      const order = orders.find(o => o.id === activeOrderId);
      if (!order || order.columnId === overColumnId) {
        setDraggedOrder(null);
        setActiveId(null);
        return;
      }
      const targetColumn = columns.find(col => col.id === overColumnId);
      if (!targetColumn) {
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
      await updateOrder(sanitizeForFirestore(updatedOrder));
    } catch (error) {
      alert('Erro ao mover o pedido. Por favor, tente novamente.');
    } finally {
      setDraggedOrder(null);
      setActiveId(null);
    }
  };

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setIsOrderItemsListOpen(true);
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    try {
      await updateOrder(sanitizeForFirestore(updatedOrder));
    } catch (error) {
      alert('Erro ao atualizar pedido. Por favor, tente novamente.');
    }
  };

  // FUNÇÃO CORRIGIDA PARA NAVEGAÇÃO
  const handleQualityControlClick = (order: Order) => {
    navigate(`/quality?orderId=${order.id}`);
  };

  const getFilteredOrders = () => {
    return orders.filter(order => {
      if (order.deleted) return false;
      if (filterByStatus.length > 0 && !filterByStatus.includes(order.status)) return false;
      if (filterByCustomer.length > 0 && !filterByCustomer.includes(order.customer)) return false;
      if (filterByProject.length > 0 && !filterByProject.some(projectName => {
        const project = projects.find(p => p.name === projectName);
        return project && project.id === order.projectId;
      })) return false;
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
          return dateA.getTime() - dateB.getTime(); // Ordem crescente
        });
    } else if (column.title === 'Pedidos expedidos') {
      ordersForColumn = filteredOrders
        .filter(order => (order.status === 'waiting-docs' || order.status === 'completed') && !order.deleted)
        .sort((a, b) => {
          const dateA = new Date(a.deliveryDate);
          const dateB = new Date(b.deliveryDate);
          return dateA.getTime() - dateB.getTime(); // Ordem crescente
        });
    } else {
      ordersForColumn = filteredOrders
        .filter(order => order.columnId === column.id && !order.deleted)
        .sort((a, b) => {
          const dateA = new Date(a.deliveryDate);
          const dateB = new Date(b.deliveryDate);
          return dateA.getTime() - dateB.getTime(); // Ordem crescente
        });
    }
    
    return { 
      ...column, 
      orders: ordersForColumn 
    };
  });

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-row w-full h-full">
      <div className="flex-1 overflow-x-auto">
        <div className="max-w-[2000px] mx-auto mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
              <h1 className="text-2xl font-bold text-white">Quadro de Produção</h1>
              <div className="flex gap-2">
                <button onClick={() => setActiveTab('kanban')} className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'kanban' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`}>
                  <LayoutGrid className="h-5 w-5" />
                </button>
                <button onClick={() => setActiveTab('stages')} className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'stages' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`}>
                  <StagedList className="h-5 w-5" />
                </button>
                <button onClick={() => setActiveTab('occupation')} className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'occupation' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`}>
                  <BarChart className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none">
                <input type="text" placeholder="Buscar pedidos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full lg:w-64 px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setFilterMenuOpen(!filterMenuOpen)} className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${filterMenuOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`}>
                  <Filter className="h-5 w-5" />
                  <span className="hidden sm:inline">Filtros</span>
                </button>
                <button onClick={() => setCompactView(!compactView)} className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${compactView ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'}`}>
                  <LayoutList className="h-5 w-5" />
                  <span className="hidden sm:inline">Compacto</span>
                </button>
                <button onClick={() => setIsManageOrdersModalOpen(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
                  <Clipboard className="h-5 w-5" />
                  <span className="hidden sm:inline">Gerenciar</span>
                </button>
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
                  onClick={() => {
                    setSearchTerm('');
                    setFilterByCustomer([]);
                    setFilterByStatus([]);
                    setFilterByProject([]);
                    setFilterByDeadline('all');
                  }}
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
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                {columnsWithOrders.map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onOrderClick={handleOrderClick}
                    onUpdateOrder={handleUpdateOrder}
                    onQualityControlClick={handleQualityControlClick}
                    highlightTerm={searchTerm}
                    compactView={compactView}
                    isManagingOrders={false}
                    selectedOrders={selectedOrders}
                    customers={customers}
                    expandedCards={expandedCards}
                    projects={projects}
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
                    projects={projects}
                  />
                )}
              </DragOverlay>
            </DndContext>
          )}
          {activeTab === 'stages' && <ManufacturingStages />}
          {activeTab === 'occupation' && <OccupationRateTab />}
        </div>

        {isOrderItemsListOpen && selectedOrder && (
          <OrderItemsList
            order={selectedOrder}
            onClose={() => {
              setIsOrderItemsListOpen(false);
              setSelectedOrder(null);
            }}
            onUpdateOrder={handleUpdateOrder}
          />
        )}
      </div>
      
      <div className="hidden lg:block w-72 min-w-[260px] max-w-xs bg-gray-900/80 border-l border-gray-800 p-4 text-white sticky top-0 h-[calc(100vh-64px)] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">Resumo de Entregas</h3>
        <div className="space-y-3">
          {Object.entries(getMonthlyOrderStats(orders)).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => (
            <div key={month} className="bg-gray-800 rounded-lg p-3 flex flex-col">
              <span className="font-semibold text-blue-300">{format(new Date(month + '-01'), 'MMMM/yyyy', { locale: ptBR })}</span>
              <span className="text-sm mt-1">Pedidos: <span className="font-bold">{data.count}</span></span>
              <span className="text-sm">Peso pendente: <span className="font-bold">{data.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Kanban;
