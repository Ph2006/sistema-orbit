import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronDown, 
  DollarSign, 
  FileText, 
  ShoppingBag, 
  Package, 
  CircleDollarSign,
  Download,
  Edit,
  Trash2,
  HelpCircle,
  Calendar,
  TrendingUp,
  TrendingDown,
  BarChart,
  Search as SearchIcon
} from 'lucide-react';
import { format, parse, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCostCenterStore } from '../store/costCenterStore';
import { useOrderStore } from '../store/orderStore';
import { CostEntry, CostCenterFilter, OrderCostSummary } from '../types/costCenter';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';

// Import components
import CostEntryModal from './CostEntryModal';
import CostReportModal from './CostReportModal';

// Types
type ViewMode = 'list' | 'dashboard' | 'order-detail';

const CostCenter: React.FC = () => {
  // Store
  const { 
    costs, 
    filteredCosts, 
    orderSummaries,
    loading, 
    error,
    subscribeToCosts,
    deleteCost,
    applyFilter,
    getOrderSummary
  } = useCostCenterStore();
  
  const { orders, subscribeToOrders } = useOrderStore();
  
  const { companyLogo } = useSettingsStore();
  
  // Local state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCost, setSelectedCost] = useState<CostEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  // Filter state
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [dateFromFilter, setDateFromFilter] = useState<string>(
    format(subMonths(new Date(), 1), 'yyyy-MM-dd')
  );
  const [dateToFilter, setDateToFilter] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [orderNumberFilter, setOrderNumberFilter] = useState<string>('');
  
  // Load data
  useEffect(() => {
    const unsubscribeCosts = subscribeToCosts();
    const unsubscribeOrders = subscribeToOrders();
    
    return () => {
      unsubscribeCosts();
      unsubscribeOrders();
    };
  }, [subscribeToCosts, subscribeToOrders]);
  
  // Apply search filtering
  useEffect(() => {
    const filter: CostCenterFilter = {
      category: categoryFilter || undefined,
      dateFrom: dateFromFilter || undefined,
      dateTo: dateToFilter || undefined,
      supplier: supplierFilter || undefined,
      orderNumber: orderNumberFilter || undefined
    };
    
    applyFilter(filter);
  }, [categoryFilter, dateFromFilter, dateToFilter, supplierFilter, orderNumberFilter, applyFilter]);
  
  // Search within filtered results
  const searchFilteredCosts = searchTerm
    ? filteredCosts.filter(
        cost =>
          cost.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cost.purchaseOrderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cost.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          cost.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : filteredCosts;
    
  // Unique suppliers for the filter
  const uniqueSuppliers = [...new Set(costs.map(cost => cost.supplierName))].sort();
  
  // Unique order numbers for the filter
  const uniqueOrderNumbers = [...new Set(costs.map(cost => cost.orderNumber))].sort();
  
  // Calculate total cost and budget
  const totalCost = filteredCosts.reduce((sum, cost) => sum + cost.amount, 0);
  const totalBudget = orderSummaries.reduce((sum, summary) => sum + summary.totalBudget, 0);
  const totalMargin = totalBudget - totalCost;
  const marginPercentage = totalBudget > 0 ? (totalMargin / totalBudget) * 100 : 0;
  
  // Group costs by category for the dashboard
  const costsByCategory = {
    material: filteredCosts.filter(cost => cost.category === 'material').reduce((sum, cost) => sum + cost.amount, 0),
    service: filteredCosts.filter(cost => cost.category === 'service').reduce((sum, cost) => sum + cost.amount, 0),
    labor: filteredCosts.filter(cost => cost.category === 'labor').reduce((sum, cost) => sum + cost.amount, 0),
    logistics: filteredCosts.filter(cost => cost.category === 'logistics').reduce((sum, cost) => sum + cost.amount, 0),
    other: filteredCosts.filter(cost => cost.category === 'other').reduce((sum, cost) => sum + cost.amount, 0),
  };
  
  // Handler to view order details
  const handleViewOrderDetails = (orderId: string) => {
    setSelectedOrderId(orderId);
    setViewMode('order-detail');
  };
  
  // Handler to delete a cost entry
  const handleDeleteCost = async (cost: CostEntry) => {
    if (window.confirm(`Tem certeza que deseja excluir este lançamento de custo? O valor de ${formatCurrency(cost.amount)} será removido do registro.`)) {
      try {
        await deleteCost(cost.id);
      } catch (error) {
        console.error('Error deleting cost:', error);
        alert('Erro ao excluir lançamento de custo');
      }
    }
  };
  
  // Handler to open the cost entry modal
  const handleAddCost = () => {
    setSelectedCost(null);
    setIsModalOpen(true);
  };
  
  // Handler to edit a cost entry
  const handleEditCost = (cost: CostEntry) => {
    setSelectedCost(cost);
    setIsModalOpen(true);
  };
  
  // Generate cost report
  const handleGenerateReport = () => {
    setIsReportModalOpen(true);
  };
  
  // Export cost data as PDF
  const handleExportCosts = () => {
    const doc = new jsPDF();
    
    let y = 20;
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 15, 10, 40, 20);
      y = 40;
    }
    
    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('RELATÓRIO DE CENTRO DE CUSTOS', 105, y, { align: 'center' });
    y += 10;
    
    // Subtitle with date range
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Período: ${format(new Date(dateFromFilter), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(dateToFilter), 'dd/MM/yyyy', { locale: ptBR })}`, 105, y, { align: 'center' });
    y += 20;
    
    // Summary
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo Financeiro', 15, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Total de Custos: ${formatCurrency(totalCost)}`, 15, y);
    y += 7;
    doc.text(`Total de Faturamento: ${formatCurrency(totalBudget)}`, 15, y);
    y += 7;
    doc.text(`Margem: ${formatCurrency(totalMargin)} (${marginPercentage.toFixed(2)}%)`, 15, y);
    y += 15;
    
    // Costs by category
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Custos por Categoria', 15, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Materiais: ${formatCurrency(costsByCategory.material)}`, 15, y);
    y += 7;
    doc.text(`Serviços: ${formatCurrency(costsByCategory.service)}`, 15, y);
    y += 7;
    doc.text(`Mão de Obra: ${formatCurrency(costsByCategory.labor)}`, 15, y);
    y += 7;
    doc.text(`Logística: ${formatCurrency(costsByCategory.logistics)}`, 15, y);
    y += 7;
    doc.text(`Outros: ${formatCurrency(costsByCategory.other)}`, 15, y);
    y += 20;
    
    // List of cost entries
    (doc as any).autoTable({
      startY: y,
      head: [
        ['OS', 'Fornecedor', 'Descrição', 'Categoria', 'Data', 'Valor']
      ],
      body: filteredCosts.map(cost => [
        cost.orderNumber,
        cost.supplierName,
        cost.description,
        getCategoryName(cost.category),
        format(new Date(cost.date), 'dd/MM/yyyy', { locale: ptBR }),
        formatCurrency(cost.amount)
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      },
      foot: [
        ['Total', '', '', '', '', formatCurrency(totalCost)]
      ]
    });
    
    // Save the document
    doc.save(`relatorio-centro-custos-${format(new Date(), 'dd-MM-yyyy')}.pdf`);
  };
  
  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };
  
  // Get category display name
  const getCategoryName = (category: string): string => {
    switch (category) {
      case 'material': return 'Materiais';
      case 'service': return 'Serviços';
      case 'labor': return 'Mão de Obra';
      case 'logistics': return 'Logística';
      case 'other': return 'Outros';
      default: return category;
    }
  };
  
  // Render the detail view for a specific order
  const renderOrderDetail = () => {
    if (!selectedOrderId) return null;
    
    const order = orders.find(o => o.id === selectedOrderId);
    const orderCosts = filteredCosts.filter(cost => cost.orderId === selectedOrderId);
    const summary = getOrderSummary(selectedOrderId);
    
    if (!order || !summary) {
      return (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Pedido não encontrado ou sem dados de custo.</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-6">
        {/* Header with order info and back button */}
        <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div>
            <h3 className="text-xl font-bold">
              Pedido #{order.orderNumber} - {order.customer}
            </h3>
            <p className="text-gray-600">OS: {order.internalOrderNumber}</p>
          </div>
          <button 
            onClick={() => setViewMode('dashboard')}
            className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Voltar ao Dashboard
          </button>
        </div>
        
        {/* Financial summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm">Valor do Pedido</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(summary.totalBudget)}</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm">Custos Totais</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(summary.totalSpent)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {(summary.totalSpent / summary.totalBudget * 100).toFixed(1)}% do valor
                </p>
              </div>
              <div className="p-2 bg-red-100 rounded-full text-red-600">
                <ShoppingBag className="h-6 w-6" />
              </div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm">Margem</p>
                <p className={`text-2xl font-bold mt-1 ${summary.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(summary.margin)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {summary.marginPercentage.toFixed(1)}% de margem
                </p>
              </div>
              <div className={`p-2 rounded-full ${summary.margin >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {summary.margin >= 0 ? (
                  <TrendingUp className="h-6 w-6" />
                ) : (
                  <TrendingDown className="h-6 w-6" />
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-sm">Lançamentos</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{orderCosts.length}</p>
                <button 
                  onClick={handleAddCost}
                  className="text-sm text-blue-600 hover:text-blue-800 mt-1"
                >
                  Adicionar novo
                </button>
              </div>
              <div className="p-2 bg-purple-100 rounded-full text-purple-600">
                <FileText className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>
        
        {/* Cost breakdown by category */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h4 className="text-lg font-medium mb-4">Composição de Custos</h4>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Materiais:</span>
              <span className="font-medium">{formatCurrency(summary.materialsCost)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${summary.totalSpent > 0 ? (summary.materialsCost / summary.totalSpent) * 100 : 0}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Serviços:</span>
              <span className="font-medium">{formatCurrency(summary.servicesCost)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full" 
                style={{ width: `${summary.totalSpent > 0 ? (summary.servicesCost / summary.totalSpent) * 100 : 0}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Mão de Obra:</span>
              <span className="font-medium">{formatCurrency(summary.laborCost)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-purple-600 h-2 rounded-full" 
                style={{ width: `${summary.totalSpent > 0 ? (summary.laborCost / summary.totalSpent) * 100 : 0}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Logística:</span>
              <span className="font-medium">{formatCurrency(summary.logisticsCost)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-yellow-600 h-2 rounded-full" 
                style={{ width: `${summary.totalSpent > 0 ? (summary.logisticsCost / summary.totalSpent) * 100 : 0}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Outros:</span>
              <span className="font-medium">{formatCurrency(summary.otherCosts)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-gray-600 h-2 rounded-full" 
                style={{ width: `${summary.totalSpent > 0 ? (summary.otherCosts / summary.totalSpent) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
        </div>
        
        {/* List of costs for this order */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-medium">Lançamentos de Custos</h4>
            <button
              onClick={handleAddCost}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Novo Lançamento
            </button>
          </div>
          
          {orderCosts.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">Nenhum custo lançado para este pedido.</p>
              <button
                onClick={handleAddCost}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 inline-block mr-1" />
                Adicionar Primeiro Lançamento
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fornecedor
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nº OC
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categoria
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orderCosts.map(cost => (
                    <tr key={cost.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(cost.date), 'dd/MM/yyyy', { locale: ptBR })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {cost.supplierName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {cost.purchaseOrderNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {cost.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          cost.category === 'material' ? 'bg-blue-100 text-blue-800' :
                          cost.category === 'service' ? 'bg-green-100 text-green-800' :
                          cost.category === 'labor' ? 'bg-purple-100 text-purple-800' :
                          cost.category === 'logistics' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getCategoryName(cost.category)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(cost.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEditCost(cost)}
                          className="text-blue-600 hover:text-blue-900 inline-block"
                          title="Editar"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCost(cost)}
                          className="text-red-600 hover:text-red-900 inline-block"
                          title="Excluir"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // Render dashboard view
  const renderDashboard = () => {
    return (
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-500 text-sm">Faturamento Total</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalBudget)}</p>
              </div>
              <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-500 text-sm">Custos Totais</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalCost)}</p>
              </div>
              <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                <ShoppingBag className="h-6 w-6" />
              </div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-500 text-sm">Margem</p>
                <p className={`text-2xl font-bold mt-2 ${totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalMargin)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {marginPercentage.toFixed(1)}% de margem
                </p>
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${totalMargin >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {totalMargin >= 0 ? (
                  <TrendingUp className="h-6 w-6" />
                ) : (
                  <TrendingDown className="h-6 w-6" />
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-500 text-sm">Pedidos com Custos</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{orderSummaries.length}</p>
              </div>
              <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600">
                <Package className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>
        
        {/* Cost breakdown by category */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium mb-4">Composição de Custos</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Materiais:</span>
                <span className="font-medium">{formatCurrency(costsByCategory.material)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${totalCost > 0 ? (costsByCategory.material / totalCost) * 100 : 0}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Serviços:</span>
                <span className="font-medium">{formatCurrency(costsByCategory.service)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: `${totalCost > 0 ? (costsByCategory.service / totalCost) * 100 : 0}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Mão de Obra:</span>
                <span className="font-medium">{formatCurrency(costsByCategory.labor)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full" 
                  style={{ width: `${totalCost > 0 ? (costsByCategory.labor / totalCost) * 100 : 0}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Logística:</span>
                <span className="font-medium">{formatCurrency(costsByCategory.logistics)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-yellow-600 h-2 rounded-full" 
                  style={{ width: `${totalCost > 0 ? (costsByCategory.logistics / totalCost) * 100 : 0}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Outros:</span>
                <span className="font-medium">{formatCurrency(costsByCategory.other)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gray-600 h-2 rounded-full" 
                  style={{ width: `${totalCost > 0 ? (costsByCategory.other / totalCost) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium mb-4">Pedidos com Maiores Custos</h3>
            
            {orderSummaries.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Nenhum pedido com custos lançados.</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-72">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pedido
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cliente
                      </th>
                      <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor
                      </th>
                      <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Custos
                      </th>
                      <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Margem
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orderSummaries
                      .sort((a, b) => b.totalSpent - a.totalSpent) // Sort by total costs (highest first)
                      .slice(0, 5) // Take only the top 5
                      .map(summary => (
                        <tr key={summary.orderId} className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                            #{summary.orderNumber}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                            {summary.customerName}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                            {formatCurrency(summary.totalBudget)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                            {formatCurrency(summary.totalSpent)}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap text-sm font-medium text-right ${
                            summary.margin >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(summary.margin)} ({summary.marginPercentage.toFixed(1)}%)
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center text-sm">
                            <button
                              onClick={() => handleViewOrderDetails(summary.orderId)}
                              className="text-blue-600 hover:text-blue-900 inline-block"
                              title="Ver Detalhes"
                            >
                              <SearchIcon className="h-5 w-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        {/* Orders with negative margin */}
        {orderSummaries.filter(summary => summary.marginPercentage < 0).length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-red-200">
            <h3 className="text-lg font-medium mb-4 text-red-800 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
              Pedidos com Margem Negativa
            </h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pedido
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Custos
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Margem
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orderSummaries
                    .filter(summary => summary.marginPercentage < 0)
                    .sort((a, b) => a.marginPercentage - b.marginPercentage) // Sort by margin percentage (most negative first)
                    .map(summary => (
                      <tr key={summary.orderId} className="bg-red-50 hover:bg-red-100">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{summary.orderNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {summary.customerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {formatCurrency(summary.totalBudget)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {formatCurrency(summary.totalSpent)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600 text-right">
                          {formatCurrency(summary.margin)} ({summary.marginPercentage.toFixed(1)}%)
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                          <button
                            onClick={() => handleViewOrderDetails(summary.orderId)}
                            className="text-blue-600 hover:text-blue-900 inline-block"
                            title="Ver Detalhes"
                          >
                            <SearchIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Render the list of all costs
  const renderCostList = () => {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium">Todos os Lançamentos de Custo</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleAddCost}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 inline-block mr-2" />
              Novo Lançamento
            </button>
          </div>
        </div>
        
        {searchFilteredCosts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Nenhum lançamento de custo encontrado.</p>
            <button
              onClick={handleAddCost}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 inline-block mr-1" />
              Adicionar Primeiro Lançamento
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pedido
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OC
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fornecedor
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoria
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {searchFilteredCosts.map(cost => (
                  <tr key={cost.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(cost.date), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button
                        onClick={() => handleViewOrderDetails(cost.orderId)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        #{cost.orderNumber}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {cost.purchaseOrderNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {cost.supplierName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {cost.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        cost.category === 'material' ? 'bg-blue-100 text-blue-800' :
                        cost.category === 'service' ? 'bg-green-100 text-green-800' :
                        cost.category === 'labor' ? 'bg-purple-100 text-purple-800' :
                        cost.category === 'logistics' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getCategoryName(cost.category)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(cost.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleEditCost(cost)}
                        className="text-blue-600 hover:text-blue-900 inline-block"
                        title="Editar"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCost(cost)}
                        className="text-red-600 hover:text-red-900 inline-block"
                        title="Excluir"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Centro de Custos</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setViewMode('dashboard')}
            className={`flex items-center px-4 py-2 ${viewMode === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'} rounded-lg hover:bg-blue-700 hover:text-white`}
          >
            <BarChart className="h-5 w-5 mr-2" />
            Dashboard
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center px-4 py-2 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'} rounded-lg hover:bg-blue-700 hover:text-white`}
          >
            <FileText className="h-5 w-5 mr-2" />
            Lançamentos
          </button>
          <button
            onClick={handleGenerateReport}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="h-5 w-5 mr-2" />
            Relatório
          </button>
          {viewMode !== 'order-detail' && (
            <button
              onClick={handleAddCost}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 mr-2" />
              Novo Lançamento
            </button>
          )}
        </div>
      </div>
      
      {/* Help panel */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
        <div className="flex">
          <HelpCircle className="h-6 w-6 text-blue-600 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Centro de Custos</h3>
            <p className="text-sm text-blue-700 mt-1">
              Gerencie os custos de seus pedidos de forma centralizada. Registre todas as despesas relacionadas 
              à produção, incluindo materiais, serviços, mão de obra e logística.
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Acompanhe a rentabilidade de cada projeto, comparando os custos com o valor orçado.
            </p>
          </div>
        </div>
      </div>
      
      {/* Filters */}
      {viewMode !== 'order-detail' && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por descrição, fornecedor, número OC..."
                className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <button 
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <Filter className="h-5 w-5 mr-2" />
              Filtros
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            
            <button
              onClick={handleExportCosts}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              <Download className="h-5 w-5 mr-2" />
              Exportar PDF
            </button>
          </div>
          
          {filterOpen && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">De</label>
                    <input
                      type="date"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Até</label>
                    <input
                      type="date"
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value="">Todas as categorias</option>
                  <option value="material">Materiais</option>
                  <option value="service">Serviços</option>
                  <option value="labor">Mão de Obra</option>
                  <option value="logistics">Logística</option>
                  <option value="other">Outros</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                <select
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value="">Todos os fornecedores</option>
                  {uniqueSuppliers.map(supplier => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número do Pedido</label>
                <select
                  value={orderNumberFilter}
                  onChange={(e) => setOrderNumberFilter(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value="">Todos os pedidos</option>
                  {uniqueOrderNumbers.map(orderNumber => (
                    <option key={orderNumber} value={orderNumber}>
                      #{orderNumber}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="md:col-span-3">
                <button
                  onClick={() => {
                    setCategoryFilter('');
                    setDateFromFilter(format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
                    setDateToFilter(format(new Date(), 'yyyy-MM-dd'));
                    setSupplierFilter('');
                    setOrderNumberFilter('');
                    setSearchTerm('');
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Carregando dados do centro de custos...</p>
        </div>
      ) : (
        <>
          {viewMode === 'dashboard' && renderDashboard()}
          {viewMode === 'list' && renderCostList()}
          {viewMode === 'order-detail' && renderOrderDetail()}
        </>
      )}
      
      {/* Modal for adding/editing cost entries */}
      {isModalOpen && (
        <CostEntryModal
          cost={selectedCost}
          orderId={viewMode === 'order-detail' ? selectedOrderId : undefined}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedCost(null);
          }}
        />
      )}
      
      {/* Modal for generating reports */}
      {isReportModalOpen && (
        <CostReportModal
          onClose={() => setIsReportModalOpen(false)}
        />
      )}
    </div>
  );
};

export default CostCenter;