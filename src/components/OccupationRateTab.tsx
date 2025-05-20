import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { Calendar, Sliders, AlertTriangle, ChevronDown, Info, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, addMonths, isSameMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useOrderStore } from '../store/orderStore';
import { Order, OrderItem } from '../types/kanban';

// Factory capacity in tons per month (per stage)
const MONTHLY_CAPACITY_TONS = 80;

interface StageCapacity {
  stage: string;
  totalWeight: number;
  percentOccupation: number;
  status: 'normal' | 'warning' | 'critical' | 'low';
  items: { 
    orderId: string;
    orderNumber: string;
    customer: string; 
    itemId: string;
    itemCode: string;
    weight: number;
  }[];
}

interface MonthlyCapacity {
  month: string; // "MM/YYYY" format
  monthDate: Date;
  stages: Record<string, StageCapacity>;
}

const OccupationRateTab: React.FC = () => {
  const { orders } = useOrderStore();
  const [monthlyData, setMonthlyData] = useState<MonthlyCapacity[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'MM/yyyy'));
  const [stageList, setStageList] = useState<string[]>([]);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [capacityThreshold, setCapacityThreshold] = useState(MONTHLY_CAPACITY_TONS);
  const [warningThreshold, setWarningThreshold] = useState(70);

  useEffect(() => {
    // Extract all unique stages from orders
    const allStages = new Set<string>();
    
    orders.forEach(order => {
      if (order.deleted) return;
      
      order.items.forEach(item => {
        if (item.stagePlanning) {
          Object.keys(item.stagePlanning).forEach(stage => {
            allStages.add(stage);
          });
        }
      });
    });
    
    setStageList(Array.from(allStages).sort());
  }, [orders]);

  useEffect(() => {
    calculateMonthlyOccupation();
  }, [orders, stageList, capacityThreshold]);

  const calculateMonthlyOccupation = () => {
    // Generate data for the current month and 5 months ahead
    const now = new Date();
    const startMonth = startOfMonth(now);
    const endMonth = startOfMonth(addMonths(now, 5));
    
    const months = eachMonthOfInterval({ start: startMonth, end: endMonth });
    
    const monthlyCapacityData: MonthlyCapacity[] = months.map(month => ({
      month: format(month, 'MM/yyyy'),
      monthDate: month,
      stages: {}
    }));
    
    // Initialize stages for each month
    monthlyCapacityData.forEach(month => {
      stageList.forEach(stage => {
        month.stages[stage] = {
          stage,
          totalWeight: 0,
          percentOccupation: 0,
          status: 'normal',
          items: []
        };
      });
    });
    
    // Process each order
    orders.forEach(order => {
      if (order.deleted) return;
      
      order.items.forEach(item => {
        if (!item.stagePlanning) return;
        
        Object.entries(item.stagePlanning).forEach(([stage, planning]) => {
          if (!planning.startDate || !planning.endDate) return;
          
          const startDate = new Date(planning.startDate);
          const endDate = new Date(planning.endDate);
          
          // Find which months this stage spans
          monthlyCapacityData.forEach(monthData => {
            const monthStart = startOfMonth(monthData.monthDate);
            const monthEnd = endOfMonth(monthData.monthDate);
            
            // Check if the stage overlaps with this month
            if (isOverlapping(startDate, endDate, monthStart, monthEnd)) {
              // Calculate weight contribution for this month
              // For simplicity, we'll allocate weight proportionally to the days in the month
              const overlapDays = calculateOverlapDays(startDate, endDate, monthStart, monthEnd);
              const stageDurationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
              const weightContribution = (item.totalWeight * overlapDays) / stageDurationDays;
              
              // Ensure the stage exists in this month's data
              if (!monthData.stages[stage]) {
                monthData.stages[stage] = {
                  stage,
                  totalWeight: 0,
                  percentOccupation: 0,
                  status: 'normal',
                  items: []
                };
              }
              
              // Add weight to the stage for this month
              monthData.stages[stage].totalWeight += weightContribution;
              monthData.stages[stage].items.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                customer: order.customer,
                itemId: item.id,
                itemCode: item.code,
                weight: weightContribution
              });
            }
          });
        });
      });
    });
    
    // Calculate percentages and status
    monthlyCapacityData.forEach(month => {
      Object.values(month.stages).forEach(stageData => {
        // Convert kg to tons
        const tonWeight = stageData.totalWeight / 1000;
        stageData.percentOccupation = Math.round((tonWeight / capacityThreshold) * 100);
        
        // Set status based on occupation percentage
        if (stageData.percentOccupation > 100) {
          stageData.status = 'critical';
        } else if (stageData.percentOccupation >= warningThreshold) {
          stageData.status = 'warning';
        } else if (stageData.percentOccupation < 30) {
          stageData.status = 'low';
        } else {
          stageData.status = 'normal';
        }
      });
    });
    
    setMonthlyData(monthlyCapacityData);
  };
  
  // Helper function to calculate days of overlap between two date ranges
  const calculateOverlapDays = (start1: Date, end1: Date, start2: Date, end2: Date): number => {
    const latestStart = new Date(Math.max(start1.getTime(), start2.getTime()));
    const earliestEnd = new Date(Math.min(end1.getTime(), end2.getTime()));
    
    const overlapMs = Math.max(0, earliestEnd.getTime() - latestStart.getTime());
    return Math.ceil(overlapMs / (1000 * 60 * 60 * 24));
  };
  
  // Helper function to check if two date ranges overlap
  const isOverlapping = (start1: Date, end1: Date, start2: Date, end2: Date): boolean => {
    return start1 <= end2 && start2 <= end1;
  };
  
  const toggleStageExpansion = (stage: string) => {
    setExpandedStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stage)) {
        newSet.delete(stage);
      } else {
        newSet.add(stage);
      }
      return newSet;
    });
  };
  
  const getSelectedMonthData = (): MonthlyCapacity | undefined => {
    return monthlyData.find(m => m.month === selectedMonth);
  };
  
  // Format weight for display
  const formatWeight = (weight: number): string => {
    // If weight is in kg, convert to tons for easier reading if greater than 1000
    if (weight >= 1000) {
      return `${(weight / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ton`;
    }
    return `${weight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
  };
  
  // Prepare data for the bar chart
  const prepareChartData = () => {
    const monthData = getSelectedMonthData();
    if (!monthData) return [];
    
    return Object.values(monthData.stages)
      .sort((a, b) => b.percentOccupation - a.percentOccupation)
      .map(stage => ({
        name: stage.stage,
        ocupacao: stage.percentOccupation,
        status: stage.status,
        pesoTotal: stage.totalWeight / 1000 // Convert to tons for the chart
      }));
  };
  
  const getBarColor = (status: string) => {
    switch (status) {
      case 'critical':
        return '#EF4444'; // Red
      case 'warning':
        return '#F59E0B'; // Amber
      case 'low':
        return '#3B82F6'; // Blue
      default:
        return '#10B981'; // Green
    }
  };
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'critical':
        return 'Sobrecarga Crítica';
      case 'warning':
        return 'Próximo da Capacidade';
      case 'low':
        return 'Carga Baixa';
      default:
        return 'Carga Normal';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Taxa de Ocupação das Etapas</h2>
      </div>

      <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
        <div className="flex">
          <div className="flex-shrink-0">
            <Info className="h-5 w-5 text-blue-500" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Taxa de Ocupação das Etapas</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>Este painel mostra a taxa de ocupação de cada etapa de fabricação por mês, com base no peso dos itens e nas datas planejadas.</p>
              <p className="mt-1">Capacidade padrão: {capacityThreshold} toneladas por etapa/mês. Você pode ajustar este valor nos filtros.</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Selecione o Mês
          </label>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
          >
            {monthlyData.map(month => (
              <option key={month.month} value={month.month}>
                {format(month.monthDate, 'MMMM yyyy', { locale: ptBR })}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 ml-auto"
          >
            <Sliders className="h-5 w-5 mr-2" />
            Configurações
            <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      
      {showFilters && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacidade Mensal (toneladas)
              </label>
              <input
                type="number"
                value={capacityThreshold}
                onChange={e => setCapacityThreshold(Number(e.target.value))}
                min="1"
                step="1"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Limite de Alerta (%)
              </label>
              <input
                type="number"
                value={warningThreshold}
                onChange={e => setWarningThreshold(Number(e.target.value))}
                min="1"
                max="100"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
              <p className="text-sm text-gray-500 mt-1">
                Percentual a partir do qual a ocupação será destacada como alerta.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Chart */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="text-lg font-medium mb-4 flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-blue-600" />
          Taxa de Ocupação - {format(getSelectedMonthData()?.monthDate || new Date(), 'MMMM yyyy', { locale: ptBR })}
        </h3>
        
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={prepareChartData()}
              layout="vertical"
              margin={{ top: 20, right: 20, bottom: 20, left: 70 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                type="number" 
                domain={[0, Math.max(100, Math.ceil(Math.max(...prepareChartData().map(d => d.ocupacao)) / 10) * 10)]} 
                tickFormatter={(value) => `${value}%`} 
              />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={120}
              />
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'ocupacao') return [`${value}%`, 'Taxa de Ocupação'];
                  if (name === 'pesoTotal') return [`${value.toLocaleString('pt-BR')} ton`, 'Peso Total'];
                  return [value, name];
                }}
              />
              <Legend />
              <ReferenceLine x={100} stroke="#ef4444" strokeWidth={2} label="Capacidade Máxima" />
              <ReferenceLine x={warningThreshold} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3 3" />
              <Bar 
                dataKey="ocupacao" 
                name="Taxa de Ocupação (%)" 
                radius={[0, 4, 4, 0]}
              >
                {prepareChartData().map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-start">
            <AlertTriangle className="h-10 w-10 text-red-500 mr-3 mt-1" />
            <div>
              <h4 className="font-medium text-red-800">Etapas com Sobrecarga</h4>
              <p className="text-sm text-red-700 mt-1">
                {getSelectedMonthData()
                  ? Object.values(getSelectedMonthData()!.stages).filter(s => s.status === 'critical').length
                  : 0} etapa(s) com ocupação acima de 100%
              </p>
              <p className="text-sm text-red-700 mt-1">
                Redistribua a carga ou expanda a capacidade destas etapas.
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <div className="flex items-start">
            <AlertTriangle className="h-10 w-10 text-yellow-500 mr-3 mt-1" />
            <div>
              <h4 className="font-medium text-yellow-800">Etapas com Alerta</h4>
              <p className="text-sm text-yellow-700 mt-1">
                {getSelectedMonthData()
                  ? Object.values(getSelectedMonthData()!.stages).filter(s => s.status === 'warning').length
                  : 0} etapa(s) com ocupação entre {warningThreshold}% e 100%
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Monitore estas etapas para evitar atrasos.
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start">
            <TrendingDown className="h-10 w-10 text-blue-500 mr-3 mt-1" />
            <div>
              <h4 className="font-medium text-blue-800">Capacidade Disponível</h4>
              <p className="text-sm text-blue-700 mt-1">
                {getSelectedMonthData()
                  ? Object.values(getSelectedMonthData()!.stages).filter(s => s.status === 'low').length
                  : 0} etapa(s) com ocupação abaixo de 30%
              </p>
              <p className="text-sm text-blue-700 mt-1">
                Estas etapas têm capacidade disponível para mais pedidos.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Detailed Stage List */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-6 border-b">
          <h3 className="text-lg font-medium">Detalhamento por Etapa</h3>
        </div>
        
        <div className="divide-y">
          {getSelectedMonthData() && Object.values(getSelectedMonthData()!.stages)
            .sort((a, b) => b.percentOccupation - a.percentOccupation)
            .map(stageData => {
              const isExpanded = expandedStages.has(stageData.stage);
              const remainingCapacity = capacityThreshold - (stageData.totalWeight / 1000);
              
              return (
                <div key={stageData.stage} className="p-4">
                  <div 
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => toggleStageExpansion(stageData.stage)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center">
                        <h4 className="font-medium">{stageData.stage}</h4>
                        <div className={`ml-3 px-3 py-1 text-xs rounded-full ${
                          stageData.status === 'critical' ? 'bg-red-100 text-red-800' :
                          stageData.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                          stageData.status === 'low' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {getStatusLabel(stageData.status)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className="text-right mr-4">
                        <div className="font-medium">{stageData.percentOccupation}%</div>
                        <div className="text-sm text-gray-500">
                          {formatWeight(stageData.totalWeight)}
                        </div>
                      </div>
                      
                      <ChevronDown className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="mt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className={`p-4 rounded-lg ${
                          stageData.status === 'critical' ? 'bg-red-50 border border-red-200' :
                          stageData.status === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                          stageData.status === 'low' ? 'bg-blue-50 border border-blue-200' :
                          'bg-green-50 border border-green-200'
                        }`}>
                          <h5 className="font-medium mb-2">Status da Capacidade</h5>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span>Capacidade Total:</span>
                              <span className="font-medium">{capacityThreshold} ton/mês</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Carga Atual:</span>
                              <span className="font-medium">{(stageData.totalWeight / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ton</span>
                            </div>
                            {stageData.status === 'critical' && (
                              <div className="flex justify-between text-red-700">
                                <span>Excesso:</span>
                                <span className="font-medium">{Math.abs(remainingCapacity).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ton</span>
                              </div>
                            )}
                            {(stageData.status === 'normal' || stageData.status === 'warning' || stageData.status === 'low') && (
                              <div className="flex justify-between text-green-700">
                                <span>Capacidade Disponível:</span>
                                <span className="font-medium">{remainingCapacity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ton</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="mt-3">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                              <div 
                                className={`h-2.5 rounded-full ${
                                  stageData.status === 'critical' ? 'bg-red-500' :
                                  stageData.status === 'warning' ? 'bg-yellow-500' :
                                  stageData.status === 'low' ? 'bg-blue-500' :
                                  'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(100, stageData.percentOccupation)}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>0%</span>
                              <span>{warningThreshold}%</span>
                              <span>100%</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-4 rounded-lg bg-gray-50 border">
                          <h5 className="font-medium mb-2">Recomendações</h5>
                          {stageData.status === 'critical' && (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-start">
                                <AlertTriangle className="h-4 w-4 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Esta etapa está com sobrecarga de {stageData.percentOccupation - 100}% acima da capacidade.</p>
                              </div>
                              <div className="flex items-start">
                                <ArrowRight className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Considere redistribuir {(Math.abs(remainingCapacity)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ton para outros meses.</p>
                              </div>
                              <div className="flex items-start">
                                <ArrowRight className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Avalie aumentar temporariamente a capacidade com horas extras ou terceirização.</p>
                              </div>
                            </div>
                          )}
                          {stageData.status === 'warning' && (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-start">
                                <AlertTriangle className="h-4 w-4 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Esta etapa está próxima da capacidade máxima.</p>
                              </div>
                              <div className="flex items-start">
                                <ArrowRight className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Monitore de perto a execução para evitar atrasos.</p>
                              </div>
                              <div className="flex items-start">
                                <ArrowRight className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Capacidade restante: {remainingCapacity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} toneladas.</p>
                              </div>
                            </div>
                          )}
                          {stageData.status === 'low' && (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-start">
                                <TrendingDown className="h-4 w-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Esta etapa está com baixa ocupação.</p>
                              </div>
                              <div className="flex items-start">
                                <ArrowRight className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Capacidade disponível para mais {remainingCapacity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} toneladas.</p>
                              </div>
                              <div className="flex items-start">
                                <ArrowRight className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Considere antecipar pedidos futuros para otimizar a utilização.</p>
                              </div>
                            </div>
                          )}
                          {stageData.status === 'normal' && (
                            <div className="space-y-2 text-sm">
                              <div className="flex items-start">
                                <TrendingUp className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Esta etapa está com ocupação equilibrada.</p>
                              </div>
                              <div className="flex items-start">
                                <ArrowRight className="h-4 w-4 text-gray-500 mr-2 mt-0.5 flex-shrink-0" />
                                <p>Capacidade disponível: {remainingCapacity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} toneladas.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {stageData.items.length > 0 && (
                        <div className="mt-2">
                          <h5 className="font-medium mb-2 text-sm">Itens Planejados ({stageData.items.length})</h5>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pedido</th>
                                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                  <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Peso</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {stageData.items.map((item, idx) => (
                                  <tr key={`${item.orderId}-${item.itemId}-${idx}`}>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">#{item.orderNumber}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">{item.customer}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">{item.itemCode}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{formatWeight(item.weight)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-gray-50">
                                <tr>
                                  <td colSpan={3} className="px-3 py-2 text-sm font-medium text-right">Total:</td>
                                  <td className="px-3 py-2 text-sm font-medium text-right">{formatWeight(stageData.totalWeight)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default OccupationRateTab;