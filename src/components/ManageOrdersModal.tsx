import React, { useState, useEffect } from 'react';
import { X, Search, Trash2, Filter } from 'lucide-react';
import { Order } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useColumnStore } from '../store/columnStore';
import { useOrderStore } from '../store/orderStore';

interface ManageOrdersModalProps {
  orders: Order[];
  onClose: () => void;
  onDelete: (orderIds: string[]) => void;
}

const ManageOrdersModal: React.FC<ManageOrdersModalProps> = ({
  orders,
  onClose,
  onDelete,
}) => {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'number' | 'customer'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showDeleted, setShowDeleted] = useState(false);
  const { columns } = useColumnStore();
  const { updateOrder } = useOrderStore();

  // Limpar seleções ao abrir o modal
  useEffect(() => {
    setSelectedOrders(new Set());
    setSearchTerm('');
  }, []);

  const handleToggleOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map(order => order.id)));
    }
  };

  const handleDelete = () => {
    if (selectedOrders.size === 0) {
      alert('Selecione pelo menos um pedido para excluir.');
      return;
    }

    if (window.confirm(`Tem certeza que deseja excluir ${selectedOrders.size} pedido(s)?`)) {
      onDelete(Array.from(selectedOrders));
    }
  };

  // Filtrar pedidos de acordo com as configurações
  const visibleOrders = orders.filter(order => showDeleted || !order.deleted);

  const filteredOrders = visibleOrders
    .filter(order => {
      const searchLower = searchTerm.toLowerCase().trim();
      if (!searchLower) return true;
      
      return (
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.customer.toLowerCase().includes(searchLower) ||
        order.internalOrderNumber.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.deliveryDate);
        const dateB = new Date(b.deliveryDate);
        return sortDirection === 'asc'
          ? dateA.getTime() - dateB.getTime()
          : dateB.getTime() - dateA.getTime();
      }
      if (sortBy === 'number') {
        return sortDirection === 'asc'
          ? a.orderNumber.localeCompare(b.orderNumber)
          : b.orderNumber.localeCompare(a.orderNumber);
      }
      // customer
      return sortDirection === 'asc'
        ? a.customer.localeCompare(b.customer)
        : b.customer.localeCompare(a.customer);
    });

  const handleSort = (newSortBy: 'date' | 'number' | 'customer') => {
    if (sortBy === newSortBy) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortDirection('asc');
    }
  };

  const handleAssignToColumn = async (orderId: string, columnId: string) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      console.log(`Atualizando pedido ${orderId}, nova coluna: ${columnId || 'null'}`);

      // Tratamento para evitar valor undefined
      const updatedOrder = {
        ...order,
        columnId: columnId === '' ? null : columnId, // Convert empty string to null
        deleted: false // Restaurar o pedido se estiver excluído
      };

      await updateOrder(updatedOrder);
      console.log('Pedido atualizado com sucesso');
    } catch (error) {
      console.error('Error assigning order to column:', error);
      alert('Erro ao atribuir pedido à coluna. Por favor, tente novamente.');
    }
  };

  // Encontrar coluna atual de cada pedido
  const getColumnName = (columnId: string | null) => {
    if (!columnId) return "Sem coluna";
    const column = columns.find(c => c.id === columnId);
    return column ? column.title : "Coluna não encontrada";
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Gerenciar Pedidos</h2>
            <p className="text-gray-600 mt-1">
              {selectedOrders.size} pedido(s) selecionado(s) de {filteredOrders.length} exibidos
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por número, cliente ou OS..."
              className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            />
          </div>
          
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="showDeleted" 
                checked={showDeleted} 
                onChange={() => setShowDeleted(!showDeleted)}
                className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="showDeleted" className="ml-2 text-sm text-gray-600">
                Mostrar excluídos
              </label>
            </div>

            <button
              onClick={handleSelectAll}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={filteredOrders.length === 0}
            >
              {selectedOrders.size === filteredOrders.length && filteredOrders.length > 0 ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
            <button
              onClick={handleDelete}
              disabled={selectedOrders.size === 0}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-5 w-5 inline-block mr-2" />
              Excluir Selecionados
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="w-8 px-6 py-3">
                  <input
                    type="checkbox"
                    checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                    onChange={handleSelectAll}
                    disabled={filteredOrders.length === 0}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('number')}
                >
                  Número do Pedido
                  {sortBy === 'number' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('customer')}
                >
                  Cliente
                  {sortBy === 'customer' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  OS Interna
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  Data de Entrega
                  {sortBy === 'date' && (
                    <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coluna Atual
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mover Para
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map(order => (
                <tr
                  key={order.id}
                  onClick={() => handleToggleOrder(order.id)}
                  className={`hover:bg-gray-50 cursor-pointer ${
                    selectedOrders.has(order.id) ? 'bg-blue-50' : ''
                  } ${order.deleted ? 'bg-red-50/50 text-gray-500' : ''}`}
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id)}
                      onChange={() => handleToggleOrder(order.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      #{order.orderNumber}
                      {order.deleted && <span className="ml-2 text-xs text-red-500">(Excluído)</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{order.customer}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{order.internalOrderNumber}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      order.status === 'delayed' ? 'bg-red-100 text-red-800' :
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      order.status === 'urgent' ? 'bg-purple-100 text-purple-800' :
                      order.status === 'waiting-docs' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'ready' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
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
                    <div className="text-sm text-gray-900">
                      {getColumnName(order.columnId)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={order.columnId || ''}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleAssignToColumn(order.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                        order.deleted ? 'bg-red-50' : ''
                      }`}
                      disabled={order.deleted}
                    >
                      <option value="">Sem coluna</option>
                      {columns.map(column => (
                        <option key={column.id} value={column.id}>
                          {column.title}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                    Nenhum pedido encontrado
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

export default ManageOrdersModal;