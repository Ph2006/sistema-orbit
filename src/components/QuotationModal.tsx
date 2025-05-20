import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar, Download, Info, DollarSign, Truck, Edit, Package, Search, Copy } from 'lucide-react';
import { Quotation, QuotationItem } from '../types/quotation';
import { Customer } from '../types/customer';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import { useOrderStore } from '../store/orderStore';
import { Order, OrderItem } from '../types/kanban';

interface QuotationModalProps {
  quotation: Quotation | null;
  customers: Customer[];
  onClose: () => void;
  onSave: (quotation: Quotation) => Promise<void>;
  onExport: (quotation: Quotation) => void;
}

// Helper function to sanitize data for Firestore
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeForFirestore(value);
  }
  
  return sanitized;
};

const QuotationModal: React.FC<QuotationModalProps> = ({
  quotation,
  customers,
  onClose,
  onSave,
  onExport
}) => {
  const { companyLogo } = useSettingsStore();
  const { orders } = useOrderStore();

  const [formData, setFormData] = useState<Quotation>({
    id: quotation?.id || 'new',
    number: quotation?.number || '000',
    customerId: quotation?.customerId || '',
    customerName: quotation?.customerName || '',
    items: quotation?.items || [],
    totalAmount: quotation?.totalAmount || 0,
    totalTaxAmount: quotation?.totalTaxAmount || 0,
    totalWithTaxes: quotation?.totalWithTaxes || 0,
    status: quotation?.status || 'draft',
    createdAt: quotation?.createdAt || new Date().toISOString(),
    updatedAt: quotation?.updatedAt || new Date().toISOString(),
    sentAt: quotation?.sentAt || '',
    approvedAt: quotation?.approvedAt || '',
    rejectedAt: quotation?.rejectedAt || '',
    expiresAt: quotation?.expiresAt || addDays(new Date(), 30).toISOString(),
    convertedToOrderId: quotation?.convertedToOrderId || '',
    notes: quotation?.notes || '',
    paymentTerms: quotation?.paymentTerms || '30 dias',
    deliveryTerms: quotation?.deliveryTerms || 'FOB',
    contactPerson: quotation?.contactPerson || '',
    validityDays: quotation?.validityDays || 30,
    processDetails: quotation?.processDetails || '',
    includedServices: quotation?.includedServices || []
  });

  const [newItem, setNewItem] = useState<Partial<QuotationItem>>({
    code: '',
    description: '',
    quantity: 1,
    unitWeight: 0,
    unitPrice: 0,
    taxRate: 10,
    leadTimeDays: 30,
    notes: ''
  });

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [allItems, setAllItems] = useState<OrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Shipping options available
  const shippingOptions = [
    { value: 'FOB', description: 'FOB - Frete por conta do cliente' },
    { value: 'CIF', description: 'CIF - Frete incluso no preço' },
    { value: 'FAS', description: 'FAS - Livre ao lado do navio' },
    { value: 'EXW', description: 'EXW - Na fábrica (cliente retira)' },
    { value: 'DAP', description: 'DAP - Entregue no local designado' },
    { value: 'DDP', description: 'DDP - Entregue com direitos pagos' }
  ];

  // Common included services
  const commonServices = [
    { id: 'materialSupply', label: 'Fornecimento de material' },
    { id: 'manufacture', label: 'Fabricação - Caldeiraria' },
    { id: 'machining', label: 'Fabricação - Usinagem' },
    { id: 'nonDestructiveTest', label: 'Ensaios não destrutivos' },
    { id: 'heatTreatment', label: 'Tratamento térmico de alívio de tensão' },
    { id: 'surfaceTreatment', label: 'Tratamento de superfície (pintura, galvanização, etc)' },
    { id: 'rubber', label: 'Emborrachamento' },
    { id: 'assembly', label: 'Montagem Mecânica' },
    { id: 'certification', label: 'Emissão de certificados e documentos da qualidade' },
    { id: 'fasteners', label: 'Itens de fixação' }
  ];
  
  // Load all items when component mounts
  useEffect(() => {
    // Extract all items from all orders
    const extractedItems = orders.flatMap(order => 
      order.items.map(item => ({
        ...item,
        orderNumber: order.orderNumber,
        customer: order.customer
      }))
    );
    
    // Remove duplicates based on code
    const uniqueItems = [];
    const itemCodes = new Set();
    
    for (const item of extractedItems) {
      if (!itemCodes.has(item.code)) {
        itemCodes.add(item.code);
        uniqueItems.push(item);
      }
    }
    
    setAllItems(uniqueItems);
  }, [orders]);

  // Update form data when customer changes
  useEffect(() => {
    if (formData.customerId) {
      const customer = customers.find(c => c.id === formData.customerId);
      if (customer) {
        setFormData(prev => ({
          ...prev,
          customerName: customer.name,
          contactPerson: customer.contactPerson || prev.contactPerson
        }));
      }
    }
  }, [formData.customerId, customers]);

  // Calculate totals when items change
  useEffect(() => {
    updateTotals();
  }, [formData.items]);

  const updateTotals = () => {
    let totalAmount = 0;
    let totalTaxAmount = 0;
    
    formData.items.forEach(item => {
      totalAmount += item.totalPrice;
      totalTaxAmount += item.taxAmount;
    });
    
    const totalWithTaxes = totalAmount + totalTaxAmount;
    
    setFormData(prev => ({
      ...prev,
      totalAmount,
      totalTaxAmount,
      totalWithTaxes
    }));
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    
    setFormData(prev => ({
      ...prev,
      customerId,
      customerName: customer?.name || '',
      contactPerson: customer?.contactPerson || ''
    }));
  };

  const handleNewItemChange = (field: keyof QuotationItem, value: any) => {
    setNewItem(prev => {
      const updated = { ...prev, [field]: value };
      
      // If weight or surplusWeight changes, update totalWeight
      if (field === 'unitWeight') {
        const unitWeight = value;
        const quantity = prev.quantity || 0;
        updated.totalWeight = unitWeight * quantity;
      }
      
      // If quantity changes, update totalWeight and totalPrice
      if (field === 'quantity') {
        const quantity = value;
        const unitWeight = prev.unitWeight || 0;
        const unitPrice = prev.unitPrice || 0;
        const taxRate = prev.taxRate || 0;
        
        updated.totalWeight = unitWeight * quantity;
        updated.totalPrice = quantity * unitPrice;
        updated.taxAmount = (quantity * unitPrice) * (taxRate / 100);
        updated.totalWithTax = (quantity * unitPrice) + ((quantity * unitPrice) * (taxRate / 100));
      }
      
      // If unitPrice changes, update totalPrice
      if (field === 'unitPrice') {
        const unitPrice = value;
        const quantity = prev.quantity || 0;
        const taxRate = prev.taxRate || 0;
        
        updated.totalPrice = quantity * unitPrice;
        updated.taxAmount = (quantity * unitPrice) * (taxRate / 100);
        updated.totalWithTax = (quantity * unitPrice) + ((quantity * unitPrice) * (taxRate / 100));
      }
      
      // If taxRate changes, update taxAmount and totalWithTax
      if (field === 'taxRate') {
        const taxRate = value;
        const totalPrice = prev.totalPrice || 0;
        
        updated.taxAmount = totalPrice * (taxRate / 100);
        updated.totalWithTax = totalPrice + (totalPrice * (taxRate / 100));
      }
      
      return updated;
    });
  };

  const handleServiceToggle = (serviceId: string) => {
    const includedServices = [...(formData.includedServices || [])];
    
    if (includedServices.includes(serviceId)) {
      setFormData(prev => ({
        ...prev,
        includedServices: includedServices.filter(id => id !== serviceId)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        includedServices: [...includedServices, serviceId]
      }));
    }
  };

  const handleEditItem = (itemId: string) => {
    const item = formData.items.find(item => item.id === itemId);
    if (item) {
      setNewItem(item);
      setEditingItemId(itemId);
    }
  };

  const handleDuplicateItem = (itemId: string) => {
    const item = formData.items.find(item => item.id === itemId);
    if (item) {
      // Create a copy with a new ID
      const duplicatedItem: QuotationItem = {
        ...item,
        id: crypto.randomUUID()
      };
      
      // Add the duplicated item to the list
      setFormData(prev => ({
        ...prev,
        items: [...prev.items, duplicatedItem]
      }));
    }
  };

  const handleAddItem = () => {
    if (!newItem.code || !newItem.description || !newItem.quantity || !newItem.unitPrice) {
      setErrors({ ...errors, items: 'Preencha todos os campos obrigatórios do item' });
      return;
    }
    
    // Create new item with all required fields
    const newQuotationItem: QuotationItem = {
      id: crypto.randomUUID(),
      code: newItem.code || '',
      description: newItem.description || '',
      quantity: newItem.quantity || 0,
      unitWeight: newItem.unitWeight || 0,
      totalWeight: newItem.totalWeight || 0,
      unitPrice: newItem.unitPrice || 0,
      taxRate: newItem.taxRate || 0,
      leadTimeDays: newItem.leadTimeDays || 0,
      totalPrice: newItem.totalPrice || 0,
      taxAmount: newItem.taxAmount || 0,
      totalWithTax: newItem.totalWithTax || 0,
      notes: newItem.notes || ''
    };
    
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newQuotationItem]
    }));
    
    // Reset new item form
    setNewItem({
      code: '',
      description: '',
      quantity: 1,
      unitWeight: 0,
      unitPrice: 0,
      taxRate: 10,
      leadTimeDays: 30,
      notes: ''
    });
    
    setErrors({ ...errors, items: '' });
  };

  const handleUpdateItem = () => {
    if (!editingItemId) return;
    
    if (!newItem.code || !newItem.description || !newItem.quantity || !newItem.unitPrice) {
      setErrors({ ...errors, items: 'Preencha todos os campos obrigatórios do item' });
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === editingItemId 
          ? {
              ...item,
              code: newItem.code || '',
              description: newItem.description || '',
              quantity: newItem.quantity || 0,
              unitWeight: newItem.unitWeight || 0,
              totalWeight: newItem.totalWeight || 0,
              unitPrice: newItem.unitPrice || 0,
              taxRate: newItem.taxRate || 0,
              leadTimeDays: newItem.leadTimeDays || 0,
              totalPrice: newItem.totalPrice || 0,
              taxAmount: newItem.taxAmount || 0,
              totalWithTax: newItem.totalWithTax || 0,
              notes: newItem.notes || ''
            }
          : item
      )
    }));
    
    // Reset new item form
    setNewItem({
      code: '',
      description: '',
      quantity: 1,
      unitWeight: 0,
      unitPrice: 0,
      taxRate: 10,
      leadTimeDays: 30,
      notes: ''
    });
    
    setEditingItemId(null);
    setErrors({ ...errors, items: '' });
  };

  const handleRemoveItem = (itemId: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setNewItem({
      code: '',
      description: '',
      quantity: 1,
      unitWeight: 0,
      unitPrice: 0,
      taxRate: 10,
      leadTimeDays: 30,
      notes: ''
    });
  };

  const handleSelectProduct = () => {
    setShowProductSelector(true);
  };

  const handleAddSelectedOrderItem = (item: OrderItem) => {
    // Create a new QuotationItem from the order item
    const newQuotationItem: QuotationItem = {
      id: crypto.randomUUID(),
      code: item.code || '',
      description: item.description || '',
      quantity: item.quantity || 0,
      unitWeight: item.unitWeight || 0,
      totalWeight: (item.unitWeight || 0) * (item.quantity || 0),
      unitPrice: item.unitPrice || 0,
      taxRate: 10, // Default tax rate
      leadTimeDays: 30, // Default lead time
      totalPrice: (item.unitPrice || 0) * (item.quantity || 0),
      taxAmount: ((item.unitPrice || 0) * (item.quantity || 0)) * 0.1, // 10% tax
      totalWithTax: ((item.unitPrice || 0) * (item.quantity || 0)) * 1.1, // With 10% tax
      notes: 'Adicionado de item existente'
    };
    
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newQuotationItem]
    }));
    
    setShowProductSelector(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};
    
    // Validate customer
    if (!formData.customerId) {
      newErrors.customer = 'Selecione um cliente';
    }
    
    // Validate items
    if (formData.items.length === 0) {
      newErrors.items = 'Adicione pelo menos um item ao orçamento';
    }
    
    // Check if there are any errors
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Create/update quotation
    try {
      // Update status if sending
      const updatedFormData = { ...formData };
      
      // If sending draft quotation, update status and dates
      if (formData.status === 'draft' && e.nativeEvent.submitter?.name === 'send') {
        updatedFormData.status = 'sent';
        updatedFormData.sentAt = new Date().toISOString();
        updatedFormData.expiresAt = addDays(new Date(), formData.validityDays).toISOString();
      }
      
      await onSave(sanitizeForFirestore(updatedFormData));
    } catch (error) {
      console.error('Error saving quotation:', error);
      setErrors({ submit: 'Erro ao salvar orçamento. Por favor, tente novamente.' });
    }
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  // Filter items based on search term
  const getFilteredItems = () => {
    if (!searchTerm.trim()) return allItems;
    
    const term = searchTerm.toLowerCase();
    return allItems.filter(item => 
      item.code?.toLowerCase().includes(term) || 
      item.description?.toLowerCase().includes(term)
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              {quotation && quotation.id !== 'new' ? `Orçamento #${quotation.number}` : 'Novo Orçamento'}
            </h2>
          </div>
          <div className="flex space-x-3">
            {quotation && quotation.id !== 'new' && (
              <button
                type="button"
                onClick={() => onExport(formData)}
                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <Download className="h-5 w-5 mr-2" />
                Exportar PDF
              </button>
            )}
            <button onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {errors.submit && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{errors.submit}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Information */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-medium mb-4">Informações do Cliente</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Cliente
                </label>
                <select
                  value={formData.customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                    errors.customer ? 'border-red-500' : ''
                  }`}
                  required
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                {errors.customer && <p className="mt-1 text-sm text-red-500">{errors.customer}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Contato
                </label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData(prev => ({...prev, contactPerson: e.target.value}))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Nome da pessoa de contato"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Validade (dias)
                </label>
                <input
                  type="number"
                  value={formData.validityDays}
                  onChange={(e) => setFormData(prev => ({...prev, validityDays: parseInt(e.target.value)}))}
                  min="1"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Válido até: {format(addDays(new Date(), formData.validityDays), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Status do Orçamento
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({...prev, status: e.target.value as any}))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value="draft">Rascunho</option>
                  <option value="sent">Aguardando aprovação</option>
                  <option value="approved">Aprovado</option>
                  <option value="rejected">Reprovado</option>
                  <option value="expired">Informativo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-medium mb-4">Condições Comerciais</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condições de Pagamento
                </label>
                <input
                  type="text"
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData(prev => ({...prev, paymentTerms: e.target.value}))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: 30/60/90 dias"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <Truck className="h-4 w-4 mr-1" />
                  Condições de Entrega
                </label>
                <select
                  value={formData.deliveryTerms}
                  onChange={(e) => setFormData(prev => ({...prev, deliveryTerms: e.target.value}))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  {shippingOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={4}
                placeholder="Observações gerais sobre o orçamento"
              />
            </div>
          </div>

          {/* Included Services Section */}
          <div className="border-b pb-6">
            <h3 className="text-lg font-medium mb-4">Serviços Inclusos</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-3 mb-4">
              {commonServices.map(service => (
                <div key={service.id} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`service-${service.id}`}
                    checked={formData.includedServices?.includes(service.id) || false}
                    onChange={() => handleServiceToggle(service.id)}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor={`service-${service.id}`} className="ml-2 text-sm text-gray-700">
                    {service.label}
                  </label>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Detalhes do Processo
              </label>
              <textarea
                value={formData.processDetails}
                onChange={(e) => setFormData(prev => ({...prev, processDetails: e.target.value}))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={4}
                placeholder="Descreva detalhes das etapas de processo incluídas no orçamento"
              />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Itens do Orçamento</h3>
              <div>
                <button
                  type="button"
                  onClick={handleSelectProduct}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Package className="h-5 w-5 mr-2" />
                  Adicionar Item do Sistema
                </button>
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 flex items-center mb-3">
                {editingItemId ? 'Editar Item' : 'Adicionar Item'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Código
                  </label>
                  <input
                    type="text"
                    value={newItem.code || ''}
                    onChange={(e) => handleNewItemChange('code', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    placeholder="Código do item"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Descrição
                  </label>
                  <input
                    type="text"
                    value={newItem.description || ''}
                    onChange={(e) => handleNewItemChange('description', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    placeholder="Descrição do item"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantidade
                  </label>
                  <input
                    type="number"
                    value={newItem.quantity || ''}
                    onChange={(e) => handleNewItemChange('quantity', Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    min="1"
                    step="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Peso Unitário (kg)
                  </label>
                  <input
                    type="number"
                    value={newItem.unitWeight || ''}
                    onChange={(e) => handleNewItemChange('unitWeight', Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Prazo (dias úteis)
                  </label>
                  <input
                    type="number"
                    value={newItem.leadTimeDays || ''}
                    onChange={(e) => handleNewItemChange('leadTimeDays', Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    min="1"
                    step="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Preço Unitário
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      value={newItem.unitPrice || ''}
                      onChange={(e) => handleNewItemChange('unitPrice', Number(e.target.value))}
                      className="pl-8 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Taxa de Imposto (%)
                  </label>
                  <input
                    type="number"
                    value={newItem.taxRate || ''}
                    onChange={(e) => handleNewItemChange('taxRate', Number(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-sm">
                  {newItem.totalPrice > 0 && (
                    <span className="text-gray-700">
                      Subtotal: {formatCurrency(newItem.totalPrice || 0)} | 
                      Imposto: {formatCurrency(newItem.taxAmount || 0)} | 
                      Total: {formatCurrency(newItem.totalWithTax || 0)}
                    </span>
                  )}
                </div>
                <div className="space-x-3">
                  {editingItemId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={editingItemId ? handleUpdateItem : handleAddItem}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    disabled={!newItem.code || !newItem.description || !newItem.quantity || !newItem.unitPrice}
                  >
                    <Plus className="h-5 w-5 inline-block mr-1" />
                    {editingItemId ? 'Atualizar Item' : 'Adicionar Item'}
                  </button>
                </div>
              </div>
              
              {errors.items && <p className="mt-2 text-sm text-red-500">{errors.items}</p>}
            </div>
            
            {/* Items List */}
            {formData.items.length === 0 ? (
              <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">Nenhum item adicionado ao orçamento.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Código
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qtd.
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dimensões
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peso (kg)
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Preço Unit.
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subtotal
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Imposto
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total c/ Imposto
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Prazo
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {formData.items.map((item, index) => (
                      <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {item.code}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          N/A
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {item.unitWeight > 0 ? (
                            <div>
                              <div>{item.unitWeight.toLocaleString('pt-BR')} kg/un</div>
                              <div className="text-xs text-gray-500">
                                Total: {(item.totalWeight || 0).toLocaleString('pt-BR')} kg
                              </div>
                            </div>
                          ) : 'N/A'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {formatCurrency(item.totalPrice)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          <div>{item.taxRate.toFixed(2)}%</div>
                          <div className="text-xs text-gray-500">
                            {formatCurrency(item.taxAmount)}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-center">
                          {formatCurrency(item.totalWithTax)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {item.leadTimeDays} dias
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          <div className="flex space-x-2 justify-center">
                            <button
                              type="button"
                              onClick={() => handleEditItem(item.id)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Editar Item"
                            >
                              <Edit className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicateItem(item.id)}
                              className="text-purple-600 hover:text-purple-800"
                              title="Duplicar Item"
                            >
                              <Copy className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Remover Item"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={8} className="px-3 py-3 text-right text-sm font-medium">
                        Valor Total com Impostos:
                      </td>
                      <td colSpan={3} className="px-3 py-3 font-bold text-sm text-center">
                        {formatCurrency(formData.totalWithTaxes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            
            <button
              type="submit"
              name="save"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Salvar como Rascunho
            </button>
            <button
              type="submit"
              name="send"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              disabled={formData.items.length === 0 || !formData.customerId}
            >
              Enviar Orçamento
            </button>
            
            {quotation && quotation.id !== 'new' && (
              <button
                type="button"
                onClick={() => onExport(formData)}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                <Download className="h-5 w-5 inline-block mr-1" />
                Exportar PDF
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Product Selector Modal */}
      {showProductSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Selecionar Item Existente</h2>
              <button onClick={() => setShowProductSelector(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar itens por código ou descrição"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  autoFocus
                />
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pedido/Cliente
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Código
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qtd.
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peso (kg)
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Preço
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {getFilteredItems().map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-sm">
                          <div className="font-medium">#{item.orderNumber || '-'}</div>
                          <div className="text-xs text-gray-500">{item.customer || '-'}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {item.code}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {item.unitWeight ? item.unitWeight.toLocaleString('pt-BR') : '0'} kg
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          {formatCurrency(item.unitPrice || 0)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          <button
                            type="button"
                            onClick={() => handleAddSelectedOrderItem(item)}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                          >
                            Adicionar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {getFilteredItems().length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-sm text-gray-500">
                          {searchTerm 
                            ? "Nenhum item encontrado para esta busca."
                            : "Nenhum item disponível no sistema."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setShowProductSelector(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationModal;