import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Calendar, 
  User, 
  Package, 
  MoreHorizontal,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  Printer
} from 'lucide-react';
import { useOrderStore } from '../store/orderStore';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import OrderModal from './OrderModal';
import { useNavigate } from 'react-router-dom';

// Definir os tipos Order e OrderStatus localmente para evitar problemas de importação
type OrderStatus = 'in-progress' | 'completed' | 'on-hold' | 'cancelled' | string;

interface OrderItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  weight: number;
  progress: number;
}

interface Order {
  id: string;
  customerId?: string;
  customerName?: string;
  customer?: string;
  project?: string;
  projectName?: string;
  orderNumber?: string;
  internalOS?: string;
  internalOrderNumber?: string;
  startDate?: string;
  deliveryDate?: string;
  completionDate?: string;
  status?: OrderStatus;
  observations?: string;
  items?: OrderItem[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

// Tipo para organização da tabela
type SortField = 'orderNumber' | 'customer' | 'internalOS' | 'startDate' | 'status';
type SortOrder = 'asc' | 'desc';

export default function Orders() {
  const navigate = useNavigate();
  
  const { 
    orders, 
    loading, 
    error, 
    fetchOrders, 
    deleteOrder, 
    setSelectedOrder,
    subscribeToOrders,
    clearError 
  } = useOrderStore();
  
  const { user, hasPermission } = useAuthStore();
  
  // Estados para pesquisa e filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  
  // Estados para ordenação
  const [sortField, setSortField] = useState<SortField>('startDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Estados para paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Estados para modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedOrder, setSelectedOrderState] = useState<Order | null>(null);
  
  // Estados para dashboard
  const [showDashboard, setShowDashboard] = useState(false);
  
  // Estados para dropdown de ação
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Carregar pedidos ao montar o componente
  useEffect(() => {
    if (user) {
      console.log("Orders component: Loading orders");
      fetchOrders();
      
      // Subscrever a mudanças em tempo real
      const unsubscribe = subscribeToOrders();
      return () => {
        try {
          unsubscribe();
        } catch (error) {
          console.error("Error unsubscribing from orders:", error);
        }
      };
    }
  }, [user, fetchOrders, subscribeToOrders]);

  // Limpar erro quando componente desmonta
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  // Função para processar os dados dos clientes para o filtro
  const clientOptions = useMemo(() => {
    const clients = new Set<string>();
    orders.forEach(order => {
      if (order.customerName) clients.add(order.customerName);
      if (order.customer) clients.add(order.customer);
    });
    return ['all', ...Array.from(clients)];
  }, [orders]);

  // Função para determinar as datas para o filtro
  const dateOptions = useMemo(() => {
    return [
      { value: 'all', label: 'Todas as datas' },
      { value: 'today', label: 'Hoje' },
      { value: 'week', label: 'Esta semana' },
      { value: 'month', label: 'Este mês' },
      { value: 'late', label: 'Atrasados' }
    ];
  }, []);

  // Função para verificar se uma data está dentro do filtro selecionado
  const isDateInFilter = (dateStr: string | undefined, filter: string): boolean => {
    if (!dateStr || filter === 'all') return true;
    
    try {
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Para filtros baseados em data
      if (filter === 'today') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return date >= today && date < tomorrow;
      }
      
      if (filter === 'week') {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);
        return date >= startOfWeek && date < endOfWeek;
      }
      
      if (filter === 'month') {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return date >= startOfMonth && date <= endOfMonth;
      }
      
      if (filter === 'late') {
        return date < today;
      }
      
      return true;
    } catch (e) {
      console.error("Error checking date filter:", e);
      return true;
    }
  };

  // Função auxiliar para campo seguro
  const safeField = (order: Order, fields: string[]): string => {
    for (const field of fields) {
      if (order[field] && typeof order[field] === 'string') {
        return order[field] as string;
      }
    }
    return '';
  };

  // Filtrar e ordenar pedidos
  const processedOrders = useMemo(() => {
    return orders
      // Filtrar
      .filter(order => {
        if (!order) return false;
        
        // Busca textual
        const orderNumber = safeField(order, ['orderNumber', 'id']);
        const customer = safeField(order, ['customerName', 'customer']);
        const project = safeField(order, ['project', 'projectName']);
        const internalOS = safeField(order, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
        
        const matchesSearch = searchTerm === '' || 
          orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.toLowerCase().includes(searchTerm.toLowerCase()) ||
          internalOS.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Filtro de status
        const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        
        // Filtro de cliente
        const matchesClient = clientFilter === 'all' || 
          customer === clientFilter;
        
        // Filtro de data
        const matchesDate = isDateInFilter(order.startDate, dateFilter);
        
        return matchesSearch && matchesStatus && matchesClient && matchesDate;
      })
      // Ordenar
      .sort((a, b) => {
        if (sortField === 'orderNumber') {
          const aValue = safeField(a, ['orderNumber', 'id']);
          const bValue = safeField(b, ['orderNumber', 'id']);
          return sortOrder === 'asc' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        }
        
        if (sortField === 'customer') {
          const aValue = safeField(a, ['customerName', 'customer']);
          const bValue = safeField(b, ['customerName', 'customer']);
          return sortOrder === 'asc' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        }
        
        if (sortField === 'internalOS') {
          const aValue = safeField(a, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
          const bValue = safeField(b, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
          return sortOrder === 'asc' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        }
        
        if (sortField === 'startDate') {
          const aValue = a.startDate ? new Date(a.startDate).getTime() : 0;
          const bValue = b.startDate ? new Date(b.startDate).getTime() : 0;
          return sortOrder === 'asc' 
            ? aValue - bValue 
            : bValue - aValue;
        }
        
        if (sortField === 'status') {
          const aValue = a.status || '';
          const bValue = b.status || '';
          return sortOrder === 'asc' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        }
        
        return 0;
      });
  }, [orders, searchTerm, statusFilter, clientFilter, dateFilter, sortField, sortOrder]);
  
  // Paginação
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [processedOrders, currentPage, itemsPerPage]);
  
  const totalPages = useMemo(() => 
    Math.ceil(processedOrders.length / itemsPerPage),
    [processedOrders, itemsPerPage]
  );

  // Handlers para o modal
  const handleCreateOrder = () => {
    setSelectedOrderState(null);
    setSelectedOrder(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleEditOrder = (order: Order) => {
    setSelectedOrderState(order);
    setSelectedOrder(order);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrderState(order);
    setSelectedOrder(order);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!order.id) {
      alert('ID do pedido não encontrado');
      return;
    }

    const confirmDelete = window.confirm(
      `Tem certeza que deseja deletar o pedido #${order.orderNumber || order.id}?`
    );
    
    if (confirmDelete) {
      try {
        await deleteOrder(order.id);
      } catch (error) {
        console.error('Erro ao deletar pedido:', error);
        alert('Erro ao deletar pedido');
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedOrderState(null);
    setSelectedOrder(null);
    setActiveDropdown(null);
  };

  // Função para alternar ordenação
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Função para mostrar/esconder dropdown
  const toggleDropdown = (orderId: string) => {
    setActiveDropdown(activeDropdown === orderId ? null : orderId);
  };

  // Função para exportar para Excel (mock)
  const handleExportToExcel = () => {
    alert('Função de exportar para Excel estará disponível em breve!');
  };

  // Função para imprimir (mock)
  const handlePrint = () => {
    window.print();
  };

  // Função para formatar data
  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return '-';
    }
  };

  // Função para obter o texto do status
  const getStatusText = (status: string | undefined) => {
    if (!status) return 'Desconhecido';
    
    const statusMap: Record<string, string> = {
      'in-progress': 'Em Processo',
      'completed': 'Concluído',
      'on-hold': 'Em Pausa',
      'cancelled': 'Cancelado',
      'shipped': 'Expedido',
      'delayed': 'Atrasado'
    };
    
    return statusMap[status.toLowerCase()] || status;
  };

  // Função para obter cor do status
  const getStatusColor = (status: string | undefined) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    
    const normalizedStatus = status.toLowerCase();
    
    if (normalizedStatus.includes('conclu') || normalizedStatus === 'completed') {
      return 'bg-green-100 text-green-800';
    }
    if (normalizedStatus.includes('processo') || normalizedStatus === 'in-progress') {
      return 'bg-blue-100 text-blue-800';
    }
    if (normalizedStatus.includes('pausa') || normalizedStatus === 'on-hold') {
      return 'bg-yellow-100 text-yellow-800';
    }
    if (normalizedStatus.includes('cancel') || normalizedStatus === 'cancelled') {
      return 'bg-red-100 text-red-800';
    }
    if (normalizedStatus.includes('exped') || normalizedStatus === 'shipped') {
      return 'bg-purple-100 text-purple-800';
    }
    if (normalizedStatus.includes('atras') || normalizedStatus === 'delayed') {
      return 'bg-orange-100 text-orange-800';
    }
    
    return 'bg-gray-100 text-gray-800';
  };

  // Componentes para o dashboard
  const OrdersDashboard = () => {
    const totalOrders = processedOrders.length;
    const inProgressOrders = processedOrders.filter(o => o.status === 'in-progress').length;
    const completedOrders = processedOrders.filter(o => o.status === 'completed').length;
    const onHoldOrders = processedOrders.filter(o => o.status === 'on-hold').length;
    const cancelledOrders = processedOrders.filter(o => o.status === 'cancelled').length;
    
    // Calcular pedidos atrasados
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lateOrders = processedOrders.filter(order => {
      if (!order.deliveryDate || order.status === 'completed' || order.status === 'cancelled') return false;
      try {
        const deliveryDate = new Date(order.deliveryDate);
        return deliveryDate < today;
      } catch {
        return false;
      }
    }).length;
    
    // Calcular tempos médios
    let totalProductionDays = 0;
    let completedOrdersWithDates = 0;
    
    processedOrders.forEach(order => {
      if (order.status === 'completed' && order.startDate && order.completionDate) {
        try {
          const startDate = new Date(order.startDate);
          const completionDate = new Date(order.completionDate);
          const days = Math.ceil((completionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          totalProductionDays += days;
          completedOrdersWithDates++;
        } catch {
          // Ignorar pedidos com datas inválidas
        }
      }
    });
    
    const averageProductionDays = completedOrdersWithDates > 0 
      ? Math.round(totalProductionDays / completedOrdersWithDates) 
      : 0;
    
    return (
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6 animate-fadeIn">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <BarChart2 className="w-5 h-5 mr-2 text-blue-600" />
          Dashboard de Pedidos
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Em Processo</p>
                <h4 className="text-2xl font-bold text-blue-700">{inProgressOrders}</h4>
                <p className="text-sm text-blue-600">
                  {Math.round((inProgressOrders / totalOrders) * 100) || 0}% do total
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">Concluídos</p>
                <h4 className="text-2xl font-bold text-green-700">{completedOrders}</h4>
                <p className="text-sm text-green-600">
                  {Math.round((completedOrders / totalOrders) * 100) || 0}% do total
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Atrasados</p>
                <h4 className="text-2xl font-bold text-red-700">{lateOrders}</h4>
                <p className="text-sm text-red-600">
                  {Math.round((lateOrders / totalOrders) * 100) || 0}% do total
                </p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Tempo Médio</p>
                <h4 className="text-2xl font-bold text-purple-700">
                  {averageProductionDays} dias
                </h4>
                <p className="text-sm text-purple-600">
                  para concluir um pedido
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-full">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-gray-600">Gerenciamento de pedidos e projetos</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowDashboard(!showDashboard)}
            className="flex items-center gap-2 bg-white border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            title={showDashboard ? "Ocultar Dashboard" : "Mostrar Dashboard"}
          >
            <BarChart2 className="w-4 h-4 text-gray-600" />
            <span className="hidden md:inline">Dashboard</span>
          </button>
          
          <button
            onClick={handleExportToExcel}
            className="flex items-center gap-2 bg-white border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            title="Exportar para Excel"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span className="hidden md:inline">Exportar</span>
          </button>
          
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            title="Imprimir"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            <span className="hidden md:inline">Imprimir</span>
          </button>
          
          <button
            onClick={handleCreateOrder}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            title="Novo Pedido"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Pedido</span>
          </button>
        </div>
      </div>

      {/* Dashboard (condicional) */}
      {showDashboard && <OrdersDashboard />}

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 print:hidden">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por número, cliente ou OS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos os status</option>
                <option value="in-progress">Em Processo</option>
                <option value="completed">Concluído</option>
                <option value="on-hold">Em Pausa</option>
                <option value="cancelled">Cancelado</option>
                <option value="shipped">Expedido</option>
                <option value="delayed">Atrasado</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos os clientes</option>
                {clientOptions.slice(1).map((client, index) => (
                  <option key={index} value={client}>
                    {client}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {dateOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Mensagem de erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 print:hidden">
          <div className="flex items-center">
            <div className="text-red-400 mr-3">⚠️</div>
            <div>
              <h3 className="text-sm font-medium text-red-800">Erro</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <button 
              onClick={clearError}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Lista de Pedidos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 print:shadow-none print:border-none">
        {loading ? (
          <div className="flex items-center justify-center p-8 print:hidden">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Carregando pedidos...</span>
          </div>
        ) : processedOrders.length === 0 ? (
          <div className="text-center py-12 print:hidden">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== 'all' || clientFilter !== 'all' || dateFilter !== 'all' 
                ? 'Nenhum pedido encontrado' 
                : 'Nenhum pedido cadastrado'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || statusFilter !== 'all' || clientFilter !== 'all' || dateFilter !== 'all' 
                ? 'Tente ajustar os filtros de busca'
                : 'Comece criando seu primeiro pedido'
              }
            </p>
            {!searchTerm && statusFilter === 'all' && clientFilter === 'all' && dateFilter === 'all' && (
              <button
                onClick={handleCreateOrder}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors mx-auto"
              >
                <Plus className="w-4 h-4" />
                Criar Primeiro Pedido
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 print:bg-white">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer" 
                        onClick={() => handleSort('orderNumber')}>
                      <div className="flex items-center gap-1">
                        Número do Pedido
                        {sortField === 'orderNumber' && (
                          <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'asc' ? 'transform rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer" 
                        onClick={() => handleSort('customer')}>
                      <div className="flex items-center gap-1">
                        Cliente
                        {sortField === 'customer' && (
                          <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'asc' ? 'transform rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer" 
                        onClick={() => handleSort('internalOS')}>
                      <div className="flex items-center gap-1">
                        OS Interna
                        {sortField === 'internalOS' && (
                          <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'asc' ? 'transform rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer" 
                        onClick={() => handleSort('startDate')}>
                      <div className="flex items-center gap-1">
                        Data de Início
                        {sortField === 'startDate' && (
                          <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'asc' ? 'transform rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 cursor-pointer" 
                        onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">
                        Status
                        {sortField === 'status' && (
                          <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'asc' ? 'transform rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700 print:hidden">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedOrders.map((order) => {
                    if (!order) return null;
                    
                    const orderNumber = safeField(order, ['orderNumber', 'id']);
                    const customer = safeField(order, ['customerName', 'customer']);
                    const project = safeField(order, ['project', 'projectName']);
                    const internalOS = safeField(order, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
                    const statusText = getStatusText(order.status);
                    const statusColorClass = getStatusColor(order.status);
                    
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-4">
                          <div className="font-medium text-gray-900">#{orderNumber}</div>
                          {project && (
                            <div className="text-sm text-gray-500">{project}</div>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-gray-900">{customer || '-'}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-gray-600">{internalOS || '-'}</span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                            <span className="text-gray-600">{formatDate(order.startDate)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColorClass}`}>
                            {statusText}
                          </span>
                        </td>
                        <td className="py-4 px-4 print:hidden">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleViewOrder(order)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Visualizar"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            
                            <button
                              onClick={() => handleEditOrder(order)}
                              className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            
                            <div className="relative">
                              <button
                                onClick={() => toggleDropdown(order.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Mais ações"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              
                              {activeDropdown === order.id && (
                                <div className="absolute right-0 z-10 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
                                  <div className="py-1" role="menu">
                                    <button
                                      onClick={() => {
                                        navigate(`/item-report/${order.id}`);
                                      }}
                                      className="text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full"
                                      title="Relatório de Produção"
                                    >
                                      <span className="flex items-center">
                                        <FileText className="w-4 h-4 mr-2" />
                                        Relatório de Produção
                                      </span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        window.open(`/cronograma/${order.id}`, '_blank');
                                      }}
                                      className="text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full"
                                      title="Cronograma Público"
                                    >
                                      <span className="flex items-center">
                                        <Calendar className="w-4 h-4 mr-2" />
                                        Cronograma Público
                                      </span>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteOrder(order)}
                                      className="text-left block px-4 py-2 text-sm text-red-600 hover:bg-gray-100 w-full"
                                      title="Deletar"
                                    >
                                      <span className="flex items-center">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Deletar Pedido
                                      </span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 print:hidden">
                <div className="flex flex-1 justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className={`relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                      currentPage === 1
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    } border border-gray-300`}
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className={`relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                      currentPage === totalPages
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    } border border-gray-300`}
                  >
                    Próximo
                  </button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Mostrando <span className="font-medium">{Math.min((currentPage - 1) * itemsPerPage + 1, processedOrders.length)}</span> a{' '}
                      <span className="font-medium">{Math.min(currentPage * itemsPerPage, processedOrders.length)}</span> de{' '}
                      <span className="font-medium">{processedOrders.length}</span> resultados
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className={`relative inline-flex items-center rounded-l-md px-2 py-2 ${
                          currentPage === 1
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-500 hover:bg-gray-50'
                        } border border-gray-300`}
                      >
                        <span className="sr-only">Anterior</span>
                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                      </button>
                      
                      {/* Paginação dinâmica */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page => 
                          page === 1 || 
                          page === totalPages || 
                          Math.abs(page - currentPage) <= 1
                        )
                        .map((page, index, array) => {
                          // Adicionar reticências se necessário
                          if (index > 0 && page > array[index - 1] + 1) {
                            return (
                              <span
                                key={`ellipsis-${page}`}
                                className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300"
                              >
                                ...
                              </span>
                            );
                          }
                          
                          return (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`relative inline-flex items-center px-4 py-2 text-sm font-medium ${
                                currentPage === page
                                  ? 'bg-blue-50 text-blue-700 border-blue-500 z-10'
                                  : 'bg-white text-gray-500 hover:bg-gray-50'
                              } border border-gray-300`}
                            >
                              {page}
                            </button>
                          );
                        })}
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className={`relative inline-flex items-center rounded-r-md px-2 py-2 ${
                          currentPage === totalPages
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white text-gray-500 hover:bg-gray-50'
                        } border border-gray-300`}
                      >
                        <span className="sr-only">Próximo</span>
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Estatísticas rápidas */}
      {paginatedOrders.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm text-gray-600 gap-2">
            <span>Total de {processedOrders.length} pedido(s) encontrado(s)</span>
            <div className="flex flex-wrap gap-4">
              <span>Em Processo: {processedOrders.filter(o => o.status === 'in-progress').length}</span>
              <span>Concluídos: {processedOrders.filter(o => o.status === 'completed').length}</span>
              <span>Em Pausa: {processedOrders.filter(o => o.status === 'on-hold').length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <OrderModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        order={selectedOrder}
        mode={modalMode}
      />
      
      {/* Estilo para impressão */}
      <style jsx>{`
        @media print {
          @page {
            size: landscape;
            margin: 10mm;
          }
          body {
            font-size: 12pt;
          }
          .print\\:hidden {
            display: none !important;
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
