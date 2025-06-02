import React, { useState, useEffect } from 'react';
import { Order, OrderItem } from '../types/kanban';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Save, Trash, Calendar, Building, FileText, User } from 'lucide-react';

interface OrderModalProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder: (order: Order) => void;
  onDeleteOrder: (orderId: string) => void;
  generateReport?: (selectedItems: OrderItem[]) => void;
  customers: any[];
  projects: any[];
}

const OrderModal: React.FC<OrderModalProps> = ({
  order,
  onClose,
  onUpdateOrder,
  onDeleteOrder,
  generateReport,
  customers,
  projects
}) => {
  const [editedOrder, setEditedOrder] = useState<Order>({ ...order });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  useEffect(() => {
    setEditedOrder({ ...order });
  }, [order]);

  const handleInputChange = (field: keyof Order, value: any) => {
    setEditedOrder(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    
    try {
      setIsSaving(true);
      
      // Validações básicas
      if (!editedOrder.orderNumber || !editedOrder.customer || !editedOrder.internalOrderNumber) {
        alert('Por favor, preencha todos os campos obrigatórios (Número do Pedido, Cliente, OS Interna)');
        return;
      }

      // Validar datas
      if (editedOrder.startDate && editedOrder.deliveryDate) {
        const startDate = new Date(editedOrder.startDate);
        const deliveryDate = new Date(editedOrder.deliveryDate);
        
        if (deliveryDate < startDate) {
          alert('A data de entrega não pode ser anterior à data de início');
          return;
        }
      }

      await onUpdateOrder(editedOrder);
      setIsEditing(false);
    } catch (error) {
      console.error('Erro ao salvar pedido:', error);
      alert('Erro ao salvar pedido. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Tem certeza que deseja excluir o pedido #${order.orderNumber}?`)) {
      onDeleteOrder(order.id);
    }
  };

  const handleCancel = () => {
    setEditedOrder({ ...order });
    setIsEditing(false);
  };

  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (!isValid(date)) return '';
      return date.toISOString().split('T')[0];
    } catch (error) {
      return '';
    }
  };

  const formatDateDisplay = (dateString?: string) => {
    if (!dateString) return 'Não definida';
    try {
      const date = new Date(dateString);
      if (!isValid(date)) return 'Data inválida';
      return format(date, 'dd/MM/yyyy', { locale: ptBR });
    } catch (error) {
      return 'Data inválida';
    }
  };

  const getStatusLabel = (status?: string) => {
    const statusMap: Record<string, string> = {
      'in-progress': 'Em Processo',
      'waiting-docs': 'Aguardando Documentação',
      'completed': 'Concluído',
      'delayed': 'Atrasado',
      'urgent': 'Urgente',
      'ready': 'Pronto para Embarque',
      'on-hold': 'Em Espera',
      'shipped': 'Expedido'
    };
    return statusMap[status || ''] || status || 'Indefinido';
  };

  const getStatusColor = (status?: string) => {
    const colorMap: Record<string, string> = {
      'in-progress': 'bg-blue-100 text-blue-800 border-blue-200',
      'waiting-docs': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'completed': 'bg-green-100 text-green-800 border-green-200',
      'delayed': 'bg-red-100 text-red-800 border-red-200',
      'urgent': 'bg-orange-100 text-orange-800 border-orange-200',
      'ready': 'bg-indigo-100 text-indigo-800 border-indigo-200',
      'on-hold': 'bg-gray-100 text-gray-800 border-gray-200',
      'shipped': 'bg-emerald-100 text-emerald-800 border-emerald-200'
    };
    return colorMap[status || ''] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center overflow-y-auto p-4">
      <div className="bg-white w-full max-w-4xl rounded-lg shadow-2xl border border-gray-200 overflow-hidden mx-auto my-auto">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold">
              {isEditing ? 'Editando' : 'Visualizando'} Pedido #{editedOrder.orderNumber}
            </h2>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(editedOrder.status)}`}>
              {getStatusLabel(editedOrder.status)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-md transition-colors text-sm font-medium"
              >
                ✏️ Editar
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 rounded-md transition-colors text-sm font-medium flex items-center space-x-1"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? 'Salvando...' : 'Salvar'}</span>
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium"
                >
                  Cancelar
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-white hover:text-gray-200 transition-colors">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Corpo do modal */}
        <div className="px-6 py-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Informações principais */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Coluna Esquerda - Informações do Cliente */}
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                  <Building className="h-5 w-5 mr-2" />
                  Informações do Cliente
                </h3>
                
                {/* Cliente */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cliente *
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedOrder.customer || ''}
                      onChange={(e) => handleInputChange('customer', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Nome do cliente"
                      required
                    />
                  ) : (
                    <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900 font-medium">
                      {editedOrder.customer || 'Não informado'}
                    </p>
                  )}
                </div>

                {/* Projeto */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Projeto
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedOrder.projectName || ''}
                      onChange={(e) => handleInputChange('projectName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Nome do projeto"
                    />
                  ) : (
                    <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900">
                      {editedOrder.projectName || 'Nenhum projeto'}
                    </p>
                  )}
                </div>

                {/* Número do Pedido */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número do Pedido *
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedOrder.orderNumber || ''}
                      onChange={(e) => handleInputChange('orderNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Número do pedido"
                      required
                    />
                  ) : (
                    <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900 font-mono font-bold">
                      #{editedOrder.orderNumber || 'Não informado'}
                    </p>
                  )}
                </div>

                {/* OS Interna */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    OS Interna *
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedOrder.internalOrderNumber || ''}
                      onChange={(e) => handleInputChange('internalOrderNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Número da OS interna"
                      required
                    />
                  ) : (
                    <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900 font-mono font-bold">
                      {editedOrder.internalOrderNumber || 'Não informado'}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Coluna Direita - Datas e Status */}
            <div className="space-y-4">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Cronograma
                </h3>
                
                {/* Data de Início */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data de Início
                  </label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={formatDateForInput(editedOrder.startDate)}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900 font-medium">
                      {formatDateDisplay(editedOrder.startDate)}
                    </p>
                  )}
                </div>

                {/* Data de Entrega */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data de Entrega
                  </label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={formatDateForInput(editedOrder.deliveryDate)}
                      onChange={(e) => handleInputChange('deliveryDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900 font-medium">
                      {formatDateDisplay(editedOrder.deliveryDate)}
                    </p>
                  )}
                </div>

                {/* Data de Conclusão */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data de Conclusão
                  </label>
                  {isEditing ? (
                    <input
                      type="date"
                      value={formatDateForInput(editedOrder.completedDate)}
                      onChange={(e) => handleInputChange('completedDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900 font-medium">
                      {formatDateDisplay(editedOrder.completedDate)}
                    </p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  {isEditing ? (
                    <select
                      value={editedOrder.status || ''}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="in-progress">Em Processo</option>
                      <option value="waiting-docs">Aguardando Documentação</option>
                      <option value="ready">Pronto para Embarque</option>
                      <option value="shipped">Expedido</option>
                      <option value="completed">Concluído</option>
                      <option value="delayed">Atrasado</option>
                      <option value="urgent">Urgente</option>
                      <option value="on-hold">Em Espera</option>
                    </select>
                  ) : (
                    <div className={`px-3 py-2 rounded-md font-medium text-center border ${getStatusColor(editedOrder.status)}`}>
                      {getStatusLabel(editedOrder.status)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Observações */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <h3 className="text-lg font-semibold text-yellow-800 mb-4 flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Observações
            </h3>
            
            {isEditing ? (
              <textarea
                value={editedOrder.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                placeholder="Observações sobre o pedido..."
              />
            ) : (
              <p className="px-3 py-2 bg-gray-50 rounded-md text-gray-900 whitespace-pre-wrap min-h-[100px]">
                {editedOrder.notes || 'Nenhuma observação adicionada.'}
              </p>
            )}
          </div>

          {/* Informações dos Itens */}
          {editedOrder.items && editedOrder.items.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Itens do Pedido ({editedOrder.items.length})
              </h3>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {editedOrder.items.map((item, index) => (
                  <div key={item.id || index} className="bg-white p-3 rounded-md border border-gray-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">
                          {item.code || `Item ${index + 1}`}
                        </p>
                        {item.description && (
                          <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                        )}
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <p>Qtd: {item.quantity || 0}</p>
                        {item.unitWeight && (
                          <p>Peso: {((item.unitWeight || 0) * (item.quantity || 0)).toFixed(2)} kg</p>
                        )}
                        <p>Progresso: {item.overallProgress || 0}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progresso geral */}
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
            <div className="flex justify-between items-center text-sm mb-2">
              <h3 className="font-semibold text-indigo-800">Progresso Geral</h3>
              <span className="text-indigo-900 font-bold">{editedOrder.progress || 0}%</span>
            </div>
            <div className="h-4 bg-indigo-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  (editedOrder.progress || 0) >= 100 ? 'bg-green-500' : 
                  (editedOrder.progress || 0) >= 75 ? 'bg-blue-500' : 
                  (editedOrder.progress || 0) >= 50 ? 'bg-yellow-500' : 
                  'bg-red-500'
                }`}
                style={{ width: `${Math.max(editedOrder.progress || 0, 2)}%` }}
              />
            </div>
          </div>
        </div>
        
        {/* Rodapé com ações */}
        {!isEditing && (
          <div className="bg-gray-50 px-6 py-4 flex justify-between border-t border-gray-200">
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center space-x-2"
            >
              <Trash className="h-4 w-4" />
              <span>Excluir Pedido</span>
            </button>
            
            <div className="text-sm text-gray-500 flex items-center space-x-4">
              {editedOrder.createdAt && (
                <span>
                  Criado em: {formatDateDisplay(editedOrder.createdAt)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderModal;
