import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Calendar as CalendarIcon, 
  List, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Hourglass, 
  Package, 
  Ship, 
  ClipboardList, 
  Briefcase, 
  FileText, 
  Download
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useOrderStore } from '../store/orderStore';
import { useSupplierStore } from '../store/supplierStore';
import { Order } from '../types/kanban';
import { MaterialRequisition, MaterialRequisitionItem, Supplier, QuotationRequest } from '../types/materials';
import MaterialRequisitionModal from './MaterialRequisitionModal';
import MaterialRequisitionDetailModal from './MaterialRequisitionDetailModal';
import QuotationRequestModal from './QuotationRequestModal';
import CuttingPlanCalculator from './CuttingPlanCalculator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Helper function to sanitize data for Firestore
const sanitizeForFirestore = (data: any): any => {
  if (data === undefined) {
    return null;
  }
  
  if (data === null || typeof data !== 'object') {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item));
  }
  
  const sanitizedData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    sanitizedData[key] = sanitizeForFirestore(value);
  }
  
  return sanitizedData;
};

const MaterialRequisitions: React.FC = () => {
  const [requisitions, setRequisitions] = useState<MaterialRequisition[]>([]);
  const [quotations, setQuotations] = useState<QuotationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isCuttingPlanModalOpen, setIsCuttingPlanModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<MaterialRequisition | null>(null);
  const [activeTab, setActiveTab] = useState<'requisitions' | 'quotations' | 'cutting-plan'>('requisitions');
  
  const { orders } = useOrderStore();
  const { suppliers, loadSuppliers, subscribeToSuppliers } = useSupplierStore();

  useEffect(() => {
    // Subscribe to order updates
    const unsubscribe = useOrderStore.getState().subscribeToOrders();
    return () => unsubscribe();
  }, []);

  // Load suppliers when component mounts
  useEffect(() => {
    const unsubscribe = subscribeToSuppliers();
    
    if (suppliers.length === 0) {
      loadSuppliers();
    }
    
    return () => unsubscribe();
  }, [subscribeToSuppliers, loadSuppliers, suppliers.length]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch requisitions
        const requisitionsQuery = query(
          collection(db, 'materialRequisitions'),
          orderBy('requestDate', 'desc')
        );
        const requisitionSnapshot = await getDocs(requisitionsQuery);
        const requisitionsData = requisitionSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MaterialRequisition[];
        setRequisitions(requisitionsData);
        
        // Fetch quotation requests
        const quotationsQuery = query(
          collection(db, 'quotationRequests'),
          orderBy('requestDate', 'desc')
        );
        const quotationSnapshot = await getDocs(quotationsQuery);
        const quotationsData = quotationSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as QuotationRequest[];
        setQuotations(quotationsData);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleAddRequisition = () => {
    setSelectedRequisition(null);
    setIsModalOpen(true);
  };

  const handleOpenCuttingPlan = () => {
    setIsCuttingPlanModalOpen(true);
  };

  const handleViewRequisition = (requisition: MaterialRequisition) => {
    setSelectedRequisition(requisition);
    setIsDetailModalOpen(true);
  };

  const handleEditRequisition = (requisition: MaterialRequisition) => {
    setSelectedRequisition(requisition);
    setIsModalOpen(true);
  };

  const handleSaveRequisition = async (requisition: MaterialRequisition) => {
    try {
      if (requisition.id === 'new') {
        // Create new requisition
        const { id, ...requisitionData } = requisition;
        // Sanitize data for Firestore before saving
        const sanitizedData = sanitizeForFirestore(requisitionData);
        const docRef = await addDoc(collection(db, 'materialRequisitions'), sanitizedData);
        
        // Update local state with the new requisition
        setRequisitions([...requisitions, { ...requisition, id: docRef.id }]);
        
        alert('Requisição criada com sucesso!');
      } else {
        // Update existing requisition
        const { id, ...requisitionData } = requisition;
        // Sanitize data for Firestore before saving
        const sanitizedData = sanitizeForFirestore(requisitionData);
        await updateDoc(doc(db, 'materialRequisitions', id), sanitizedData);
        
        // Update local state
        setRequisitions(requisitions.map(r => 
          r.id === requisition.id ? requisition : r
        ));
        
        alert('Requisição atualizada com sucesso!');
      }
      
      setIsModalOpen(false);
      setSelectedRequisition(null);
    } catch (error) {
      console.error('Error saving requisition:', error);
      alert('Erro ao salvar requisição. Por favor, tente novamente.');
    }
  };

  const handleCreateQuotation = (requisition: MaterialRequisition) => {
    setSelectedRequisition(requisition);
    setIsQuotationModalOpen(true);
  };

  const handleSaveQuotationRequest = async (quotation: QuotationRequest, itemIds: string[]) => {
    try {
      // Sanitize data for Firestore before saving
      const sanitizedQuotation = sanitizeForFirestore(quotation);
      // Add the quotation request
      const docRef = await addDoc(collection(db, 'quotationRequests'), sanitizedQuotation);
      
      // Update the requisition items to mark them as sent for quotation
      if (selectedRequisition) {
        const updatedItems = selectedRequisition.items.map(item => {
          if (itemIds.includes(item.id)) {
            return {
              ...item,
              sentForQuotation: true
            };
          }
          return item;
        });
        
        const updateData = sanitizeForFirestore({
          items: updatedItems,
          lastUpdated: new Date().toISOString()
        });
        
        await updateDoc(doc(db, 'materialRequisitions', selectedRequisition.id), updateData);
        
        // Update local state
        setRequisitions(requisitions.map(r => 
          r.id === selectedRequisition.id 
            ? { ...r, items: updatedItems, lastUpdated: new Date().toISOString() } 
            : r
        ));
      }
      
      setQuotations([...quotations, { ...quotation, id: docRef.id }]);
      setIsQuotationModalOpen(false);
      alert('Solicitação de cotação enviada com sucesso!');
    } catch (error) {
      console.error('Error saving quotation request:', error);
      alert('Erro ao salvar solicitação de cotação.');
    }
  };

  // Helper function to generate a traceability code
  const generateTraceabilityCode = (orderId: string, itemId: string): string => {
    const order = orders.find(o => o.id === orderId);
    const item = order?.items.find(i => i.id === itemId);
    
    if (!order || !item) return "TC-UNKNOWN";
    
    // Create a code with order number and item number
    return `TC-${order.orderNumber}-${item.itemNumber}`;
  };

  // Calculate 30% of the order budget
  const calculateBudgetLimit = (order: MaterialRequisition): number => {
    // Find the main order to get budget
    const mainOrder = orders.find(o => o.orderNumber === order.orderNumber);
    if (!mainOrder) return 0;
    
    // Calculate total budget from all items
    const totalBudget = mainOrder.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    
    // Return 30% of the budget
    return totalBudget * 0.3;
  };

  // Filter requisitions based on search term, status, and date
  const filteredRequisitions = requisitions.filter(req => {
    // Apply search filter
    const matchesSearch = !searchTerm || 
      req.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.customer.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply status filter
    const matchesStatus = !statusFilter || req.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Get pending requisition items that need quotes
  const getPendingRequisitionItems = () => {
    return requisitions
      .filter(req => req.status !== 'complete' && req.status !== 'cancelled')
      .flatMap(req => ({
        requisition: req,
        pendingItems: req.items.filter(item => 
          item.status === 'pending' && !item.sentForQuotation
        )
      }))
      .filter(item => item.pendingItems.length > 0);
  };

  // Process orders for display
  const activeOrders = orders.filter(o => !o.deleted);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Requisições de Materiais</h2>
        <div className="flex space-x-4">
          <button
            onClick={handleOpenCuttingPlan}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileText className="h-5 w-5 mr-2" />
            Plano de Corte
          </button>
          <button
            onClick={handleAddRequisition}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Requisição
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button 
          onClick={() => setActiveTab('requisitions')} 
          className={`px-4 py-2 font-medium ${activeTab === 'requisitions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Package className="h-5 w-5 inline-block mr-2" />
          Requisições
        </button>
        <button 
          onClick={() => setActiveTab('quotations')} 
          className={`px-4 py-2 font-medium ${activeTab === 'quotations' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Package className="h-5 w-5 inline-block mr-2" />
          Cotações
        </button>
        <button 
          onClick={() => setActiveTab('cutting-plan')} 
          className={`px-4 py-2 font-medium ${activeTab === 'cutting-plan' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <FileText className="h-5 w-5 mr-2 inline-block" />
          Plano de Corte
        </button>
      </div>

      {activeTab === 'requisitions' && (
        <>
          {/* Search and filters */}
          <div className="mb-6 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por número do pedido ou cliente..."
                className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos os status</option>
                <option value="pending">Pendente</option>
                <option value="partial">Recebimento Parcial</option>
                <option value="complete">Completa</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            
            {(statusFilter !== '' || searchTerm) && (
              <button
                onClick={() => {
                  setStatusFilter('');
                  setSearchTerm('');
                }}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {/* Requisitions list */}
          {loading ? (
            <div className="text-center py-12">
              <div className="text-lg text-gray-600">Carregando requisições...</div>
            </div>
          ) : filteredRequisitions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center">
              <p className="text-gray-500">Nenhuma requisição de material encontrada.</p>
              <button
                onClick={handleAddRequisition}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 inline-block mr-2" />
                Nova Requisição
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredRequisitions.map(requisition => {
                // Check if budget is exceeded
                const budgetExceeded = requisition.budgetExceeded;
                
                // Get counts for each status
                const pendingItems = requisition.items.filter(item => item.status === 'pending').length;
                const orderedItems = requisition.items.filter(item => item.status === 'ordered').length;
                const receivedItems = requisition.items.filter(item => item.status === 'received' || item.status === 'stock').length;
                
                return (
                  <div key={requisition.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="p-4 bg-gray-50 flex justify-between items-start border-b">
                      <div>
                        <h3 className="text-xl font-bold">Requisição para Pedido #{requisition.orderNumber}</h3>
                        <p className="text-gray-600 mt-1">
                          Cliente: {requisition.customer}
                        </p>
                        <p className="text-gray-600">
                          Data da Solicitação: {format(new Date(requisition.requestDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                        
                        {/* Budget info with warning if exceeded */}
                        {budgetExceeded && (
                          <div className="mt-2 bg-red-50 text-red-800 px-3 py-1 rounded-md inline-block">
                            <AlertTriangle className="h-4 w-4 inline-block mr-1" />
                            Orçamento excedido
                          </div>
                        )}
                        
                        <div className="flex mt-3 space-x-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            requisition.status === 'complete' 
                              ? 'bg-green-100 text-green-800' 
                              : requisition.status === 'partial'
                              ? 'bg-blue-100 text-blue-800'
                              : requisition.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {requisition.status === 'complete' 
                              ? 'Completa' 
                              : requisition.status === 'partial'
                              ? 'Parcial'
                              : requisition.status === 'cancelled'
                              ? 'Cancelada'
                              : 'Pendente'}
                          </span>
                          
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                            {requisition.items.length} itens
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        {(pendingItems > 0 && requisition.status !== 'cancelled') && (
                          <button
                            onClick={() => handleCreateQuotation(requisition)}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            <Download className="h-4 w-4 inline-block mr-1" />
                            Solicitar Cotação
                          </button>
                        )}
                        <button
                          onClick={() => handleViewRequisition(requisition)}
                          className="px-3 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                        >
                          <FileText className="h-4 w-4 inline-block mr-1" />
                          Detalhes
                        </button>
                        <button
                          onClick={() => handleEditRequisition(requisition)}
                          className="px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                        >
                          <Edit className="h-4 w-4 inline-block mr-1" />
                          Editar
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="text-sm text-gray-500">Pendentes</div>
                          <div className="text-xl font-bold">{pendingItems}</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="text-sm text-gray-500">Encomendados</div>
                          <div className="text-xl font-bold">{orderedItems}</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="text-sm text-gray-500">Recebidos</div>
                          <div className="text-xl font-bold">{receivedItems}</div>
                        </div>
                        <div className={`p-3 rounded-lg border ${
                          budgetExceeded ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                        }`}>
                          <div className="text-sm text-gray-500">
                            {budgetExceeded ? 'Custo Total (Excedido)' : 'Custo Total'}
                          </div>
                          <div className={`text-xl font-bold ${
                            budgetExceeded ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {requisition.totalCost.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL'
                            })}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Limite: {requisition.budgetLimit?.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL'
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'quotations' && (
        <>
          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-lg font-medium">Solicitações de Cotação</h3>
          </div>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Carregando cotações...</p>
            </div>
          ) : quotations.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma solicitação de cotação</h3>
              <p className="text-gray-600">
                Não há solicitações de cotação no momento. Vá para a aba de Requisições para criar uma nova.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {quotations.map(quotation => {
                const supplier = suppliers.find(s => s.id === quotation.supplierId);
                
                // Check if quotation is expired
                const expired = new Date() > new Date(quotation.expirationDate) && 
                                quotation.status === 'pending';
                
                return (
                  <div 
                    key={quotation.id} 
                    className={`bg-white rounded-lg shadow-md overflow-hidden border ${
                      quotation.status === 'responded' ? 'border-green-200' :
                      quotation.status === 'accepted' ? 'border-blue-200' :
                      expired ? 'border-red-200' :
                      'border-gray-200'
                    }`}
                  >
                    <div className={`p-4 ${
                      quotation.status === 'responded' ? 'bg-green-50' :
                      quotation.status === 'accepted' ? 'bg-blue-50' :
                      expired ? 'bg-red-50' :
                      'bg-gray-50'
                    }`}>
                      <div className="flex justify-between">
                        <h4 className="font-medium text-lg flex items-center">
                          Cotação para {supplier?.name || 'Fornecedor não encontrado'}
                          <span className={`ml-3 px-2 py-0.5 text-xs rounded-full ${
                            quotation.status === 'pending' && !expired ? 'bg-yellow-100 text-yellow-800' :
                            quotation.status === 'responded' ? 'bg-green-100 text-green-800' :
                            quotation.status === 'accepted' ? 'bg-blue-100 text-blue-800' :
                            quotation.status === 'expired' || expired ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {quotation.status === 'pending' && !expired ? 'Pendente' :
                             quotation.status === 'responded' ? 'Respondida' :
                             quotation.status === 'accepted' ? 'Aceita' :
                             'Expirada'}
                          </span>
                        </h4>
                        <div className="flex items-center text-sm text-gray-500">
                          <CalendarIcon className="h-4 w-4 mr-1" />
                          {format(new Date(quotation.requestDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </div>
                      </div>
                      
                      <div className="text-sm text-gray-600 mt-1">
                        <span>Itens: {quotation.items.length}</span>
                        <span className="mx-2">|</span>
                        <span>Expira em: {format(new Date(quotation.expirationDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                        {quotation.responseDate && (
                          <>
                            <span className="mx-2">|</span>
                            <span>Respondida em: {format(new Date(quotation.responseDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Descrição
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Material
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Qtd
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Dimensões
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Peso
                              </th>
                              {quotation.status === 'responded' && (
                                <>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Preço/kg
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    IPI (%)
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Prazo
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Preço Total
                                  </th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {quotation.items.map(item => (
                              <tr key={item.id}>
                                <td className="px-3 py-2 text-sm">{item.description}</td>
                                <td className="px-3 py-2 text-sm">{item.material}</td>
                                <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                <td className="px-3 py-2 text-sm">{item.dimensions}</td>
                                <td className="px-3 py-2 text-sm">{item.weight.toLocaleString('pt-BR')} kg</td>
                                {quotation.status === 'responded' && (
                                  <>
                                    <td className="px-3 py-2 text-sm">
                                      {item.pricePerKg?.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                    </td>
                                    <td className="px-3 py-2 text-sm">
                                      {item.ipiPercentage?.toLocaleString('pt-BR')}%
                                    </td>
                                    <td className="px-3 py-2 text-sm">
                                      {item.deliveryTime} dias
                                    </td>
                                    <td className="px-3 py-2 text-sm font-medium">
                                      {item.finalPrice?.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {quotation.notes && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <h5 className="text-sm font-medium text-gray-700">Observações:</h5>
                          <p className="mt-1 text-sm text-gray-600">{quotation.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'cutting-plan' && (
        <CuttingPlanCalculator />
      )}

      {/* Material Requisition Modal */}
      {isModalOpen && (
        <MaterialRequisitionModal
          requisition={selectedRequisition}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedRequisition(null);
          }}
          onSave={handleSaveRequisition}
          orders={activeOrders}
          generateTraceabilityCode={generateTraceabilityCode}
          calculateBudgetLimit={calculateBudgetLimit}
        />
      )}

      {/* Material Requisition Detail Modal */}
      {isDetailModalOpen && selectedRequisition && (
        <MaterialRequisitionDetailModal
          requisition={selectedRequisition}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedRequisition(null);
          }}
          onEdit={() => {
            setIsDetailModalOpen(false);
            setIsModalOpen(true);
          }}
        />
      )}

      {/* Quotation Request Modal */}
      {isQuotationModalOpen && selectedRequisition && (
        <QuotationRequestModal
          requisition={selectedRequisition}
          suppliers={suppliers.filter(s => s.status === 'active')}
          onClose={() => {
            setIsQuotationModalOpen(false);
            setSelectedRequisition(null);
          }}
          onSave={handleSaveQuotationRequest}
        />
      )}

      {/* Cutting Plan Modal */}
      {isCuttingPlanModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-6xl w-full h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Plano de Corte</h2>
              <button onClick={() => setIsCuttingPlanModalOpen(false)}>
                <X className="h-6 w-6" />
              </button>
            </div>
            <CuttingPlanCalculator />
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialRequisitions;