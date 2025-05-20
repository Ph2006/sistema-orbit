import React, { useState, useEffect } from 'react';
import { Calendar, Download, Filter, ChevronDown } from 'lucide-react';
import { jsPDF } from 'jspdf';
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
  Cell
} from 'recharts';
import { ProductionOrder } from '../types/productionOrder';
import { useProductionOrderStore } from '../store/productionOrderStore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import { Order } from '../types/kanban';
import { useOrderStore } from '../store/orderStore';
import 'jspdf-autotable';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#e30b5c'];

const ProductionOrderReport: React.FC = () => {
  const { companyLogo } = useSettingsStore();
  const { orders } = useProductionOrderStore();
  const { orders: mainOrders } = useOrderStore();
  
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0], // First day of current month
    end: new Date().toISOString().split('T')[0], // Today
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  
  // Derived state
  const stages = Array.from(new Set(orders.map(order => order.stageName))).sort();
  
  // Filter orders by date and stage
  const filteredOrders = orders.filter(order => {
    const orderDate = new Date(order.plannedStartDate);
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    
    // Adjust end date to include the entire day
    endDate.setHours(23, 59, 59, 999);
    
    const dateInRange = orderDate >= startDate && orderDate <= endDate;
    const stageMatches = selectedStage === 'all' || order.stageName === selectedStage;
    
    return dateInRange && stageMatches;
  });
  
  // Calculate metrics
  const totalOrders = filteredOrders.length;
  const completedOrders = filteredOrders.filter(order => order.status === 'completed').length;
  const inProgressOrders = filteredOrders.filter(order => order.status === 'in-progress').length;
  const pendingOrders = filteredOrders.filter(order => order.status === 'pending').length;
  const delayedOrders = filteredOrders.filter(order => order.status === 'delayed').length;
  const onHoldOrders = filteredOrders.filter(order => order.status === 'on-hold').length;
  const cancelledOrders = filteredOrders.filter(order => order.status === 'cancelled').length;
  
  // Calculate completion rate
  const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0;
  
  // Calculate average completion time (in days)
  const completionTimes = filteredOrders
    .filter(order => order.status === 'completed' && order.actualStartDate && order.actualEndDate)
    .map(order => {
      const startDate = new Date(order.actualStartDate!);
      const endDate = new Date(order.actualEndDate!);
      return (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24); // Convert to days
    });
  
  const averageCompletionTime = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length * 10) / 10
    : 0;
  
  // Prepare chart data
  const statusData = [
    { name: 'Concluídos', value: completedOrders, color: '#22c55e' },
    { name: 'Em Andamento', value: inProgressOrders, color: '#3b82f6' },
    { name: 'Pendentes', value: pendingOrders, color: '#94a3b8' },
    { name: 'Atrasados', value: delayedOrders, color: '#ef4444' },
    { name: 'Em Espera', value: onHoldOrders, color: '#f59e0b' },
    { name: 'Cancelados', value: cancelledOrders, color: '#6b7280' }
  ].filter(item => item.value > 0);
  
  // Group orders by stage
  const stageOrders = stages.map(stage => {
    const stageOrders = filteredOrders.filter(order => order.stageName === stage);
    return {
      stage,
      total: stageOrders.length,
      completed: stageOrders.filter(order => order.status === 'completed').length,
      inProgress: stageOrders.filter(order => order.status === 'in-progress').length,
      pending: stageOrders.filter(order => order.status === 'pending').length,
    };
  });
  
  // Calculate on-time completion rate
  const onTimeCompletions = filteredOrders
    .filter(order => order.status === 'completed')
    .filter(order => {
      if (!order.actualEndDate) return false;
      const plannedEnd = new Date(order.plannedEndDate);
      const actualEnd = new Date(order.actualEndDate);
      return actualEnd <= plannedEnd;
    }).length;
  
  const onTimeRate = completedOrders > 0 
    ? Math.round((onTimeCompletions / completedOrders) * 100) 
    : 0;
  
  // Group by main order
  const orderGroups = filteredOrders.reduce((acc, order) => {
    const mainOrder = mainOrders.find(o => o.id === order.orderId);
    if (!mainOrder) return acc;
    
    const key = `${mainOrder.orderNumber} - ${mainOrder.customer}`;
    if (!acc[key]) {
      acc[key] = {
        orderNumber: mainOrder.orderNumber,
        customer: mainOrder.customer,
        orders: []
      };
    }
    
    acc[key].orders.push(order);
    return acc;
  }, {} as Record<string, { orderNumber: string; customer: string; orders: ProductionOrder[] }>);
  
  // Handle report download
  const handleDownloadReport = () => {
    const doc = new jsPDF();
    
    // Add logo if available
    let y = 20;
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('RELATÓRIO DE ORDENS DE PRODUÇÃO', 105, 25, { align: 'center' });
      y = 40;
    } else {
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('RELATÓRIO DE ORDENS DE PRODUÇÃO', 105, y, { align: 'center' });
    }
    
    // Add report period
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Período: ${format(new Date(dateRange.start), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(dateRange.end), 'dd/MM/yyyy', { locale: ptBR })}`, 105, y + 10, { align: 'center' });
    
    if (selectedStage !== 'all') {
      doc.text(`Etapa: ${selectedStage}`, 105, y + 20, { align: 'center' });
      y += 10;
    }
    
    y += 20;
    
    // Add summary section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo', 20, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    // Create a summary table with autotable
    (doc as any).autoTable({
      startY: y,
      head: [['Métrica', 'Valor']],
      body: [
        ['Total de OPs', totalOrders.toString()],
        ['OPs Concluídas', completedOrders.toString()],
        ['OPs Em Andamento', inProgressOrders.toString()],
        ['OPs Pendentes', pendingOrders.toString()],
        ['OPs Atrasadas', delayedOrders.toString()],
        ['Taxa de Conclusão', `${completionRate}%`],
        ['Tempo Médio de Conclusão', `${averageCompletionTime} dias`],
        ['Taxa de Conclusão no Prazo', `${onTimeRate}%`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { fontStyle: 'bold' },
      }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;
    
    // Add orders by stage section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('OPs por Etapa', 20, y);
    y += 10;
    
    // Create a stage breakdown table with autotable
    (doc as any).autoTable({
      startY: y,
      head: [['Etapa', 'Total', 'Concluídas', 'Em Andamento', 'Pendentes']],
      body: stageOrders.map(so => [
        so.stage,
        so.total.toString(),
        so.completed.toString(),
        so.inProgress.toString(),
        so.pending.toString()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: 255 }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;
    
    // Add orders list section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Lista de OPs por Pedido', 20, y);
    y += 10;
    
    // Create a detailed orders table for each main order
    Object.values(orderGroups).forEach(group => {
      // Add order header
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Pedido #${group.orderNumber} - ${group.customer}`, 20, y);
      y += 8;
      
      // Create detailed table with autotable
      (doc as any).autoTable({
        startY: y,
        head: [['Etapa', 'Status', 'Prioridade', 'Data Início', 'Data Término', 'Responsável']],
        body: group.orders.map(o => [
          o.stageName,
          o.status === 'pending' ? 'Pendente' :
          o.status === 'in-progress' ? 'Em Andamento' :
          o.status === 'completed' ? 'Concluído' :
          o.status === 'on-hold' ? 'Em Espera' :
          o.status === 'cancelled' ? 'Cancelado' : 'Atrasado',
          o.priority === 'critical' ? 'Crítica' :
          o.priority === 'high' ? 'Alta' :
          o.priority === 'medium' ? 'Média' : 'Baixa',
          format(new Date(o.plannedStartDate), 'dd/MM/yyyy', { locale: ptBR }),
          format(new Date(o.plannedEndDate), 'dd/MM/yyyy', { locale: ptBR }),
          o.assignedTo || 'N/A'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 }
      });
      
      y = (doc as any).lastAutoTable.finalY + 15;
      
      // Add new page if needed
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
    });
    
    doc.save(`relatorio-producao-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  };
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Relatório de Progresso</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <Filter className="h-5 w-5 mr-2" />
            Filtros
            <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={handleDownloadReport}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar PDF
          </button>
        </div>
      </div>
      
      {showFilters && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Calendar className="h-4 w-4 mr-1" /> Data Início
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Calendar className="h-4 w-4 mr-1" /> Data Fim
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filtrar por Etapa
              </label>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="all">Todas as etapas</option>
                {stages.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-gray-500 text-sm">Total de OPs</p>
              <p className="text-2xl font-bold">{totalOrders}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <ClipboardList className="h-6 w-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-gray-500 text-sm">Concluídas</p>
              <p className="text-2xl font-bold">{completedOrders}</p>
              <p className="text-sm text-green-600">{completionRate}% de conclusão</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-gray-500 text-sm">Em Andamento</p>
              <p className="text-2xl font-bold">{inProgressOrders}</p>
              <p className="text-sm text-blue-600">{totalOrders > 0 ? Math.round((inProgressOrders / totalOrders) * 100) : 0}% do total</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <Clock className="h-6 w-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex justify-between">
            <div>
              <p className="text-gray-500 text-sm">Atrasadas</p>
              <p className="text-2xl font-bold">{delayedOrders}</p>
              <p className="text-sm text-red-600">{totalOrders > 0 ? Math.round((delayedOrders / totalOrders) * 100) : 0}% do total</p>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
              <AlertCircle className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Status Distribution Pie Chart */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h3 className="text-lg font-medium mb-4">Distribuição por Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} OPs`, 'Quantidade']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Stage Completion Bar Chart */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h3 className="text-lg font-medium mb-4">Progresso por Etapa</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stageOrders}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="stage" type="category" scale="band" width={100} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" name="Concluídas" stackId="a" fill="#22c55e" />
                <Bar dataKey="inProgress" name="Em Andamento" stackId="a" fill="#3b82f6" />
                <Bar dataKey="pending" name="Pendentes" stackId="a" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <h3 className="text-lg font-medium mb-4">Métricas de Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500 mb-1">Tempo Médio de Conclusão</div>
            <div className="text-xl font-bold">{averageCompletionTime} dias</div>
            <div className="text-xs text-gray-600 mt-1">Baseado em {completionTimes.length} OPs concluídas</div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500 mb-1">Taxa de Conclusão no Prazo</div>
            <div className="text-xl font-bold">{onTimeRate}%</div>
            <div className="text-xs text-gray-600 mt-1">{onTimeCompletions} de {completedOrders} OPs concluídas no prazo</div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-500 mb-1">OPs por Pedido (Média)</div>
            <div className="text-xl font-bold">
              {Object.keys(orderGroups).length > 0 
                ? (filteredOrders.length / Object.keys(orderGroups).length).toFixed(1) 
                : '0'}
            </div>
            <div className="text-xs text-gray-600 mt-1">{filteredOrders.length} OPs em {Object.keys(orderGroups).length} pedidos</div>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="text-lg font-medium mb-4">Detalhamento por Pedido</h3>
        {Object.entries(orderGroups).length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhuma ordem de produção encontrada no período selecionado.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(orderGroups).map(([key, group]) => {
              const { orders } = group;
              const completed = orders.filter(o => o.status === 'completed').length;
              const total = orders.length;
              const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
              
              return (
                <div key={key} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">Pedido #{group.orderNumber}</h4>
                      <p className="text-gray-600 text-sm">{group.customer}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Progresso</div>
                      <div className="font-medium">{progress}% ({completed}/{total} etapas)</div>
                    </div>
                  </div>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {orders.map(order => (
                      <div 
                        key={order.id} 
                        className={`p-3 rounded-md text-sm ${
                          order.status === 'completed' ? 'bg-green-50 border border-green-200' :
                          order.status === 'in-progress' ? 'bg-blue-50 border border-blue-200' :
                          order.status === 'pending' ? 'bg-gray-50 border border-gray-200' :
                          order.status === 'delayed' ? 'bg-red-50 border border-red-200' :
                          order.status === 'on-hold' ? 'bg-yellow-50 border border-yellow-200' :
                          'bg-gray-100 border border-gray-300'
                        }`}
                      >
                        <div className="flex justify-between">
                          <div className="font-medium">{order.stageName}</div>
                          <div className={`text-xs px-2 py-0.5 rounded-full ${
                            order.status === 'completed' ? 'bg-green-100 text-green-800' :
                            order.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                            order.status === 'pending' ? 'bg-gray-100 text-gray-800' :
                            order.status === 'delayed' ? 'bg-red-100 text-red-800' :
                            order.status === 'on-hold' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-200 text-gray-800'
                          }`}>
                            {order.status === 'completed' ? 'Concluído' :
                             order.status === 'in-progress' ? 'Em Andamento' :
                             order.status === 'pending' ? 'Pendente' :
                             order.status === 'delayed' ? 'Atrasado' :
                             order.status === 'on-hold' ? 'Em Espera' : 'Cancelado'}
                          </div>
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-gray-600">
                          <span>Prazo: {format(new Date(order.plannedEndDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          {order.actualEndDate && (
                            <span className="text-green-600">
                              Concluído: {format(new Date(order.actualEndDate), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Component for ClipboardList icon
const ClipboardList = (props: any) => {
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
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
};

// Component for CheckCircle icon
const CheckCircle = (props: any) => {
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
};

// Component for Clock icon
const Clock = (props: any) => {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
};

// Component for AlertCircle icon
const AlertCircle = (props: any) => {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
};

export default ProductionOrderReport;