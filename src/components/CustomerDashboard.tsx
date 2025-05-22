import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Calendar, Package, DollarSign, Clock, Truck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Customer } from '../types/customer';
import { Order, OrderItem } from '../types/kanban';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, isAfter, isBefore, addDays, differenceInDays, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { calculateOrderProgress } from '../utils/progress';

// Color palette for customer-specific data visualization
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
  '#329262'  // blue-green
];

interface CustomerDashboardProps {
  customer: Customer;
  onBack: () => void;
}

const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ customer, onBack }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderCountByMonth, setOrderCountByMonth] = useState<any[]>([]);
  const [valueByMonth, setValueByMonth] = useState<any[]>([]);
  const [totalStats, setTotalStats] = useState({
    totalOrders: 0,
    totalValue: 0,
    averageOrderValue: 0,
    lateOrdersCount: 0,
    upcomingDeliveries: 0,
    completedOrders: 0,
    inProgressOrders: 0
  });

  useEffect(() => {
    loadCustomerOrders();
  }, [customer.id]);

  const loadCustomerOrders = async () => {
    try {
      setLoading(true);
      
      const ordersQuery = query(
        collection(db, getCompanyCollection('orders')),
        where('customer', '==', customer.name)
      );

      const orderDocs = await getDocs(ordersQuery);
      const customerOrders = orderDocs.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }) as Order)
        .filter(order => !order.deleted) // Filter out deleted orders
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()); // Sort by startDate desc

      setOrders(customerOrders);
      processOrderData(customerOrders);
    } catch (error) {
      console.error('Error loading customer orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const processOrderData = (orders: Order[]) => {
    // Calculate monthly order counts and value
    const monthlyData: Record<string, { count: number, value: number }> = {};
    let totalValue = 0;
    const now = new Date();
    let lateOrdersCount = 0;
    let upcomingDeliveries = 0;
    let completedOrders = 0;
    let inProgressOrders = 0;

    // Initialize months for the current year
    const currentYear = now.getFullYear();
    const yearStart = startOfYear(now);
    const yearEnd = endOfYear(now);

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
      
      // Check order status
      const isCompleted = order.status === 'completed' || !!order.completedDate;
      const deliveryDate = new Date(order.deliveryDate);

      // Only consider as late if not completed and delivery date has passed
      if (!isCompleted && isBefore(deliveryDate, now)) {
        lateOrdersCount++;
      }
      
      if (isAfter(deliveryDate, now) && isBefore(deliveryDate, addDays(now, 30))) {
        upcomingDeliveries++;
      }
      
      if (isCompleted) {
        completedOrders++;
      } else {
        inProgressOrders++;
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
    
    setTotalStats({
      totalOrders: orders.length,
      totalValue,
      averageOrderValue: orders.length ? totalValue / orders.length : 0,
      lateOrdersCount,
      upcomingDeliveries,
      completedOrders,
      inProgressOrders
    });
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(`Relatório do Cliente: ${customer.name}`, 20, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`CNPJ: ${customer.cnpj}`, 20, y);
    y += 7;
    
    if (customer.category) {
      doc.text(`Categoria: ${customer.category}`, 20, y);
      y += 7;
    }
    
    if (customer.segment) {
      doc.text(`Segmento: ${customer.segment}`, 20, y);
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
    doc.text(`Total de Pedidos: ${totalStats.totalOrders}`, 20, y);
    y += 7;
    doc.text(`Valor Total: ${formatCurrency(totalStats.totalValue)}`, 20, y);
    y += 7;
    doc.text(`Valor Médio por Pedido: ${formatCurrency(totalStats.averageOrderValue)}`, 20, y);
    y += 7;
    doc.text(`Pedidos em Andamento: ${totalStats.inProgressOrders}`, 20, y);
    y += 7;
    doc.text(`Pedidos Concluídos: ${totalStats.completedOrders}`, 20, y);
    y += 15;

    // Orders list
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Histórico de Pedidos', 20, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    if (orders.length === 0) {
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
      orders.forEach(order => {
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

    doc.save(`relatorio_${customer.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold">{customer.name}</h2>
            <p className="text-gray-600">{customer.cnpj}</p>
          </div>
        </div>
        
        <button
          onClick={handleExportPDF}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Download className="h-5 w-5 mr-2" />
          Exportar Relatório
        </button>
      </div>

      {/* Cliente Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4">Informações do Cliente</h3>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Email</p>
                <p>{customer.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Telefone</p>
                <p>{customer.phone || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Categoria</p>
                <p>{customer.category || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Segmento</p>
                <p>{customer.segment || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Contato</p>
                <p>{customer.contactPerson || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Telefone do Contato</p>
                <p>{customer.contactPhone || '-'}</p>
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Endereço</p>
              <p>{customer.address || '-'}</p>
            </div>

            {customer.notes && (
              <div>
                <p className="text-sm text-gray-500">Observações</p>
                <p>{customer.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-4">Métricas do Cliente</h3>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start">
                <DollarSign className="h-8 w-8 text-blue-500 mr-3" />
                <div>
                  <h4 className="text-blue-900 font-medium">Valor Total</h4>
                  <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalStats.totalValue)}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="flex items-start">
                <Package className="h-8 w-8 text-purple-500 mr-3" />
                <div>
                  <h4 className="text-purple-900 font-medium">Total de Pedidos</h4>
                  <p className="text-2xl font-bold text-purple-700">{totalStats.totalOrders}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-start">
                <Calendar className="h-8 w-8 text-green-500 mr-3" />
                <div>
                  <h4 className="text-green-900 font-medium">Valor Médio</h4>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(totalStats.averageOrderValue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-start">
                <Truck className="h-8 w-8 text-yellow-500 mr-3" />
                <div>
                  <h4 className="text-yellow-900 font-medium">Entregas Próximas</h4>
                  <p className="text-2xl font-bold text-yellow-700">{totalStats.upcomingDeliveries}</p>
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
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center">
                    <div className="text-gray-500">Carregando...</div>
                  </td>
                </tr>
              ) : orders.length > 0 ? (
                orders.map(order => {
                  // Calculate order value
                  const orderValue = order.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
                  
                  // Check if order is completed
                  const isCompleted = order.status === 'completed' || !!order.completedDate;
                  
                  // Calculate delivery status
                  const now = new Date();
                  const deliveryDate = new Date(order.deliveryDate);
                  const completionDate = order.completedDate ? new Date(order.completedDate) : null;
                  
                  const isLate = !isCompleted && isBefore(deliveryDate, now);
                  let deliveryStatus = '';
                  
                  if (isCompleted && completionDate) {
                    const daysDiff = differenceInDays(completionDate, deliveryDate);
                    if (daysDiff < 0) {
                      deliveryStatus = `${Math.abs(daysDiff)} dias antes do prazo`;
                    } else if (daysDiff > 0) {
                      deliveryStatus = `${daysDiff} dias após o prazo`;
                    } else {
                      deliveryStatus = 'No prazo';
                    }
                  } else if (isLate) {
                    deliveryStatus = `${Math.abs(differenceInDays(now, deliveryDate))} dias atrasado`;
                  }
                  
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
                        <div className="space-y-1">
                          <div className={`text-sm ${isLate ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
                            {isLate && (
                              <span className="ml-2">
                                <AlertTriangle className="h-4 w-4 inline-block text-red-500" title={`${Math.abs(differenceInDays(new Date(order.deliveryDate), new Date()))} dias atrasado`} />
                              </span>
                            )}
                          </div>
                          {order.completedDate && (
                            <div className="text-sm text-green-600">
                              <CheckCircle2 className="h-4 w-4 inline-block mr-1" /> 
                              Concluído: {format(new Date(order.completedDate), 'dd/MM/yyyy', { locale: ptBR })}
                              {deliveryStatus && (
                                <span className="ml-2 text-xs text-gray-600">
                                  ({deliveryStatus})
                                </span>
                              )}
                            </div>
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
  );
};

export default CustomerDashboard;