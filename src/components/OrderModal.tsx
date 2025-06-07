import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Trash2, Calendar, User, FileText, Package, Edit3, BarChart3, ExternalLink, Folder, Upload, Download, Eye, Search, Filter, SortAsc, SortDesc, Copy, RefreshCw, AlertCircle, CheckCircle, Clock, Target, Printer } from 'lucide-react';
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
  overallProgress?: number;
  stagePlanning?: Record<string, any>;
  itemNumber?: number;
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDays?: number;
  startDate?: string;
  endDate?: string;
  responsible?: string;
}

// Definição de tipo interna para OrderStatus
type OrderStatus = 'in-progress' | 'completed' | 'on-hold' | 'cancelled' | string;

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
  googleDriveLink?: string;
  value?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
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
    status: 'in-progress',
    observations: '',
    items: [] as OrderItem[],
    googleDriveLink: '',
    value: 0,
    priority: 'medium'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'documents'>('details');
  
  // Estados para gestão de itens
  const [itemsFilter, setItemsFilter] = useState('');
  const [itemsSortField, setItemsSortField] = useState<'itemNumber' | 'code' | 'description' | 'progress'>('itemNumber');
  const [itemsSortOrder, setItemsSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressItem, setProgressItem] = useState<OrderItem | null>(null);
  const [showRomaneioModal, setShowRomaneioModal] = useState(false);

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
        status: order.status || 'in-progress',
        observations: order.observations || order.notes || '',
        items: Array.isArray(order.items) ? [...order.items.map((item, index) => ({
          ...item,
          itemNumber: item.itemNumber || index + 1
        }))] : [],
        googleDriveLink: order.googleDriveLink || '',
        value: order.value || 0,
        priority: order.priority || 'medium'
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
        status: 'in-progress',
        observations: '',
        items: [],
        googleDriveLink: '',
        value: 0,
        priority: 'medium'
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

      // Converte datas para o formato ISO ou null (não undefined)
      const convertDate = (dateStr: string | undefined) => {
        if (!dateStr || dateStr.trim() === '') return null;
        try {
          return new Date(dateStr).toISOString();
        } catch (error) {
          console.error("Error converting date:", dateStr, error);
          return null; // Retorna null em caso de erro, não undefined
        }
      };

      const orderData: Partial<Order> = {
        customerId: formData.customerId || null,
        customerName: formData.customerName || '',
        customer: formData.customerName || '', // Campo adicional para compatibilidade
        project: formData.project || '',
        projectName: formData.project || '', // Campo adicional para compatibilidade
        orderNumber: formData.orderNumber || '',
        internalOS: formData.internalOS || '',
        internalOrderNumber: formData.internalOS || '', // Campo adicional para compatibilidade
        serviceOrder: formData.internalOS || '', // Campo adicional para compatibilidade
        startDate: convertDate(formData.startDate),
        deliveryDate: convertDate(formData.deliveryDate),
        completionDate: convertDate(formData.completionDate), // Isso vai retornar null, não undefined
        status: formData.status || 'in-progress',
        observations: formData.observations || '',
        notes: formData.observations || '', // Campo adicional para compatibilidade
        items: formData.items || [],
        googleDriveLink: formData.googleDriveLink || '',
        value: formData.value || 0,
        priority: formData.priority || 'medium',
        updatedAt: new Date().toISOString()
      };

      // Remover explicitamente quaisquer campos undefined antes de enviar ao Firestore
      Object.keys(orderData).forEach(key => {
        if (orderData[key as keyof typeof orderData] === undefined) {
          orderData[key as keyof typeof orderData] = null;
        }
      });

      console.log("Final order data to be saved:", orderData);

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
      progress: 0,
      overallProgress: 0,
      itemNumber: (formData.items?.length || 0) + 1,
      notes: '',
      priority: 'medium',
      estimatedDays: 1,
      startDate: '',
      endDate: '',
      responsible: ''
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
      items: prev.items?.filter(item => item.id !== itemId).map((item, index) => ({
        ...item,
        itemNumber: index + 1
      })) || []
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

  // Função para abrir modal de edição de item
  const openItemModal = (item?: OrderItem) => {
    setEditingItem(item || null);
    setShowItemModal(true);
  };

  // Função para abrir modal de progresso
  const openProgressModal = (item: OrderItem) => {
    setProgressItem(item);
    setShowProgressModal(true);
  };

  // Função para salvar item editado
  const saveItem = (item: OrderItem) => {
    if (editingItem) {
      // Editando item existente
      updateItem(item.id, 'code', item.code);
      updateItem(item.id, 'description', item.description);
      updateItem(item.id, 'quantity', item.quantity);
      updateItem(item.id, 'unit', item.unit);
      updateItem(item.id, 'weight', item.weight);
      updateItem(item.id, 'notes', item.notes);
      updateItem(item.id, 'priority', item.priority);
      updateItem(item.id, 'estimatedDays', item.estimatedDays);
      updateItem(item.id, 'responsible', item.responsible);
    } else {
      // Novo item
      setFormData(prev => ({
        ...prev,
        items: [...(prev.items || []), item]
      }));
    }
    setShowItemModal(false);
    setEditingItem(null);
  };

  // Função para atualizar progresso do item
  const updateItemProgress = (updatedItem: OrderItem) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      ) || []
    }));
    setShowProgressModal(false);
    setProgressItem(null);
  };

  // Função para selecionar/deselecionar todos os itens
  const toggleSelectAll = () => {
    if (selectedItems.length === filteredAndSortedItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredAndSortedItems.map(item => item.id));
    }
  };

  // Função para selecionar/deselecionar um item
  const toggleSelectItem = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  // Função para abrir modal de romaneio
  const openRomaneioModal = () => {
    if (selectedItems.length === 0) {
      alert('Selecione pelo menos um item para gerar o romaneio.');
      return;
    }
    setShowRomaneioModal(true);
  };

  // Função para limpar seleção
  const clearSelection = () => {
    setSelectedItems([]);
  };
  const filteredAndSortedItems = React.useMemo(() => {
    let filtered = formData.items || [];

    // Aplicar filtro
    if (itemsFilter) {
      filtered = filtered.filter(item =>
        item.code.toLowerCase().includes(itemsFilter.toLowerCase()) ||
        item.description.toLowerCase().includes(itemsFilter.toLowerCase())
      );
    }

    // Aplicar ordenação
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (itemsSortField) {
        case 'itemNumber':
          aValue = a.itemNumber || 0;
          bValue = b.itemNumber || 0;
          break;
        case 'code':
          aValue = a.code.toLowerCase();
          bValue = b.code.toLowerCase();
          break;
        case 'description':
          aValue = a.description.toLowerCase();
          bValue = b.description.toLowerCase();
          break;
        case 'progress':
          aValue = a.overallProgress || 0;
          bValue = b.overallProgress || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return itemsSortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return itemsSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [formData.items, itemsFilter, itemsSortField, itemsSortOrder]);

  // Função para obter cor da prioridade
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Função para obter cor do progresso
  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    if (progress >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Calcular estatísticas dos itens
  const itemStats = useMemo(() => {
    const items = formData.items || [];
    const totalItems = items.length;
    const completedItems = items.filter(item => (item.overallProgress || 0) >= 100).length;
    const inProgressItems = items.filter(item => (item.overallProgress || 0) > 0 && (item.overallProgress || 0) < 100).length;
    const notStartedItems = items.filter(item => (item.overallProgress || 0) === 0).length;
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
    const averageProgress = totalItems > 0 ? items.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / totalItems : 0;

    return {
      totalItems,
      completedItems,
      inProgressItems,
      notStartedItems,
      totalWeight,
      averageProgress: Math.round(averageProgress)
    };
  }, [formData.items]);

  if (!isOpen) return null;

  // Determinar qual status exibir no formulário
  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'in-progress': 'Em Processo',
      'completed': 'Concluído',
      'on-hold': 'Em Pausa',
      'cancelled': 'Cancelado'
    };
    return statusMap[status] || status;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">
                {mode === 'create' ? 'Novo Pedido' : mode === 'view' ? 'Visualizar Pedido' : `Editando Pedido #${order?.orderNumber}`}
              </h2>
              {mode !== 'create' && formData.status && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-blue-500 bg-opacity-80 px-2 py-1 rounded">
                    {getStatusLabel(formData.status)}
                  </span>
                  {formData.priority && (
                    <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(formData.priority)} text-gray-800`}>
                      Prioridade: {formData.priority === 'urgent' ? 'Urgente' : formData.priority === 'high' ? 'Alta' : formData.priority === 'medium' ? 'Média' : 'Baixa'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode !== 'view' && (
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 transition-colors p-1"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="flex">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'details'
                  ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <User className="w-4 h-4 inline mr-2" />
              Detalhes do Pedido
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'items'
                  ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Package className="w-4 h-4 inline mr-2" />
              Itens ({formData.items?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                activeTab === 'documents'
                  ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Folder className="w-4 h-4 inline mr-2" />
              Documentos
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-140px)]">
          {activeTab === 'details' && (
            <div className="p-6 space-y-6">
              {/* Informações do Cliente */}
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" />
                  Informações do Cliente
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cliente *
                    </label>
                    <select
                      value={formData.customerId || ''}
                      onChange={(e) => handleCustomerSelect(e.target.value)}
                      disabled={mode === 'view'}
                      className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.customerName ? 'border-red-500' : 'border-gray-300'
                      } ${mode === 'view' ? 'bg-gray-100' : ''}`}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Projeto
                    </label>
                    <input
                      type="text"
                      value={formData.project || ''}
                      onChange={(e) => setFormData(prev => ({...prev, project: e.target.value}))}
                      placeholder="Nome do projeto"
                      disabled={mode === 'view'}
                      className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        mode === 'view' ? 'bg-gray-100' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Dados do Pedido */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número do Pedido *
                  </label>
                  <input
                    type="text"
                    value={formData.orderNumber || ''}
                    onChange={(e) => setFormData(prev => ({...prev, orderNumber: e.target.value}))}
                    placeholder="052"
                    disabled={mode === 'view'}
                    className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      errors.orderNumber ? 'border-red-500' : 'border-gray-300'
                    } ${mode === 'view' ? 'bg-gray-100' : ''}`}
                  />
                  {errors.orderNumber && (
                    <p className="text-red-500 text-sm mt-1">{errors.orderNumber}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    OS Interna
                  </label>
                  <input
                    type="text"
                    value={formData.internalOS || ''}
                    onChange={(e) => setFormData(prev => ({...prev, internalOS: e.target.value}))}
                    placeholder="OS/052"
                    disabled={mode === 'view'}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      mode === 'view' ? 'bg-gray-100' : ''
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valor do Pedido (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.value || 0}
                    onChange={(e) => setFormData(prev => ({...prev, value: parseFloat(e.target.value) || 0}))}
                    placeholder="0,00"
                    disabled={mode === 'view'}
                    className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                      mode === 'view' ? 'bg-gray-100' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Cronograma e Status */}
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Cronograma e Status
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Início *
                    </label>
                    <input
                      type="date"
                      value={formData.startDate || ''}
                      onChange={(e) => setFormData(prev => ({...prev, startDate: e.target.value}))}
                      disabled={mode === 'view'}
                      className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.startDate ? 'border-red-500' : 'border-gray-300'
                      } ${mode === 'view' ? 'bg-gray-100' : ''}`}
                    />
                    {errors.startDate && (
                      <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Entrega *
                    </label>
                    <input
                      type="date"
                      value={formData.deliveryDate || ''}
                      onChange={(e) => setFormData(prev => ({...prev, deliveryDate: e.target.value}))}
                      disabled={mode === 'view'}
                      className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.deliveryDate ? 'border-red-500' : 'border-gray-300'
                      } ${mode === 'view' ? 'bg-gray-100' : ''}`}
                    />
                    {errors.deliveryDate && (
                      <p className="text-red-500 text-sm mt-1">{errors.deliveryDate}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Conclusão
                    </label>
                    <input
                      type="date"
                      value={formData.completionDate || ''}
                      onChange={(e) => setFormData(prev => ({...prev, completionDate: e.target.value}))}
                      disabled={mode === 'view'}
                      className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        mode === 'view' ? 'bg-gray-100' : ''
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status || 'in-progress'}
                      onChange={(e) => setFormData(prev => ({...prev, status: e.target.value}))}
                      disabled={mode === 'view'}
                      className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        mode === 'view' ? 'bg-gray-100' : ''
                      }`}
                    >
                      <option value="in-progress">Em Processo</option>
                      <option value="completed">Concluído</option>
                      <option value="on-hold">Em Pausa</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Prioridade
                    </label>
                    <select
                      value={formData.priority || 'medium'}
                      onChange={(e) => setFormData(prev => ({...prev, priority: e.target.value}))}
                      disabled={mode === 'view'}
                      className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        mode === 'view' ? 'bg-gray-100' : ''
                      }`}
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Observações
                </label>
                <textarea
                  value={formData.observations || ''}
                  onChange={(e) => setFormData(prev => ({...prev, observations: e.target.value}))}
                  placeholder="Observações sobre o pedido..."
                  rows={4}
                  disabled={mode === 'view'}
                  className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors ${
                    mode === 'view' ? 'bg-gray-100' : ''
                  }`}
                />
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="p-6 space-y-6">
              {/* Header dos Itens com Estatísticas */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                      <Package className="w-5 h-5" />
                      Itens do Pedido
                    </h3>
                    <p className="text-blue-700 text-sm mt-1">
                      Gerencie os itens que compõem este pedido
                    </p>
                  </div>
                  
                  {/* Estatísticas Rápidas */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-center">
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="text-2xl font-bold text-blue-600">{itemStats.totalItems}</div>
                      <div className="text-xs text-gray-600">Total</div>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="text-2xl font-bold text-green-600">{itemStats.completedItems}</div>
                      <div className="text-xs text-gray-600">Concluídos</div>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="text-2xl font-bold text-yellow-600">{itemStats.inProgressItems}</div>
                      <div className="text-xs text-gray-600">Em Andamento</div>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="text-2xl font-bold text-gray-600">{itemStats.notStartedItems}</div>
                      <div className="text-xs text-gray-600">Não Iniciados</div>
                    </div>
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <div className="text-2xl font-bold text-purple-600">{itemStats.averageProgress}%</div>
                      <div className="text-xs text-gray-600">Progresso Médio</div>
                    </div>
                  </div>
                </div>

                {/* Barra de Progresso Geral */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-blue-900">Progresso Geral do Pedido</span>
                    <span className="text-blue-700">{itemStats.averageProgress}%</span>
                  </div>
                  <div className="h-3 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${getProgressColor(itemStats.averageProgress)}`}
                      style={{ width: `${itemStats.averageProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Controles dos Itens */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Busca */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Buscar itens..."
                      value={itemsFilter}
                      onChange={(e) => setItemsFilter(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64"
                    />
                  </div>

                  {/* Ordenação */}
                  <div className="flex gap-2">
                    <select
                      value={itemsSortField}
                      onChange={(e) => setItemsSortField(e.target.value as any)}
                      className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="itemNumber">Número</option>
                      <option value="code">Código</option>
                      <option value="description">Descrição</option>
                      <option value="progress">Progresso</option>
                    </select>
                    <button
                      onClick={() => setItemsSortOrder(itemsSortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {itemsSortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Ações */}
                {mode !== 'view' && (
                  <div className="flex gap-2">
                    {selectedItems.length > 0 && (
                      <>
                        <button
                          onClick={openRomaneioModal}
                          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors shadow-md"
                        >
                          <FileText className="w-4 h-4" />
                          Romaneio ({selectedItems.length})
                        </button>
                        <button
                          onClick={clearSelection}
                          className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors shadow-md"
                        >
                          <X className="w-4 h-4" />
                          Limpar Seleção
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openItemModal()}
                      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar Item
                    </button>
                  </div>
                )}
              </div>

              {/* Lista de Itens */}
              {!formData.items || formData.items.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum item adicionado</h3>
                  <p className="text-gray-500 mb-6">Comece adicionando itens ao seu pedido</p>
                  {mode !== 'view' && (
                    <button
                      onClick={() => openItemModal()}
                      className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors mx-auto shadow-md"
                    >
                      <Plus className="w-5 h-5" />
                      Adicionar Primeiro Item
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">
                            <input
                              type="checkbox"
                              checked={selectedItems.length === filteredAndSortedItems.length && filteredAndSortedItems.length > 0}
                              onChange={toggleSelectAll}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">#</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Código</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Descrição</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Qtd.</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Peso (kg)</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Progresso</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Prioridade</th>
                          <th className="text-right py-3 px-4 font-medium text-gray-700">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredAndSortedItems.map((item, index) => (
                          <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${selectedItems.includes(item.id) ? 'bg-blue-50' : ''}`}>
                            <td className="py-4 px-4">
                              <input
                                type="checkbox"
                                checked={selectedItems.includes(item.id)}
                                onChange={() => toggleSelectItem(item.id)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-4 px-4">
                              <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 text-blue-800 font-medium text-sm">
                                {item.itemNumber || index + 1}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="font-medium text-gray-900">{item.code}</div>
                              {item.notes && (
                                <div className="text-sm text-gray-500 mt-1">{item.notes}</div>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <div className="text-gray-900">{item.description}</div>
                              {item.responsible && (
                                <div className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {item.responsible}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-gray-900">{item.quantity} {item.unit}</span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-gray-900">{item.weight} kg</span>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${getProgressColor(item.overallProgress || 0)}`}
                                      style={{ width: `${item.overallProgress || 0}%` }}
                                    />
                                  </div>
                                </div>
                                <span className="text-sm font-medium text-gray-700 min-w-[3rem]">
                                  {item.overallProgress || 0}%
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(item.priority || 'medium')}`}>
                                {item.priority === 'urgent' ? 'Urgente' : 
                                 item.priority === 'high' ? 'Alta' : 
                                 item.priority === 'medium' ? 'Média' : 'Baixa'}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openProgressModal(item)}
                                  className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Gerenciar Progresso"
                                >
                                  <BarChart3 className="w-4 h-4" />
                                </button>
                                {mode !== 'view' && (
                                  <>
                                    <button
                                      onClick={() => openItemModal(item)}
                                      className="p-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors"
                                      title="Editar Item"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => removeItem(item.id)}
                                      className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Remover Item"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Resumo dos Itens */}
              {formData.items && formData.items.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-2">Resumo dos Itens</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Total de Itens:</span>
                      <span className="font-medium text-gray-900 ml-2">{itemStats.totalItems}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Peso Total:</span>
                      <span className="font-medium text-gray-900 ml-2">{itemStats.totalWeight.toFixed(2)} kg</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Progresso Médio:</span>
                      <span className="font-medium text-gray-900 ml-2">{itemStats.averageProgress}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Valor Total:</span>
                      <span className="font-medium text-gray-900 ml-2">R$ {(formData.value || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="p-6 space-y-6">
              {/* Header dos Documentos */}
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
                <h3 className="text-lg font-semibold text-green-900 flex items-center gap-2">
                  <Folder className="w-5 h-5" />
                  Documentos do Pedido
                </h3>
                <p className="text-green-700 text-sm mt-1">
                  Gerencie documentos, arquivos e links relacionados ao pedido
                </p>
              </div>

              {/* Google Drive Integration */}
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <ExternalLink className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Google Drive</h4>
                    <p className="text-sm text-gray-600">Link para pasta compartilhada do pedido</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Link do Google Drive
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="url"
                        value={formData.googleDriveLink || ''}
                        onChange={(e) => setFormData(prev => ({...prev, googleDriveLink: e.target.value}))}
                        placeholder="https://drive.google.com/drive/folders/..."
                        disabled={mode === 'view'}
                        className={`flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        }`}
                      />
                      {formData.googleDriveLink && (
                        <a
                          href={formData.googleDriveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Abrir
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      Cole aqui o link da pasta do Google Drive que contém os documentos deste pedido. 
                      Certifique-se de que a pasta tenha as permissões adequadas para acesso.
                    </p>
                  </div>

                  {formData.googleDriveLink && (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-green-800 font-medium">Link do Google Drive configurado</span>
                      </div>
                      <p className="text-green-700 text-sm mt-1">
                        Os documentos do pedido estão acessíveis através do link configurado.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Instruções e Dicas */}
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-blue-900 mb-2">Dicas para Organização de Documentos</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Organize os documentos em pastas por tipo: Desenhos, Especificações, Fotos, etc.</li>
                      <li>• Use nomes de arquivo descritivos que incluam o número do pedido</li>
                      <li>• Mantenha versões atualizadas dos documentos</li>
                      <li>• Configure permissões adequadas para a equipe de produção</li>
                      <li>• Inclua cronogramas, listas de materiais e especificações técnicas</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Acesso Rápido a Tipos de Documentos */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <FileText className="w-8 h-8 text-blue-600" />
                    <div>
                      <h5 className="font-medium text-gray-900">Especificações Técnicas</h5>
                      <p className="text-sm text-gray-600">Desenhos e especificações</p>
                    </div>
                  </div>
                  {formData.googleDriveLink ? (
                    <a
                      href={`${formData.googleDriveLink}?filter=pdf,dwg,doc`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Ver documentos técnicos →
                    </a>
                  ) : (
                    <span className="text-gray-400 text-sm">Configure o link do Drive</span>
                  )}
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <Camera className="w-8 h-8 text-green-600" />
                    <div>
                      <h5 className="font-medium text-gray-900">Fotos de Progresso</h5>
                      <p className="text-sm text-gray-600">Registro visual da produção</p>
                    </div>
                  </div>
                  {formData.googleDriveLink ? (
                    <a
                      href={`${formData.googleDriveLink}?filter=jpg,png,jpeg`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-800 text-sm font-medium"
                    >
                      Ver fotos →
                    </a>
                  ) : (
                    <span className="text-gray-400 text-sm">Configure o link do Drive</span>
                  )}
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <Calendar className="w-8 h-8 text-purple-600" />
                    <div>
                      <h5 className="font-medium text-gray-900">Cronogramas</h5>
                      <p className="text-sm text-gray-600">Planejamento e marcos</p>
                    </div>
                  </div>
                  {formData.googleDriveLink ? (
                    <a
                      href={`${formData.googleDriveLink}?filter=xls,xlsx,pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                    >
                      Ver cronogramas →
                    </a>
                  ) : (
                    <span className="text-gray-400 text-sm">Configure o link do Drive</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Item */}
      {showItemModal && (
        <ItemModal
          item={editingItem}
          onSave={saveItem}
          onClose={() => {
            setShowItemModal(false);
            setEditingItem(null);
          }}
        />
      )}

      {/* Modal de Progresso */}
      {showProgressModal && progressItem && (
        <ItemProgressModal
          item={progressItem}
          allItems={formData.items || []}
          onSave={updateItemProgress}
          onClose={() => {
            setShowProgressModal(false);
            setProgressItem(null);
          }}
        />
      )}
      {/* Modal de Romaneio */}
      {showRomaneioModal && (
        <RomaneioModal
          order={formData}
          selectedItems={formData.items?.filter(item => selectedItems.includes(item.id)) || []}
          onClose={() => setShowRomaneioModal(false)}
        />
      )}
    </div>
  );
}

// Componente para Modal de Romaneio
interface RomaneioModalProps {
  order: Order;
  selectedItems: OrderItem[];
  onClose: () => void;
}

const RomaneioModal: React.FC<RomaneioModalProps> = ({ order, selectedItems, onClose }) => {
  const [romaneioData, setRomaneioData] = useState({
    title: 'ROMANEIO DE EXPEDIÇÃO',
    subtitle: 'Relação de materiais para expedição',
    destination: '',
    transport: '',
    driver: '',
    vehicle: '',
    observations: '',
    expeditionDate: new Date().toISOString().split('T')[0]
  });

  // Calcular totais
  const totalWeight = selectedItems.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 1), 0);
  const totalQuantity = selectedItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Função para imprimir
  const handlePrint = () => {
    window.print();
  };

  // Função para exportar como PDF (mock)
  const handleExportPDF = () => {
    alert('Funcionalidade de exportação PDF será implementada em breve!');
  };

  // Função para gerar número do romaneio
  const generateRomaneioNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const orderNumber = order.orderNumber || '000';
    return `ROM-${orderNumber}-${year}${month}${day}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-hidden shadow-2xl">
        {/* Header - Não imprime */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-blue-600 text-white print:hidden">
          <div>
            <h2 className="text-xl font-semibold">Gerar Romaneio de Expedição</h2>
            <p className="text-blue-100 text-sm mt-1">
              {selectedItems.length} item(s) selecionado(s) - Peso total: {totalWeight.toFixed(2)} kg
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 transition-colors p-1"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Configurações do Romaneio - Não imprime */}
        <div className="p-6 bg-gray-50 border-b border-gray-200 print:hidden">
          <h3 className="text-lg font-semibold mb-4">Configurações do Romaneio</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destino
              </label>
              <input
                type="text"
                value={romaneioData.destination}
                onChange={(e) => setRomaneioData(prev => ({...prev, destination: e.target.value}))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Local de destino"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transportadora
              </label>
              <input
                type="text"
                value={romaneioData.transport}
                onChange={(e) => setRomaneioData(prev => ({...prev, transport: e.target.value}))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nome da transportadora"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motorista
              </label>
              <input
                type="text"
                value={romaneioData.driver}
                onChange={(e) => setRomaneioData(prev => ({...prev, driver: e.target.value}))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nome do motorista"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Veículo/Placa
              </label>
              <input
                type="text"
                value={romaneioData.vehicle}
                onChange={(e) => setRomaneioData(prev => ({...prev, vehicle: e.target.value}))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Placa do veículo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Expedição
              </label>
              <input
                type="date"
                value={romaneioData.expeditionDate}
                onChange={(e) => setRomaneioData(prev => ({...prev, expeditionDate: e.target.value}))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <input
                type="text"
                value={romaneioData.observations}
                onChange={(e) => setRomaneioData(prev => ({...prev, observations: e.target.value}))}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Observações gerais"
              />
            </div>
          </div>
        </div>

        {/* Conteúdo do Romaneio - Para impressão */}
        <div className="p-8 overflow-y-auto max-h-[60vh] print:max-h-none print:overflow-visible">
          {/* Cabeçalho do Romaneio */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{romaneioData.title}</h1>
            <p className="text-gray-600 mb-4">{romaneioData.subtitle}</p>
            <div className="bg-gray-100 p-4 rounded-lg inline-block">
              <p className="font-semibold text-lg">Romaneio Nº: {generateRomaneioNumber()}</p>
              <p className="text-gray-600">Data: {format(new Date(romaneioData.expeditionDate), 'dd/MM/yyyy', { locale: ptBR })}</p>
            </div>
          </div>

          {/* Informações do Pedido */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Dados do Pedido</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Pedido Nº:</span> {order.orderNumber}</div>
                <div><span className="font-medium">OS Interna:</span> {order.internalOS}</div>
                <div><span className="font-medium">Cliente:</span> {order.customerName}</div>
                <div><span className="font-medium">Projeto:</span> {order.project || 'N/A'}</div>
                {order.deliveryDate && (
                  <div><span className="font-medium">Data de Entrega:</span> {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}</div>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Dados da Expedição</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Destino:</span> {romaneioData.destination || 'A definir'}</div>
                <div><span className="font-medium">Transportadora:</span> {romaneioData.transport || 'A definir'}</div>
                <div><span className="font-medium">Motorista:</span> {romaneioData.driver || 'A definir'}</div>
                <div><span className="font-medium">Veículo:</span> {romaneioData.vehicle || 'A definir'}</div>
                <div><span className="font-medium">Data Expedição:</span> {format(new Date(romaneioData.expeditionDate), 'dd/MM/yyyy', { locale: ptBR })}</div>
              </div>
            </div>
          </div>

          {/* Tabela de Itens */}
          <div className="mb-8">
            <h3 className="font-semibold text-gray-900 mb-4">Relação de Itens</h3>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 border-b border-gray-300">Item</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 border-b border-gray-300">Código</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 border-b border-gray-300">Descrição</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700 border-b border-gray-300">Qtd.</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700 border-b border-gray-300">Unid.</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 border-b border-gray-300">Peso Unit. (kg)</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 border-b border-gray-300">Peso Total (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map((item, index) => (
                    <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-3 px-4 border-b border-gray-200 text-center font-medium">
                        {item.itemNumber || index + 1}
                      </td>
                      <td className="py-3 px-4 border-b border-gray-200 font-medium">
                        {item.code}
                      </td>
                      <td className="py-3 px-4 border-b border-gray-200">
                        {item.description}
                        {item.notes && (
                          <div className="text-xs text-gray-500 mt-1">{item.notes}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 border-b border-gray-200 text-center">
                        {item.quantity || 1}
                      </td>
                      <td className="py-3 px-4 border-b border-gray-200 text-center">
                        {item.unit || 'un'}
                      </td>
                      <td className="py-3 px-4 border-b border-gray-200 text-right">
                        {(item.weight || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 border-b border-gray-200 text-right font-medium">
                        {((item.weight || 0) * (item.quantity || 1)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 font-semibold text-gray-900 border-t-2 border-gray-300">
                      TOTAIS
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900 border-t-2 border-gray-300">
                      {totalQuantity} itens
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900 border-t-2 border-gray-300 text-lg">
                      {totalWeight.toFixed(2)} kg
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Observações */}
          {romaneioData.observations && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-2">Observações</h3>
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <p className="text-gray-800">{romaneioData.observations}</p>
              </div>
            </div>
          )}

          {/* Assinaturas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 pt-8 border-t border-gray-300">
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-16">
                <p className="font-medium">Responsável pela Expedição</p>
                <p className="text-sm text-gray-600">Nome e Assinatura</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-16">
                <p className="font-medium">Motorista/Transportadora</p>
                <p className="text-sm text-gray-600">Nome e Assinatura</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-gray-400 pt-2 mt-16">
                <p className="font-medium">Recebedor</p>
                <p className="text-sm text-gray-600">Nome, Assinatura e Data</p>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="text-center mt-8 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Romaneio gerado automaticamente em {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
            </p>
          </div>
        </div>
      </div>

      {/* Estilos para impressão */}
      <style jsx>{`
        @media print {
          @page {
            size: A4;
            margin: 1cm;
          }
          
          body {
            font-size: 11pt;
            line-height: 1.3;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:max-h-none {
            max-height: none !important;
          }
          
          .print\\:overflow-visible {
            overflow: visible !important;
          }
          
          table {
            page-break-inside: avoid;
          }
          
          tr {
            page-break-inside: avoid;
          }
          
          h1, h2, h3 {
            page-break-after: avoid;
          }
          
          .bg-gray-50, .bg-gray-100 {
            background-color: #f9f9f9 !important;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};
interface ItemModalProps {
  item?: OrderItem | null;
  onSave: (item: OrderItem) => void;
  onClose: () => void;
}

const ItemModal: React.FC<ItemModalProps> = ({ item, onSave, onClose }) => {
  const [formData, setFormData] = useState<OrderItem>({
    id: item?.id || Date.now().toString(),
    code: item?.code || '',
    description: item?.description || '',
    quantity: item?.quantity || 1,
    unit: item?.unit || 'un',
    weight: item?.weight || 0,
    progress: item?.progress || 0,
    overallProgress: item?.overallProgress || 0,
    itemNumber: item?.itemNumber || 1,
    notes: item?.notes || '',
    priority: item?.priority || 'medium',
    estimatedDays: item?.estimatedDays || 1,
    startDate: item?.startDate || '',
    endDate: item?.endDate || '',
    responsible: item?.responsible || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-blue-600 text-white">
          <h3 className="text-lg font-semibold">
            {item ? 'Editar Item' : 'Novo Item'}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({...prev, code: e.target.value}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: 70133F173001-02"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantidade *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({...prev, quantity: parseFloat(e.target.value) || 1}))}
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0.01"
                  step="0.01"
                  required
                />
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData(prev => ({...prev, unit: e.target.value}))}
                  className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="un">un</option>
                  <option value="kg">kg</option>
                  <option value="m">m</option>
                  <option value="m²">m²</option>
                  <option value="m³">m³</option>
                  <option value="L">L</option>
                  <option value="pç">pç</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição *
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: Longarina de alimentação"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Peso (kg) *
              </label>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData(prev => ({...prev, weight: parseFloat(e.target.value) || 0}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prioridade
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({...prev, priority: e.target.value as any}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dias Estimados
              </label>
              <input
                type="number"
                value={formData.estimatedDays}
                onChange={(e) => setFormData(prev => ({...prev, estimatedDays: parseFloat(e.target.value) || 1}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                step="0.5"
                min="0.1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsável
              </label>
              <input
                type="text"
                value={formData.responsible}
                onChange={(e) => setFormData(prev => ({...prev, responsible: e.target.value}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nome do responsável"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
              placeholder="Observações sobre o item..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {item ? 'Atualizar' : 'Adicionar'} Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Componente ItemProgressModal simplificado (placeholder)
// Em produção, você deve importar o componente real do arquivo ItemProgressModal.tsx
const ItemProgressModal: React.FC<{
  item: OrderItem;
  allItems: OrderItem[];
  onSave: (item: OrderItem) => void;
  onClose: () => void;
}> = ({ item, allItems, onSave, onClose }) => {
  const [progress, setProgress] = useState(item.overallProgress || 0);

  const handleSave = () => {
    const updatedItem = {
      ...item,
      overallProgress: progress,
      progress: progress // Para compatibilidade
    };
    onSave(updatedItem);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Atualizar Progresso</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-medium text-gray-900">Item: {item.code}</h4>
            <p className="text-sm text-gray-600">{item.description}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Progresso Geral: {progress}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                progress >= 100 ? 'bg-green-500' :
                progress >= 75 ? 'bg-blue-500' :
                progress >= 50 ? 'bg-yellow-500' :
                progress >= 25 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700">
              💡 <strong>Dica:</strong> Use o sistema completo de gestão de progresso 
              para controlar etapas detalhadas de fabricação. Este é apenas um controle básico.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Atualizar Progresso
          </button>
        </div>
      </div>
    </div>
  );
};

// Ícone Camera (para a seção de documentos)
const Camera = (props: any) => {
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
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
};
