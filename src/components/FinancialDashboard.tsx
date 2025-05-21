import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { format, startOfYear, endOfYear, eachMonthOfInterval, isAfter, isBefore, addDays, differenceInDays, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, FileSpreadsheet, ArrowLeft, Search, DollarSign, Users, Package, Calendar, Truck, AlertTriangle, TrendingUp, BarChart as ChartBar, BarChart2, Activity, Calculator, PieChart as PieChartIcon, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Order } from '../types/kanban';
import { Customer } from '../types/customer';
import { useOrderStore } from '../store/orderStore';
import { calculateOrderProgress } from '../utils/progress';
import { useSettingsStore } from '../store/settingsStore';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Assume these default margins for products if not specified
const DEFAULT_MARGINS = {
  'Premium': 0.35,  // 35% margin
  'Padrão': 0.25,   // 25% margin
  'Ocasional': 0.20, // 20% margin
  'Novo': 0.15,     // 15% margin
  'default': 0.22   // Default 22% margin
};

// Colors for pie charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const FinancialDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orders } = useOrderStore();
  const { companyLogo } = useSettingsStore();
  
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'overview' | 'projections' | 'profitability' | 'cashflow'>('overview');
  
  // General financial data
  const [yearlyData, setYearlyData] = useState({
    totalBilled: 0,
    totalPending: 0
  });
  
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerStats, setCustomerStats] = useState({
    totalOrders: 0,
    totalValue: 0,
    averageOrderValue: 0,
    lateOrdersCount: 0,
    upcomingDeliveries: 0
  });
  
  // For customer charts
  const [orderCountByMonth, setOrderCountByMonth] = useState<any[]>([]);
  const [valueByMonth, setValueByMonth] = useState<any[]>([]);

  // Future projections data
  const [projectionData, setProjectionData] = useState<any[]>([]);
  const [projectionSummary, setProjectionSummary] = useState({
    totalProjected: 0,
    next30Days: 0,
    next90Days: 0,
    next12Months: 0
  });
  
  // Profitability analysis data
  const [profitabilityByCustomer, setProfitabilityByCustomer] = useState<any[]>([]);
  const [profitabilityByProduct, setProfitabilityByProduct] = useState<any[]>([]);
  const [topProfitableProducts, setTopProfitableProducts] = useState<any[]>([]);
  const [marginSummary, setMarginSummary] = useState({
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    averageMargin: 0
  });

  // Cash flow data
  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  const [cashFlowSummary, setCashFlowSummary] = useState({
    currentMonthInflow: 0,
    currentMonthOutflow: 0,
    nextMonthProjected: 0,
    totalPositiveFlow: 0,
    totalNegativeFlow: 0
  });

  // For customer charts
  const [showCostInfo, setShowCostInfo] = useState(false);
  const [costPercentage, setCostPercentage] = useState(0.7); // Default: costs are 70% of price

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    const yearStart = startOfYear(new Date());
    const yearEnd = endOfYear(new Date());
    
    // Create array of all months in the year
    const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });
    
    // Initialize monthly data
    const monthlyStats = months.map(month => ({
      month: format(month, 'MMM', { locale: ptBR }),
      billed: 0,
      pending: 0
    }));

    let totalBilled = 0;
    let totalPending = 0;

    orders.forEach(order => {
      // Calculate total value for each item
      order.items.forEach(item => {
        const itemProgress = calculateOrderProgress([item]);
        const itemValue = item.totalPrice;

        // Add to yearly totals based on item progress
        if (itemProgress === 100) {
          totalBilled += itemValue;
        } else {
          totalPending += itemValue;
        }

        // Add to monthly data
        const deliveryDate = new Date(order.deliveryDate);
        const monthIndex = deliveryDate.getMonth();
        
        if (deliveryDate.getFullYear() === currentYear) {
          if (itemProgress === 100) {
            monthlyStats[monthIndex].billed += itemValue;
          } else {
            monthlyStats[monthIndex].pending += itemValue;
          }
        }
      });
    });

    setYearlyData({ totalBilled, totalPending });
    setMonthlyData(monthlyStats);
    
    // Generate future projections
    generateProjections(orders);
    
    // Generate profitability data
    analyzeCustomerProfitability(orders, costPercentage);
    analyzeProductProfitability(orders, costPercentage);
    
    // Generate cash flow data
    generateCashFlowData(orders, costPercentage);
    
  }, [orders, costPercentage]);

  // Generate future revenue projections
  const generateProjections = (allOrders: Order[]) => {
    const now = new Date();
    const next12Months = Array.from({ length: 12 }, (_, i) => {
      const month = addMonths(now, i);
      return {
        month: format(month, 'MMM yy', { locale: ptBR }),
        projected: 0,
        confirmed: 0,
        date: month
      };
    });
    
    let totalProjected = 0;
    let next30DaysRevenue = 0;
    let next90DaysRevenue = 0;
    let next12MonthsRevenue = 0;

    // Filter out completed orders
    const activeOrders = allOrders.filter(order => 
      order.status !== 'completed' && !order.deleted
    );
    
    // Calculate projected revenue for each month
    activeOrders.forEach(order => {
      const deliveryDate = new Date(order.deliveryDate);
      
      // Skip if delivery date is in the past
      if (isBefore(deliveryDate, now) && order.status !== 'delayed') {
        return;
      }
      
      const monthIndex = differenceInDays(deliveryDate, now) < 0 
        ? 0 // If delayed, put in current month
        : Math.min(11, Math.floor(differenceInDays(deliveryDate, now) / 30));
      
      let orderValue = 0;
      order.items.forEach(item => {
        orderValue += item.totalPrice;
      });
      
      // Add to the right month
      const isConfirmed = order.status === 'ready' || 
                        differenceInDays(deliveryDate, now) < 7;
      
      next12Months[monthIndex].projected += orderValue;
      
      if (isConfirmed) {
        next12Months[monthIndex].confirmed += orderValue;
      }
      
      // Add to summary statistics
      totalProjected += orderValue;
      
      if (differenceInDays(deliveryDate, now) <= 30) {
        next30DaysRevenue += orderValue;
      }
      
      if (differenceInDays(deliveryDate, now) <= 90) {
        next90DaysRevenue += orderValue;
      }
      
      next12MonthsRevenue += orderValue;
    });
    
    setProjectionData(next12Months);
    setProjectionSummary({
      totalProjected,
      next30Days: next30DaysRevenue,
      next90Days: next90DaysRevenue,
      next12Months: next12MonthsRevenue
    });
  };
  
  // Analyze profitability by customer
  const analyzeCustomerProfitability = (allOrders: Order[], costPerc: number) => {
    const customerMap: Map<string, { 
      revenue: number, 
      cost: number,
      profit: number,
      margin: number,
      orderCount: number
    }> = new Map();
    
    let totalRevenue = 0;
    let totalCost = 0;
    
    allOrders.forEach(order => {
      if (order.deleted) return;
      
      let orderRevenue = 0;
      let orderCost = 0;
      
      order.items.forEach(item => {
        orderRevenue += item.totalPrice;
        
        // Estimate cost based on customer category or default margin
        const customer = customers.find(c => c.name === order.customer);
        const marginPercent = customer?.category 
          ? DEFAULT_MARGINS[customer.category as keyof typeof DEFAULT_MARGINS] || DEFAULT_MARGINS.default
          : DEFAULT_MARGINS.default;
          
        // Calculate estimated cost: price / (1 + margin)
        const estimatedCost = item.totalPrice * costPerc;
        orderCost += estimatedCost;
      });
      
      totalRevenue += orderRevenue;
      totalCost += orderCost;
      
      // Add to customer map
      if (customerMap.has(order.customer)) {
        const current = customerMap.get(order.customer)!;
        customerMap.set(order.customer, {
          revenue: current.revenue + orderRevenue,
          cost: current.cost + orderCost,
          profit: current.profit + (orderRevenue - orderCost),
          margin: (current.revenue + orderRevenue - current.cost - orderCost) / (current.revenue + orderRevenue),
          orderCount: current.orderCount + 1
        });
      } else {
        customerMap.set(order.customer, {
          revenue: orderRevenue,
          cost: orderCost,
          profit: orderRevenue - orderCost,
          margin: (orderRevenue - orderCost) / orderRevenue,
          orderCount: 1
        });
      }
    });
    
    // Convert map to array for chart
    const customerProfitability = Array.from(customerMap.entries())
      .map(([customer, data]) => ({
        customer,
        revenue: data.revenue,
        profit: data.profit,
        margin: data.margin,
        orderCount: data.orderCount
      }))
      .sort((a, b) => b.profit - a.profit);
    
    setProfitabilityByCustomer(customerProfitability);
    
    setMarginSummary({
      totalRevenue,
      totalCost,
      totalProfit: totalRevenue - totalCost,
      averageMargin: totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0
    });
  };
  
  // Analyze profitability by product type
  const analyzeProductProfitability = (allOrders: Order[], costPerc: number) => {
    const productMap: Map<string, { 
      revenue: number,
      cost: number,
      profit: number,
      margin: number,
      quantity: number
    }> = new Map();
    
    allOrders.forEach(order => {
      if (order.deleted) return;
      
      order.items.forEach(item => {
        const productCode = item.code;
        const revenue = item.totalPrice;
        
        // Estimate cost based on customer category or default margin
        const customer = customers.find(c => c.name === order.customer);
        const marginPercent = customer?.category 
          ? DEFAULT_MARGINS[customer.category as keyof typeof DEFAULT_MARGINS] || DEFAULT_MARGINS.default
          : DEFAULT_MARGINS.default;
          
        // Calculate estimated cost based on current cost percentage
        const cost = revenue * costPerc;
        const profit = revenue - cost;
        
        if (productMap.has(productCode)) {
          const current = productMap.get(productCode)!;
          productMap.set(productCode, {
            revenue: current.revenue + revenue,
            cost: current.cost + cost,
            profit: current.profit + profit,
            margin: (current.revenue + revenue - current.cost - cost) / (current.revenue + revenue),
            quantity: current.quantity + item.quantity
          });
        } else {
          productMap.set(productCode, {
            revenue,
            cost,
            profit,
            margin: profit / revenue,
            quantity: item.quantity
          });
        }
      });
    });
    
    // Convert map to array and sort by profit
    const productProfitability = Array.from(productMap.entries())
      .map(([code, data]) => ({
        code,
        revenue: data.revenue,
        cost: data.cost,
        profit: data.profit,
        margin: data.margin,
        quantity: data.quantity
      }))
      .sort((a, b) => b.profit - a.profit);
    
    setProfitabilityByProduct(productProfitability);
    
    // Extract top 5 most profitable products for pie chart
    const top5Products = productProfitability.slice(0, 5);
    const otherProducts = productProfitability.slice(5);
    
    const topProducts = [
      ...top5Products,
      {
        code: 'Outros',
        revenue: otherProducts.reduce((sum, p) => sum + p.revenue, 0),
        cost: otherProducts.reduce((sum, p) => sum + p.cost, 0),
        profit: otherProducts.reduce((sum, p) => sum + p.profit, 0),
        margin: 0,
        quantity: otherProducts.reduce((sum, p) => sum + p.quantity, 0)
      }
    ];
    
    setTopProfitableProducts(topProducts);
  };
  
  // Generate cash flow data
  const generateCashFlowData = (allOrders: Order[], costPerc: number) => {
    const now = new Date();
    const next12Months = Array.from({ length: 12 }, (_, i) => {
      const month = addMonths(now, i);
      return {
        month: format(month, 'MMM yy', { locale: ptBR }),
        inflow: 0,
        outflow: 0,
        netFlow: 0,
        date: month
      };
    });
    
    let currentMonthInflow = 0;
    let currentMonthOutflow = 0;
    let nextMonthProjected = 0;
    let totalPositiveFlow = 0;
    let totalNegativeFlow = 0;
    
    allOrders.forEach(order => {
      if (order.deleted) return;
      
      const deliveryDate = new Date(order.deliveryDate);
      const monthIndex = Math.min(11, Math.max(0, differenceInDays(deliveryDate, now) < 0 
        ? 0 // If in the past or current month, put in current month
        : Math.floor(differenceInDays(deliveryDate, now) / 30)));
      
      let orderRevenue = 0;
      let orderCost = 0;
      
      order.items.forEach(item => {
        orderRevenue += item.totalPrice;
        
        // Estimate cost based on provided cost percentage
        const estimatedCost = item.totalPrice * costPerc;
        orderCost += estimatedCost;
      });
      
      // Inflow on delivery date
      next12Months[monthIndex].inflow += orderRevenue;
      
      // Outflow (cost) is typically earlier - assume 30 days before delivery
      const costMonthIndex = Math.max(0, monthIndex - 1);
      next12Months[costMonthIndex].outflow += orderCost;
      
      // Update summary stats
      if (monthIndex === 0) {
        currentMonthInflow += orderRevenue;
      }
      
      if (costMonthIndex === 0) {
        currentMonthOutflow += orderCost;
      }
      
      if (monthIndex === 1) {
        nextMonthProjected += orderRevenue;
      }
    });
    
    // Calculate net flow and running totals
    next12Months.forEach(month => {
      month.netFlow = month.inflow - month.outflow;
      
      if (month.netFlow > 0) {
        totalPositiveFlow += month.netFlow;
      } else {
        totalNegativeFlow += Math.abs(month.netFlow);
      }
    });
    
    setCashFlowData(next12Months);
    setCashFlowSummary({
      currentMonthInflow,
      currentMonthOutflow,
      nextMonthProjected,
      totalPositiveFlow,
      totalNegativeFlow
    });
  };

  // Load customers
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, getCompanyCollection('customers')));
        const customersData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Customer[];
        
        // Calculate and update lifetime value for each customer
        const enrichedCustomers = await Promise.all(
          customersData.map(async customer => {
            const lifetimeValue = await calculateCustomerLifetimeValue(customer.name);
            return { 
              ...customer, 
              lifetimeValue
            };
          })
        );
        
        setCustomers(enrichedCustomers);
      } catch (error) {
        console.error('Error loading customers:', error);
      }
    };
    
    loadCustomers();
  }, []);

  // Check for customer ID in URL query params
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const customerId = queryParams.get('customerId');
    
    if (customerId) {
      setSelectedCustomerId(customerId);
      
      const loadCustomerById = async () => {
        try {
          const docRef = doc(db, 'customers', customerId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const customerData = { id: docSnap.id, ...docSnap.data() } as Customer;
            setSelectedCustomer(customerData);
            loadCustomerOrders(customerData.name);
          }
        } catch (error) {
          console.error('Error loading customer by ID:', error);
        }
      };
      
      loadCustomerById();
    }
  }, [location.search]);

  // Calculate customer lifetime value
  const calculateCustomerLifetimeValue = async (customerName: string): Promise<number> => {
    try {
      // Query orders for this customer
      const ordersQuery = query(
        collection(db, 'orders'), 
        where('customer', '==', customerName)
      );
      
      const orderDocs = await getDocs(ordersQuery);
      const customerOrders = orderDocs.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as Order)
        .filter(order => !order.deleted);
      
      // Calculate total value from all items
      let totalValue = 0;
      customerOrders.forEach(order => {
        order.items?.forEach(item => {
          totalValue += item.totalPrice || 0;
        });
      });
      
      return Number(totalValue.toFixed(2));
    } catch (error) {
      console.error('Error calculating LTV:', error);
      return 0;
    }
  };

  // Load customer orders
  const loadCustomerOrders = async (customerName: string) => {
    try {
      // Simple query that doesn't require a composite index
      const ordersQuery = query(
        collection(db, 'orders'),
        where('customer', '==', customerName)
      );

      const orderDocs = await getDocs(ordersQuery);
      const orders = orderDocs.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }) as Order)
        .filter(order => !order.deleted)
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

      setCustomerOrders(orders);
      processCustomerOrderData(orders);
    } catch (error) {
      console.error('Error loading customer orders:', error);
    }
  };

  // Process customer order data for charts and stats
  const processCustomerOrderData = (orders: Order[]) => {
    // Calculate monthly order counts and value
    const monthlyData: Record<string, { count: number, value: number }> = {};
    let totalValue = 0;
    const now = new Date();
    let lateOrdersCount = 0;
    let upcomingDeliveries = 0;

    // Initialize months for the current year
    const currentYear = now.getFullYear();
    for (let month = 0; month < 12; month++) {
      const date = new Date(currentYear, month, 1);
      const monthKey = format(date, 'MMM', { locale: ptBR });
      monthlyData[monthKey] = { count: 0, value: 0 };
    }

    orders.forEach(order => {
      const orderDate = new Date(order.startDate);
      const monthKey = format(orderDate, 'MMM', { locale: ptBR });
      const yearKey = format(orderDate, 'yyyy');
      
      // Only count this year's orders in the monthly chart
      if (yearKey === currentYear.toString()) {
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { count: 0, value: 0 };
        }
        
        monthlyData[monthKey].count += 1;
      }
      
      // Calculate order value from items
      let orderValue = 0;
      order.items.forEach(item => {
        orderValue += item.totalPrice || 0;
      });
      
      // Add to month's value
      if (yearKey === currentYear.toString() && monthlyData[monthKey]) {
        monthlyData[monthKey].value += orderValue;
      }
      
      // Add to total value
      totalValue += orderValue;
      
      // Check delivery date status
      const deliveryDate = new Date(order.deliveryDate);
      if (isBefore(deliveryDate, now) && order.status !== 'completed') {
        lateOrdersCount++;
      }
      
      if (isAfter(deliveryDate, now) && isBefore(deliveryDate, addDays(now, 30))) {
        upcomingDeliveries++;
      }
    });

    // Convert to array for charts
    const countData = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      pedidos: data.count
    }));

    const valueData = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      valor: data.value
    }));

    setOrderCountByMonth(countData);
    setValueByMonth(valueData);
    
    setCustomerStats({
      totalOrders: orders.length,
      totalValue,
      averageOrderValue: orders.length ? totalValue / orders.length : 0,
      lateOrdersCount,
      upcomingDeliveries
    });
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;

    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      doc.setFontSize(16);
      doc.text('Relatório Financeiro', 70, 25);
      y = 40;
    }

    // Add date
    doc.setFontSize(12);
    doc.text(`Data do relatório: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 20, y);
    y += 20;

    // Add yearly summary
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo Anual', 20, y);
    y += 10;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(12);
    doc.text(`Total Faturado: ${formatCurrency(yearlyData.totalBilled)}`, 20, y);
    y += 10;
    doc.text(`Total a Faturar: ${formatCurrency(yearlyData.totalPending)}`, 20, y);
    y += 10;
    doc.text(`Projeção para próximos 30 dias: ${formatCurrency(projectionSummary.next30Days)}`, 20, y);
    y += 10;
    doc.text(`Projeção para próximos 90 dias: ${formatCurrency(projectionSummary.next90Days)}`, 20, y);
    y += 20;

    // Add profitability section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Análise de Lucratividade', 20, y);
    y += 10;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(12);
    doc.text(`Receita Total: ${formatCurrency(marginSummary.totalRevenue)}`, 20, y);
    y += 10;
    doc.text(`Custo Total Estimado: ${formatCurrency(marginSummary.totalCost)}`, 20, y);
    y += 10;
    doc.text(`Lucro Total: ${formatCurrency(marginSummary.totalProfit)}`, 20, y);
    y += 10;
    doc.text(`Margem Média: ${formatPercent(marginSummary.averageMargin)}`, 20, y);
    y += 20;

    // Add monthly details
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Detalhamento Mensal', 20, y);
    y += 10;

    // Table header
    doc.setFontSize(12);
    doc.text('Mês', 20, y);
    doc.text('Faturado', 70, y);
    doc.text('A Faturar', 120, y);
    doc.text('Total', 170, y);
    y += 10;

    // Table content
    doc.setFont(undefined, 'normal');
    monthlyData.forEach(data => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.text(data.month, 20, y);
      doc.text(formatCurrency(data.billed), 70, y);
      doc.text(formatCurrency(data.pending), 120, y);
      doc.text(formatCurrency(data.billed + data.pending), 170, y);
      y += 10;
    });

    doc.save('relatorio-financeiro.pdf');
  };

  const handleExportCustomerPDF = () => {
    if (!selectedCustomer) return;
    
    const doc = new jsPDF();
    let y = 20;

    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      doc.setFontSize(16);
      doc.text(`Relatório Financeiro: ${selectedCustomer.name}`, 70, 25);
      y = 40;
    } else {
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text(`Relatório do Cliente: ${selectedCustomer.name}`, 20, y);
      y += 10;
    }
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`CNPJ: ${selectedCustomer.cnpj}`, 20, y);
    y += 7;
    
    if (selectedCustomer.category) {
      doc.text(`Categoria: ${selectedCustomer.category}`, 20, y);
      y += 7;
    }
    
    if (selectedCustomer.segment) {
      doc.text(`Segmento: ${selectedCustomer.segment}`, 20, y);
      y += 7;
    }
    
    doc.text(`Data do relatório: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 20, y);
    y += 15;

    // Summary statistics
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo Financeiro', 20, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Total de Pedidos: ${customerStats.totalOrders}`, 20, y);
    y += 7;
    doc.text(`Valor Total: ${formatCurrency(customerStats.totalValue)}`, 20, y);
    y += 7;
    doc.text(`Valor Médio por Pedido: ${formatCurrency(customerStats.averageOrderValue)}`, 20, y);
    y += 15;

    // Orders list
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Histórico de Pedidos', 20, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    if (customerOrders.length === 0) {
      doc.text('Nenhum pedido encontrado.', 20, y);
      y += 10;
    } else {
      // Table headers
      doc.setFont(undefined, 'bold');
      doc.text('Nº Pedido', 20, y);
      doc.text('OS Interna', 60, y);
      doc.text('Data Início', 100, y);
      doc.text('Data Entrega', 140, y);
      doc.text('Valor', 180, y);
      y += 7;
      doc.setFont(undefined, 'normal');
      
      // Table rows
      customerOrders.forEach(order => {
        if (y > 270) {
          doc.addPage();
          y = 20;
          
          // Add headers to new page
          doc.setFont(undefined, 'bold');
          doc.text('Nº Pedido', 20, y);
          doc.text('OS Interna', 60, y);
          doc.text('Data Início', 100, y);
          doc.text('Data Entrega', 140, y);
          doc.text('Valor', 180, y);
          y += 7;
          doc.setFont(undefined, 'normal');
        }
        
        // Calculate order value
        let orderValue = 0;
        order.items.forEach(item => {
          orderValue += item.totalPrice || 0;
        });
        
        doc.text(order.orderNumber, 20, y);
        doc.text(order.internalOrderNumber, 60, y);
        doc.text(format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR }), 100, y);
        doc.text(format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR }), 140, y);
        doc.text(formatCurrency(orderValue), 180, y);
        y += 7;
      });
    }

    doc.save(`relatorio_financeiro_${selectedCustomer.name.replace(/\s+/g, '_')}.pdf`);
  };

  const handleExportExcel = () => {
    // Create CSV content
    const csvContent = [
      ['Relatório Financeiro'],
      [`Data do relatório: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`],
      [],
      ['Resumo Anual'],
      ['Total Faturado', yearlyData.totalBilled],
      ['Total a Faturar', yearlyData.totalPending],
      ['Projeção para próximos 30 dias', projectionSummary.next30Days],
      ['Projeção para próximos 90 dias', projectionSummary.next90Days],
      ['Projeção para próximos 12 meses', projectionSummary.next12Months],
      [],
      ['Análise de Lucratividade'],
      ['Receita Total', marginSummary.totalRevenue],
      ['Custo Total Estimado', marginSummary.totalCost],
      ['Lucro Total', marginSummary.totalProfit],
      ['Margem Média', marginSummary.averageMargin],
      [],
      ['Detalhamento Mensal'],
      ['Mês', 'Faturado', 'A Faturar', 'Total'],
      ...monthlyData.map(data => [
        data.month,
        data.billed,
        data.pending,
        data.billed + data.pending
      ])
    ].map(row => row.join(',')).join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'relatorio-financeiro.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const filteredCustomers = customers
    .filter(c => !searchTerm || 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cnpj.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => (b.lifetimeValue || 0) - (a.lifetimeValue || 0));

  const handleBackToOverview = () => {
    setSelectedCustomer(null);
    setSelectedCustomerId(null);
    // Remove customer param from URL
    navigate('/financial');
  };
  
  const handleCostPercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setCostPercentage(value / 100);
  };

  return (
    <div className="p-6">
      {!selectedCustomer ? (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Controle Financeiro</h2>
            <div className="flex space-x-4">
              <button
                onClick={handleExportPDF}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download className="h-5 w-5 mr-2" />
                Exportar PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <FileSpreadsheet className="h-5 w-5 mr-2" />
                Exportar CSV
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <ul className="flex flex-wrap -mb-px">
              <li className="mr-2">
                <button
                  className={`inline-flex items-center py-4 px-4 text-sm font-medium text-center border-b-2 ${
                    activeTab === 'overview'
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('overview')}
                >
                  <BarChart2 className="h-5 w-5 mr-2" />
                  Visão Geral
                </button>
              </li>
              <li className="mr-2">
                <button
                  className={`inline-flex items-center py-4 px-4 text-sm font-medium text-center border-b-2 ${
                    activeTab === 'projections'
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('projections')}
                >
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Projeções
                </button>
              </li>
              <li className="mr-2">
                <button
                  className={`inline-flex items-center py-4 px-4 text-sm font-medium text-center border-b-2 ${
                    activeTab === 'profitability'
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('profitability')}
                >
                  <ChartBar className="h-5 w-5 mr-2" />
                  Lucratividade
                </button>
              </li>
              <li>
                <button
                  className={`inline-flex items-center py-4 px-4 text-sm font-medium text-center border-b-2 ${
                    activeTab === 'cashflow'
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-600 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('cashflow')}
                >
                  <Activity className="h-5 w-5 mr-2" />
                  Fluxo de Caixa
                </button>
              </li>
            </ul>
          </div>

          {activeTab === 'overview' && (
            <>
              {/* Yearly Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Total Faturado (Ano)</h3>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(yearlyData.totalBilled)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Total a Faturar (Ano)</h3>
                  <p className="text-3xl font-bold text-blue-600">{formatCurrency(yearlyData.totalPending)}</p>
                </div>
              </div>

              {/* Monthly Chart */}
              <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Faturamento Mensal</h3>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis
                        tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), 'Valor']}
                      />
                      <Legend />
                      <Bar
                        dataKey="billed"
                        name="Faturado"
                        fill="#059669"
                        stackId="a"
                      />
                      <Bar
                        dataKey="pending"
                        name="A Faturar"
                        fill="#3B82F6"
                        stackId="a"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Customer Financial Analysis Section */}
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-4">Análise Financeira por Cliente</h3>
                
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por cliente..."
                    className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cliente
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          CNPJ
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Categoria
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Segmento
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Valor Total
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCustomers.map(customer => (
                        <tr key={customer.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{customer.cnpj}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{customer.category || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{customer.segment || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(customer.lifetimeValue || 0)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <button
                              onClick={() => {
                                setSelectedCustomer(customer);
                                loadCustomerOrders(customer.name);
                                navigate(`/financial?customerId=${customer.id}`);
                              }}
                              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                            >
                              Ver Detalhes
                            </button>
                          </td>
                        </tr>
                      ))}
                      
                      {filteredCustomers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                            Nenhum cliente encontrado com os filtros atuais.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Monthly Details Table */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Mês
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Faturado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        A Faturar
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {monthlyData.map((data, index) => (
                      <tr key={data.month}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {data.month}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(data.billed)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(data.pending)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(data.billed + data.pending)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'projections' && (
            <>
              {/* Projections Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Projeção Total</h3>
                  <p className="text-3xl font-bold text-purple-600">{formatCurrency(projectionSummary.totalProjected)}</p>
                  <p className="text-sm text-gray-600 mt-2">Total de receita projetada de pedidos em andamento</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Próximos 30 Dias</h3>
                  <p className="text-3xl font-bold text-blue-600">{formatCurrency(projectionSummary.next30Days)}</p>
                  <p className="text-sm text-gray-600 mt-2">Pedidos com entrega nos próximos 30 dias</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Próximos 90 Dias</h3>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(projectionSummary.next90Days)}</p>
                  <p className="text-sm text-gray-600 mt-2">Pedidos com entrega nos próximos 90 dias</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Próximos 12 Meses</h3>
                  <p className="text-3xl font-bold text-indigo-600">{formatCurrency(projectionSummary.next12Months)}</p>
                  <p className="text-sm text-gray-600 mt-2">Projeção para o ano inteiro</p>
                </div>
              </div>

              {/* Future Revenue Projections Chart */}
              <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Projeção de Receita Futura</h3>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projectionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis
                        tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), 'Valor']}
                      />
                      <Legend />
                      <Bar
                        dataKey="confirmed"
                        name="Confirmado"
                        fill="#059669"
                        stackId="a"
                      />
                      <Bar
                        dataKey="projected"
                        name="Projetado"
                        fill="#3B82F6"
                        stackId="a"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-sm text-gray-600 mt-4">
                  <span className="font-medium">Confirmado:</span> Pedidos com entrega nos próximos 7 dias ou com status "Pronto para Embarque"<br />
                  <span className="font-medium">Projetado:</span> Demais pedidos em andamento com base na data de entrega prevista
                </p>
              </div>
              
              {/* Projection Details Table */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Período
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Confirmado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Projetado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projectionData.map((data, index) => (
                      <tr key={data.month} className={index < 3 ? "bg-blue-50" : ""}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {data.month}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(data.confirmed)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(data.projected - data.confirmed)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          {formatCurrency(data.projected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          
          {activeTab === 'profitability' && (
            <>
              {/* Cost Adjustment Control */}
              <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Configurações de Custo</h3>
                    <p className="text-sm text-gray-600 mt-1">Ajuste a estimativa de custo médio para cálculo de lucratividade</p>
                  </div>
                  <button 
                    onClick={() => setShowCostInfo(!showCostInfo)}
                    className="text-blue-600 hover:text-blue-800 text-sm underline"
                  >
                    {showCostInfo ? 'Ocultar Informações' : 'Mais Informações'}
                  </button>
                </div>
                
                {showCostInfo && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
                    <p>
                      <strong>Informações sobre o cálculo de custos:</strong>
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>Como o sistema não armazena diretamente os custos dos produtos, utilizamos um percentual estimado sobre o valor de venda.</li>
                      <li>Este percentual pode ser ajustado abaixo para refletir melhor a realidade da empresa.</li>
                      <li>Quando a categoria do cliente está definida, são utilizados percentuais de margem específicos por categoria.</li>
                      <li>Clientes Premium: 35% de margem | Padrão: 25% | Ocasional: 20% | Novo: 15% | Padrão: 22%</li>
                      <li>Esta é uma estimativa para visualização de tendências, e não substitui uma análise contábil precisa.</li>
                    </ul>
                  </div>
                )}
                
                <div className="mt-4">
                  <label htmlFor="costPercentage" className="block text-sm font-medium text-gray-700 mb-1">
                    Percentual médio de custo sobre preço de venda: {(costPercentage * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    id="costPercentage"
                    min="10"
                    max="95"
                    step="5"
                    value={costPercentage * 100}
                    onChange={handleCostPercentageChange}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>10%</span>
                    <span>50%</span>
                    <span>95%</span>
                  </div>
                </div>
              </div>
              
              {/* Profitability Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Receita Total</h3>
                  <p className="text-3xl font-bold text-blue-600">{formatCurrency(marginSummary.totalRevenue)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Custo Total Estimado</h3>
                  <p className="text-3xl font-bold text-red-600">{formatCurrency(marginSummary.totalCost)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Lucro Total</h3>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(marginSummary.totalProfit)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Margem Média</h3>
                  <p className="text-3xl font-bold text-purple-600">{formatPercent(marginSummary.averageMargin)}</p>
                </div>
              </div>

              {/* Profitability by Customer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 5 Clientes por Lucratividade</h3>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profitabilityByCustomer.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="customer" />
                        <YAxis
                          tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
                        />
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), 'Valor']}
                        />
                        <Legend />
                        <Bar dataKey="revenue" name="Receita" fill="#3B82F6" />
                        <Bar dataKey="profit" name="Lucro" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Margens por Cliente</h3>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profitabilityByCustomer.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="customer" />
                        <YAxis 
                          tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                          domain={[0, 0.5]}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Margem']}
                        />
                        <Legend />
                        <Bar dataKey="margin" name="Margem" fill="#8B5CF6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Profitability by Product */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Top 5 Produtos por Lucratividade</h3>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profitabilityByProduct.slice(0, 5)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(value) => formatCurrency(value).replace('R$', '')} />
                        <YAxis type="category" dataKey="code" width={80} />
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), 'Valor']}
                        />
                        <Legend />
                        <Bar dataKey="revenue" name="Receita" fill="#3B82F6" />
                        <Bar dataKey="profit" name="Lucro" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribuição do Lucro por Produto</h3>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={topProfitableProducts}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ code, profit, percent }) => `${code}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={150}
                          fill="#8884d8"
                          dataKey="profit"
                        >
                          {topProfitableProducts.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(value as number)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Profitability Table */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
                <h3 className="text-lg font-semibold text-gray-800 p-6">Detalhamento de Lucratividade por Cliente</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Cliente
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Receita Total
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Custo Estimado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Lucro Estimado
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Margem
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Pedidos
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {profitabilityByCustomer.map((customer, index) => (
                        <tr key={customer.customer} className={index < 3 ? "bg-green-50" : ""}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {customer.customer}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(customer.revenue)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(customer.revenue - customer.profit)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(customer.profit)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatPercent(customer.margin)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {customer.orderCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          
          {activeTab === 'cashflow' && (
            <>
              {/* Cash Flow Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-800">Entradas (Mês Atual)</h3>
                    <ArrowUpCircle className="h-6 w-6 text-green-500" />
                  </div>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(cashFlowSummary.currentMonthInflow)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-800">Saídas (Mês Atual)</h3>
                    <ArrowDownCircle className="h-6 w-6 text-red-500" />
                  </div>
                  <p className="text-3xl font-bold text-red-600">{formatCurrency(cashFlowSummary.currentMonthOutflow)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Saldo (Mês Atual)</h3>
                  <p className={`text-3xl font-bold ${cashFlowSummary.currentMonthInflow - cashFlowSummary.currentMonthOutflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(cashFlowSummary.currentMonthInflow - cashFlowSummary.currentMonthOutflow)}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Projeção (Próximo Mês)</h3>
                  <p className="text-3xl font-bold text-blue-600">{formatCurrency(cashFlowSummary.nextMonthProjected)}</p>
                </div>
              </div>
              
              {/* Cash Flow Chart */}
              <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Fluxo de Caixa Projetado (12 Meses)</h3>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashFlowData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis
                        tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), 'Valor']}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="inflow"
                        name="Entradas"
                        stackId="1"
                        stroke="#10B981"
                        fill="#D1FAE5"
                      />
                      <Area
                        type="monotone"
                        dataKey="outflow"
                        name="Saídas"
                        stackId="2"
                        stroke="#EF4444"
                        fill="#FEE2E2"
                      />
                      <Line
                        type="monotone"
                        dataKey="netFlow"
                        name="Saldo Líquido"
                        stroke="#6366F1"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-sm text-gray-600 mt-4">
                  Este gráfico mostra as projeções de entradas e saídas de caixa para os próximos 12 meses, com base nos pedidos existentes. 
                  O cálculo assume que as entradas ocorrem na data de entrega dos pedidos, e as saídas (custos) ocorrem cerca de 30 dias antes.
                </p>
              </div>
              
              {/* Cash Flow Table */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <h3 className="text-lg font-semibold text-gray-800 p-6">Detalhamento de Fluxo de Caixa Projetado</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Mês
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Entradas
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Saídas
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Saldo Líquido
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {cashFlowData.map((data, index) => (
                        <tr key={data.month} className={index === 0 ? "bg-blue-50 font-medium" : ""}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {data.month}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                            {formatCurrency(data.inflow)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                            {formatCurrency(data.outflow)}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                            data.netFlow >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(data.netFlow)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        // Customer Financial Dashboard
        <div>
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <button
                onClick={handleBackToOverview}
                className="mr-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-2xl font-bold">Análise Financeira: {selectedCustomer.name}</h2>
                <p className="text-gray-600">{selectedCustomer.cnpj}</p>
              </div>
            </div>
            
            <button
              onClick={handleExportCustomerPDF}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Download className="h-5 w-5 mr-2" />
              Exportar Relatório
            </button>
          </div>

          {/* Cliente Info & Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4">Informações do Cliente</h3>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p>{selectedCustomer.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Telefone</p>
                    <p>{selectedCustomer.phone || '-'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Categoria</p>
                    <p>{selectedCustomer.category || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Segmento</p>
                    <p>{selectedCustomer.segment || '-'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-500">Contato</p>
                    <p>{selectedCustomer.contactPerson || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Telefone do Contato</p>
                    <p>{selectedCustomer.contactPhone || '-'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4">Métricas Financeiras</h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-start">
                    <DollarSign className="h-8 w-8 text-blue-500 mr-3" />
                    <div>
                      <h4 className="text-blue-900 font-medium">Valor Total</h4>
                      <p className="text-2xl font-bold text-blue-700">{formatCurrency(customerStats.totalValue)}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="flex items-start">
                    <Package className="h-8 w-8 text-purple-500 mr-3" />
                    <div>
                      <h4 className="text-purple-900 font-medium">Total de Pedidos</h4>
                      <p className="text-2xl font-bold text-purple-700">{customerStats.totalOrders}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex items-start">
                    <Calendar className="h-8 w-8 text-green-500 mr-3" />
                    <div>
                      <h4 className="text-green-900 font-medium">Valor Médio</h4>
                      <p className="text-2xl font-bold text-green-700">
                        {formatCurrency(customerStats.averageOrderValue)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-start">
                    <Truck className="h-8 w-8 text-yellow-500 mr-3" />
                    <div>
                      <h4 className="text-yellow-900 font-medium">Entregas Próximas</h4>
                      <p className="text-2xl font-bold text-yellow-700">{customerStats.upcomingDeliveries}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4">Pedidos por Mês</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orderCountByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="pedidos" name="Pedidos" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4">Valor por Mês</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={valueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => formatCurrency(value).replace('R$', '')} />
                    <Tooltip formatter={(value) => [formatCurrency(value as number), 'Valor']} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="valor" 
                      name="Valor (R$)"
                      stroke="#8884d8" 
                      activeDot={{ r: 8 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Orders List */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-4">Histórico de Pedidos</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pedido
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      OS Interna
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data de Início
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data de Entrega
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progresso
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customerOrders.length > 0 ? (
                    customerOrders.map(order => {
                      // Calculate order value
                      const orderValue = order.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
                      
                      // Check if order is late
                      const isLate = isBefore(new Date(order.deliveryDate), new Date()) && 
                                    order.status !== 'completed';
                      
                      // Calculate days until/since delivery
                      const today = new Date();
                      const deliveryDate = new Date(order.deliveryDate);
                      const daysDiff = differenceInDays(deliveryDate, today);
                      
                      return (
                        <tr key={order.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">#{order.orderNumber}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{order.internalOrderNumber}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`text-sm ${isLate ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
                              {isLate && (
                                <span className="ml-2">
                                  <AlertTriangle className="h-4 w-4 inline-block text-red-500" title={`${Math.abs(daysDiff)} dias atrasado`} />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              order.status === 'delayed' ? 'bg-red-100 text-red-800' :
                              order.status === 'completed' ? 'bg-green-100 text-green-800' :
                              order.status === 'urgent' ? 'bg-purple-100 text-purple-800' :
                              order.status === 'waiting-docs' ? 'bg-yellow-100 text-yellow-800' :
                              order.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {order.status === 'delayed' ? 'Atrasado' :
                              order.status === 'completed' ? 'Concluído' :
                              order.status === 'urgent' ? 'Urgente' :
                              order.status === 'waiting-docs' ? 'Aguardando Docs' :
                              order.status === 'ready' ? 'Pronto' :
                              'Em Processo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {formatCurrency(orderValue)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div 
                                  className={`h-2.5 rounded-full ${
                                    calculateOrderProgress(order.items) >= 100 ? 'bg-green-500' :
                                    calculateOrderProgress(order.items) >= 70 ? 'bg-blue-500' :
                                    calculateOrderProgress(order.items) >= 30 ? 'bg-yellow-500' :
                                    'bg-red-500'
                                  }`}
                                  style={{ width: `${calculateOrderProgress(order.items)}%` }}
                                />
                              </div>
                              <div className="text-xs text-right mt-1 text-gray-500">
                                {calculateOrderProgress(order.items)}%
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                        Nenhum pedido encontrado para este cliente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialDashboard;