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
  '#4B5563', // cinza slate
  '#6B7280', // cinza
  '#9CA3AF', // cinza claro
  '#D1D5DB', // cinza mais claro
  '#60A5FA', // azul suave
  '#34D399', // verde suave
  '#FBBF24', // amarelo suave
  '#F87171', // vermelho suave
  '#A78BFA', // roxo suave
  '#2DD4BF', // turquesa suave
  '#818CF8', // índigo suave
  '#FB923C', // laranja suave
  '#94A3B8', // slate suave
  '#38BDF8', // azul céu suave
  '#4ADE80', // verde esmeralda suave
  '#FCD34D', // amarelo âmbar suave
  '#FB7185', // rosa suave
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
  const [deliveryKpi, setDeliveryKpi] = useState({ total: 0, onTime: 0, percent: 0 });
  
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

  useEffect(() => {
    const allItems = orders.flatMap(order => 
      order.items?.map(item => ({
        ...item,
        deliveryDate: item.deliveryDate || order.deliveryDate,
        finishedDate: item.finishedDate || order.completedDate
      })) || []
    );

    const finalizados = allItems.filter(item => item.overallProgress === 100 && item.finishedDate);
    const noPrazo = finalizados.filter(item => {
      if (!item.finishedDate || !item.deliveryDate) return false;
      return new Date(item.finishedDate) <= new Date(item.deliveryDate);
    });

    const percent = finalizados.length > 0 ? (noPrazo.length / finalizados.length) * 100 : 0;

    setDeliveryKpi({
      total: finalizados.length,
      onTime: noPrazo.length,
      percent: parseFloat(percent.toFixed(1))
    });
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
    const color = isPositive ? 'text-green-400' : 'text-red-400';
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Navbar */}
      <nav className="bg-gray-900/50 backdrop-blur-lg border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">Sistema de Monitoramento</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-300">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
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
        <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl shadow-xl p-6 mb-8 border border-gray-700/50">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-blue-400" />
            Filtros de Período
          </h2>
          
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setDateRange('7days')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  dateRange === '7days' 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Últimos 7 dias
              </button>
              <button 
                onClick={() => setDateRange('30days')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  dateRange === '30days' 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Últimos 30 dias
              </button>
              <button 
                onClick={() => setDateRange('90days')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  dateRange === '90days' 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Últimos 90 dias
              </button>
              <button 
                onClick={() => setDateRange('thisMonth')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  dateRange === 'thisMonth' 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Este Mês
              </button>
              <button 
                onClick={() => setDateRange('thisYear')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  dateRange === 'thisYear' 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Este Ano
              </button>
            </div>
            
            {/* Seletor de datas personalizadas */}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <div>
                <input 
                  type="date" 
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-lg bg-gray-700/50 border-gray-600 text-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-500/25"
                />
              </div>
              <span className="text-gray-400">até</span>
              <div>
                <input 
                  type="date" 
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-lg bg-gray-700/50 border-gray-600 text-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-500/25"
                />
              </div>
              <button 
                onClick={applyCustomDateRange}
                className="px-4 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
              >
                Aplicar
              </button>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-gray-400">
            Exibindo dados de {format(startDate, 'dd/MM/yyyy', { locale: ptBR })} até {format(endDate, 'dd/MM/yyyy', { locale: ptBR })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {/* Card 1 - Pedidos em Produção */}
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl shadow-xl p-6 border border-gray-700/50 hover:border-gray-600/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Pedidos em Produção</h2>
              <Package className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-white">{activeOrdersKpi.current}</p>
              <div className="flex items-center">
                {renderKpiComparison(activeOrdersKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Comparado a {activeOrdersKpi.previous} pedidos no período anterior
            </p>
          </div>

          {/* Card 2 - Pedidos Concluídos */}
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl shadow-xl p-6 border border-gray-700/50 hover:border-gray-600/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Pedidos Concluídos</h2>
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-white">{completedOrdersKpi.current}</p>
              <div className="flex items-center">
                {renderKpiComparison(completedOrdersKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Comparado a {completedOrdersKpi.previous} no período anterior
            </p>
          </div>

          {/* Card 3 - Total de Clientes */}
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl shadow-xl p-6 border border-gray-700/50 hover:border-gray-600/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Total de Clientes</h2>
              <Users className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-white">{uniqueCustomersKpi.current}</p>
              <div className="flex items-center">
                {renderKpiComparison(uniqueCustomersKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Comparado a {uniqueCustomersKpi.previous} clientes no período anterior
            </p>
          </div>

          {/* Card 4 - Produção Total */}
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl shadow-xl p-6 border border-gray-700/50 hover:border-gray-600/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Produção Total</h2>
              <TrendingUp className="h-6 w-6 text-purple-400" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-white">{formatNumber(totalWeightKpi.current)}kg</p>
              <div className="flex items-center">
                {renderKpiComparison(totalWeightKpi.percentChange)}
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Comparado a {formatNumber(totalWeightKpi.previous)}kg no período anterior
            </p>
          </div>

          {/* Card 5 - Entregas no Prazo (Itens) */}
          <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl shadow-xl p-6 border border-gray-700/50 hover:border-gray-600/50 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Entregas no Prazo</h2>
              <CheckCircle className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex justify-between items-center">
              <p className="text-3xl font-bold text-white">{deliveryKpi.percent.toFixed(1)}%</p>
              <p className="text-sm text-gray-400">{deliveryKpi.onTime} de {deliveryKpi.total} itens</p>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Considerando apenas itens 100% expedidos
            </p>
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Gráfico de Status dos Pedidos */}
          <div className="bg-gray-800/50 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Status dos Pedidos</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="45%"
                    labelLine={true}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={130}
                    innerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {statusData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        stroke="rgba(31, 41, 55, 0.5)"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => [value, 'Quantidade']}
                    contentStyle={{ 
                      backgroundColor: 'rgba(31, 41, 55, 0.9)',
                      border: '1px solid rgba(75, 85, 99, 0.5)',
                      borderRadius: '0.5rem',
                      color: 'white',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend 
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    formatter={(value) => <span className="text-gray-300">{value}</span>}
                    wrapperStyle={{
                      right: 0,
                      top: '50%',
                      transform: 'translateY(-50%)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Gráfico de Produção Mensal */}
          <div className="bg-gray-800/50 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-gray-700/50">
            <h2 className="text-lg font-semibold text-white mb-4">Produção Mensal (por Data de Entrega)</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" />
                  <XAxis 
                    dataKey="month" 
                    stroke="rgba(156, 163, 175, 1)"
                    tick={{ fill: '#9CA3AF' }}
                    axisLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
                  />
                  <YAxis 
                    tickFormatter={(value) => formatNumber(value)} 
                    stroke="rgba(156, 163, 175, 1)"
                    tick={{ fill: '#9CA3AF' }}
                    axisLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
                    width={80}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatNumber(value), 'Produção (kg)']}
                    contentStyle={{ 
                      backgroundColor: 'rgba(31, 41, 55, 0.9)',
                      border: '1px solid rgba(75, 85, 99, 0.5)',
                      borderRadius: '0.5rem',
                      color: 'white',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    formatter={(value) => <span className="text-gray-300">{value}</span>}
                    wrapperStyle={{
                      paddingBottom: '20px'
                    }}
                  />
                  <Bar 
                    dataKey="producao" 
                    fill="#60A5FA" 
                    name="Produção (kg)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={50}
                    label={{ 
                      position: 'top',
                      fill: '#9CA3AF',
                      fontSize: 12,
                      formatter: (value: number) => formatNumber(value)
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico de Produção por Cliente por Mês */}
          <div className="bg-gray-800/50 backdrop-blur-lg p-6 rounded-xl shadow-xl border border-gray-700/50 md:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4">Produção por Cliente (por Mês)</h2>
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={customerMonthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(75, 85, 99, 0.3)" />
                  <XAxis 
                    dataKey="month" 
                    stroke="rgba(156, 163, 175, 1)"
                    tick={{ fill: '#9CA3AF' }}
                    axisLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
                  />
                  <YAxis 
                    tickFormatter={(value) => formatNumber(value)} 
                    stroke="rgba(156, 163, 175, 1)"
                    tick={{ fill: '#9CA3AF' }}
                    axisLine={{ stroke: 'rgba(75, 85, 99, 0.5)' }}
                    width={80}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatNumber(value), 'Produção (kg)']}
                    contentStyle={{ 
                      backgroundColor: 'rgba(31, 41, 55, 0.9)',
                      border: '1px solid rgba(75, 85, 99, 0.5)',
                      borderRadius: '0.5rem',
                      color: 'white',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend 
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    formatter={(value) => <span className="text-gray-300">{value}</span>}
                    wrapperStyle={{
                      right: 0,
                      top: '50%',
                      transform: 'translateY(-50%)'
                    }}
                  />
                  {uniqueCustomers.map((customer, index) => (
                    <Bar 
                      key={customer}
                      dataKey={customer} 
                      name={customer} 
                      fill={getCustomerColor(customer, index)} 
                      stackId="a"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={50}
                      label={{ 
                        position: 'top',
                        fill: '#9CA3AF',
                        fontSize: 12,
                        formatter: (value: number) => formatNumber(value)
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-gray-400 mt-4 text-center">
              Produção em kg por cliente, agrupada por mês (empilhada)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;