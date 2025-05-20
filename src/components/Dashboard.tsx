import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Package, Users, TrendingUp, Calendar, ArrowUp, ArrowDown, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useOrderStore } from '../store/orderStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, subDays, subMonths, startOfDay, endOfDay, isAfter, isBefore, differenceInDays, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Define os tipos de período para comparação
type DateRangeOption = '7days' | '30days' | '90days' | 'thisMonth' | 'thisYear' | 'custom';

// Interface para os KPIs com comparação
interface KpiData {
  current: number;
  previous: number;
  percentChange: number;
}

// Interface para dados de produção mensal
interface MonthlyProductionData {
  month: string;
  producao: number;
  sortDate: number; // Usado para ordenação
}

// Interface para dados de produção por cliente
interface ClientProductionData {
  month: string;
  sortDate: number; // Usado para ordenação
  [customer: string]: any;
}

const COLORS = [
  '#3366CC', // deep blue
  '#DC3912', // red
  '#FF9900', // orange
  '#109618', // green
  '#990099', // purple
  '#0099C6', // turquoise
  '#DD4477', // pink
  '#66AA00', // light green
  '#B82E2E', // brick red
  '#316395', // dark blue
  '#994499', // dark purple
  '#22AA99', // sea green
  '#AAAA11', // olive
  '#6633CC', // purple-blue
  '#E67300', // dark orange
  '#329262', // blue-green
  '#5574A6', // slate blue
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const { orders, subscribeToOrders } = useOrderStore();
  
  // Estados para filtros de data
  const [dateRange, setDateRange] = useState<DateRangeOption>('30days');
  const [startDate, setStartDate] = useState<Date>(() => subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<string>(format(startDate, 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(endDate, 'yyyy-MM-dd'));
  
  // Estado para dados filtrados
  const [filteredOrders, setFilteredOrders] = useState(orders);
  const [completedOrders, setCompletedOrders] = useState(orders.filter(o => o.status === 'completed' || o.completedDate));
  
  // Estados para KPIs com comparação
  const [activeOrdersKpi, setActiveOrdersKpi] = useState<KpiData>({ current: 0, previous: 0, percentChange: 0 });
  const [uniqueCustomersKpi, setUniqueCustomersKpi] = useState<KpiData>({ current: 0, previous: 0, percentChange: 0 });
  const [totalWeightKpi, setTotalWeightKpi] = useState<KpiData>({ current: 0, previous: 0, percentChange: 0 });
  const [completedOrdersKpi, setCompletedOrdersKpi] = useState<KpiData>({ current: 0, previous: 0, percentChange: 0 });
  
  // Estado para alertas de pedidos
  const [lateOrders, setLateOrders] = useState<typeof orders>([]);
  const [upcomingDeadlineOrders, setUpcomingDeadlineOrders] = useState<typeof orders>([]);

  // Estados para dados de gráficos
  const [customerMonthlyData, setCustomerMonthlyData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToOrders();
    return () => unsubscribe();
  }, []);

  // Efeito para atualizar os dados quando os filtros mudarem
  useEffect(() => {
    applyDateRange(dateRange);
  }, [orders, dateRange]);

  // Efeito para verificar pedidos com alerta
  useEffect(() => {
    const today = new Date();
    
    // Late orders: past deadline and not completed
    const late = orders.filter(order => {
      const deadline = new Date(order.deliveryDate);
      return isBefore(deadline, today) && 
             order.status !== 'completed' &&
             !order.completedDate;
    });
    
    // Upcoming deadlines: within 7 days and not completed
    const upcoming = orders.filter(order => {
      const deadline = new Date(order.deliveryDate);
      const daysUntilDeadline = differenceInDays(deadline, today);
      return daysUntilDeadline >= 0 && 
             daysUntilDeadline <= 7 && 
             order.status !== 'completed' &&
             !order.completedDate;
    });
    
    setLateOrders(late);
    setUpcomingDeadlineOrders(upcoming);

    // Also update completed orders
    setCompletedOrders(orders.filter(o => o.status === 'completed' || o.completedDate));
  }, [orders]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
      navigate('/');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  // Função para aplicar filtros de data
  const applyDateRange = (range: DateRangeOption) => {
    let start: Date;
    let end = new Date();
    
    switch(range) {
      case '7days':
        start = subDays(new Date(), 7);
        break;
      case '30days':
        start = subDays(new Date(), 30);
        break;
      case '90days':
        start = subDays(new Date(), 90);
        break;
      case 'thisMonth':
        start = new Date();
        start.setDate(1);
        break;
      case 'thisYear':
        start = new Date();
        start.setMonth(0, 1);
        break;
      case 'custom':
        start = customStartDate ? new Date(customStartDate) : subDays(new Date(), 30);
        end = customEndDate ? new Date(customEndDate) : new Date();
        break;
      default:
        start = subDays(new Date(), 30);
    }
    
    // Garantir que temos início e fim do dia para comparação precisa
    start = startOfDay(start);
    end = endOfDay(end);
    
    setStartDate(start);
    setEndDate(end);
    
    // Filtrar pedidos pelo período selecionado (baseado na data de INÍCIO)
    const filtered = orders.filter(order => {
      const orderDate = new Date(order.startDate);
      return !isBefore(orderDate, start) && !isAfter(orderDate, end);
    });
    
    // Also filter completed orders for the same period
    const completed = orders.filter(order => {
      const isCompleted = order.status === 'completed' || order.completedDate;
      if (!isCompleted) return false;
      
      const completionDate = order.completedDate ? new Date(order.completedDate) : new Date();
      return !isBefore(completionDate, start) && !isAfter(completionDate, end);
    });
    
    setFilteredOrders(filtered);
    setCompletedOrders(completed);
    
    // Calcular KPIs para o período atual
    const currentActiveOrders = filtered.filter(o => o.status !== 'completed' && !o.completedDate).length;
    const currentCompletedOrders = completed.length;
    const currentUniqueCustomers = new Set(filtered.map(order => order.customer)).size;
    const currentTotalWeight = filtered.reduce((sum, order) => sum + order.totalWeight, 0);
    
    // Calcular período anterior (mesmo tamanho que o período atual)
    const daysDiff = differenceInDays(end, start) || 1;
    const previousEnd = new Date(start);
    previousEnd.setHours(0, 0, 0, -1); // Um dia antes do início do período atual
    const previousStart = subDays(previousEnd, daysDiff);
    
    // Filtrar pedidos do período anterior
    const previousFiltered = orders.filter(order => {
      const orderDate = new Date(order.startDate);
      return !isBefore(orderDate, previousStart) && !isAfter(orderDate, previousEnd);
    });
    
    const previousCompleted = orders.filter(order => {
      const isCompleted = order.status === 'completed' || order.completedDate;
      if (!isCompleted) return false;
      
      const completionDate = order.completedDate ? new Date(order.completedDate) : new Date();
      return !isBefore(completionDate, previousStart) && !isAfter(completionDate, previousEnd);
    });
    
    // Calcular KPIs para o período anterior
    const previousActiveOrders = previousFiltered.filter(o => o.status !== 'completed' && !o.completedDate).length;
    const previousCompletedOrders = previousCompleted.length;
    const previousUniqueCustomers = new Set(previousFiltered.map(order => order.customer)).size;
    const previousTotalWeight = previousFiltered.reduce((sum, order) => sum + order.totalWeight, 0);
    
    // Calcular percentual de mudança
    const calcPercentChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    
    setActiveOrdersKpi({
      current: currentActiveOrders,
      previous: previousActiveOrders,
      percentChange: calcPercentChange(currentActiveOrders, previousActiveOrders)
    });
    
    setCompletedOrdersKpi({
      current: currentCompletedOrders,
      previous: previousCompletedOrders,
      percentChange: calcPercentChange(currentCompletedOrders, previousCompletedOrders)
    });
    
    setUniqueCustomersKpi({
      current: currentUniqueCustomers,
      previous: previousUniqueCustomers,
      percentChange: calcPercentChange(currentUniqueCustomers, previousUniqueCustomers)
    });
    
    setTotalWeightKpi({
      current: currentTotalWeight,
      previous: previousTotalWeight,
      percentChange: calcPercentChange(currentTotalWeight, previousTotalWeight)
    });

    // Prepare data for customer by month bar chart
    prepareCustomerMonthlyData(filtered);
    
    // Prepare data for status pie chart
    prepareStatusData();
  };

  // Prepare data for customer by month bar chart
  const prepareCustomerMonthlyData = (ordersData: typeof orders) => {
    // Step 1: Group by month and customer
    const monthlyCustomerData: Record<string, Record<string, number>> = {};

    ordersData.forEach(order => {
      const date = new Date(order.deliveryDate);
      const monthKey = format(date, 'MMM/yyyy', { locale: ptBR });
      const customer = order.customer;
      
      if (!monthlyCustomerData[monthKey]) {
        monthlyCustomerData[monthKey] = {};
      }
      
      if (!monthlyCustomerData[monthKey][customer]) {
        monthlyCustomerData[monthKey][customer] = 0;
      }
      
      monthlyCustomerData[monthKey][customer] += order.totalWeight;
    });

    // Step 2: Convert to array format for chart
    const chartData: any[] = Object.entries(monthlyCustomerData).map(([month, customers]) => {
      const sortDate = getMonthSortValue(month);
      return {
        month,
        sortDate,
        ...customers
      };
    });

    // Step 3: Sort by date
    chartData.sort((a, b) => a.sortDate - b.sortDate);
    
    setCustomerMonthlyData(chartData);
  };

  // Prepare data for status pie chart
  const prepareStatusData = () => {
    const statusCounts: Record<string, number> = {
      'completed': completedOrders.length,
      'in-progress': orders.filter(o => o.status === 'in-progress').length,
      'delayed': orders.filter(o => o.status === 'delayed').length,
      'waiting-docs': orders.filter(o => o.status === 'waiting-docs').length,
      'ready': orders.filter(o => o.status === 'ready').length,
      'urgent': orders.filter(o => o.status === 'urgent').length,
    };
    
    const statusColors: Record<string, string> = {
      'completed': '#10B981', // green
      'in-progress': '#F97316', // orange
      'delayed': '#EF4444', // red
      'waiting-docs': '#F59E0B', // amber
      'ready': '#3B82F6', // blue
      'urgent': '#8B5CF6', // purple
    };
    
    const statusLabels: Record<string, string> = {
      'completed': 'Concluídos',
      'in-progress': 'Em Processo',
      'delayed': 'Atrasados',
      'waiting-docs': 'Aguardando Docs',
      'ready': 'Prontos',
      'urgent': 'Urgentes',
    };
    
    const data = Object.entries(statusCounts)
      .filter(([_, count]) => count > 0)
      .map(([status, count]) => ({
        name: statusLabels[status],
        value: count,
        color: statusColors[status]
      }));
    
    setStatusData(data);
  };

  // Aplicar filtros personalizados
  const applyCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      setDateRange('custom');
    }
  };

  // Format number with dots for thousands and comma for decimals
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Função auxiliar para obter um valor numérico para ordenar meses
  const getMonthSortValue = (monthStr: string): number => {
    const [monthAbbr, yearStr] = monthStr.split('/');
    
    // Map month abbreviations to numeric values (1-12)
    const monthMap: Record<string, number> = {
      'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
      'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
    };
    
    const month = monthMap[monthAbbr.toLowerCase()] || 1;
    const year = parseInt(yearStr) || new Date().getFullYear();
    
    // Create a sortable value (year * 100 + month)
    return (year * 100) + month;
  };

  // Prepare data for charts based on delivery date (not start date)
  const getMonthlyProductionByDeliveryDate = () => {
    // Group orders by delivery month
    const monthlyProduction: Record<string, number> = {};
    
    orders.forEach(order => {
      // Use delivery date instead of start date
      const deliveryDate = new Date(order.deliveryDate);
      const month = format(deliveryDate, 'MMM', { locale: ptBR });
      const year = deliveryDate.getFullYear();
      const key = `${month}/${year}`;
      
      monthlyProduction[key] = (monthlyProduction[key] || 0) + order.totalWeight;
    });
    
    // Convert to array for chart
    const productionArray: MonthlyProductionData[] = Object.entries(monthlyProduction).map(([month, producao]) => ({
      month,
      producao,
      sortDate: getMonthSortValue(month)
    }));

    // Sort by date (chronologically)
    return productionArray.sort((a, b) => a.sortDate - b.sortDate);
  };

  // Generate production data for the chart
  const productionData = getMonthlyProductionByDeliveryDate();

  // Renderiza indicador de comparação de KPI
  const renderKpiComparison = (percentChange: number) => {
    if (Math.abs(percentChange) < 0.5) return null;
    
    const isPositive = percentChange > 0;
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    const Icon = isPositive ? ArrowUp : ArrowDown;
    
    return (
      <div className={`flex items-center ${color} text-sm ml-1`}>
        <Icon className="h-4 w-4 mr-1" />
        <span>{Math.abs(percentChange).toFixed(1)}%</span>
      </div>
    );
  };

  // Get all unique customers for the chart
  const getUniqueCustomers = () => {
    return [...new Set(orders.map(order => order.customer))];
  };

  // Generate customer-specific colors for better visualization
  const getCustomerColor = (customer: string, index: number): string => {
    // Use preset colors for better visibility
    return COLORS[index % COLORS.length];
  };

  const uniqueCustomers = getUniqueCustomers();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-800">Sistema de Monitoramento</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
              >
                <LogOut className="h-5 w-5" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Filtros de Data */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-blue-600" />
            Filtros de Período
          </h2>
          
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex space-x-2">
              <button 
                onClick={() => setDateRange('7days')}
                className={`px-3 py-1 rounded-md ${dateRange === '7days' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Últimos 7 dias
              </button>
              <button 
                onClick={() => setDateRange('30days')}
                className={`px-3 py-1 rounded-md ${dateRange === '30days' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Últimos 30 dias
              </button>
              <button 
                onClick={() => setDateRange('90days')}
                className={`px-3 py-1 rounded-md ${dateRange === '90days' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Últimos 90 dias
              </button>
              <button 
                onClick={() => setDateRange('thisMonth')}
                className={`px-3 py-1 rounded-md ${dateRange === 'thisMonth' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Este Mês
              </button>
              <button 
                onClick={() => setDateRange('thisYear')}
                className={`px-3 py-1 rounded-md ${dateRange === 'thisYear' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Este Ano
              </button>
            </div>
            
            {/* Seletor de datas personalizadas */}
            <div className="flex items-center space-x-2 ml-auto">
              <div>
                <input 
                  type="date" 
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                />
              </div>
              <span>até</span>
              <div>
                <input 
                  type="date" 
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                />
              </div>
              <button 
                onClick={applyCustomDateRange}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Aplicar
              </button>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            Exibindo dados de {format(startDate, 'dd/MM/yyyy', { locale: ptBR })} até {format(endDate, 'dd/MM/yyyy', { locale: ptBR })}
          </div>
        </div>

        {/* Alertas de Pedidos */}
        {(lateOrders.length > 0 || upcomingDeadlineOrders.length > 0) && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Pedidos que Requerem Atenção</h2>
            
            {lateOrders.length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg shadow-md p-4 mb-4">
                <div className="flex items-center mb-2">
                  <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
                  <h3 className="text-lg font-semibold text-red-800">Pedidos Atrasados</h3>
                </div>
                
                <div className="mt-2 space-y-2">
                  {lateOrders.slice(0, 5).map(order => (
                    <div key={order.id} className="flex justify-between items-center p-2 bg-white rounded border border-red-200">
                      <div>
                        <span className="font-medium">#{order.orderNumber}</span>
                        <span className="text-gray-600 ml-2">{order.customer}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-red-600 text-sm">
                          {Math.abs(differenceInDays(new Date(order.deliveryDate), new Date()))} dias atrasado
                        </span>
                        <button 
                          onClick={() => navigate('/orders')}
                          className="ml-4 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Ver Detalhes
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {lateOrders.length > 5 && (
                    <div className="text-center text-sm mt-2">
                      <button 
                        onClick={() => navigate('/orders')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Ver todos os {lateOrders.length} pedidos atrasados
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {upcomingDeadlineOrders.length > 0 && (
              <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-lg shadow-md p-4">
                <div className="flex items-center mb-2">
                  <Clock className="h-6 w-6 text-yellow-600 mr-2" />
                  <h3 className="text-lg font-semibold text-yellow-800">Prazo de Entrega Próximo</h3>
                </div>
                
                <div className="mt-2 space-y-2">
                  {upcomingDeadlineOrders.slice(0, 5).map(order => (
                    <div key={order.id} className="flex justify-between items-center p-2 bg-white rounded border border-yellow-200">
                      <div>
                        <span className="font-medium">#{order.orderNumber}</span>
                        <span className="text-gray-600 ml-2">{order.customer}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-yellow-600 text-sm">
                          {differenceInDays(new Date(order.deliveryDate), new Date())} dias restantes
                        </span>
                        <button 
                          onClick={() => navigate('/orders')}
                          className="ml-4 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Ver Detalhes
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {upcomingDeadlineOrders.length > 5 && (
                    <div className="text-center text-sm mt-2">
                      <button 
                        onClick={() => navigate('/orders')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Ver todos os {upcomingDeadlineOrders.length} pedidos com prazo próximo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed Orders Section */}
        {completedOrders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Pedidos Expedidos Recentemente</h2>
            
            <div className="bg-green-50 border-l-4 border-green-500 rounded-lg shadow-md p-4">
              <div className="flex items-center mb-2">
                <CheckCircle className="h-6 w-6 text-green-600 mr-2" />
                <h3 className="text-lg font-semibold text-green-800">Pedidos Concluídos</h3>
              </div>
              
              <div className="mt-2 space-y-2">
                {completedOrders.slice(0, 5).map(order => {
                  const completionDate = order.completedDate ? new Date(order.completedDate) : new Date();
                  const deliveryDate = new Date(order.deliveryDate);
                  const daysDiff = differenceInDays(completionDate, deliveryDate);
                  
                  return (
                    <div key={order.id} className="flex justify-between items-center p-2 bg-white rounded border border-green-200">
                      <div>
                        <span className="font-medium">#{order.orderNumber}</span>
                        <span className="text-gray-600 ml-2">{order.customer}</span>
                      </div>
                      <div className="flex items-center">
                        <span className={`text-sm ${
                          daysDiff > 0 ? 'text-orange-600' : 
                          daysDiff < 0 ? 'text-green-600' : 
                          'text-blue-600'
                        }`}>
                          {daysDiff === 0 ? 'No prazo' : 
                           daysDiff > 0 ? `${daysDiff} dias após o prazo` : 
                           `${Math.abs(daysDiff)} dias antes do prazo`}
                        </span>
                        <button 
                          onClick={() => navigate('/orders')}
                          className="ml-4 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Ver Detalhes
                        </button>
                      </div>
                    </div>
                  );
                })}
                
                {completedOrders.length > 5 && (
                  <div className="text-center text-sm mt-2">
                    <button 
                      onClick={() => navigate('/orders')}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Ver todos os {completedOrders.length} pedidos concluídos
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Card 1 - Pedidos em Produção */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Pedidos em Produção</h2>
              <Package className="h-6 w-6 text-blue-500" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-gray-900">{activeOrdersKpi.current}</p>
              <div className="flex items-center">
                {renderKpiComparison(activeOrdersKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Comparado a {activeOrdersKpi.previous} pedidos no período anterior
            </p>
          </div>

          {/* Card 2 - Pedidos Concluídos */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Pedidos Concluídos</h2>
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-gray-900">{completedOrdersKpi.current}</p>
              <div className="flex items-center">
                {renderKpiComparison(completedOrdersKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Comparado a {completedOrdersKpi.previous} no período anterior
            </p>
          </div>

          {/* Card 3 - Total de Clientes */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Total de Clientes</h2>
              <Users className="h-6 w-6 text-green-500" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-gray-900">{uniqueCustomersKpi.current}</p>
              <div className="flex items-center">
                {renderKpiComparison(uniqueCustomersKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Comparado a {uniqueCustomersKpi.previous} clientes no período anterior
            </p>
          </div>

          {/* Card 4 - Produção Total */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Produção Total</h2>
              <TrendingUp className="h-6 w-6 text-purple-500" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-gray-900">{formatNumber(totalWeightKpi.current)}kg</p>
              <div className="flex items-center">
                {renderKpiComparison(totalWeightKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Comparado a {formatNumber(totalWeightKpi.previous)}kg no período anterior
            </p>
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Gráfico de Status dos Pedidos */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Status dos Pedidos</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, 'Quantidade']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Gráfico de Produção Mensal */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Produção Mensal (por Data de Entrega)</h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => formatNumber(value)} />
                  <Tooltip 
                    formatter={(value: number) => [formatNumber(value), 'Produção (kg)']}
                  />
                  <Legend />
                  <Bar dataKey="producao" fill="#3B82F6" name="Produção (kg)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de Produção por Cliente por Mês */}
          <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Produção por Cliente (por Mês)</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => formatNumber(value)} />
                  <Tooltip 
                    formatter={(value: number) => [formatNumber(value), 'Produção (kg)']}
                  />
                  <Legend />
                  {uniqueCustomers.map((customer, index) => (
                    <Bar 
                      key={customer}
                      dataKey={customer} 
                      name={customer} 
                      fill={getCustomerColor(customer, index)} 
                      stackId="a"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-gray-600 mt-4 text-center">
              Produção em kg por cliente, agrupada por mês (empilhada)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;