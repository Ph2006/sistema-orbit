import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar, Download, Info, DollarSign, Truck, Edit, Package, Search, Tag, AlertTriangle } from 'lucide-react';
import { MaterialRequisition, MaterialRequisitionItem } from '../types/materials';
import { Order, OrderItem } from '../types/kanban';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MaterialRequisitionModalProps {
  requisition: MaterialRequisition | null;
  onClose: () => void;
  onSave: (requisition: MaterialRequisition) => void;
  orders: Order[];
  generateTraceabilityCode: (orderId: string, itemId: string) => string;
  calculateBudgetLimit: (order: MaterialRequisition) => number;
}

const MaterialRequisitionModal: React.FC<MaterialRequisitionModalProps> = ({
  requisition,
  onClose,
  onSave,
  orders,
  generateTraceabilityCode,
  calculateBudgetLimit
}) => {
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [formData, setFormData] = useState<MaterialRequisition>({
    id: requisition?.id || 'new',
    orderId: requisition?.orderId || '',
    orderNumber: requisition?.orderNumber || '',
    customer: requisition?.customer || '',
    items: requisition?.items || [],
    requestDate: requisition?.requestDate || new Date().toISOString(),
    status: requisition?.status || 'pending',
    notes: requisition?.notes || '',
    createdAt: requisition?.createdAt || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    totalCost: requisition?.totalCost || 0,
    budgetLimit: requisition?.budgetLimit || 0,
    budgetExceeded: requisition?.budgetExceeded || false
  });
  const [suppliers, setSuppliers] = useState<{id: string; name: string}[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [newItem, setNewItem] = useState<Partial<MaterialRequisitionItem>>({
    description: '',
    material: '',
    quantity: 1,
    unit: '',
    dimensions: '',
    weight: 0,
    surplusWeight: 0,
    totalWeight: 0,
    status: 'pending',
    sentForQuotation: false
  });

  // Load suppliers
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const suppliersRef = collection(db, 'suppliers');
        const suppliersSnapshot = await getDocs(suppliersRef);
        const suppliersData = suppliersSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name
        }));
        setSuppliers(suppliersData);
      } catch (error) {
        console.error('Error loading suppliers:', error);
      }
    };
    
    loadSuppliers();
  }, []);

  // When order is selected, populate items and set budget limit
  useEffect(() => {
    if (formData.orderId) {
      const order = orders.find(o => o.id === formData.orderId);
      if (order) {
        setCurrentOrder(order);
        setOrderItems(order.items);
        
        // If new requisition, set order info
        if (formData.id === 'new' || !requisition) {
          const budgetLimit = calculateBudgetLimit(order);
          setFormData(prev => ({
            ...prev,
            orderNumber: order.orderNumber,
            customer: order.customer,
            budgetLimit
          }));
        }
      }
    }
  }, [formData.orderId, orders, calculateBudgetLimit]);

  // Update total cost and budget exceeded status
  useEffect(() => {
    const totalCost = formData.items.reduce((sum, item) => {
      return sum + (item.invoiceValue || 0);
    }, 0);
    
    const totalWithTaxes = totalCost;
    
    setFormData(prev => ({
      ...prev,
      totalCost: totalCost,
      budgetExceeded: totalCost > prev.budgetLimit
    }));
  }, [formData.items]);

  const handleOrderChange = (orderId: string) => {
    setFormData(prev => ({ ...prev, orderId }));
  };

  const handleNewItemChange = (field: keyof MaterialRequisitionItem, value: any) => {
    setNewItem(prev => {
      const updated = { ...prev, [field]: value };
      
      // If weight or surplusWeight changes, update totalWeight
      if (field === 'weight' || field === 'surplusWeight') {
        const weight = field === 'weight' ? value : (prev.weight || 0);
        const surplusWeight = field === 'surplusWeight' ? value : (prev.surplusWeight || 0);
        updated.totalWeight = weight + surplusWeight;
      }
      
      return updated;
    });
  };

  const handleAddItem = () => {
    if (!formData.orderId || !newItem.orderItemId || !newItem.description || !newItem.material || !newItem.unit) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const orderItem = orderItems.find(item => item.id === newItem.orderItemId);
    if (!orderItem) return;

    const newMaterialItem: MaterialRequisitionItem = {
      id: crypto.randomUUID(),
      traceabilityCode: generateTraceabilityCode(formData.orderId, orderItem.id),
      orderItemId: orderItem.id,
      itemCode: orderItem.code,
      description: newItem.description || '',
      material: newItem.material || '',
      quantity: newItem.quantity || 1,
      unit: newItem.unit || '',
      dimensions: newItem.dimensions || '',
      weight: newItem.weight || 0,
      surplusWeight: newItem.surplusWeight || 0,
      totalWeight: (newItem.weight || 0) + (newItem.surplusWeight || 0),
      status: 'pending',
      sentForQuotation: false
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newMaterialItem]
    }));

    // Reset new item form
    setNewItem({
      description: '',
      material: '',
      quantity: 1,
      unit: '',
      dimensions: '',
      weight: 0,
      surplusWeight: 0,
      totalWeight: 0,
      status: 'pending',
      sentForQuotation: false
    });
  };

  const handleRemoveItem = (itemId: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  const handleItemChange = (itemId: string, field: keyof MaterialRequisitionItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };
          
          // If we're updating status to 'stock', clear supplier-related fields
          if (field === 'status' && value === 'stock') {
            updatedItem.supplierId = undefined;
            updatedItem.supplierName = undefined;
            updatedItem.purchaseOrderNumber = 'Estoque';
          }
          
          // Update total weight when weight or surplus changes
          if (field === 'weight' || field === 'surplusWeight') {
            updatedItem.totalWeight = updatedItem.weight + updatedItem.surplusWeight;
          }
          
          // When supplier changes, update supplier name
          if (field === 'supplierId') {
            const supplier = suppliers.find(s => s.id === value);
            if (supplier) {
              updatedItem.supplierName = supplier.name;
            }
          }
          
          return updatedItem;
        }
        return item;
      })
    }));
  };

  const handleSave = async () => {
    try {
      // Validar campos obrigatórios
      if (!formData.orderId) {
        alert('Por favor, selecione um pedido.');
        return;
      }

      if (!formData.requestDate) {
        alert('Por favor, selecione a data da requisição.');
        return;
      }

      if (!formData.items || formData.items.length === 0) {
        alert('Por favor, adicione pelo menos um item à requisição.');
        return;
      }

      // Validar cada item
      for (const item of formData.items) {
        if (!item.description || !item.quantity || !item.unit) {
          alert('Por favor, preencha todos os campos obrigatórios dos itens (descrição, quantidade e unidade).');
          return;
        }
      }

      // Validar fornecedor se estiver em modo de cotação
      if (isQuotationMode && !formData.supplierId) {
        alert('Por favor, selecione um fornecedor para a cotação.');
        return;
      }

      // Preparar dados para salvar
      const requisitionData: MaterialRequisition = {
        ...formData,
        id: requisition?.id || 'new',
        status: isQuotationMode ? 'quotation' : 'pending',
        createdAt: requisition?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await onSave(requisitionData);
      onClose();
    } catch (error) {
      console.error('Error saving requisition:', error);
      alert(`Erro ao salvar requisição: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  // Filter orders to only show in-process orders (not completed or expedited)
  const availableOrders = orders.filter(order => 
    !order.deleted && 
    order.status !== 'completed' && 
    !order.completedDate
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              {requisition ? 'Editar Requisição de Material' : 'Nova Requisição de Material'}
            </h2>
            {currentOrder && (
              <p className="text-gray-600">
                Pedido #{currentOrder.orderNumber} - {currentOrder.customer}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Order Selection */}
          <div className="border-b pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selecione o Pedido
                </label>
                <select
                  value={formData.orderId}
                  onChange={(e) => handleOrderChange(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  disabled={!!requisition}
                  required
                >
                  <option value="">Selecione um pedido</option>
                  {availableOrders.map(order => (
                    <option key={order.id} value={order.id}>
                      #{order.orderNumber} - {order.customer}
                    </option>
                  ))}
                </select>
                {orders.length > 0 && availableOrders.length === 0 && (
                  <p className="text-sm text-red-500 mt-1">
                    Não há pedidos disponíveis que ainda não foram expedidos.
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data da Solicitação
                </label>
                <input
                  type="date"
                  value={formData.requestDate.split('T')[0]}
                  onChange={(e) => setFormData(prev => ({...prev, requestDate: new Date(e.target.value).toISOString()}))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Limite de Orçamento (30%)
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <DollarSign className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={formatCurrency(formData.budgetLimit)}
                    className="pl-10 block w-full rounded-md border-gray-300 bg-gray-100 cursor-not-allowed"
                    readOnly
                  />
                </div>
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={2}
              />
            </div>
          </div>

          {/* Budget Status */}
          {formData.budgetExceeded && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Limite de Orçamento Excedido</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>O custo total de materiais ({formatCurrency(formData.totalCost)}) excede o limite de 30% do valor do pedido ({formatCurrency(formData.budgetLimit)}).</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Items Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Itens da Requisição</h3>
            
            {/* Add New Item Form */}
            {formData.orderId && (
              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <h4 className="font-medium mb-3 text-gray-700 flex items-center">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Item
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Item do Pedido
                    </label>
                    <select
                      value={newItem.orderItemId || ''}
                      onChange={(e) => handleNewItemChange('orderItemId', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    >
                      <option value="">Selecione um item</option>
                      {orderItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.code} - {item.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descrição do Material
                    </label>
                    <input
                      type="text"
                      value={newItem.description || ''}
                      onChange={(e) => handleNewItemChange('description', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      placeholder="Ex: Chapa de aço carbono"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Material
                    </label>
                    <input
                      type="text"
                      value={newItem.material || ''}
                      onChange={(e) => handleNewItemChange('material', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      placeholder="Ex: ASTM A-36"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      value={newItem.quantity || ''}
                      onChange={(e) => handleNewItemChange('quantity', parseInt(e.target.value))}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      min="1"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unidade
                    </label>
                    <input
                      type="text"
                      value={newItem.unit || ''}
                      onChange={(e) => handleNewItemChange('unit', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      placeholder="Ex: kg, m, cm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dimensões
                    </label>
                    <input
                      type="text"
                      value={newItem.dimensions || ''}
                      onChange={(e) => handleNewItemChange('dimensions', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      placeholder="Ex: 1000 x 500 x 6.3 mm"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Peso (kg)
                      </label>
                      <input
                        type="number"
                        value={newItem.weight || ''}
                        onChange={(e) => handleNewItemChange('weight', parseFloat(e.target.value))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sobra (kg)
                      </label>
                      <input
                        type="number"
                        value={newItem.surplusWeight || ''}
                        onChange={(e) => handleNewItemChange('surplusWeight', parseFloat(e.target.value))}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    disabled={!newItem.orderItemId || !newItem.description || !newItem.material || !newItem.unit}
                  >
                    <Plus className="h-5 w-5 inline-block mr-1" />
                    Adicionar Item
                  </button>
                </div>
              </div>
            )}
            
            {/* Items List */}
            {formData.items.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">
                  Nenhum item adicionado à requisição.
                  {formData.orderId ? ' Use o formulário acima para adicionar itens.' : ' Selecione um pedido primeiro.'}
                </p>
              </div>
            ) : (
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
                        Qtd.
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dimensões
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peso (kg)
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        PO/NF
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor (R$)
                      </th>
                      <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {formData.items.map((item, index) => (
                      <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <div className="flex items-center">
                            <Tag className="h-4 w-4 text-gray-500 mr-1" />
                            <span className="font-mono text-xs">{item.traceabilityCode}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{item.itemCode}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <input
                            type="text"
                            value={item.material}
                            onChange={(e) => handleItemChange(item.id, 'material', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value))}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                            min="1"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <input
                            type="text"
                            value={item.dimensions}
                            onChange={(e) => handleItemChange(item.id, 'dimensions', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              value={item.weight}
                              onChange={(e) => handleItemChange(item.id, 'weight', parseFloat(e.target.value))}
                              className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                              min="0"
                              step="0.01"
                            />
                            <span>+</span>
                            <input
                              type="number"
                              value={item.surplusWeight}
                              onChange={(e) => handleItemChange(item.id, 'surplusWeight', parseFloat(e.target.value))}
                              className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                              min="0"
                              step="0.01"
                              title="Sobra"
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Total: {item.totalWeight.toLocaleString('pt-BR')} kg
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <select
                            value={item.status}
                            onChange={(e) => handleItemChange(item.id, 'status', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          >
                            <option value="pending">Pendente</option>
                            <option value="ordered">Encomendado</option>
                            <option value="received">Recebido</option>
                            <option value="stock">Estoque</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={item.purchaseOrderNumber || ''}
                              onChange={(e) => handleItemChange(item.id, 'purchaseOrderNumber', e.target.value)}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                              placeholder="Nº PO"
                              disabled={item.status === 'stock'}
                            />
                            <input
                              type="text"
                              value={item.invoiceNumber || ''}
                              onChange={(e) => handleItemChange(item.id, 'invoiceNumber', e.target.value)}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                              placeholder="Nº NF"
                              disabled={item.status === 'stock'}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          {item.status !== 'stock' ? (
                            <div className="space-y-2">
                              <select
                                value={item.supplierId || ''}
                                onChange={(e) => handleItemChange(item.id, 'supplierId', e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                              >
                                <option value="">Selecione</option>
                                {suppliers.map(supplier => (
                                  <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={item.qualityCertificateNumber || ''}
                                onChange={(e) => handleItemChange(item.id, 'qualityCertificateNumber', e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                                placeholder="Nº Certificado"
                              />
                            </div>
                          ) : (
                            <div className="text-purple-600 font-medium">
                              Material de Estoque
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <div className="space-y-2">
                            <input
                              type="number"
                              value={item.invoiceValue || ''}
                              onChange={(e) => handleItemChange(item.id, 'invoiceValue', parseFloat(e.target.value))}
                              className={`w-full rounded-md shadow-sm focus:ring focus:ring-blue-200 text-sm 
                              ${
                                item.invoiceValue && item.invoiceValue > 0
                                  ? 'border-green-300 focus:border-green-500 bg-green-50'
                                  : 'border-gray-300 focus:border-blue-500'
                              }`}
                              min="0"
                              step="0.01"
                              placeholder="Valor (R$)"
                            />
                            <input
                              type="date"
                              value={item.receiptDate ? item.receiptDate.split('T')[0] : ''}
                              onChange={(e) => handleItemChange(item.id, 'receiptDate', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                              className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm
                              ${item.receiptDate ? 'bg-green-50 border-green-300' : ''}`}
                              placeholder="Data Receb."
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={9} className="px-3 py-3 text-right text-sm font-medium">
                        Total de Itens: {formData.items.length}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium">
                        {formatCurrency(formData.totalCost)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={formData.items.length === 0}
            >
              Salvar Requisição
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialRequisitionModal;