import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Settings, ListX, Search, Filter, ChevronDown, Calendar, Users, Flag, LayoutGrid, LayoutList, Clipboard, LayoutList as StagedList, BarChart, Download, Plus } from 'lucide-react';
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useNavigate } from 'react-router-dom';
import OccupationRateTab from './OccupationRateTab';

const Kanban: React.FC = () => {
  // Estados principais
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
  
  // Estados de filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [filterByStatus, setFilterByStatus] = useState<string[]>([]);
  const [filterByCustomer, setFilterByCustomer] = useState<string[]>([]);
  const [filterByProject, setFilterByProject] = useState<string[]>([]);
  const [filterByDateRange, setFilterByDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [activeTab, setActiveTab] = useState<'kanban' | 'stages' | 'occupation'>('kanban');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
  // Configurações para DnD
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 10, // Pixel de distância para iniciar o drag
    },
  });
  
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250, // Atraso para iniciar o drag em touchscreens
      tolerance: 5, // Tolerância em px para movimento durante o delay
    },
  });
  
  const sensors = useSensors(mouseSensor, touchSensor);
  
  // Stores
  const { orders, updateOrder, deleteOrder, loadOrders, subscribeToOrders } = useOrderStore();
  const { columns, updateColumn, deleteColumn, subscribeToColumns, initializeDefaultColumns } = useColumnStore();
  const { projects, subscribeToProjects } = useProjectStore();
  const { customers, loadCustomers, subscribeToCustomers } = useCustomerStore();
  const navigate = useNavigate();

  // Inicialização do componente
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
        console.error('Erro ao inicializar Kanban:', error);
        setError('Erro ao carregar o quadro Kanban. Por favor, recarregue a página.');
      } finally {
        setIsLoading(false);
      }
    };
    
    init();
  }, []);
  
  // Carregar clientes
  useEffect(() => {
    const loadData = async () => {
      try {
        await loadCustomers();
        const unsubscribeCustomers = subscribeToCustomers();
        return () => unsubscribeCustomers();
      } catch (error) {
        console.error("Erro ao carregar clientes:", error);
      }
    };
    
    loadData();
  }, []);
  
  // Processamento de dados para exibição
  const columnsWithOrders = React.useMemo(() => {
    if (!columns || columns.length === 0) return [];
    
    return columns.map(column => {
      // Filtra os pedidos para esta coluna
      const columnOrders = orders
        .filter(order => {
          // Verificação básica de validade
          if (!order || !order.id || !order.columnId) return false;
          
          // Filtro por coluna
          if (order.columnId !== column.id) return false;
          
          // Aplicar filtros de busca
          if (searchTerm && searchTerm.trim() !== '') {
            const term = searchTerm.toLowerCase();
            const matchesSearch = (
              (order.orderNumber && order.orderNumber.toLowerCase().includes(term)) ||
              (order.customer && order.customer.toLowerCase().includes(term)) ||
              (order.internalOrderNumber && order.internalOrderNumber.toLowerCase().includes(term)) ||
              (order.notes && order.notes.toLowerCase().includes(term))
            );
            if (!matchesSearch) return false;
          }
          
          // Filtro por status
          if (filterByStatus.length > 0 && order.status) {
            if (!filterByStatus.includes(order.status)) return false;
          }
          
          // Filtro por cliente
          if (filterByCustomer.length > 0 && order.customer) {
            if (!filterByCustomer.includes(order.customer)) return false;
          }
          
          // Filtro por projeto
          if (filterByProject.length > 0 && order.projectId) {
            if (!filterByProject.includes(order.projectId)) return false;
          }
          
          // Filtro por data de entrega
          if (filterByDateRange[0] && filterByDateRange[1] && order.deliveryDate) {
            const deliveryDate = new Date(order.deliveryDate);
            if (deliveryDate < filterByDateRange[0] || deliveryDate > filterByDateRange[1]) return false;
          }
          
          return true;
        })
        .sort((a, b) => {
          // Ordenação das ordens dentro da coluna
          // Por default, ordens urgentes primeiro, depois por data de entrega
          if (a.status === 'urgent' && b.status !== 'urgent') return -1;
          if (a.status !== 'urgent' && b.status === 'urgent') return 1;
          
          if (a.deliveryDate && b.deliveryDate) {
            return new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime();
          }
          
          return 0;
        });
      
      return {
        ...column,
        orders: columnOrders
      };
    });
  }, [columns, orders, searchTerm, filterByStatus, filterByCustomer, filterByProject, filterByDateRange]);
  
  // Lista de todos os pedidos filtrados (para exportação)
  const filteredOrders = React.useMemo(() => {
    return columnsWithOrders.flatMap(col => col.orders || []);
  }, [columnsWithOrders]);
  
  // Listas para os filtros dropdown
  const availableCustomers = React.useMemo(() => {
    return [...new Set(orders
      .filter(order => order && order.customer)
      .map(order => order.customer as string)
    )].sort();
  }, [orders]);
  
  const availableProjects = React.useMemo(() => {
    return projects
      .filter(project => project && project.id)
      .map(project => project.id);
  }, [projects]);
  
  // Status disponíveis para filtro
  const statusLegend = [
    { status: 'waiting', label: 'Aguardando', color: 'bg-gray-400', borderColor: 'border-gray-500' },
    { status: 'in-progress', label: 'Em Processo', color: 'bg-blue-400', borderColor: 'border-blue-500' },
    { status: 'delayed', label: 'Atrasado', color: 'bg-red-400', borderColor: 'border-red-500' },
    { status: 'completed', label: 'Concluído', color: 'bg-emerald-400', borderColor: 'border-emerald-500' },
    { status: 'urgent', label: 'Urgente', color: 'bg-orange-400', borderColor: 'border-orange-500' },
    { status: 'on-hold', label: 'Em Espera', color: 'bg-amber-400', borderColor: 'border-amber-500' },
    { status: 'waiting-docs', label: 'Aguardando Docs', color: 'bg-purple-400', borderColor: 'border-purple-500' },
    { status: 'ready', label: 'Pronto', color: 'bg-indigo-400', borderColor: 'border-indigo-500' },
  ];
  
  // Handlers
  const handleDragStart = (event: any) => {
    const { active } = event;
    setActiveId(active.id);
    
    const draggedOrder = orders.find(order => order.id === active.id);
    if (draggedOrder) {
      setDraggedOrder(draggedOrder);
    }
  };
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      // Id do pedido sendo movido
      const orderId = String(active.id);
      // Id da coluna de destino
      const targetColumnId = String(over.id);
      
      // Encontra o pedido e atualiza sua coluna
      const order = orders.find(o => o.id === orderId);
      
      if (order && order.columnId !== targetColumnId) {
        try {
          updateOrder({
            ...order,
            columnId: targetColumnId,
            updatedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error('Erro ao mover pedido:', error);
        }
      }
    }
    
    setActiveId(null);
    setDraggedOrder(null);
  };
  
  const handleDeleteColumn = async (column: Column) => {
    if (!column) return;
    
    if (window.confirm(`Tem certeza que deseja excluir a coluna "${column.title}"?\n\nTodos os pedidos nesta coluna serão movidos para a primeira coluna.`)) {
      try {
        // Encontrar coluna de fallback (primeira) para mover os pedidos
        const fallbackColumn = columns.find(col => col.id !== column.id);
        
        if (!fallbackColumn) {
          throw new Error('É necessário ter pelo menos uma coluna no quadro.');
        }
        
        // Mover pedidos para a coluna de fallback
        const columnOrders = orders.filter(order => order.columnId === column.id);
        
        for (const order of columnOrders) {
          await updateOrder({
            ...order,
            columnId: fallbackColumn.id,
            updatedAt: new Date().toISOString()
          });
        }
        
        // Excluir a coluna
        await deleteColumn(column.id);
        
      } catch (error) {
        console.error('Erro ao excluir coluna:', error);
        alert(`Erro ao excluir coluna: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      }
    }
  };
  
  const handleUpdateOrder = (order: Order) => {
    if (!order || !order.id) return;
    
    try {
      updateOrder({
        ...order,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Erro ao atualizar pedido:', error);
    }
  };
  
  const handleOrderClick = (order: Order) => {
    if (isManageOrdersModalOpen) {
      // Modo de seleção de pedidos
      const isSelected = selectedOrders.includes(order.id);
      
      if (isSelected) {
        setSelectedOrders(selectedOrders.filter(id => id !== order.id));
      } else {
        setSelectedOrders([...selectedOrders, order.id]);
      }
    } else {
      // Modo normal - abre o modal de detalhes do pedido
      setSelectedOrder(order);
      setIsOrderModalOpen(true);
    }
  };
  
  const handleQualityControlClick = (order: Order) => {
    setSelectedOrder(order);
    setIsOrderItemsListOpen(true);
  };
  
  const clearFilters = () => {
    setFilterByStatus([]);
    setFilterByCustomer([]);
    setFilterByProject([]);
    setFilterByDateRange([null, null]);
    setSearchTerm('');
    setFilterMenuOpen(false);
  };
  
  const exportPDF = () => {
    // Cria uma nova instância de jsPDF
    const doc = new jsPDF();
    
    // Gera um relatório simples
    try {
      doc.setFontSize(18);
      doc.text('Relatório de Pedidos', 20, 20);
      
      doc.setFontSize(12);
      doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 20, 40);
      doc.text(`Total de pedidos: ${filteredOrders.length}`, 20, 50);
      
      const tableData = filteredOrders.map(order => [
        order.orderNumber,
        order.customer,
        order.internalOrderNumber,
        format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR }),
        statusLegend.find(s => s.status === order.status)?.label || order.status,
        `${order.progress || 0}%`
      ]);
      
      doc.autoTable({
        head: [['Pedido', 'Cliente', 'OS Interna', 'Entrega', 'Status', 'Progresso']],
        body: tableData,
        startY: 60,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [52, 152, 219] },
        alternateRowStyles: { fillColor: [245, 245, 245] }
      });
      
      doc.save('relatorio-pedidos.pdf');
      
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Verifique o console para mais detalhes.');
    }
  };
  
  const generateReportForOrder = (order: Order) => {
    if (!order) return;
    
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(16);
      doc.text(`Relatório de Pedido: #${order.orderNumber}`, 20, 20);
      
      doc.setFontSize(10);
      doc.text(`Cliente: ${order.customer || 'Não informado'}`, 20, 35);
      doc.text(`OS Interna: ${order.internalOrderNumber || 'Não informado'}`, 20, 42);
      
      if (order.deliveryDate) {
        doc.text(`Data de Entrega: ${format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, 20, 49);
      }
      
      doc.text(`Status: ${statusLegend.find(s => s.status === order.status)?.label || order.status || 'Não definido'}`, 20, 56);
      doc.text(`Progresso Geral: ${order.progress || 0}%`, 20, 63);
      
      if (order.totalWeight) {
        doc.text(`Peso Total: ${order.totalWeight.toFixed(1)} kg`, 20, 70);
      }
      
      // Tabela de itens
      if (order.items && order.items.length > 0) {
        doc.setFontSize(14);
        doc.text('Itens do Pedido', 20, 85);
        
        const tableData = order.items.map((item, index) => [
          index + 1,
          item.code || 'N/A',
          item.description || 'Sem descrição',
          `${item.quantity || 0}`,
          `${item.unitWeight?.toFixed(1) || 0} kg`,
          `${((item.unitWeight || 0) * (item.quantity || 0)).toFixed(1)} kg`
        ]);
        
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
            5: { halign: 'right', cellWidth: 25 }
          }
        });
      }
      
      doc.save(`pedido-${order.orderNumber}.pdf`);
      
    } catch (error) {
      console.error('Erro ao gerar relatório do pedido:', error);
      alert('Erro ao gerar relatório. Verifique o console para mais detalhes.');
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-lg font-medium text-white flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span>Carregando...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="text-lg font-medium text-red-400 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <div>{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Recarregar Página
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-gray-900 flex flex-row w-full h-full">
      <div className="flex-1 overflow-x-auto">
        {/* Header */}
        <div className="max-w-[2000px] mx-auto mb-6 p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-gray-800/70 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
              <h1 className="text-2xl font-bold text-white">Quadro de Produção</h1>
              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('kanban')} 
                  className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    activeTab === 'kanban' 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <LayoutGrid className="h-5 w-5" />
                  <span className="hidden md:inline">Kanban</span>
                </button>
                <button 
                  onClick={() => setActiveTab('stages')} 
                  className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    activeTab === 'stages' 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <StagedList className="h-5 w-5" />
                  <span className="hidden md:inline">Estágios</span>
                </button>
                <button 
                  onClick={() => setActiveTab('occupation')} 
                  className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    activeTab === 'occupation' 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <BarChart className="h-5 w-5" />
                  <span className="hidden md:inline">Ocupação</span>
                </button>
              </div>
            </div>
            
            {/* Controles de busca e filtros */}
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none">
                <input 
                  type="text" 
                  placeholder="Buscar pedidos..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="w-full lg:w-64 px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" 
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
              </div>
            </div>
          </div>

          {/* Menu de filtros */}
          {filterMenuOpen && (
            <div className="mt-4 bg-gray-800/50 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 shadow-xl">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cliente</label>
                  <select
                    multiple
                    value={filterByCustomer}
                    onChange={(e) => setFilterByCustomer(Array.from(e.target.selectedOptions, option => option.value))}
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 scrollbar-thin"
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
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 scrollbar-thin"
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
                    className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 scrollbar-thin"
                    size={5}
                  >
                    {availableProjects.map(project => (
                      <option key={project} value={project} className="py-1">
                        {projects.find(p => p.id === project)?.name || project}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Exportar</label>
                  <button
                    onClick={exportPDF}
                    className="w-full mb-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 justify-center"
                  >
                    <Download className="h-4 w-4" />
                    Exportar PDF
                  </button>
                  <button
                    onClick={clearFilters}
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Limpar Filtros
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Conteúdo principal */}
        <div className="max-w-[2000px] mx-auto px-4">
          {activeTab === 'kanban' && (
            <DndContext 
              sensors={sensors} 
              onDragStart={handleDragStart} 
              onDragEnd={handleDragEnd}
            >
              {/* Container principal com scroll horizontal melhorado */}
              <div className="flex gap-6 overflow-x-auto pb-6 custom-scrollbar min-h-[calc(100vh-240px)]">
                {columnsWithOrders.map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    onEdit={() => {
                      setSelectedColumn(column);
                      setIsColumnModalOpen(true);
                    }}
                    onDelete={() => {
                      handleDeleteColumn(column);
                    }}
                    onOrderClick={handleOrderClick}
                    onUpdateOrder={handleUpdateOrder}
                    onQualityControlClick={handleQualityControlClick}
                    highlightTerm={searchTerm}
                    compactView={compactView}
                    isManagingOrders={isManageOrdersModalOpen}
                    selectedOrders={selectedOrders}
                    customers={customers}
                    expandedCards={expandedCards}
                    projects={projects}
                  />
                ))}
                
                <div className="flex-shrink-0 w-80 h-[calc(100vh-240px)] flex items-center justify-center">
                  <button
                    onClick={() => {
                      setSelectedColumn(null);
                      setIsColumnModalOpen(true);
                    }}
                    className="w-60 h-60 rounded-lg border-2 border-gray-700 border-dashed text-gray-500 hover:text-gray-400 hover:border-gray-600 flex flex-col items-center justify-center transition-all duration-200"
                  >
                    <Plus className="h-10 w-10 mb-2" />
                    <span className="text-sm font-medium">Nova Coluna</span>
                  </button>
                </div>
              </div>
              
              <DragOverlay>
                {draggedOrder ? (
                  <div className="w-80">
                    <KanbanCard 
                      order={draggedOrder} 
                      isManaging={false}
                      isSelected={false}
                      highlight={false}
                      compactView={compactView}
                      onOrderClick={() => {}}
                      projects={projects}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
          
          {activeTab === 'stages' && (
            <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 shadow-2xl">
              <ManufacturingStages />
            </div>
          )}
          
          {activeTab === 'occupation' && (
            <div className="bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 shadow-2xl">
              <OccupationRateTab />
            </div>
          )}
        </div>

        {/* Modal de lista de itens do pedido */}
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
        
        {/* Modal de detalhes do pedido */}
        {isOrderModalOpen && selectedOrder && (
          <OrderModal
            order={selectedOrder}
            onClose={() => {
              setIsOrderModalOpen(false);
              setSelectedOrder(null);
            }}
            onUpdateOrder={handleUpdateOrder}
            onDeleteOrder={deleteOrder}
            generateReport={() => generateReportForOrder(selectedOrder)}
            customers={customers}
            projects={projects}
          />
        )}
        
        {/* Modal de coluna */}
        {isColumnModalOpen && (
          <ColumnModal
            column={selectedColumn}
            onClose={() => {
              setIsColumnModalOpen(false);
              setSelectedColumn(null);
            }}
            onUpdateColumn={updateColumn}
          />
        )}
        
        {/* Modal de gerenciamento de pedidos */}
        {isManageOrdersModalOpen && (
          <ManageOrdersModal
            orders={orders}
            selectedOrderIds={selectedOrders}
            setSelectedOrderIds={setSelectedOrders}
            onClose={() => {
              setIsManageOrdersModalOpen(false);
              setSelectedOrders([]);
            }}
            onUpdateOrder={handleUpdateOrder}
            onDeleteOrder={deleteOrder}
          />
        )}
      </div>
      
      {/* Barra lateral de informações */}
      <div className="hidden lg:block w-80 bg-gray-900/70 backdrop-blur-sm border-l border-gray-800/50 overflow-y-auto h-screen p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Clipboard className="h-5 w-5 text-blue-400" />
            Resumo do Quadro
          </h2>
          
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-800/70 border border-gray-700/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">Total de Pedidos</span>
                <span className="text-lg font-semibold text-white">{filteredOrders.length}</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-400">Peso Total</span>
                <span className="text-lg font-semibold text-white">
                  {filteredOrders.reduce((total, order) => total + (order.totalWeight || 0), 0).toFixed(1)} kg
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Progresso Médio</span>
                <span className="text-lg font-semibold text-white">
                  {filteredOrders.length > 0
                    ? Math.round(
                        filteredOrders.reduce((total, order) => total + (order.progress || 0), 0) /
                          filteredOrders.length
                      )
                    : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Legenda de status */}
        <div className="mb-6">
          <h4 className="text-md font-semibold mb-3 flex items-center gap-2">
            <Flag className="h-4 w-4 text-purple-400" />
            Legenda de Status
          </h4>
          <div className="space-y-2">
            {statusLegend.map(status => (
              <div key={status.status} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 transition-colors">
                <div className={`w-3 h-3 rounded-full ${status.color} ${status.borderColor} border-2`}></div>
                <span className="text-sm text-gray-300">{status.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Estatísticas gerais */}
        <div className="mt-6">
          <h4 className="text-md font-semibold mb-3 flex items-center gap-2">
            <BarChart className="h-4 w-4 text-green-400" />
            Estatísticas
          </h4>
          <div className="space-y-3">
            <div className="bg-gray-800/70 rounded-lg border border-gray-700/50 p-3">
              <div className="text-sm text-gray-400 mb-1.5">Status dos Pedidos</div>
              <div className="h-8 rounded-md overflow-hidden flex">
                {statusLegend.map(status => {
                  const count = filteredOrders.filter(o => o.status === status.status).length;
                  const percentage = (count / filteredOrders.length) * 100 || 0;
                  
                  if (percentage === 0) return null;
                  
                  return (
                    <div 
                      key={status.status}
                      className={`${status.color} border-r border-gray-800 last:border-0`}
                      style={{ width: `${percentage}%` }}
                      title={`${status.label}: ${count} pedidos (${percentage.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {statusLegend.map(status => {
                  const count = filteredOrders.filter(o => o.status === status.status).length;
                  if (count === 0) return null;
                  
                  return (
                    <div key={status.status} className="text-xs text-gray-300 flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                      {count}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={exportPDF}
            className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar Relatório
          </button>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-800/50 space-y-3">
          <button
            onClick={() => {
              setIsManageOrdersModalOpen(true);
            }}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Clipboard className="h-4 w-4" />
            Gerenciar Pedidos
          </button>
          <button
            onClick={() => {
              setSelectedColumn(null);
              setIsColumnModalOpen(true);
            }}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nova Coluna
          </button>
        </div>
      </div>
    </div>
  );
};

export default Kanban;
