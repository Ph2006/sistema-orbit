import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase'; // ✅ CORRIGIDO: Caminho correto do Firebase
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye, 
  Calendar, 
  Package, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';
import { MaterialRequisition } from '../types/materials';
import { Order } from '../types/kanban';
import MaterialRequisitionModal from './MaterialRequisitionModal';
import MaterialRequisitionDetailModal from './MaterialRequisitionDetailModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Função para gerar código de rastreabilidade
const generateTraceabilityCode = (orderId: string, itemId: string): string => {
  const timestamp = Date.now().toString().slice(-6);
  const orderPrefix = orderId.slice(-3).toUpperCase();
  const itemPrefix = itemId.slice(-3).toUpperCase();
  return `TR-${orderPrefix}-${itemPrefix}-${timestamp}`;
};

// Função para calcular limite de orçamento (30% do valor do pedido)
const calculateBudgetLimit = (order: any): number => {
  if (!order || !order.items) return 0;
  const totalOrderValue = order.items.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);
  return totalOrderValue * 0.3; // 30% do valor total do pedido
};

const MaterialRequisitions = () => {
  const [requisitions, setRequisitions] = useState<MaterialRequisition[]>([]);
  const [filteredRequisitions, setFilteredRequisitions] = useState<MaterialRequisition[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<MaterialRequisition | null>(null);
  const [editingRequisition, setEditingRequisition] = useState<MaterialRequisition | null>(null);

  // Carregar pedidos (orders) - CORRIGIDO para usar companies/mecald
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        console.log('🔄 Carregando pedidos...');
        const ordersRef = collection(db, 'companies/mecald/orders'); // ✅ CORRIGIDO
        const ordersSnapshot = await getDocs(ordersRef);
        const ordersData = ordersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Order[];
        
        console.log('✅ Pedidos carregados:', ordersData.length);
        setOrders(ordersData);
      } catch (err) {
        console.error('❌ Erro ao carregar pedidos:', err);
        setError('Erro ao carregar pedidos: ' + err.message);
      }
    };

    fetchOrders();
  }, []);

  // Carregar requisições - CORRIGIDO para usar companies/mecald
  useEffect(() => {
    const fetchRequisitions = async () => {
      try {
        console.log('🔄 Carregando requisições...');
        setLoading(true);
        
        const requisitionsRef = collection(db, 'companies/mecald/materialsRequisitions'); // ✅ CORRIGIDO
        const q = query(requisitionsRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const requisitionsData = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Garantir que datas sejam convertidas corretamente
            requestDate: data.requestDate?.toDate?.() ? data.requestDate.toDate().toISOString() : data.requestDate,
            createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt,
            lastUpdated: data.lastUpdated?.toDate?.() ? data.lastUpdated.toDate().toISOString() : data.lastUpdated,
            // Garantir que campos numéricos tenham valores padrão
            totalCost: typeof data.totalCost === 'number' ? data.totalCost : 0,
            budgetLimit: typeof data.budgetLimit === 'number' ? data.budgetLimit : 0,
            budgetExceeded: Boolean(data.budgetExceeded),
            // Garantir que items seja um array
            items: Array.isArray(data.items) ? data.items : []
          };
        }) as MaterialRequisition[];
        
        console.log('✅ Requisições carregadas:', requisitionsData.length);
        setRequisitions(requisitionsData);
        setFilteredRequisitions(requisitionsData);
        
        if (requisitionsData.length === 0) {
          console.log('ℹ️ Nenhuma requisição encontrada');
        }
        
      } catch (err) {
        console.error('❌ Erro ao carregar requisições:', err);
        setError('Erro ao carregar requisições: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRequisitions();
  }, []);

  // Filtrar requisições
  useEffect(() => {
    let filtered = requisitions;

    // Filtro por termo de busca
    if (searchTerm) {
      filtered = filtered.filter(req =>
        req.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.customer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(req => req.status === statusFilter);
    }

    setFilteredRequisitions(filtered);
  }, [requisitions, searchTerm, statusFilter]);

  // Salvar requisição - CORRIGIDO para usar companies/mecald
  const handleSaveRequisition = async (requisitionData: MaterialRequisition) => {
    console.log('💾 === SALVANDO REQUISIÇÃO ===');
    console.log('💾 Dados recebidos:', requisitionData);
    
    try {
      setSaving(true);
      setError('');

      const dataToSave = {
        ...requisitionData,
        // Converter datas para Timestamp do Firebase
        requestDate: Timestamp.fromDate(new Date(requisitionData.requestDate)),
        createdAt: requisitionData.id === 'new' 
          ? Timestamp.fromDate(new Date()) 
          : Timestamp.fromDate(new Date(requisitionData.createdAt)),
        lastUpdated: Timestamp.fromDate(new Date()),
        // Garantir campos numéricos
        totalCost: typeof requisitionData.totalCost === 'number' ? requisitionData.totalCost : 0,
        budgetLimit: typeof requisitionData.budgetLimit === 'number' ? requisitionData.budgetLimit : 0,
        budgetExceeded: Boolean(requisitionData.budgetExceeded)
      };

      // Remover o campo 'id' antes de salvar
      delete dataToSave.id;

      if (requisitionData.id === 'new') {
        console.log('💾 Criando nova requisição...');
        const docRef = await addDoc(collection(db, 'companies/mecald/materialsRequisitions'), dataToSave); // ✅ CORRIGIDO
        console.log('✅ Nova requisição criada com ID:', docRef.id);
        
        // Atualizar a lista local
        const newRequisition = {
          id: docRef.id,
          ...requisitionData,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        setRequisitions(prev => [newRequisition, ...prev]);
        setSuccess('Requisição criada com sucesso!');
      } else {
        console.log('💾 Atualizando requisição existente...');
        const docRef = doc(db, 'companies/mecald/materialsRequisitions', requisitionData.id); // ✅ CORRIGIDO
        await updateDoc(docRef, dataToSave);
        console.log('✅ Requisição atualizada');
        
        // Atualizar a lista local
        setRequisitions(prev => prev.map(req => 
          req.id === requisitionData.id 
            ? { ...requisitionData, lastUpdated: new Date().toISOString() }
            : req
        ));
        setSuccess('Requisição atualizada com sucesso!');
      }

      setShowModal(false);
      setEditingRequisition(null);
      
    } catch (err) {
      console.error('❌ Erro ao salvar requisição:', err);
      setError('Erro ao salvar requisição: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Excluir requisição - CORRIGIDO para usar companies/mecald
  const handleDeleteRequisition = async (requisition: MaterialRequisition) => {
    if (!window.confirm('Tem certeza que deseja excluir esta requisição?')) return;

    try {
      await deleteDoc(doc(db, 'companies/mecald/materialsRequisitions', requisition.id)); // ✅ CORRIGIDO
      setRequisitions(prev => prev.filter(req => req.id !== requisition.id));
      setSuccess('Requisição excluída com sucesso!');
      setShowDetailModal(false);
    } catch (err) {
      console.error('Erro ao excluir requisição:', err);
      setError('Erro ao excluir requisição: ' + err.message);
    }
  };

  // Funções de modal
  const handleNewRequisition = () => {
    setEditingRequisition(null);
    setShowModal(true);
  };

  const handleEditRequisition = (requisition: MaterialRequisition) => {
    console.log('✏️ Editando requisição:', requisition);
    setEditingRequisition(requisition);
    setShowModal(true);
    if (showDetailModal) setShowDetailModal(false);
  };

  const handleViewRequisition = (requisition: MaterialRequisition) => {
    setSelectedRequisition(requisition);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRequisition(null);
  };

  const handleCloseDetailModal = () => {
    setShowDetailModal(false);
    setSelectedRequisition(null);
  };

  // Formatar data
  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      return format(dateObj, 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return 'Data inválida';
    }
  };

  // Formatar moeda
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  // Badge de status
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pendente' },
      partial: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Parcial' },
      complete: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Completa' },
      cancelled: { color: 'bg-gray-100 text-gray-800', icon: AlertCircle, label: 'Cancelada' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </span>
    );
  };

  // Limpar mensagens após tempo
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-lg text-gray-600">Carregando requisições...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-3">
              <Package className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Requisições de Materiais</h1>
                <p className="text-gray-600 text-sm">
                  Gerencie as requisições de materiais para produção
                </p>
              </div>
            </div>
            <button
              onClick={handleNewRequisition}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Requisição
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <div className="flex">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <div className="ml-3">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por pedido, cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Todos os Status</option>
                  <option value="pending">Pendente</option>
                  <option value="partial">Parcial</option>
                  <option value="complete">Completa</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>
            </div>

            <div className="flex items-end">
              <div className="text-sm text-gray-600">
                <strong>{filteredRequisitions.length}</strong> de <strong>{requisitions.length}</strong> requisições
              </div>
            </div>
          </div>
        </div>

        {/* Lista de Requisições */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {filteredRequisitions.length === 0 ? (
            <div className="text-center p-12">
              <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {requisitions.length === 0 
                  ? 'Nenhuma requisição encontrada'
                  : 'Nenhuma requisição corresponde aos filtros'
                }
              </h3>
              <p className="text-gray-600 mb-6">
                {requisitions.length === 0 
                  ? 'Comece criando sua primeira requisição de materiais.'
                  : 'Tente ajustar os filtros ou limpar a busca.'
                }
              </p>
              {requisitions.length === 0 && (
                <button
                  onClick={handleNewRequisition}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Requisição
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pedido / Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data Solicitação
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Itens
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Custo Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Orçamento
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequisitions.map((requisition) => (
                    <tr key={requisition.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            Pedido #{requisition.orderNumber}
                          </div>
                          <div className="text-sm text-gray-500">
                            {requisition.customer}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          {formatDate(requisition.requestDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Package className="h-4 w-4 mr-1" />
                          {requisition.items?.length || 0} {(requisition.items?.length || 0) === 1 ? 'item' : 'itens'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(requisition.totalCost || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(requisition.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {requisition.budgetExceeded ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Excedido
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            OK
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleViewRequisition(requisition)}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEditRequisition(requisition)}
                            className="text-yellow-600 hover:text-yellow-900 p-1 rounded"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRequisition(requisition)}
                            className="text-red-600 hover:text-red-900 p-1 rounded"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modals */}
        {showModal && (
          <MaterialRequisitionModal
            requisition={editingRequisition}
            onClose={handleCloseModal}
            onSave={handleSaveRequisition}
            orders={orders}
            generateTraceabilityCode={generateTraceabilityCode}
            calculateBudgetLimit={calculateBudgetLimit}
          />
        )}

        {showDetailModal && selectedRequisition && (
          <MaterialRequisitionDetailModal
            requisition={selectedRequisition}
            onClose={handleCloseDetailModal}
            onEdit={() => handleEditRequisition(selectedRequisition)}
            onDelete={handleDeleteRequisition}
          />
        )}
      </div>
    </div>
  );
};

export default MaterialRequisitions;
