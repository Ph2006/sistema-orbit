import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Calendar, User, FileText, Package } from 'lucide-react';
import { useOrderStore } from '../store/orderStore';
import { useCustomerStore } from '../store/customerStore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Definição de tipo interna para OrderItem
interface OrderItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  weight: number;
  progress: number;
}

// Definição de tipo interna para OrderStatus
type OrderStatus = 'Em Processo' | 'Concluído' | 'Cancelado' | 'Em Pausa' | string;

// Definição de tipo interna para Order
interface Order {
  id?: string;
  customerId?: string;
  customerName?: string;
  project?: string;
  orderNumber?: string;
  internalOS?: string;
  startDate?: string;
  deliveryDate?: string;
  completionDate?: string;
  status?: OrderStatus;
  observations?: string;
  items?: OrderItem[];
  [key: string]: any;
}

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order | null;
  mode: 'create' | 'edit' | 'view';
}

export default function OrderModal({ isOpen, onClose, order, mode }: OrderModalProps) {
  const { addOrder, updateOrder, loading } = useOrderStore();
  const { customers, loadCustomers } = useCustomerStore();
  
  // Estados do formulário
  const [formData, setFormData] = useState<Order>({
    customerId: '',
    customerName: '',
    project: '',
    orderNumber: '',
    internalOS: '',
    startDate: '',
    deliveryDate: '',
    completionDate: '',
    status: 'Em Processo',
    observations: '',
    items: [] as OrderItem[]
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Carregar clientes quando o modal for aberto
  useEffect(() => {
    console.log("OrderModal: Loading customers");
    if (isOpen) {
      try {
        loadCustomers();
      } catch (error) {
        console.error("Error loading customers:", error);
      }
    }
  }, [isOpen, loadCustomers]);

  // Efeito para popular o formulário quando em modo de edição
  useEffect(() => {
    console.log("OrderModal: Setting form data based on order", { mode, order });
    
    if (mode === 'edit' && order) {
      // Tentar formatar as datas corretamente
      const formatDateField = (dateString: string | undefined | null) => {
        if (!dateString) return '';
        try {
          return format(new Date(dateString), 'yyyy-MM-dd');
        } catch (error) {
          console.error("Error formatting date:", dateString, error);
          return '';
        }
      };

      setFormData({
        customerId: order.customerId || '',
        customerName: order.customerName || order.customer || '',
        project: order.project || order.projectName || '',
        orderNumber: order.orderNumber || '',
        internalOS: order.internalOS || order.internalOrderNumber || order.serviceOrder || '',
        startDate: formatDateField(order.startDate),
        deliveryDate: formatDateField(order.deliveryDate),
        completionDate: formatDateField(order.completionDate),
        status: order.status || 'Em Processo',
        observations: order.observations || order.notes || '',
        items: Array.isArray(order.items) ? [...order.items] : []
      });
      
      // Log dos dados do cliente associado para depuração
      if (order.customerId) {
        console.log("Customer ID in order:", order.customerId);
        const foundCustomer = customers.find(c => c.id === order.customerId);
        console.log("Found customer:", foundCustomer);
      }
    } else if (mode === 'create') {
      // Reset para criação
      setFormData({
        customerId: '',
        customerName: '',
        project: '',
        orderNumber: '',
        internalOS: '',
        startDate: '',
        deliveryDate: '',
        completionDate: '',
        status: 'Em Processo',
        observations: '',
        items: []
      });
    }
  }, [mode, order, isOpen, customers]);

  // Log para debug dos clientes disponíveis
  useEffect(() => {
    console.log("Available customers:", customers.length);
  }, [customers]);

  // Validação do formulário
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.customerName?.trim()) {
      newErrors.customerName = 'Nome do cliente é obrigatório';
    }
    if (!formData.orderNumber?.trim()) {
      newErrors.orderNumber = 'Número do pedido é obrigatório';
    }
    if (!formData.startDate) {
      newErrors.startDate = 'Data de início é obrigatória';
    }
    if (!formData.deliveryDate) {
      newErrors.deliveryDate = 'Data de entrega é obrigatória';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Função para salvar o pedido
  const handleSave = async () => {
    try {
      console.log("Attempting to save order with data:", formData);
      
      if (!validateForm()) {
        return;
      }

      // Converte datas para o formato ISO
      const convertDate = (dateStr: string | undefined) => {
        if (!dateStr) return undefined;
        try {
          return new Date(dateStr).toISOString();
        } catch (error) {
          console.error("Error converting date:", dateStr, error);
          return undefined;
        }
      };

      const orderData: Partial<Order> = {
        customerId: formData.customerId,
        customerName: formData.customerName,
        customer: formData.customerName, // Campo adicional para compatibilidade
        project: formData.project,
        projectName: formData.project, // Campo adicional para compatibilidade
        orderNumber: formData.orderNumber,
        internalOS: formData.internalOS,
        internalOrderNumber: formData.internalOS, // Campo adicional para compatibilidade
        serviceOrder: formData.internalOS, // Campo adicional para compatibilidade
        startDate: convertDate(formData.startDate),
        deliveryDate: convertDate(formData.deliveryDate),
        completionDate: convertDate(formData.completionDate),
        status: formData.status,
        observations: formData.observations,
        notes: formData.observations, // Campo adicional para compatibilidade
        items: formData.items,
        updatedAt: new Date().toISOString()
      };

      if (mode === 'create') {
        orderData.createdAt = new Date().toISOString();
        await addOrder(orderData as any);
        console.log("Order created successfully");
      } else if (mode === 'edit' && order?.id) {
        await updateOrder(order.id, orderData);
        console.log("Order updated successfully");
      }

      onClose();
    } catch (error) {
      console.error('Erro ao salvar pedido:', error);
      alert(`Erro ao salvar pedido: ${error}`);
    }
  };

  // Função para adicionar item
  const addItem = () => {
    const newItem: OrderItem = {
      id: Date.now().toString(),
      code: '',
      description: '',
      quantity: 1,
      unit: 'un',
      weight: 0,
      progress: 0
    };
    
    setFormData(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
  };

  // Função para remover item
  const removeItem = (itemId: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.filter(item => item.id !== itemId) || []
    }));
  };

  // Função para atualizar item
  const updateItem = (itemId: string, field: keyof OrderItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      ) || []
    }));
  };

  // Função para selecionar cliente
  const handleCustomerSelect = (customerId: string) => {
    console.log("Selected customer ID:", customerId);
    const selectedCustomer = customers.find(customer => customer.id === customerId);
    console.log("Found customer:", selectedCustomer);
    
    if (selectedCustomer) {
      setFormData(prev => ({
        ...prev,
        customerId: customerId,
        customerName: selectedCustomer.name || ''
      }));
      console.log("Customer data set in form:", selectedCustomer.name);
    } else {
      console.warn("Customer not found for ID:", customerId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-blue-600 text-white">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {mode === 'create' ? 'Novo Pedido' : `Editando Pedido #${order?.orderNumber}`}
            {mode === 'edit' && (
              <span className="text-xs bg-blue-500 px-2 py-1 rounded">
                {formData.status || 'Em Processo'}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="p-6 space-y-6">
            {/* Informações do Cliente */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Informações do Cliente
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cliente *
                  </label>
                  <select
                    value={formData.customerId || ''}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                    className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.customerName ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Selecione um cliente</option>
                    {customers.length > 0 ? (
                      customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>Carregando clientes...</option>
                    )}
                  </select>
                  {errors.customerName && (
                    <p className="text-red-500 text-sm mt-1">{errors.customerName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Projeto
                  </label>
                  <input
                    type="text"
                    value={formData.project || ''}
                    onChange={(e) => setFormData(prev => ({...prev, project: e.target.value}))}
                    placeholder="Nome do projeto"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Restante do formulário continua igual... */}
            {/* Cronograma */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Cronograma
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Início *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate || ''}
                    onChange={(e) => setFormData(prev => ({...prev, startDate: e.target.value}))}
                    className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.startDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.startDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Entrega *
                  </label>
                  <input
                    type="date"
                    value={formData.deliveryDate || ''}
                    onChange={(e) => setFormData(prev => ({...prev, deliveryDate: e.target.value}))}
                    className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.deliveryDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.deliveryDate && (
                    <p className="text-red-500 text-sm mt-1">{errors.deliveryDate}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Conclusão
                  </label>
                  <input
                    type="date"
                    value={formData.completionDate || ''}
                    onChange={(e) => setFormData(prev => ({...prev, completionDate: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status || 'Em Processo'}
                    onChange={(e) => setFormData(prev => ({...prev, status: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="in-progress">Em Processo</option>
                    <option value="completed">Concluído</option>
                    <option value="on-hold">Em Pausa</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Dados do Pedido */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número do Pedido *
                </label>
                <input
                  type="text"
                  value={formData.orderNumber || ''}
                  onChange={(e) => setFormData(prev => ({...prev, orderNumber: e.target.value}))}
                  placeholder="052"
                  className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.orderNumber ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.orderNumber && (
                  <p className="text-red-500 text-sm mt-1">{errors.orderNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  OS Interna
                </label>
                <input
                  type="text"
                  value={formData.internalOS || ''}
                  onChange={(e) => setFormData(prev => ({...prev, internalOS: e.target.value}))}
                  placeholder="OS/052"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.observations || ''}
                onChange={(e) => setFormData(prev => ({...prev, observations: e.target.value}))}
                placeholder="Observações sobre o pedido..."
                rows={4}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Itens do Pedido */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Itens do Pedido ({formData.items?.length || 0})
                </h3>
                <button
                  onClick={addItem}
                  className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Item
                </button>
              </div>

              {!formData.items || formData.items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum item adicionado</p>
                  <p className="text-sm">Clique em "Adicionar Item" para começar</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div key={item.id} className="bg-white p-4 rounded-lg border border-gray-200">
                      <div className="flex items-start justify-between mb-4">
                        <h4 className="font-medium">Item #{index + 1}</h4>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                        <div className="md:col-span-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Código
                          </label>
                          <input
                            type="text"
                            value={item.code || ''}
                            onChange={(e) => updateItem(item.id, 'code', e.target.value)}
                            placeholder="30210556"
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Descrição
                          </label>
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                            placeholder="Chapa assentamento olhal de içamento"
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Qtd.
                          </label>
                          <input
                            type="number"
                            value={item.quantity || 0}
                            onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                            min="1"
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Peso (kg)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.weight || 0}
                            onChange={(e) => updateItem(item.id, 'weight', parseFloat(e.target.value) || 0)}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Progresso (%)
                          </label>
                          <input
                            type="number"
                            value={item.progress || 0}
                            onChange={(e) => updateItem(item.id, 'progress', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                            min="0"
                            max="100"
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
