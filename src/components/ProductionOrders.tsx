import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ChevronDown, 
  Filter, 
  QrCode,
  FileText, 
  ClipboardList, 
  Calendar, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  PauseCircle as PauseCircleIcon,
  Trash2,
  Download,
  X
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { format, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ProductionOrder, ProductionOrderStatus, POFilterOptions } from '../types/productionOrder';
import { useProductionOrderStore } from '../store/productionOrderStore';
import { useOrderStore } from '../store/orderStore';
import { Order } from '../types/kanban';
import QRCodeDisplay from './QRCodeDisplay';
import QRCodeScanner from './QRCodeScanner';
import ProductionOrderForm from './ProductionOrderForm';
import ProductionOrderDetail from './ProductionOrderDetail';
import ProductionOrderReport from './ProductionOrderReport';
import ItemProductionReport from './ItemProductionReport';
import { useSettingsStore } from '../store/settingsStore';
import { useNavigate } from 'react-router-dom';

const ProductionOrders: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
  const [selectedMainOrder, setSelectedMainOrder] = useState<Order | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isItemReportOpen, setIsItemReportOpen] = useState(false);
  const [mainOrders, setMainOrders] = useState<Order[]>([]);
  const [displayQR, setDisplayQR] = useState<{ order: ProductionOrder, type: 'start' | 'end' } | null>(null);
  const [scanSuccess, setScanSuccess] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [dateRangeFilter, setDateRangeFilter] = useState<{
    start: string;
    end: string;
  }>({
    start: '',
    end: ''
  });
  
  const [groupBy, setGroupBy] = useState<'none' | 'stage' | 'status' | 'order'>('none');
  const [sortBy, setSortBy] = useState<'plannedStart' | 'plannedEnd' | 'priority'>('plannedStart');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { companyLogo } = useSettingsStore();
  
  const { 
    orders, 
    filteredOrders, 
    loading, 
    error,
    loadProductionOrders,
    subscribeToProductionOrders,
    applyFilters,
    deleteProductionOrder
  } = useProductionOrderStore();
  
  const { orders: mainOrdersList, subscribeToOrders, getOrder } = useOrderStore();
  
  useEffect(() => {
    const unsubscribeOrders = subscribeToOrders();
    const unsubscribeProdOrders = subscribeToProductionOrders();
    
    setMainOrders(mainOrdersList);
    
    return () => {
      unsubscribeOrders();
      unsubscribeProdOrders();
    };
  }, []);
  
  useEffect(() => {
    setMainOrders(mainOrdersList);
  }, [mainOrdersList]);

  useEffect(() => {
    // Load selected main order when needed
    if (selectedOrder && !selectedMainOrder) {
      const loadMainOrder = async () => {
        const order = await getOrder(selectedOrder.orderId);
        setSelectedMainOrder(order);
      };
      loadMainOrder();
    }
  }, [selectedOrder, selectedMainOrder]);
  
  // Apply filters when filter state changes
  useEffect(() => {
    const filterOptions: POFilterOptions = {};
    
    if (statusFilter.length > 0) filterOptions.status = statusFilter;
    if (stageFilter.length > 0) filterOptions.stages = stageFilter;
    if (priorityFilter.length > 0) filterOptions.priority = priorityFilter.map(p => p as any);
    
    if (dateRangeFilter.start && dateRangeFilter.end) {
      filterOptions.dateRange = dateRangeFilter;
    }
    
    applyFilters(filterOptions);
  }, [statusFilter, stageFilter, priorityFilter, dateRangeFilter, applyFilters]);
  
  // List of all stages for filtering
  const availableStages = [...new Set(orders.map(o => o.stageName))];

  const handleScanSuccess = (order: ProductionOrder, action: 'start' | 'complete') => {
    setScanSuccess({
      message: `Ordem de produção #${order.id.slice(0, 8)} ${action === 'start' ? 'iniciada' : 'concluída'} com sucesso!`,
      type: 'success'
    });
    setShowQRScanner(false);
    
    // Force refresh from server
    loadProductionOrders();
    
    // Clear message after 5 seconds
    setTimeout(() => {
      setScanSuccess(null);
    }, 5000);
  };
  
  const handleScanError = (errorMessage: string) => {
    setScanSuccess({
      message: errorMessage,
      type: 'error'
    });
    
    // Clear message after 5 seconds
    setTimeout(() => {
      setScanSuccess(null);
    }, 5000);
  };
  
  const handleToggleSort = (sortField: 'plannedStart' | 'plannedEnd' | 'priority') => {
    if (sortBy === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(sortField);
      setSortDirection('asc');
    }
  };
  
  // Sort function for orders
  const getSortedOrders = (orders: ProductionOrder[]) => {
    return [...orders].sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'plannedStart') {
        comparison = new Date(a.plannedStartDate).getTime() - new Date(b.plannedStartDate).getTime();
      } else if (sortBy === 'plannedEnd') {
        comparison = new Date(a.plannedEndDate).getTime() - new Date(b.plannedEndDate).getTime();
      } else if (sortBy === 'priority') {
        const priorityValue = { 'critical': 3, 'high': 2, 'medium': 1, 'low': 0 };
        comparison = (priorityValue as any)[a.priority] - (priorityValue as any)[b.priority];
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };
  
  // Function to filter orders based on search term
  const getFilteredBySearchTerm = (orders: ProductionOrder[]) => {
    if (!searchTerm.trim()) return orders;
    
    const term = searchTerm.toLowerCase();
    return orders.filter(order => {
      // Get the main order for this production order
      const mainOrder = mainOrders.find(o => o.id === order.orderId);
      
      return (
        order.id.toLowerCase().includes(term) ||
        order.stageName.toLowerCase().includes(term) ||
        order.assignedTo.toLowerCase().includes(term) ||
        (mainOrder?.orderNumber.toLowerCase().includes(term) || false) ||
        (mainOrder?.internalOrderNumber.toLowerCase().includes(term) || false) ||
        (mainOrder?.customer.toLowerCase().includes(term) || false)
      );
    });
  };
  
  // Function to group orders
  const getGroupedOrders = (orders: ProductionOrder[]) => {
    if (groupBy === 'none') return { 'Todas as Ordens': orders };
    
    return orders.reduce((groups, order) => {
      let groupKey = '';
      
      if (groupBy === 'stage') {
        groupKey = order.stageName;
      } else if (groupBy === 'status') {
        const statusMap: Record<ProductionOrderStatus, string> = {
          'pending': 'Pendente',
          'in-progress': 'Em Andamento',
          'completed': 'Concluído',
          'on-hold': 'Em Espera',
          'cancelled': 'Cancelado',
          'delayed': 'Atrasado'
        };
        
        groupKey = statusMap[order.status];
      } else if (groupBy === 'order') {
        const mainOrder = mainOrders.find(o => o.id === order.orderId);
        groupKey = mainOrder ? 
          `Pedido #${mainOrder.orderNumber} - ${mainOrder.customer}` : 
          'Pedido Desconhecido';
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(order);
      return groups;
    }, {} as Record<string, ProductionOrder[]>);
  };
  
  // Helper function to get status badge style
  const getStatusBadgeStyle = (status: ProductionOrderStatus) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'on-hold':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'delayed':
        return 'bg-orange-100 text-orange-800';
    }
  };
  
  // Helper function to get priority badge style
  const getPriorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-blue-100 text-blue-800';
      case 'medium':
        return 'bg-green-100 text-green-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Helper function to get status badge icon
  const getStatusIcon = (status: ProductionOrderStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'in-progress':
        return <ClipboardList className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'on-hold':
        return <PauseCircleIcon className="h-4 w-4" />;
      case 'cancelled':
        return <Trash2 className="h-4 w-4" />;
      case 'delayed':
        return <AlertCircle className="h-4 w-4" />;
    }
  };
  
  // Helper function to format date
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
  };
  
  // Helper function to get main order details
  const getMainOrderDetails = (orderId: string) => {
    const mainOrder = mainOrders.find(o => o.id === orderId);
    if (!mainOrder) return { orderNumber: 'N/A', customer: 'Cliente não encontrado' };
    
    return {
      orderNumber: mainOrder.orderNumber,
      customer: mainOrder.customer,
      internalOrderNumber: mainOrder.internalOrderNumber
    };
  };
  
  // Helper function to check if a production order is late
  const isOrderLate = (order: ProductionOrder) => {
    const now = new Date();
    const endDate = new Date(order.plannedEndDate);
    
    return order.status !== 'completed' && order.status !== 'cancelled' && isAfter(now, endDate);
  };
  
  // Helper function to print production order
  const handlePrintProductionOrder = (order: ProductionOrder) => {
    const doc = new jsPDF();
    const mainOrder = mainOrders.find(o => o.id === order.orderId);
    let y = 20;
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      y = 40;
    }
    
    // Title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('ORDEM DE PRODUÇÃO', 105, y, { align: 'center' });
    y += 10;
    
    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.line(20, y, 190, y);
    y += 10;
    
    // Order details section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Informações da Ordem', 20, y);
    y += 8;
    
    // Order details in 2 columns
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Etapa de Produção:', 20, y);
    doc.text('Prioridade:', 110, y);
    y += 6;
    
    doc.setFont(undefined, 'normal');
    doc.text(order.stageName, 20, y);
    doc.text(
      order.priority === 'critical' ? 'Crítica' : 
      order.priority === 'high' ? 'Alta' : 
      order.priority === 'medium' ? 'Média' : 'Baixa', 
      110, y
    );
    y += 8;
    
    doc.setFont(undefined, 'bold');
    doc.text('Data Planejada Início:', 20, y);
    doc.text('Data Planejada Término:', 110, y);
    y += 6;
    
    doc.setFont(undefined, 'normal');
    doc.text(formatDate(order.plannedStartDate), 20, y);
    doc.text(formatDate(order.plannedEndDate), 110, y);
    y += 10;
    
    // Main order details
    if (mainOrder) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Informações do Pedido', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Pedido Nº:', 20, y);
      doc.text('OS Interna:', 110, y);
      y += 6;
      
      doc.setFont(undefined, 'normal');
      doc.text(mainOrder.orderNumber, 20, y);
      doc.text(mainOrder.internalOrderNumber, 110, y);
      y += 8;
      
      doc.setFont(undefined, 'bold');
      doc.text('Cliente:', 20, y);
      y += 6;
      
      doc.setFont(undefined, 'normal');
      doc.text(mainOrder.customer, 20, y);
      y += 10;
      
      // Item details (if available)
      const item = mainOrder.items.find(i => i.id === order.itemId);
      if (item) {
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Informações do Item', 20, y);
        y += 8;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Código:', 20, y);
        doc.text('Quantidade:', 110, y);
        y += 6;
        
        doc.setFont(undefined, 'normal');
        doc.text(item.code, 20, y);
        doc.text(`${item.quantity}`, 110, y);
        y += 8;
        
        doc.setFont(undefined, 'bold');
        doc.text('Descrição:', 20, y);
        doc.text('Peso:', 110, y);
        y += 6;
        
        doc.setFont(undefined, 'normal');
        doc.text(item.description, 20, y);
        doc.text(`${item.totalWeight.toLocaleString('pt-BR')} kg`, 110, y);
        y += 10;
      }
    }
    
    // Assignment and notes
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Atribuição e Observações', 20, y);
    y += 8;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Responsável:', 20, y);
    y += 6;
    
    doc.setFont(undefined, 'normal');
    doc.text(order.assignedTo || 'Não atribuído', 20, y);
    y += 8;
    
    doc.setFont(undefined, 'bold');
    doc.text('Observações:', 20, y);
    y += 6;
    
    doc.setFont(undefined, 'normal');
    doc.text(order.notes || 'Nenhuma observação', 20, y);
    y += 15;
    
    // Work instructions
    if (order.workInstructions && order.workInstructions.length > 0) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Instruções de Trabalho', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      order.workInstructions.forEach((instruction, index) => {
        doc.text(`${index + 1}. ${instruction}`, 20, y);
        y += 6;
        
        // Add a new page if we're running out of space
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      });
      
      y += 5;
    }
    
    // Materials required
    if (order.materialsRequired && order.materialsRequired.length > 0) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Materiais Necessários', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      
      // Table header
      doc.setFont(undefined, 'bold');
      doc.text('Material', 20, y);
      doc.text('Quantidade', 120, y);
      doc.text('Unidade', 150, y);
      y += 6;
      
      // Table rows
      doc.setFont(undefined, 'normal');
      order.materialsRequired.forEach(material => {
        doc.text(material.name, 20, y);
        doc.text(material.quantity.toString(), 120, y);
        doc.text(material.unit, 150, y);
        y += 6;
        
        // Add a new page if we're running out of space
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      });
      
      y += 5;
    }
    
    // Quality checklist
    if (order.qualityChecklist && order.qualityChecklist.length > 0) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Checklist de Qualidade', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      
      order.qualityChecklist.forEach((item, index) => {
        doc.text(`☐ ${item.description}`, 20, y);
        y += 6;
        
        // Add a new page if we're running out of space
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      });
      
      y += 5;
    }
    
    // Add QR codes on the last page
    doc.addPage();
    y = 30;
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Códigos QR para Registro', 105, y, { align: 'center' });
    y += 20;
    
    // Use a placeholder for QR codes since we can't generate them directly with jsPDF
    // In a real application, you would generate these QR codes and add them as images
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Iniciar Tarefa', 60, y, { align: 'center' });
    doc.text('Finalizar Tarefa', 150, y, { align: 'center' });
    y += 10;
    
    // Add instruction to scan the appropriate QR code
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Escaneie este código para iniciar', 60, y + 60, { align: 'center' });
    doc.text('Escaneie este código para finalizar', 150, y + 60, { align: 'center' });
    
    // Add the URL path for the scanner
    doc.text(`${window.location.origin}/scan/${order.startCode}`, 60, y + 70, { align: 'center' });
    doc.text(`${window.location.origin}/scan/${order.endCode}`, 150, y + 70, { align: 'center' });
    
    // Save the PDF
    doc.save(`ordem-producao-${order.id.slice(0, 8)}.pdf`);
  };
  
  // View order details
  const handleViewOrderDetails = (order: ProductionOrder) => {
    setSelectedOrder(order);
    const mainOrder = mainOrders.find(o => o.id === order.orderId);
    setSelectedMainOrder(mainOrder || null);
    setIsDetailOpen(true);
  };

  // View item-based reports
  const handleViewItemReport = (orderId: string) => {
    navigate(`/item-report/${orderId}`);
  };
  
  // Process orders for display
  const displayOrders = getSortedOrders(getFilteredBySearchTerm(filteredOrders));
  const groupedOrders = getGroupedOrders(displayOrders);

  // Render main view
  if (isDetailOpen && selectedOrder) {
    return (
      <ProductionOrderDetail
        order={selectedOrder}
        mainOrder={selectedMainOrder}
        onBack={() => {
          setIsDetailOpen(false);
          setSelectedOrder(null);
          setSelectedMainOrder(null);
        }}
        onExport={handlePrintProductionOrder}
      />
    );
  }

  // Render reports view
  if (isReportOpen) {
    return (
      <div>
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Relatórios de Produção</h2>
          <button
            onClick={() => setIsReportOpen(false)}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <ArrowLeft className="h-5 w-5 inline-block mr-2" />
            Voltar
          </button>
        </div>
        <ProductionOrderReport />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Ordens de Produção</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setIsReportOpen(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileText className="h-5 w-5 mr-2" />
            Relatórios
          </button>
          <button
            onClick={() => setShowQRScanner(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <QrCode className="h-5 w-5 mr-2" />
            Escanear QR Code
          </button>
          <button
            onClick={() => {
              setSelectedOrder(null);
              setIsFormOpen(true);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova OP
          </button>
        </div>
      </div>

      {/* Success/Error notification */}
      {scanSuccess && (
        <div className={`mb-4 p-3 rounded-lg ${
          scanSuccess.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {scanSuccess.message}
        </div>
      )}

      {/* Search and filters */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por número, cliente, etapa..."
              className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <Filter className="h-5 w-5 mr-2" />
            Filtros
            <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          
          <div className="flex space-x-2">
            <div>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as any)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="none">Sem Agrupamento</option>
                <option value="stage">Agrupar por Etapa</option>
                <option value="status">Agrupar por Status</option>
                <option value="order">Agrupar por Pedido</option>
              </select>
            </div>
            
            <div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="plannedStart">Ordenar por Data Início</option>
                <option value="plannedEnd">Ordenar por Data Término</option>
                <option value="priority">Ordenar por Prioridade</option>
              </select>
            </div>
            
            <button
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
              title={sortDirection === 'asc' ? 'Crescente' : 'Decrescente'}
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
        
        {showFilters && (
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div className="space-y-1">
                  {['pending', 'in-progress', 'completed', 'on-hold', 'delayed', 'cancelled'].map((status) => (
                    <div key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`status-${status}`}
                        checked={statusFilter.includes(status as ProductionOrderStatus)}
                        onChange={() => {
                          setStatusFilter(prev => 
                            prev.includes(status as ProductionOrderStatus)
                              ? prev.filter(s => s !== status)
                              : [...prev, status as ProductionOrderStatus]
                          );
                        }}
                        className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`status-${status}`} className="ml-2 text-sm text-gray-700">
                        {status === 'pending' ? 'Pendente' :
                         status === 'in-progress' ? 'Em Andamento' :
                         status === 'completed' ? 'Concluído' :
                         status === 'on-hold' ? 'Em Espera' :
                         status === 'delayed' ? 'Atrasado' : 'Cancelado'}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Stage filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etapa de Produção</label>
                <select
                  multiple
                  size={6}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  value={stageFilter}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, option => option.value);
                    setStageFilter(values);
                  }}
                >
                  {availableStages.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>
              
              {/* Priority filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                <div className="space-y-1">
                  {['critical', 'high', 'medium', 'low'].map((priority) => (
                    <div key={priority} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`priority-${priority}`}
                        checked={priorityFilter.includes(priority)}
                        onChange={() => {
                          setPriorityFilter(prev => 
                            prev.includes(priority)
                              ? prev.filter(p => p !== priority)
                              : [...prev, priority]
                          );
                        }}
                        className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`priority-${priority}`} className="ml-2 text-sm text-gray-700">
                        {priority === 'critical' ? 'Crítica' :
                         priority === 'high' ? 'Alta' :
                         priority === 'medium' ? 'Média' : 'Baixa'}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Date range filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600">Data Início</label>
                    <input
                      type="date"
                      value={dateRangeFilter.start}
                      onChange={(e) => setDateRangeFilter(prev => ({ ...prev, start: e.target.value }))}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Data Término</label>
                    <input
                      type="date"
                      value={dateRangeFilter.end}
                      onChange={(e) => setDateRangeFilter(prev => ({ ...prev, end: e.target.value }))}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setStatusFilter([]);
                  setStageFilter([]);
                  setPriorityFilter([]);
                  setDateRangeFilter({ start: '', end: '' });
                }}
                className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
        <div className="flex items-start">
          <QrCode className="h-8 w-8 text-blue-500 mr-3" />
          <div>
            <h3 className="font-bold text-blue-800 mb-1">Nova funcionalidade: Ordens de Produção por Item</h3>
            <p className="text-blue-700">
              Agora você pode gerar relatórios detalhados por item e usar o aplicativo Orbit para atualizar o progresso diretamente do chão de fábrica através de QR codes.
            </p>
            <div className="mt-3 space-x-3">
              {mainOrders.length > 0 && (
                <button
                  onClick={() => handleViewItemReport(mainOrders[0].id)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Experimentar Relatório por Item
                </button>
              )}
              <a 
                href="/update/manual" 
                target="_blank" 
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 inline-block"
              >
                Ver Scanner de QR Code
              </a>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-lg text-gray-600">Carregando ordens de produção...</div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {displayOrders.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                Nenhuma ordem de produção encontrada com os filtros atuais.
              </p>
              <button
                onClick={() => {
                  setStatusFilter([]);
                  setStageFilter([]);
                  setPriorityFilter([]);
                  setDateRangeFilter({ start: '', end: '' });
                  setSearchTerm('');
                }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedOrders).map(([group, orders]) => (
                <div key={group}>
                  <h3 className="text-lg font-semibold mb-3 border-b pb-2">{group}</h3>
                  <div className="space-y-3">
                    {orders.map(order => {
                      const mainOrderInfo = getMainOrderDetails(order.orderId);
                      const isLate = isOrderLate(order);
                      const now = new Date();
                      const endDate = new Date(order.plannedEndDate);
                      const startDate = new Date(order.plannedStartDate);
                      const isDueSoon = !isLate && isAfter(now, startDate) && isBefore(now, endDate) &&
                                        (endDate.getTime() - now.getTime()) < 2 * 24 * 60 * 60 * 1000; // 2 days
                      
                      return (
                        <div 
                          key={order.id}
                          className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
                            isLate ? 'border-red-300' : 
                            isDueSoon ? 'border-yellow-300' : 
                            'border-gray-200'
                          }`}
                        >
                          <div className="p-4">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h4 className="font-medium text-gray-900 flex items-center">
                                  <span className="mr-2">
                                    {order.stageName}
                                  </span>
                                  
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeStyle(order.status)}`}>
                                    {getStatusIcon(order.status)}
                                    <span className="ml-1">
                                      {order.status === 'pending' ? 'Pendente' :
                                      order.status === 'in-progress' ? 'Em Andamento' :
                                      order.status === 'completed' ? 'Concluído' :
                                      order.status === 'on-hold' ? 'Em Espera' :
                                      order.status === 'cancelled' ? 'Cancelado' : 'Atrasado'}
                                    </span>
                                  </span>
                                  
                                  <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityBadgeStyle(order.priority)}`}>
                                    {order.priority === 'critical' ? 'Crítica' :
                                    order.priority === 'high' ? 'Alta' :
                                    order.priority === 'medium' ? 'Média' : 'Baixa'}
                                  </span>
                                  
                                  {isLate && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      Atrasado
                                    </span>
                                  )}
                                  
                                  {isDueSoon && !isLate && (
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Prazo Próximo
                                    </span>
                                  )}
                                </h4>
                                <p className="text-gray-600 text-sm">
                                  Pedido #{mainOrderInfo.orderNumber} - {mainOrderInfo.customer}
                                  <span className="mx-2">|</span>
                                  OS: {mainOrderInfo.internalOrderNumber}
                                </p>
                              </div>
                              
                              <div className="flex space-x-2">
                                {/* Action buttons */}
                                <button
                                  onClick={() => handleViewItemReport(order.orderId)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  title="Relatório por Item"
                                >
                                  <FileBarChart className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => setDisplayQR({ order, type: 'start' })}
                                  className={`p-1 rounded ${order.status === 'pending' ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 cursor-not-allowed'}`}
                                  disabled={order.status !== 'pending'}
                                  title="QR de Início"
                                >
                                  <QrCode className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => setDisplayQR({ order, type: 'end' })}
                                  className={`p-1 rounded ${order.status === 'in-progress' ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 cursor-not-allowed'}`}
                                  disabled={order.status !== 'in-progress'}
                                  title="QR de Finalização"
                                >
                                  <QrCode className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handlePrintProductionOrder(order)}
                                  className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                                  title="Imprimir OP"
                                >
                                  <FileText className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleViewOrderDetails(order)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Ver Detalhes"
                                >
                                  <Eye className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsFormOpen(true);
                                  }}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Editar OP"
                                >
                                  <Edit className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm('Tem certeza que deseja deletar esta ordem de produção?')) {
                                      deleteProductionOrder(order.id);
                                    }
                                  }}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                  title="Deletar OP"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <span className="text-gray-500 flex items-center">
                                  <Calendar className="h-4 w-4 mr-1" /> Data Início
                                </span>
                                <span className="font-medium">{formatDate(order.plannedStartDate)}</span>
                                {order.actualStartDate && (
                                  <div className="text-xs text-green-600">
                                    Iniciado em: {formatDate(order.actualStartDate)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <span className="text-gray-500 flex items-center">
                                  <Calendar className="h-4 w-4 mr-1" /> Data Término
                                </span>
                                <span className="font-medium">{formatDate(order.plannedEndDate)}</span>
                                {order.actualEndDate && (
                                  <div className="text-xs text-green-600">
                                    Finalizado em: {formatDate(order.actualEndDate)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <span className="text-gray-500 flex items-center">
                                  <User className="h-4 w-4 mr-1" /> Responsável
                                </span>
                                <span className="font-medium">{order.assignedTo || 'Não atribuído'}</span>
                              </div>
                              <div>
                                <span className="text-gray-500 flex items-center">
                                  <ClipboardList className="h-4 w-4 mr-1" /> Instruções
                                </span>
                                <span className="font-medium">{order.workInstructions?.length || 0} item(s)</span>
                              </div>
                            </div>
                            
                            {order.notes && (
                              <div className="mt-3 text-sm border-t pt-3">
                                <span className="text-gray-500">Observações:</span>
                                <p className="mt-1">{order.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      
      {/* QR Code Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Escaneie o Código QR</h3>
              <button 
                onClick={() => setShowQRScanner(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <QRCodeScanner
              onSuccess={handleScanSuccess}
              onError={handleScanError}
            />
          </div>
        </div>
      )}
      
      {/* QR Code Display Modal */}
      {displayQR && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                {displayQR.type === 'start' ? 'Iniciar Tarefa' : 'Finalizar Tarefa'}
              </h3>
              <button 
                onClick={() => setDisplayQR(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="text-center mb-4">
              <p className="text-gray-600">
                {displayQR.type === 'start' 
                  ? 'Escaneie este código para iniciar a tarefa' 
                  : 'Escaneie este código para finalizar a tarefa'}
              </p>
              <p className="text-sm font-medium text-gray-800 mt-1">
                {displayQR.order.stageName}
              </p>
            </div>
            
            <div className="flex justify-center">
              <QRCodeDisplay
                value={displayQR.type === 'start' ? displayQR.order.startCode : displayQR.order.endCode}
                size={250}
                title={`Código para ${displayQR.type === 'start' ? 'iniciar' : 'finalizar'}`}
                subtitle={`OP #${displayQR.order.id.slice(0, 8)}`}
                downloadFileName={`op-${displayQR.order.id.slice(0, 8)}-${displayQR.type}`}
                color={displayQR.type === 'start' ? '#1d4ed8' : '#15803d'}
              />
            </div>
            
            <div className="mt-6">
              <p className="text-center text-sm text-gray-600 mb-2">URL para escaneamento direto:</p>
              <div className="bg-gray-100 p-2 rounded text-sm text-center text-gray-800 break-all">
                {window.location.origin}/scan/{displayQR.type === 'start' ? displayQR.order.startCode : displayQR.order.endCode}
              </div>
              <button
                onClick={() => handlePrintProductionOrder(displayQR.order)}
                className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mt-4"
              >
                <Download className="h-5 w-5 mr-2" />
                Imprimir Ordem de Produção
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ProductionOrder Form Modal */}
      {isFormOpen && (
        <ProductionOrderForm
          order={selectedOrder}
          mainOrders={mainOrders}
          onClose={() => {
            setIsFormOpen(false);
            setSelectedOrder(null);
          }}
          onSuccess={() => {
            setIsFormOpen(false);
            setSelectedOrder(null);
          }}
        />
      )}
    </div>
  );
};

// Add User icon component
const User = (props: any) => {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
};

// Add Edit icon component
const Edit = (props: any) => {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
};

// Add Eye icon component
const Eye = (props: any) => {
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
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
};

// Add ArrowLeft icon component
const ArrowLeft = (props: any) => {
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
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
};

// Add FileBarChart icon component
const FileBarChart = (props: any) => {
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
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-4" />
      <path d="M8 18v-2" />
      <path d="M16 18v-6" />
    </svg>
  );
};

export default ProductionOrders;