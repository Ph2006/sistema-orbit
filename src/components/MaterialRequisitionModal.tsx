import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, DollarSign, Edit, Package, Tag, AlertTriangle } from 'lucide-react';
import { MaterialRequisition, MaterialRequisitionItem } from '../types/materials';
import { Order, OrderItem } from '../types/kanban';
import { collection, getDocs } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

interface MaterialRequisitionModalProps {
  requisition: MaterialRequisition | null;
  onClose: () => void;
  onSave: (requisition: MaterialRequisition) => void;
  orders: Order[];
  generateTraceabilityCode: (orderId: string, itemId: string) => string;
  calculateBudgetLimit: (order: any) => number;
}

const MaterialRequisitionModal: React.FC<MaterialRequisitionModalProps> = ({
  requisition,
  onClose,
  onSave,
  orders,
  generateTraceabilityCode,
  calculateBudgetLimit
}) => {
  const { companyId } = useAuthStore();
  
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

  useEffect(() => {
    const loadSuppliers = async () => {
      if (!companyId) return;
      
      try {
        const suppliersRef = collection(db, getCompanyCollection('suppliers', companyId));
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
  }, [companyId]);

  useEffect(() => {
    if (formData.orderId) {
      const order = orders.find(o => o.id === formData.orderId);
      if (order) {
        setCurrentOrder(order);
        
        if (formData.id === 'new' || !requisition) {
          const budgetLimit = calculateBudgetLimit(order);
          
          const generatedItems = order.items.map(orderItem => ({
            id: crypto.randomUUID(),
            traceabilityCode: generateTraceabilityCode(order.id, orderItem.id),
            orderItemId: orderItem.id,
            itemCode: orderItem.itemCode || '',
            description: orderItem.description || '',
            material: orderItem.material || '',
            quantity: orderItem.quantity || 1,
            unit: orderItem.unit || 'un',
            dimensions: orderItem.dimensions || '',
            weight: orderItem.weight || 0,
            surplusWeight: 0,
            totalWeight: orderItem.weight || 0,
            status: 'pending' as const,
            sentForQuotation: false,
            deliveryDate: null,
            supplier: '',
            notes: '',
            supplierId: undefined,
            supplierName: '',
            purchaseOrderNumber: '',
            invoiceNumber: '',
            invoiceValue: 0,
            receiptDate: null,
            qualityCertificateNumber: '',
            unitPrice: 0,
            totalPrice: 0
          }));
          
          setFormData(prev => ({
            ...prev,
            orderNumber: order.orderNumber,
            customer: order.customer,
            budgetLimit: budgetLimit || 0,
            items: generatedItems
          }));
        }
      }
    }
  }, [formData.orderId, orders, calculateBudgetLimit, generateTraceabilityCode, requisition]);

  useEffect(() => {
    const totalCost = formData.items.reduce((sum, item) => {
      const invoiceValue = typeof item.invoiceValue === 'number' ? item.invoiceValue : 0;
      return sum + invoiceValue;
    }, 0);
    
    setFormData(prev => ({
      ...prev,
      totalCost: totalCost,
      budgetExceeded: totalCost > (prev.budgetLimit ?? 0)
    }));
  }, [formData.items]);

  useEffect(() => {
    if (requisition) {
      const itemsWithDefaults = requisition.items.map(item => ({
        ...item,
        weight: typeof item.weight === 'number' ? item.weight : 0,
        surplusWeight: typeof item.surplusWeight === 'number' ? item.surplusWeight : 0,
        totalWeight: typeof item.totalWeight === 'number' ? item.totalWeight : 
                     (typeof item.weight === 'number' ? item.weight : 0) + 
                     (typeof item.surplusWeight === 'number' ? item.surplusWeight : 0),
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        invoiceValue: typeof item.invoiceValue === 'number' ? item.invoiceValue : 0
      }));
      
      setFormData({
        ...requisition,
        items: itemsWithDefaults,
        totalCost: typeof requisition.totalCost === 'number' ? requisition.totalCost : 0,
        budgetLimit: typeof requisition.budgetLimit === 'number' ? requisition.budgetLimit : 0,
        budgetExceeded: Boolean(requisition.budgetExceeded),
        lastUpdated: new Date().toISOString()
      });
    }
  }, [requisition]);

  const handleOrderChange = (orderId: string) => {
    setFormData(prev => ({ ...prev, orderId }));
  };

  const handleItemChange = (itemId: string, field: keyof MaterialRequisitionItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };
          
          if (field === 'weight') {
            updatedItem.weight = typeof value === 'number' ? value : 0;
          }
          if (field === 'surplusWeight') {
            updatedItem.surplusWeight = typeof value === 'number' ? value : 0;
          }
          
          const weight = typeof updatedItem.weight === 'number' ? updatedItem.weight : 0;
          const surplusWeight = typeof updatedItem.surplusWeight === 'number' ? updatedItem.surplusWeight : 0;
          
          if (field === 'status' && value === 'stock') {
            updatedItem.supplierId = undefined;
            updatedItem.supplierName = undefined;
            updatedItem.purchaseOrderNumber = 'Estoque';
          }
          
          updatedItem.totalWeight = weight + surplusWeight;
          
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

  const handleAddItem = () => {
    if (!newItem.description?.trim() || !newItem.material?.trim()) {
      alert('Por favor, preencha pelo menos a descrição e o material.');
      return;
    }

    const item: MaterialRequisitionItem = {
      id: crypto.randomUUID(),
      traceabilityCode: generateTraceabilityCode(formData.orderId || 'unknown', crypto.randomUUID()),
      orderItemId: '',
      itemCode: '',
      description: newItem.description || '',
      material: newItem.material || '',
      quantity: newItem.quantity || 1,
      unit: newItem.unit || 'un',
      dimensions: newItem.dimensions || '',
      weight: newItem.weight || 0,
      surplusWeight: newItem.surplusWeight || 0,
      totalWeight: (newItem.weight || 0) + (newItem.surplusWeight || 0),
      status: newItem.status || 'pending',
      sentForQuotation: false,
      deliveryDate: null,
      supplier: '',
      notes: '',
      supplierId: undefined,
      supplierName: '',
      purchaseOrderNumber: '',
      invoiceNumber: '',
      invoiceValue: 0,
      receiptDate: null,
      qualityCertificateNumber: '',
      unitPrice: 0,
      totalPrice: 0
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, item]
    }));

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

  const isSimpleEdit = (): boolean => {
    return !!requisition && requisition.id !== 'new';
  };

  const validateForm = (): boolean => {
    if (isSimpleEdit()) {
      if (!formData.items || formData.items.length === 0) {
        alert('A requisição deve ter pelo menos um item.');
        return false;
      }
      
      for (const item of formData.items) {
        if (!item.description?.trim()) {
          alert('Todos os itens devem ter uma descrição.');
          return false;
        }
        if (!item.material?.trim()) {
          alert('Todos os itens devem ter o material especificado.');
          return false;
        }
        if (!item.quantity || item.quantity <= 0) {
          alert('Todos os itens devem ter uma quantidade válida.');
          return false;
        }
      }
      
      return true;
    }
    
    if (!formData.orderId) {
      alert('Por favor, selecione um pedido.');
      return false;
    }
    
    if (!formData.requestDate) {
      alert('Por favor, selecione a data da requisição.');
      return false;
    }
    
    if (!formData.items || formData.items.length === 0) {
      alert('Por favor, adicione pelo menos um item à requisição.');
      return false;
    }
    
    for (const item of formData.items) {
      if (!item.description?.trim() || !item.material?.trim() || !item.quantity) {
        alert('Por favor, preencha todos os campos obrigatórios dos itens.');
        return false;
      }
    }
    
    return true;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    try {
      if (!validateForm()) {
        return;
      }
      
      const correctedFormData = {
        ...formData,
        items: formData.items.map(item => ({
          ...item,
          weight: typeof item.weight === 'number' ? item.weight : 0,
          surplusWeight: typeof item.surplusWeight === 'number' ? item.surplusWeight : 0,
          totalWeight: typeof item.totalWeight === 'number' ? item.totalWeight : 
                       (typeof item.weight === 'number' ? item.weight : 0) + 
                       (typeof item.surplusWeight === 'number' ? item.surplusWeight : 0),
          quantity: typeof item.quantity === 'number' ? item.quantity : 1,
          invoiceValue: typeof item.invoiceValue === 'number' ? item.invoiceValue : 0
        }))
      };
      
      const requisitionData: MaterialRequisition = {
        ...correctedFormData,
        id: requisition?.id || 'new',
        status: 'pending',
        createdAt: requisition?.createdAt || new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      if (!onSave) {
        alert('Erro: Função de salvamento não encontrada');
        return;
      }
      
      await onSave(requisitionData);
      onClose();
      
    } catch (error) {
      console.error('Erro ao salvar requisição:', error);
      alert(`Erro ao salvar requisição: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

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
            {isSimpleEdit() && (
              <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                <Edit className="h-4 w-4 mr-1" />
                Modo: Edição
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6">
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
                  required={!isSimpleEdit()}
                >
                  <option value="">Selecione um pedido</option>
                  {availableOrders.map(order => (
                    <option key={order.id} value={order.id}>
                      #{order.orderNumber} - {order.customer}
                    </option>
                  ))}
                </select>
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
                  required={!isSimpleEdit()}
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
                    value={formatCurrency(formData.budgetLimit ?? 0)}
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

          {formData.budgetExceeded && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Limite de Orçamento Excedido</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>O custo total de materiais ({formatCurrency(formData.totalCost ?? 0)}) excede o limite de 30% do valor do pedido ({formatCurrency(formData.budgetLimit ?? 0)}).</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {formData.orderId && formData.id === 'new' && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h4 className="text-md font-semibold mb-4">Adicionar Item Manualmente</h4>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <input
                    type="text"
                    value={newItem.description || ''}
                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                    placeholder="Descrição"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={newItem.material || ''}
                    onChange={(e) => setNewItem({...newItem, material: e.target.value})}
                    placeholder="Material"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={newItem.quantity || ''}
                    onChange={(e) => setNewItem({...newItem, quantity: parseInt(e.target.value) || 1})}
                    placeholder="Qtd"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    min="1"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={newItem.dimensions || ''}
                    onChange={(e) => setNewItem({...newItem, dimensions: e.target.value})}
                    placeholder="Dimensões"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={newItem.weight || ''}
                    onChange={(e) => setNewItem({...newItem, weight: parseFloat(e.target.value) || 0})}
                    placeholder="Peso (kg)"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    step="0.01"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 text-sm"
                  >
                    <Plus className="h-4 w-4 inline mr-1" />
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Itens da Requisição</h3>
            
            {formData.items.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-500">
                  Nenhum item adicionado à requisição. {formData.orderId ? 'Os itens do pedido foram carregados automaticamente.' : 'Selecione um pedido primeiro.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Código
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qtd.
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dimensões
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peso (kg)
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor (R$)
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <input
                            type="text"
                            value={item.material}
                            onChange={(e) => handleItemChange(item.id, 'material', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <input
                            type="number"
                            value={typeof item.quantity === 'number' ? item.quantity : 1}
                            onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value ? parseInt(e.target.value) : 1)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                            min="1"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <input
                            type="text"
                            value={item.dimensions}
                            onChange={(e) => handleItemChange(item.id, 'dimensions', e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              value={typeof item.weight === 'number' ? item.weight : 0}
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
                          ) : (
                            <div className="text-purple-600 font-medium text-sm">
                              Material de Estoque
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <input
                            type="number"
                            value={typeof item.invoiceValue === 'number' ? item.invoiceValue : 0}
                            onChange={(e) => {
                              const newValue = e.target.value !== '' ? parseFloat(e.target.value) : 0;
                              handleItemChange(item.id, 'invoiceValue', isNaN(newValue) ? 0 : newValue);
                            }}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                            min="0"
                            step="0.01"
                            placeholder="Valor"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-600 hover:text-red-800 p-1 rounded"
                            title="Remover Item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={7} className="px-3 py-3 text-right text-sm font-medium">
                        Total de Itens: {formData.items.length}
                      </td>
                      <td className="px-3 py-3 text-sm font-medium">
                        {formatCurrency(formData.totalCost ?? 0)}
                      </td>
                      <td colSpan={2}></td>
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
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={formData.items.length === 0}
            >
              {isSimpleEdit() ? 'Salvar Alterações' : 'Salvar Requisição'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaterialRequisitionModal; {
                                const newValue = e.target.value !== '' ? parseFloat(e.target.value) : 0;
                                handleItemChange(item.id, 'weight', isNaN(newValue) ? 0 : newValue);
                              }}
                              className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                              min="0"
                              step="0.01"
                            />
                            <span>+</span>
                            <input
                              type="number"
                              value={typeof item.surplusWeight === 'number' ? item.surplusWeight : 0}
                              onChange={(e) => {
                                const newValue = e.target.value !== '' ? parseFloat(e.target.value) : 0;
                                handleItemChange(item.id, 'surplusWeight', isNaN(newValue) ? 0 : newValue);
                              }}
                              className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                              min="0"
                              step="0.01"
                              title="Sobra"
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Total: {(typeof item.totalWeight === 'number' ? item.totalWeight : 0).toFixed(2)} kg
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm">
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
                        <td className="px-3 py-2 text-sm">
                          {item.status !== 'stock' ? (
                            <select
                              value={item.supplierId || ''}
                              onChange={(e) =>
