import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, Calendar, User, Package } from 'lucide-react';
import { useOrderStore } from '../store/orderStore';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import OrderModal from './OrderModal';

// Definir os tipos Order e OrderStatus já que não conseguimos acessar o arquivo types/order.ts
type OrderStatus = 'in-progress' | 'completed' | 'on-hold' | 'cancelled' | string;

interface Order {
  id: string;
  orderNumber?: string;
  customer?: string;
  customerName?: string;
  internalOrderNumber?: string;
  serviceOrder?: string;
  internalOS?: string;
  project?: string;
  projectName?: string;
  startDate?: string;
  deliveryDate?: string;
  completionDate?: string;
  status?: OrderStatus;
  createdAt?: string;
  updatedAt?: string;
  items?: any[];
  [key: string]: any; // Para acomodar campos adicionais
}

export default function Orders() {
  const { 
    orders, 
    loading, 
    error, 
    fetchOrders, 
    deleteOrder, 
    setSelectedOrder,
    subscribeToOrders,
    clearError 
  } = useOrderStore();
  
  const { user, hasPermission } = useAuthStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedOrder, setSelectedOrderState] = useState<Order | null>(null);

  // Carregar pedidos ao montar o componente
  useEffect(() => {
    console.log("Orders component: Attempting to fetch orders");
    if (user) {
      try {
        fetchOrders();
        
        // Subscrever a mudanças em tempo real
        const unsubscribe = subscribeToOrders();
        return () => {
          try {
            unsubscribe();
          } catch (error) {
            console.error("Error unsubscribing from orders:", error);
          }
        };
      } catch (error) {
        console.error("Error in Orders useEffect:", error);
      }
    }
  }, [user, fetchOrders, subscribeToOrders]);

  // Limpar erro quando componente desmonta
  useEffect(() => {
    return () => {
      try {
        clearError();
      } catch (error) {
        console.error("Error clearing error state:", error);
      }
    };
  }, [clearError]);

  // Função auxiliar para campo seguro
  const safeField = (order: Order, fields: string[]): string => {
    for (const field of fields) {
      if (order[field] && typeof order[field] === 'string') {
        return order[field] as string;
      }
    }
    return '';
  };

  // Filtrar pedidos
  const filteredOrders = orders.filter(order => {
    if (!order) return false;
    
    const orderNumber = safeField(order, ['orderNumber', 'id']);
    const customer = safeField(order, ['customer', 'customerName']);
    const project = safeField(order, ['project', 'projectName']);
    const internalOS = safeField(order, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
    
    const matchesSearch = searchTerm === '' || 
      orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.toLowerCase().includes(searchTerm.toLowerCase()) ||
      internalOS.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      order.status === statusFilter || 
      mapStatus(order.status || '') === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Handlers para o modal
  const handleCreateOrder = () => {
    setSelectedOrderState(null);
    setSelectedOrder(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleEditOrder = (order: Order) => {
    setSelectedOrderState(order);
    setSelectedOrder(order);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrderState(order);
    setSelectedOrder(order);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!order.id) {
      alert('ID do pedido não encontrado');
      return;
    }

    const confirmDelete = window.confirm(
      `Tem certeza que deseja deletar o pedido #${order.orderNumber || order.id}?`
    );
    
    if (confirmDelete) {
      try {
        await deleteOrder(order.id);
      } catch (error) {
        console.error('Erro ao deletar pedido:', error);
        alert('Erro ao deletar pedido');
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedOrderState(null);
    setSelectedOrder(null);
  };

  // Função para mapear status do banco de dados para exibição
  const mapStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      'in-progress': 'Em Processo',
      'completed': 'Concluído',
      'on-hold': 'Em Pausa',
      'cancelled': 'Cancelado',
      'shipped': 'Expedido',
      'delayed': 'Atrasado',
      'waiting-docs': 'Aguardando Docs'
    };
    return statusMap[status] || status;
  };

  // Função para formatar data
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return '-';
    }
  };

  // Função para obter cor do status
  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    
    if (normalizedStatus.includes('conclu') || normalizedStatus === 'completed') {
      return 'bg-green-100 text-green-800';
    }
    if (normalizedStatus.includes('processo') || normalizedStatus === 'in-progress') {
      return 'bg-blue-100 text-blue-800';
    }
    if (normalizedStatus.includes('pausa') || normalizedStatus === 'on-hold' || normalizedStatus === 'paralisado') {
      return 'bg-yellow-100 text-yellow-800';
    }
    if (normalizedStatus.includes('cancel') || normalizedStatus === 'cancelled') {
      return 'bg-red-100 text-red-800';
    }
    if (normalizedStatus.includes('exped') || normalizedStatus === 'shipped') {
      return 'bg-purple-100 text-purple-800';
    }
    if (normalizedStatus.includes('atras') || normalizedStatus === 'delayed') {
      return 'bg-orange-100 text-orange-800';
    }
    
    return 'bg-gray-100 text-gray-800';
  };

  // Verificar e logar os dados dos pedidos para debug
  console.log("Orders data:", orders?.slice(0, 3));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-gray-600">Gerenciamento de pedidos e projetos</p>
        </div>
        
        <button
          onClick={handleCreateOrder}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Pedido
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por número, cliente ou OS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos os status</option>
              <option value="in-progress">Em Processo</option>
              <option value="completed">Concluído</option>
              <option value="on-hold">Em Pausa</option>
              <option value="shipped">Expedido</option>
              <option value="delayed">Atrasado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mensagem de erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-400 mr-3">⚠️</div>
            <div>
              <h3 className="text-sm font-medium text-red-800">Erro</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <button 
              onClick={clearError}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Lista de Pedidos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Carregando pedidos...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter !== 'all' ? 'Nenhum pedido encontrado' : 'Nenhum pedido cadastrado'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || statusFilter !== 'all' 
                ? 'Tente ajustar os filtros de busca'
                : 'Comece criando seu primeiro pedido'
              }
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <button
                onClick={handleCreateOrder}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors mx-auto"
              >
                <Plus className="w-4 h-4" />
                Criar Primeiro Pedido
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Número do Pedido</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Cliente</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">OS Interna</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Data de Início</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredOrders.map((order) => {
                  if (!order) return null;
                  
                  const orderNumber = safeField(order, ['orderNumber', 'id']);
                  const customer = safeField(order, ['customer', 'customerName']);
                  const project = safeField(order, ['project', 'projectName']);
                  const internalOS = safeField(order, ['internalOS', 'internalOrderNumber', 'serviceOrder']);
                  const displayStatus = mapStatus(order.status || '');
                  
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-medium text-gray-900">#{orderNumber}</div>
                        {project && (
                          <div className="text-sm text-gray-500">{project}</div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-gray-900">{customer || '-'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-600">{internalOS || '-'}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-gray-600">{formatDate(order.startDate)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status || '')}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewOrder(order)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Visualizar"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => handleEditOrder(order)}
                            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteOrder(order)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Deletar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Estatísticas rápidas */}
      {filteredOrders.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Total de {filteredOrders.length} pedido(s) encontrado(s)</span>
            <div className="flex gap-4">
              <span>Em Processo: {filteredOrders.filter(o => o.status === 'in-progress').length}</span>
              <span>Concluídos: {filteredOrders.filter(o => o.status === 'completed').length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <OrderModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        order={selectedOrder}
        mode={modalMode}
      />
    </div>
  );
}
