import React, { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { FileText, CheckCircle, XCircle, Clock, AlertCircle, Calendar } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuotationStore } from '../store/quotationStore';
import { Quotation } from '../types/quotation';

const COLORS = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'];

const QuotationDashboard: React.FC = () => {
  const { quotations, stats, customerStats } = useQuotationStore();

  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  // Prepare data for status pie chart
  const prepareStatusData = () => {
    if (!stats) return [];
    
    const data = [
      { name: 'Aprovados', value: stats.approvedQuotes, color: '#10B981' },
      { name: 'Rejeitados', value: stats.rejectedQuotes, color: '#EF4444' },
      { name: 'Pendentes', value: stats.pendingQuotes, color: '#F59E0B' }
    ].filter(item => item.value > 0);
    
    return data;
  };

  // Prepare monthly data
  const prepareMonthlyData = () => {
    // Generate last 6 months
    const today = new Date();
    const sixMonthsAgo = subMonths(today, 5);
    
    const months = eachMonthOfInterval({
      start: startOfMonth(sixMonthsAgo),
      end: endOfMonth(today)
    });
    
    // Initialize data for each month
    const monthlyData = months.map(month => {
      const monthStr = format(month, 'MMM/yy', { locale: ptBR });
      return {
        month: monthStr,
        aprovados: 0,
        rejeitados: 0,
        total: 0,
        valor: 0
      };
    });
    
    // Fill in actual data
    quotations.forEach(quotation => {
      const createdAt = new Date(quotation.createdAt);
      const monthIndex = months.findIndex(month => 
        createdAt >= startOfMonth(month) && 
        createdAt <= endOfMonth(month)
      );
      
      if (monthIndex >= 0) {
        monthlyData[monthIndex].total++;
        monthlyData[monthIndex].valor += quotation.totalWithTaxes;
        
        if (quotation.status === 'approved') {
          monthlyData[monthIndex].aprovados++;
        } else if (quotation.status === 'rejected') {
          monthlyData[monthIndex].rejeitados++;
        }
      }
    });
    
    return monthlyData;
  };

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Total de Orçamentos</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">{stats?.totalQuotes || 0}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full text-blue-800">
              <FileText className="h-6 w-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Taxa de Aprovação</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {stats ? `${stats.approvalRate.toFixed(1)}%` : '0%'}
              </p>
              <p className="text-sm text-gray-500">
                {stats?.approvedQuotes || 0} aprovados de {(stats?.approvedQuotes || 0) + (stats?.rejectedQuotes || 0)}
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-full text-green-800">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Valor Total Aprovado</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(stats?.approvedQuoteValue || 0)}
              </p>
              <p className="text-sm text-gray-500">
                {formatCurrency(stats?.totalQuoteValue || 0)} em propostas
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-full text-purple-800">
              <DollarSign className="h-6 w-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Tempo Médio de Resposta</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {stats?.averageResponseTime.toFixed(1) || 0} dias
              </p>
              <p className="text-sm text-gray-500">
                {stats?.pendingQuotes || 0} orçamentos pendentes
              </p>
            </div>
            <div className="p-2 bg-yellow-100 rounded-full text-yellow-800">
              <Clock className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Pie Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Status dos Orçamentos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={prepareStatusData()}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {prepareStatusData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Quantidade']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Quotes */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Orçamentos por Mês</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prepareMonthlyData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="aprovados" name="Aprovados" fill="#10B981" />
                <Bar dataKey="rejeitados" name="Rejeitados" fill="#EF4444" />
                <Bar dataKey="total" name="Total" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Quote Values */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Valor dos Orçamentos por Mês</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={prepareMonthlyData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => formatCurrency(value).replace('R$', '')} />
                <Tooltip formatter={(value) => [formatCurrency(value as number), 'Valor']} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="valor" 
                  name="Valor dos Orçamentos"
                  stroke="#8884d8" 
                  activeDot={{ r: 8 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Customer Approval Rates */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Taxa de Aprovação por Cliente</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={customerStats.slice(0, 5)} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                <YAxis 
                  type="category" 
                  dataKey="customerName" 
                  width={75}
                  tickFormatter={(value) => value.length > 12 ? `${value.substring(0, 12)}...` : value} 
                />
                <Tooltip formatter={(value) => [`${value}%`, 'Taxa de Aprovação']} />
                <Bar dataKey="approvalRate" name="Taxa de Aprovação" fill="#10B981">
                  {customerStats.slice(0, 5).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.approvalRate > 50 ? '#10B981' : '#F59E0B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-gray-500 text-center mt-2">
            Mostrando os 5 clientes com mais orçamentos
          </div>
        </div>
      </div>

      {/* Recent Quotations */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-lg font-medium mb-4">Orçamentos Recentes</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nº
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cliente
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valor Total
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prazo Médio
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotations.slice(0, 5).map((quotation) => (
                <tr key={quotation.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {quotation.number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {quotation.customerName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(quotation.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatCurrency(quotation.totalWithTaxes)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${quotation.status === 'approved' ? 'bg-green-100 text-green-800' : 
                        quotation.status === 'rejected' ? 'bg-red-100 text-red-800' : 
                        quotation.status === 'sent' ? 'bg-yellow-100 text-yellow-800' : 
                        quotation.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'}`}
                    >
                      {quotation.status === 'approved' ? 'Aprovado' :
                       quotation.status === 'rejected' ? 'Rejeitado' :
                       quotation.status === 'sent' ? 'Enviado' :
                       quotation.status === 'draft' ? 'Rascunho' :
                       'Expirado'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {quotation.items.length > 0
                      ? `${Math.round(quotation.items.reduce((sum, item) => sum + item.leadTimeDays, 0) / quotation.items.length)} dias`
                      : 'N/A'
                    }
                  </td>
                </tr>
              ))}
              {quotations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Nenhum orçamento encontrado
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

// Custom DollarSign icon
const DollarSign = (props: any) => (
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
    <line x1="12" x2="12" y1="2" y2="22"></line>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
  </svg>
);

export default QuotationDashboard;