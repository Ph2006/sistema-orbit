import React, { useState, useEffect } from 'react';
import { X, HelpCircle, Calendar, DollarSign, Package, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CostEntry } from '../types/costCenter';
import { useOrderStore } from '../store/orderStore';
import { useCostCenterStore } from '../store/costCenterStore';
import { useAuthStore } from '../store/authStore';
import { useSupplierStore } from '../store/supplierStore';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface CostEntryModalProps {
  cost: CostEntry | null;
  orderId?: string; // Optional, will be pre-selected if provided
  onClose: () => void;
  onSave: (cost: CostEntry) => Promise<void>;
}

interface PurchaseOrder {
  id: string;
  purchaseOrderNumber: string;
  supplierName: string;
  issueDate: string;
  totalValue: number;
  status: 'pending' | 'partial' | 'delivered' | 'cancelled';
}

const CostEntryModal: React.FC<CostEntryModalProps> = ({ cost, orderId, onClose, onSave }) => {
  const { orders } = useOrderStore();
  const { addCost, updateCost } = useCostCenterStore();
  const { user } = useAuthStore();
  const { suppliers, loadSuppliers, subscribeToSuppliers } = useSupplierStore();
  
  // Track the search type (orderNumber or internalOrderNumber)
  const [searchType, setSearchType] = useState<'orderNumber' | 'internalOrderNumber'>('orderNumber');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPurchaseOrders, setShowPurchaseOrders] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  
  const [formData, setFormData] = useState<Omit<CostEntry, 'id'>>({
    orderId: cost?.orderId || orderId || '',
    orderNumber: cost?.orderNumber || '',
    purchaseOrderNumber: cost?.purchaseOrderNumber || '',
    supplierName: cost?.supplierName || '',
    description: cost?.description || '',
    category: cost?.category || 'material',
    amount: cost?.amount || 0,
    date: cost?.date || format(new Date(), 'yyyy-MM-dd'),
    notes: cost?.notes || '',
    attachmentUrl: cost?.attachmentUrl || '',
    createdAt: cost?.createdAt || new Date().toISOString(),
    createdBy: cost?.createdBy || user?.email || 'unknown',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filteredOrders, setFilteredOrders] = useState<typeof orders>(orders);
  
  // Load suppliers when component mounts
  useEffect(() => {
    const unsubscribe = subscribeToSuppliers();
    
    if (suppliers.length === 0) {
      loadSuppliers();
    }
    
    return () => unsubscribe();
  }, [subscribeToSuppliers, loadSuppliers, suppliers.length]);
  
  // When order ID changes, update order number
  useEffect(() => {
    if (formData.orderId) {
      const selectedOrder = orders.find(order => order.id === formData.orderId);
      if (selectedOrder) {
        setFormData(prev => ({
          ...prev,
          orderNumber: selectedOrder.orderNumber
        }));
        
        // Load purchase orders for this order
        loadPurchaseOrders(formData.orderId);
      }
    }
  }, [formData.orderId, orders]);
  
  // Filter orders when search term changes
  useEffect(() => {
    if (!searchTerm) {
      setFilteredOrders(orders);
    } else {
      setFilteredOrders(orders.filter(order => {
        if (searchType === 'orderNumber') {
          return order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase());
        } else {
          return order.internalOrderNumber.toLowerCase().includes(searchTerm.toLowerCase());
        }
      }));
    }
  }, [searchTerm, searchType, orders]);

  // Load purchase orders for the selected order
  const loadPurchaseOrders = async (selectedOrderId: string) => {
    try {
      // In a real app, this would fetch from Firestore
      // For now, let's query the purchaseOrders collection
      const purchaseOrdersQuery = query(
        collection(db, 'purchaseOrders'),
        where('orderId', '==', selectedOrderId)
      );
      
      const purchaseOrdersSnapshot = await getDocs(purchaseOrdersQuery);
      
      if (!purchaseOrdersSnapshot.empty) {
        const poData = purchaseOrdersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PurchaseOrder[];
        
        setPurchaseOrders(poData);
      } else {
        // For demo purposes, generate some mock data if no real data exists
        const mockPurchaseOrders = [
          {
            id: 'po1',
            purchaseOrderNumber: 'PO-230501-001',
            supplierName: 'Fornecedor A',
            issueDate: '2023-05-01',
            totalValue: 5000.00,
            status: 'pending'
          },
          {
            id: 'po2',
            purchaseOrderNumber: 'PO-230615-002',
            supplierName: 'Fornecedor B',
            issueDate: '2023-06-15',
            totalValue: 2500.00,
            status: 'delivered'
          }
        ] as PurchaseOrder[];
        
        setPurchaseOrders(mockPurchaseOrders);
      }
    } catch (error) {
      console.error('Error loading purchase orders:', error);
      setPurchaseOrders([]);
    }
  };
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.orderId) {
      newErrors.orderId = 'Por favor, selecione um pedido';
    }
    
    if (!formData.supplierName.trim()) {
      newErrors.supplierName = 'Por favor, informe o nome do fornecedor';
    }
    
    if (!formData.purchaseOrderNumber.trim()) {
      newErrors.purchaseOrderNumber = 'Por favor, informe o número do pedido de compra (OC)';
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Por favor, informe uma descrição';
    }
    
    if (!formData.date) {
      newErrors.date = 'Por favor, selecione uma data';
    }
    
    if (formData.amount <= 0) {
      newErrors.amount = 'O valor deve ser maior que zero';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      if (cost) {
        // Update existing cost
        await updateCost({
          ...formData,
          id: cost.id
        });
      } else {
        // Add new cost
        await addCost(formData);
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving cost entry:', error);
      alert('Erro ao salvar lançamento de custo');
    }
  };

  const handleSelectPurchaseOrder = (po: PurchaseOrder) => {
    setFormData(prev => ({
      ...prev,
      purchaseOrderNumber: po.purchaseOrderNumber,
      supplierName: po.supplierName,
      amount: po.totalValue,
      description: `Pagamento referente ao Pedido de Compra ${po.purchaseOrderNumber}`
    }));
    setShowPurchaseOrders(false);
  };

  // Handle supplier selection
  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setFormData(prev => ({
        ...prev,
        supplierName: supplier.name
      }));
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            {cost ? 'Editar Lançamento de Custo' : 'Novo Lançamento de Custo'}
          </h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {/* Help text */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex">
            <HelpCircle className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800">
                Registre os custos relacionados a pedidos, como compra de materiais, 
                contratação de serviços, mão de obra e logística. Cada lançamento 
                será associado a um pedido específico.
              </p>
            </div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Work order selection added */}
          <div>
            <div className="flex space-x-2 mb-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Package className="h-4 w-4 mr-1" />
                Ordem de Serviço (OS)
              </label>
              <div className="space-x-2">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    checked={searchType === 'orderNumber'}
                    onChange={() => setSearchType('orderNumber')}
                  />
                  <span className="ml-2 text-sm text-gray-700">Nº Pedido</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    checked={searchType === 'internalOrderNumber'}
                    onChange={() => setSearchType('internalOrderNumber')}
                  />
                  <span className="ml-2 text-sm text-gray-700">OS Interna</span>
                </label>
              </div>
            </div>
            
            <div className="mb-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchType === 'orderNumber' ? "Buscar por número do pedido..." : "Buscar por número da OS interna..."}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
            
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <Package className="h-4 w-4 mr-1" />
              Pedido Relacionado
            </label>
            <select
              value={formData.orderId}
              onChange={(e) => setFormData(prev => ({ ...prev, orderId: e.target.value }))}
              className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                errors.orderId ? 'border-red-500' : ''
              }`}
              disabled={!!orderId} // Disable if orderId is provided through props
            >
              <option value="">Selecione um pedido</option>
              {filteredOrders
                .filter(order => !order.deleted) // Only show non-deleted orders
                .sort((a, b) => {
                  if (searchType === 'orderNumber') {
                    return a.orderNumber.localeCompare(b.orderNumber);
                  } else {
                    return a.internalOrderNumber.localeCompare(b.internalOrderNumber);
                  }
                }) // Sort by order number or internal order number
                .map(order => (
                  <option key={order.id} value={order.id}>
                    {searchType === 'orderNumber' 
                      ? `#${order.orderNumber} - ${order.customer}` 
                      : `OS: ${order.internalOrderNumber} - #${order.orderNumber} - ${order.customer}`}
                  </option>
                ))}
            </select>
            {errors.orderId && (
              <p className="mt-1 text-sm text-red-500">{errors.orderId}</p>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Purchase Order selection */}
            <div>
              <label className="flex justify-between items-center">
                <span className="block text-sm font-medium text-gray-700 mb-1">
                  Número do Pedido de Compra (OC)
                </span>
                {formData.orderId && (
                  <button
                    type="button"
                    onClick={() => setShowPurchaseOrders(!showPurchaseOrders)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {showPurchaseOrders ? 'Ocultar PCs' : 'Mostrar PCs disponíveis'}
                  </button>
                )}
              </label>
              <input
                type="text"
                value={formData.purchaseOrderNumber}
                onChange={(e) => setFormData(prev => ({...prev, purchaseOrderNumber: e.target.value}))}
                className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                  errors.purchaseOrderNumber ? 'border-red-500' : ''
                }`}
                placeholder="Ex: OC-123, 456/2022"
              />
              {errors.purchaseOrderNumber && (
                <p className="mt-1 text-sm text-red-500">{errors.purchaseOrderNumber}</p>
              )}
              
              {/* Available purchase orders dropdown */}
              {showPurchaseOrders && purchaseOrders.length > 0 && (
                <div className="mt-2 border rounded-md bg-white shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-3 border-b bg-gray-50">
                    <h4 className="font-medium text-sm">Pedidos de Compra disponíveis</h4>
                  </div>
                  <div className="divide-y">
                    {purchaseOrders.map(po => (
                      <div 
                        key={po.id}
                        className="p-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleSelectPurchaseOrder(po)}
                      >
                        <div className="font-medium">{po.purchaseOrderNumber}</div>
                        <div className="flex justify-between text-sm">
                          <span>{po.supplierName}</span>
                          <span>{po.totalValue.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Supplier selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fornecedor
              </label>
              <select
                value={suppliers.find(s => s.name === formData.supplierName)?.id || ""}
                onChange={(e) => handleSupplierChange(e.target.value)}
                className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                  errors.supplierName ? 'border-red-500' : ''
                }`}
              >
                <option value="">Selecione um fornecedor</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              
              {/* Allow custom supplier name input if needed */}
              {!suppliers.some(s => s.name === formData.supplierName) && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    Ou digite o nome do fornecedor manualmente:
                  </label>
                  <input
                    type="text"
                    value={formData.supplierName}
                    onChange={(e) => setFormData(prev => ({...prev, supplierName: e.target.value}))}
                    className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                      errors.supplierName ? 'border-red-500' : ''
                    }`}
                    placeholder="Nome do fornecedor"
                  />
                </div>
              )}
              
              {errors.supplierName && (
                <p className="mt-1 text-sm text-red-500">{errors.supplierName}</p>
              )}
            </div>
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                errors.description ? 'border-red-500' : ''
              }`}
              placeholder="Descrição do item/serviço adquirido"
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-500">{errors.description}</p>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  category: e.target.value as 'material' | 'service' | 'labor' | 'logistics' | 'other' 
                }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="material">Materiais</option>
                <option value="service">Serviços</option>
                <option value="labor">Mão de Obra</option>
                <option value="logistics">Logística</option>
                <option value="other">Outros</option>
              </select>
            </div>
            
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <DollarSign className="h-4 w-4 mr-1" />
                Valor
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">R$</span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                  className={`pl-9 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                    errors.amount ? 'border-red-500' : ''
                  }`}
                  placeholder="0,00"
                  step="0.01"
                  min="0.01"
                />
              </div>
              {errors.amount && (
                <p className="mt-1 text-sm text-red-500">{errors.amount}</p>
              )}
            </div>
            
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Data
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                  errors.date ? 'border-red-500' : ''
                }`}
              />
              {errors.date && (
                <p className="mt-1 text-sm text-red-500">{errors.date}</p>
              )}
            </div>
          </div>
          
          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={3}
              placeholder="Informações adicionais sobre este lançamento"
            />
          </div>
          
          {/* File Attachment (URL only for now) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link para Nota Fiscal ou Comprovante (opcional)
            </label>
            <input
              type="url"
              value={formData.attachmentUrl || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, attachmentUrl: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="https://drive.google.com/..."
            />
          </div>
          
          <div className="flex justify-end space-x-4 mt-6">
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
            >
              {cost ? 'Atualizar' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CostEntryModal;