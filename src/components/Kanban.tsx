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
    if (order?.status === 'completed' || order?.deleted) return;
    if (!order?.deliveryDate) return;
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
    const uniqueCustomers = [...new Set(orders.filter(o => o?.customer).map(order => order.customer))];
    setAvailableCustomers(uniqueCustomers.sort());
    const projectIds = [...new Set(orders.filter(o => o?.projectId).map(o => o.projectId))];
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
    const draggedOrder = orders.find(order => order?.id === active.id);
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
      const order = orders.find(o => o?.id === activeOrderId);
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

  const handleQualityControlClick = (order: Order) => {
    navigate(`/quality?orderId=${order.id}`);
  };

  const getFilteredOrders = () => {
    return orders.filter(order => {
      // Verificações de segurança
      if (!order || !order.id || order.deleted) return false;
      
      // Filtro por status
      if (filterByStatus.length > 0 && !filterByStatus.includes(order.status || 'in-progress')) return false;
      
      // Filtro por cliente
      if (filterByCustomer.length > 0 && !filterByCustomer.includes(order.customer || '')) return false;
      
      // Filtro por projeto
      if (filterByProject.length > 0 && !filterByProject.some(projectName => {
        const project = projects.find(p => p.name === projectName);
        return project && project.id === order.projectId;
      })) return false;
      
      // Filtro por prazo de entrega
      if (filterByDeadline !== 'all' && order.deliveryDate) {
        const deliveryDate = new Date(order.deliveryDate);
        const today = new Date();
        
        switch (filterByDeadline) {
          case 'today':
            if (!isToday(deliveryDate)) return false;
            break;
          case 'this-week':
            const weekFromNow = addDays(today, 7);
            if (isAfter(deliveryDate, weekFromNow) || isBefore(deliveryDate, today)) return false;
            break;
          case 'overdue':
            if (!isBefore(deliveryDate, today)) return false;
            break;
          case 'next-week':
            const nextWeekStart = addDays(today, 7);
            const nextWeekEnd = addDays(today, 14);
            if (isBefore(deliveryDate, nextWeekStart) || isAfter(deliveryDate, nextWeekEnd)) return false;
            break;
        }
      }
      
      // Filtro por termo de busca
      const searchLower = searchTerm.toLowerCase().trim();
      if (searchLower) {
        const orderNumber = order.orderNumber?.toLowerCase() || '';
        const customer = order.customer?.toLowerCase() || '';
        const internalOrderNumber = order.internalOrderNumber?.toLowerCase() || '';
        const description = order.description?.toLowerCase() || '';
        
        return (
          orderNumber.includes(searchLower) ||
          customer.includes(searchLower) ||
          internalOrderNumber.includes(searchLower) ||
          description.includes(searchLower)
        );
      }
      
      return true;
    });
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAllOrders = () => {
    const filteredOrders = getFilteredOrders();
    const allSelected = filteredOrders.every(order => selectedOrders.includes(order.id));
    
    if (allSelected) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(order => order.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOrders.length === 0) return;
    
    const confirmed = window.confirm(`Tem certeza que deseja excluir ${selectedOrders.length} pedido(s)?`);
    if (!confirmed) return;
    
    try {
      await Promise.all(selectedOrders.map(orderId => deleteOrder(orderId)));
      setSelectedOrders([]);
    } catch (error) {
      alert('Erro ao excluir pedidos. Por favor, tente novamente.');
    }
  };

  const handleBulkExport = () => {
    if (selectedOrders.length === 0) return;
    
    const ordersToExport = orders.filter(order => selectedOrders.includes(order.id));
    ordersToExport.forEach(order => {
      try {
        exportOrderToPDF(order);
      } catch (error) {
        console.error(`Erro ao exportar pedido ${order.orderNumber}:`, error);
      }
    });
  };

  const toggleCardExpansion = (orderId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const clearAllFilters = () => {
    setFilterByCustomer([]);
    setFilterByStatus([]);
    setFilterByProject([]);
    setFilterByDeadline('all');
    setSearchTerm('');
  };

  const filteredOrders = getFilteredOrders();
  const monthlyStats = getMonthlyOrderStats(filteredOrders);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">{error}</div>
          <button 
            onClick={() => window.location.reload()}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
          >
            Recarregar Página
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Sistema Orbit</h1>
            
            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('kanban')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'kanban'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <LayoutGrid className="w-4 h-4 inline mr-2" />
                Kanban
              </button>
              <button
                onClick={() => setActiveTab('stages')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'stages'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <StagedList className="w-4 h-4 inline mr-2" />
                Etapas
              </button>
              <button
                onClick={() => setActiveTab('occupation')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'occupation'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <BarChart className="w-4 h-4 inline mr-2" />
                Taxa de Ocupação
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar pedidos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Menu */}
            <div className="relative">
              <button
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Filter className="w-4 h-4" />
                <span>Filtros</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {filterMenuOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
                  <div className="p-4 space-y-4">
                    {/* Status Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Status
                      </label>
                      <div className="space-y-2">
                        {statusLegend.map(({ status, label }) => (
                          <label key={status} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={filterByStatus.includes(status)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterByStatus([...filterByStatus, status]);
                                } else {
                                  setFilterByStatus(filterByStatus.filter(s => s !== status));
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Customer Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cliente
                      </label>
                      <div className="max-h-32 overflow-y-auto space-y-2">
                        {availableCustomers.map(customer => (
                          <label key={customer} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={filterByCustomer.includes(customer)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFilterByCustomer([...filterByCustomer, customer]);
                                } else {
                                  setFilterByCustomer(filterByCustomer.filter(c => c !== customer));
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">{customer}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Deadline Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prazo de Entrega
                      </label>
                      <select
                        value={filterByDeadline}
                        onChange={(e) => setFilterByDeadline(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">Todos</option>
                        <option value="overdue">Em Atraso</option>
                        <option value="today">Hoje</option>
                        <option value="this-week">Esta Semana</option>
                        <option value="next-week">Próxima Semana</option>
                      </select>
                    </div>

                    <div className="flex justify-between pt-4 border-t">
                      <button
                        onClick={clearAllFilters}
                        className="text-sm text-gray-600 hover:text-gray-800"
                      >
                        Limpar Filtros
                      </button>
                      <button
                        onClick={() => setFilterMenuOpen(false)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* View Toggle */}
            <button
              onClick={() => setCompactView(!compactView)}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              title={compactView ? "Vista Expandida" : "Vista Compacta"}
            >
              {compactView ? <LayoutGrid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
            </button>

            {/* Bulk Actions */}
            {selectedOrders.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedOrders.length} selecionado(s)
                </span>
                <button
                  onClick={handleBulkExport}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                  title="Exportar Selecionados"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  title="Excluir Selecionados"
                >
                  <ListX className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Settings */}
            <button
              onClick={() => setIsColumnModalOpen(true)}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              title="Configurações"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Legend */}
        <div className="flex flex-wrap gap-4 mt-4">
          {statusLegend.map(({ status, color, borderColor, label }) => (
            <div key={status} className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded border-2 ${color} ${borderColor}`}></div>
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'kanban' && (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="h-full overflow-x-auto">
              <div className="flex h-full min-w-max space-x-6 p-6">
                {columns.map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    orders={filteredOrders.filter(order => order.columnId === column.id)}
                    onOrderClick={handleOrderClick}
                    onUpdateOrder={handleUpdateOrder}
                    onSelectOrder={handleSelectOrder}
                    selectedOrders={selectedOrders}
                    compactView={compactView}
                    expandedCards={expandedCards}
                    onToggleExpansion={toggleCardExpansion}
                    onQualityControlClick={handleQualityControlClick}
                  />
                ))}
              </div>
            </div>

            <DragOverlay>
              {activeId && draggedOrder ? (
                <KanbanCard
                  order={draggedOrder}
                  onClick={() => {}}
                  onUpdate={() => {}}
                  isSelected={false}
                  onSelect={() => {}}
                  compactView={compactView}
                  isExpanded={false}
                  onToggleExpansion={() => {}}
                  onQualityControlClick={() => {}}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {activeTab === 'stages' && (
          <ManufacturingStages orders={filteredOrders} />
        )}

        {activeTab === 'occupation' && (
          <OccupationRateTab orders={filteredOrders} monthlyStats={monthlyStats} />
        )}
      </div>

      {/* Modals */}
      {isColumnModalOpen && (
        <ColumnModal
          isOpen={isColumnModalOpen}
          onClose={() => setIsColumnModalOpen(false)}
          column={selectedColumn}
          onSave={(column) => {
            if (selectedColumn) {
              updateColumn(column);
            }
            setSelectedColumn(null);
          }}
          onDelete={(columnId) => {
            deleteColumn(columnId);
            setSelectedColumn(null);
          }}
        />
      )}

      {isManageOrdersModalOpen && (
        <ManageOrdersModal
          isOpen={isManageOrdersModalOpen}
          onClose={() => setIsManageOrdersModalOpen(false)}
          orders={filteredOrders}
          onUpdateOrder={handleUpdateOrder}
          onDeleteOrder={deleteOrder}
          onSelectAll={handleSelectAllOrders}
          selectedOrders={selectedOrders}
          onSelectOrder={handleSelectOrder}
        />
      )}

      {isOrderModalOpen && selectedOrder && (
        <OrderModal
          isOpen={isOrderModalOpen}
          onClose={() => {
            setIsOrderModalOpen(false);
            setSelectedOrder(null);
          }}
          order={selectedOrder}
          onSave={handleUpdateOrder}
          onDelete={() => {
            if (selectedOrder) {
              deleteOrder(selectedOrder.id);
              setIsOrderModalOpen(false);
              setSelectedOrder(null);
            }
          }}
        />
      )}

      {isOrderItemsListOpen && selectedOrder && (
        <OrderItemsList
          isOpen={isOrderItemsListOpen}
          onClose={() => {
            setIsOrderItemsListOpen(false);
            setSelectedOrder(null);
          }}
          order={selectedOrder}
          onUpdateOrder={handleUpdateOrder}
          onExportPDF={() => {
            if (selectedOrder) {
              exportOrderToPDF(selectedOrder);
            }
          }}
          onQualityControl={() => {
            if (selectedOrder) {
              handleQualityControlClick(selectedOrder);
            }
          }}
        />
      )}

      {/* Statistics Summary */}
      {Object.keys(monthlyStats).length > 0 && (
        <div className="bg-white border-t px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6 text-sm text-gray-600">
              <span>
                Total de Pedidos: <strong>{filteredOrders.length}</strong>
              </span>
              <span>
                Peso Total: <strong>
                  {filteredOrders.reduce((sum, order) => sum + (order.totalWeight || 0), 0).toFixed(2)} kg
                </strong>
              </span>
              <span>
                Em Atraso: <strong>
                  {filteredOrders.filter(order => {
                    if (!order.deliveryDate) return false;
                    return isBefore(new Date(order.deliveryDate), new Date()) && 
                           order.status !== 'completed';
                  }).length}
                </strong>
              </span>
              <span>
                Entrega Hoje: <strong>
                  {filteredOrders.filter(order => {
                    if (!order.deliveryDate) return false;
                    return isToday(new Date(order.deliveryDate));
                  }).length}
                </strong>
              </span>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsManageOrdersModalOpen(true)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Gerenciar Pedidos
              </button>
              <button
                onClick={() => {
                  const newOrder: Partial<Order> = {
                    orderNumber: `ORD-${Date.now()}`,
                    customer: '',
                    deliveryDate: new Date().toISOString().split('T')[0],
                    status: 'in-progress',
                    columnId: columns[0]?.id || '',
                    items: [],
                    totalWeight: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  };
                  addOrder(newOrder as Order);
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Novo Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Kanban;
