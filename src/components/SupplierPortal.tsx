import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronDown, 
  Tag, 
  Building, 
  Mail, 
  Phone, 
  Edit, 
  Trash2, 
  ShoppingBag, 
  AlertTriangle,
  Send,
  Check,
  Info,
  RefreshCw,
  Award
} from 'lucide-react';
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Supplier, MaterialRequisition, MaterialRequisitionItem, QuotationRequest } from '../types/materials';
import { format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import SupplierModal from './SupplierModal';
import QuotationRequestModal from './QuotationRequestModal';
import SupplierClassification from './SupplierClassification';

const SupplierPortal: React.FC = () => {
  const [activeTab, setActiveTab] = useState('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [requisitions, setRequisitions] = useState<MaterialRequisition[]>([]);
  const [quotations, setQuotations] = useState<QuotationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<MaterialRequisition | null>(null);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load suppliers
      const suppliersQuery = query(collection(db, getCompanyCollection('suppliers')), orderBy('name', 'asc'));
      const suppliersSnapshot = await getDocs(suppliersQuery);
      const suppliersData = suppliersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Supplier
      }));
      setSuppliers(suppliersData);

      // Setup real-time listeners for requisitions and quotations
      // Requisitions
      const requisitionsQuery = query(collection(db, getCompanyCollection('materialRequisitions')), orderBy('requestDate', 'desc'));
      const unsubscribeRequisitions = onSnapshot(requisitionsQuery, (snapshot) => {
        const requisitionsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as MaterialRequisition
        }));
        setRequisitions(requisitionsData);
      });

      // Quotations
      const quotationsQuery = query(collection(db, getCompanyCollection('quotationRequests')), orderBy('requestDate', 'desc'));
      const unsubscribeQuotations = onSnapshot(quotationsQuery, (snapshot) => {
        const quotationsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as QuotationRequest
        }));
        setQuotations(quotationsData);
      });
      
      setLoading(false);

      // Return unsubscribe functions to clean up listeners later
      return () => {
        unsubscribeRequisitions();
        unsubscribeQuotations();
      };

    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
      // Return a dummy unsubscribe function to avoid errors
      return () => {};
    }
  };
  
  useEffect(() => {
    const unsubscribe = loadData();
    return () => unsubscribe(); // Cleanup listeners on unmount
  }, []);

  const handleAddSupplier = () => {
    setSelectedSupplier(null);
    setIsSupplierModalOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsSupplierModalOpen(true);
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este fornecedor?')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, getCompanyCollection('suppliers'), id));
      // Update local state after deletion
      setSuppliers(prev => prev.filter(supplier => supplier.id !== id));
      alert('Fornecedor excluído com sucesso!');
    } catch (error) {
      console.error('Error deleting supplier:', error);
      alert('Erro ao excluir fornecedor.');
    }
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    
    if (!availableCategories.includes(newCategory.trim())) {
      setAvailableCategories([...availableCategories, newCategory.trim()].sort());
    }
    
    // If applying a filter, add to filter list
    if (!categoryFilter.includes(newCategory.trim())) {
      setCategoryFilter([...categoryFilter, newCategory.trim()]);
    }
    
    setNewCategory('');
  };

  const handleSaveSupplier = async (supplier: Supplier) => {
    try {
      if (supplier.id && supplier.id !== 'new') {
        // Update
        const supplierRef = doc(db, getCompanyCollection('suppliers'), supplier.id);
        await updateDoc(supplierRef, {
          name: supplier.name,
          cnpj: supplier.cnpj,
          email: supplier.email,
          phone: supplier.phone,
          address: supplier.address,
          contactPerson: supplier.contactPerson,
          category: supplier.category,
          paymentTerms: supplier.paymentTerms,
          deliveryTimeAvg: supplier.deliveryTimeAvg,
          notes: supplier.notes,
          status: supplier.status
        });
        // Update local state after update
        setSuppliers(prev => prev.map(s => s.id === supplier.id ? supplier : s));
        alert('Fornecedor atualizado com sucesso!');
      } else {
        // Create
        const { id, ...supplierData } = supplier;
        const newSupplier = {
          ...supplierData,
          createdAt: new Date().toISOString()
        };
        
        const docRef = await addDoc(collection(db, getCompanyCollection('suppliers')), newSupplier);
        // Add to local state
        setSuppliers(prev => [...prev, { ...newSupplier, id: docRef.id }]);
        alert('Fornecedor criado com sucesso!');
      }
      
      setIsSupplierModalOpen(false);
      setSelectedSupplier(null);
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert('Erro ao salvar fornecedor.');
    }
  };

  const handleCreateQuotation = (requisition: MaterialRequisition) => {
    setSelectedRequisition(requisition);
    setIsQuotationModalOpen(true);
  };

  const handleSaveQuotationRequest = async (quotation: QuotationRequest, itemIds: string[]) => {
    try {
      if (quotation.id && quotation.id !== 'new') {
        // Update existing quotation
        const quotationRef = doc(db, getCompanyCollection('quotationRequests'), quotation.id);
        await updateDoc(quotationRef, quotation);
      } else {
        // Create new quotation
        const { id, ...quotationData } = quotation;
        await addDoc(collection(db, getCompanyCollection('quotationRequests')), quotationData);
      }
      
      // Mark requisition items as sent for quotation
      if (selectedRequisition && itemIds.length > 0) {
        const requisitionRef = doc(db, getCompanyCollection('materialRequisitions'), selectedRequisition.id);
        const updatedItems = selectedRequisition.items.map(item => {
          if (itemIds.includes(item.id)) {
            return {
              ...item,
              sentForQuotation: true
            };
          }
          return item;
        });
        
        await updateDoc(requisitionRef, {
          items: updatedItems,
          lastUpdated: new Date().toISOString()
        });
      }
      
      setIsQuotationModalOpen(false);
      setSelectedRequisition(null);
      alert('Solicitação de cotação enviada com sucesso!');
    } catch (error) {
      console.error('Error saving quotation request:', error);
      alert('Erro ao salvar solicitação de cotação.');
    }
  };

  // Filter suppliers
  const filteredSuppliers = suppliers.filter(supplier => {
    // Apply search filter
    const matchesSearch = !searchTerm || 
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.cnpj.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply category filter
    const matchesCategory = categoryFilter.length === 0 || 
      categoryFilter.some(category => supplier.category.includes(category));
    
    // Apply status filter
    const matchesStatus = statusFilter.length === 0 || 
      statusFilter.includes(supplier.status);
    
    return matchesSearch && matchesCategory && matchesStatus;
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Portal do Fornecedor</h2>
        <div className="flex space-x-4">
          {activeTab === 'suppliers' && (
            <>
              <button
                onClick={handleAddSupplier}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Novo Fornecedor
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
        <div className="flex">
          <Info className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Portal do Fornecedor</h3>
            <p className="text-sm text-blue-700 mt-1">
              Gerencie seus fornecedores, envie solicitações de cotação e acompanhe o status das requisições.
              Os fornecedores cadastrados estarão disponíveis para seleção nas requisições de materiais.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 font-medium ${activeTab === 'suppliers' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Building className="h-5 w-5 inline-block mr-1" />
          Fornecedores
        </button>
        <button
          onClick={() => setActiveTab('requisitions')}
          className={`px-4 py-2 font-medium ${activeTab === 'requisitions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <ShoppingBag className="h-5 w-5 inline-block mr-1" />
          Requisições Pendentes
        </button>
        <button
          onClick={() => setActiveTab('quotations')}
          className={`px-4 py-2 font-medium ${activeTab === 'quotations' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Send className="h-5 w-5 inline-block mr-1" />
          Cotações
        </button>
        <button
          onClick={() => setActiveTab('classification')}
          className={`px-4 py-2 font-medium ${activeTab === 'classification' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Award className="h-5 w-5 inline-block mr-1" />
          Classificação
        </button>
      </div>

      {activeTab === 'classification' ? (
        <SupplierClassification />
      ) : activeTab === 'suppliers' && (
        <>
          {/* Filters for suppliers tab */}
          <div className="mb-6 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, CNPJ ou email..."
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

            {(categoryFilter.length > 0 || statusFilter.length > 0) && (
              <button
                onClick={() => {
                  setCategoryFilter([]);
                  setStatusFilter([]);
                }}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {filterOpen && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria de Materiais</label>
                <div className="h-48 overflow-y-auto border rounded-md p-2">
                  {availableCategories.map(category => (
                    <div key={category} className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        id={`category-${category}`}
                        checked={categoryFilter.includes(category)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCategoryFilter([...categoryFilter, category]);
                          } else {
                            setCategoryFilter(categoryFilter.filter(cat => cat !== category));
                          }
                        }}
                        className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`category-${category}`} className="ml-2 text-sm text-gray-700">
                        {category}
                      </label>
                    </div>
                  ))}
                  {availableCategories.length === 0 && (
                    <p className="text-gray-500 text-sm py-2">Nenhuma categoria cadastrada.</p>
                  )}
                </div>
                
                {/* Add new category section */}
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adicionar Nova Categoria
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="flex-grow rounded-l-md border-r-0 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Ex: Aço, Parafusos"
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="bg-blue-600 text-white px-3 py-2 rounded-r-md hover:bg-blue-700"
                      disabled={!newCategory.trim()}
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div className="space-y-2">
                  {['active', 'inactive', 'blocked'].map(status => (
                    <div key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`status-${status}`}
                        checked={statusFilter.includes(status)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setStatusFilter([...statusFilter, status]);
                          } else {
                            setStatusFilter(statusFilter.filter(s => s !== status));
                          }
                        }}
                        className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`status-${status}`} className="ml-2 text-sm text-gray-700">
                        {status === 'active' ? 'Ativo' :
                         status === 'inactive' ? 'Inativo' :
                         'Bloqueado'}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Suppliers List */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Carregando fornecedores...</p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum fornecedor encontrado</h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || categoryFilter.length > 0 || statusFilter.length > 0
                  ? 'Não há fornecedores correspondentes aos filtros aplicados.'
                  : 'Comece cadastrando seu primeiro fornecedor.'}
              </p>
              <button
                onClick={handleAddSupplier}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-5 w-5 mr-2" />
                Novo Fornecedor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSuppliers.map(supplier => (
                <div 
                  key={supplier.id} 
                  className={`bg-white rounded-lg shadow-md border overflow-hidden ${
                    supplier.status === 'active' 
                      ? 'border-green-200' 
                      : supplier.status === 'inactive' 
                      ? 'border-yellow-200'
                      : 'border-red-200'
                  }`}
                >
                  <div className={`p-4 ${
                    supplier.status === 'active' 
                      ? 'bg-green-50' 
                      : supplier.status === 'inactive' 
                      ? 'bg-yellow-50'
                      : 'bg-red-50'
                  }`}>
                    <div className="flex justify-between">
                      <h3 className="font-medium text-lg">{supplier.name}</h3>
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        supplier.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : supplier.status === 'inactive' 
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {supplier.status === 'active' ? 'Ativo' : 
                         supplier.status === 'inactive' ? 'Inativo' : 'Bloqueado'}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm mt-1">CNPJ: {supplier.cnpj}</p>
                  </div>
                  
                  <div className="p-4">
                    <div className="space-y-3 text-sm">
                      <div className="flex items-start">
                        <Mail className="h-4 w-4 text-gray-500 mr-2 mt-0.5" />
                        <div>
                          <div className="text-gray-700">{supplier.email}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-start">
                        <Phone className="h-4 w-4 text-gray-500 mr-2 mt-0.5" />
                        <div>
                          <div className="text-gray-700">{supplier.phone}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-start">
                        <Tag className="h-4 w-4 text-gray-500 mr-2 mt-0.5" />
                        <div>
                          <div className="text-gray-700">
                            {supplier.category.join(', ')}
                          </div>
                        </div>
                      </div>
                      
                      {supplier.contactPerson && (
                        <div className="text-gray-700">
                          <span className="text-gray-500">Contato:</span> {supplier.contactPerson}
                        </div>
                      )}

                      {supplier.evaluationScore && (
                        <div className="flex items-start">
                          <Award className="h-4 w-4 text-blue-500 mr-2 mt-0.5" />
                          <div>
                            <div className="text-gray-700">
                              Avaliação: {supplier.evaluationScore.toFixed(1)}/5
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-end mt-4 space-x-2">
                      <button
                        onClick={() => handleEditSupplier(supplier)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Editar Fornecedor"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Excluir Fornecedor"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'requisitions' && (
        <>
          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-lg font-medium">Requisições Pendentes para Cotação</h3>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center text-blue-600 hover:text-blue-800"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Carregando requisições...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {getPendingRequisitionItems().length === 0 ? (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                  <ShoppingBag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma requisição pendente</h3>
                  <p className="text-gray-600">
                    Não há requisições de materiais pendentes para cotação no momento.
                  </p>
                </div>
              ) : (
                getPendingRequisitionItems().map(({ requisition, pendingItems }) => (
                  <div key={requisition.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                    <div className="p-4 bg-blue-50 border-b flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-lg">
                          Requisição para Pedido #{requisition.orderNumber}
                        </h3>
                        <p className="text-gray-600 text-sm mt-1">
                          Cliente: {requisition.customer} | Data: {format(new Date(requisition.requestDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCreateQuotation(requisition)}
                        className="flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Solicitar Cotação
                      </button>
                    </div>
                    
                    <div className="p-4">
                      <h4 className="font-medium mb-3">Itens Pendentes de Cotação ({pendingItems.length})</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Código
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Descrição
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Material
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Quantidade
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Dimensões
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Peso Total
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {pendingItems.map(item => (
                              <tr key={item.id}>
                                <td className="px-3 py-2 whitespace-nowrap text-sm">
                                  <div className="flex items-center">
                                    <Tag className="h-4 w-4 text-gray-500 mr-1" />
                                    <span className="font-mono text-xs">{item.traceabilityCode}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {item.description}
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {item.material}
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {item.quantity}
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {item.dimensions}
                                </td>
                                <td className="px-3 py-2 text-sm">
                                  {item.totalWeight.toLocaleString('pt-BR')} kg
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))
              )}
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
              <Send className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma solicitação de cotação</h3>
              <p className="text-gray-600">
                Não há solicitações de cotação no momento. Vá para a aba de Requisições Pendentes para criar uma nova.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {quotations.map(quotation => {
                const supplier = suppliers.find(s => s.id === quotation.supplierId);
                
                // Check if quotation is expired
                const expired = isAfter(new Date(), new Date(quotation.expirationDate)) && 
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
                    <div className={`p-4 flex justify-between items-center ${
                      quotation.status === 'responded' ? 'bg-green-50' :
                      quotation.status === 'accepted' ? 'bg-blue-50' :
                      expired ? 'bg-red-50' :
                      'bg-gray-50'
                    }`}>
                      <div>
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
                        <div className="text-sm text-gray-600 mt-1">
                          <span>Enviada em: {format(new Date(quotation.requestDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
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
                      
                      <div className="flex space-x-2">
                        {quotation.status === 'responded' && (
                          <button
                            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            onClick={() => {
                              // Logic to accept the quotation would go here
                              alert('Funcionalidade para aceitar cotação será implementada em breve.');
                            }}
                          >
                            <Check className="h-4 w-4 mr-1 inline-block" />
                            Aceitar
                          </button>
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
                          {quotation.status === 'responded' && (
                            <tfoot className="bg-gray-50">
                              <tr>
                                <td colSpan={8} className="px-3 py-2 text-sm font-medium text-right">Valor Total:</td>
                                <td className="px-3 py-2 text-sm font-medium">
                                  {quotation.items.reduce((sum, item) => sum + (item.finalPrice || 0), 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                </td>
                              </tr>
                            </tfoot>
                          )}
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

      {/* Supplier Modal */}
      {isSupplierModalOpen && (
        <SupplierModal
          supplier={selectedSupplier}
          onClose={() => {
            setIsSupplierModalOpen(false);
            setSelectedSupplier(null);
          }}
          onSave={handleSaveSupplier}
          existingCategories={availableCategories}
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
    </div>
  );
};

export default SupplierPortal;