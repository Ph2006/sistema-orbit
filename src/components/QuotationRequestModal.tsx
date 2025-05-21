import React, { useState, useEffect } from 'react';
import { X, Send, Calendar, Plus, Trash2, AlertTriangle, FileText } from 'lucide-react';
import { collection, getDocs, query, where, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { MaterialRequisition, MaterialRequisitionItem, Supplier, QuotationRequest, QuotationRequestItem } from '../types/materials';
import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface QuotationRequestModalProps {
  requisition: MaterialRequisition;
  suppliers: Supplier[];
  onClose: () => void;
  onSave: (quotation: QuotationRequest, itemIds: string[]) => void;
}

const QuotationRequestModal: React.FC<QuotationRequestModalProps> = ({
  requisition,
  suppliers,
  onClose,
  onSave
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expirationDate, setExpirationDate] = useState<string>(
    format(addDays(new Date(), 7), 'yyyy-MM-dd')
  );
  const [notes, setNotes] = useState<string>('');
  const [drawingAttachments, setDrawingAttachments] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleToggleAllItems = (checked: boolean) => {
    if (checked) {
      setSelectedItems(new Set(requisition.items.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleToggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSetDrawingAttachment = (itemId: string, value: string) => {
    setDrawingAttachments(prev => ({
      ...prev,
      [itemId]: value
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!selectedSupplier) {
      newErrors.supplier = 'Selecione um fornecedor';
    }
    
    if (selectedItems.size === 0) {
      newErrors.items = 'Selecione pelo menos um item';
    }
    
    if (!expirationDate) {
      newErrors.expiration = 'Data de validade é obrigatória';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const supplier = suppliers.find(s => s.id === selectedSupplier);
    if (!supplier) return;
    
    const quotationItems: QuotationRequestItem[] = Array.from(selectedItems).map(itemId => {
      const item = requisition.items.find(i => i.id === itemId);
      if (!item) throw new Error('Item not found');
      
      return {
        id: crypto.randomUUID(),
        requisitionItemId: itemId,
        description: item.description,
        material: item.material,
        quantity: item.quantity,
        dimensions: item.dimensions,
        weight: item.totalWeight,
        drawingAttachment: drawingAttachments[itemId] // Include drawing attachment if any
      };
    });
    
    const quotation: QuotationRequest = {
      id: 'new',
      requisitionId: requisition.id,
      supplierId: supplier.id,
      supplierName: supplier.name,
      items: quotationItems,
      status: 'pending',
      requestDate: new Date().toISOString(),
      expirationDate: new Date(expirationDate).toISOString(),
      notes: notes
    };
    
    try {
      // Add the new quotation request to the 'quotationRequests' collection
      await addDoc(collection(db, getCompanyCollection('quotationRequests')), {
        ...quotation,
        requestDate: new Date().toISOString(), // Add timestamp
      });

      // Update the status of the selected items in the original material requisition
      const requisitionRef = doc(db, getCompanyCollection('materialRequisitions'), requisition.id); // Use getCompanyCollection
      const updatedRequisitionItems = requisition.items.map(item => {
        if (selectedItems.has(item.id)) {
          return { ...item, sentForQuotation: true }; // Mark as sent for quotation
        }
        return item;
      });

      await updateDoc(requisitionRef, { items: updatedRequisitionItems });

      // Notify parent component and close modal
      onSave(quotation, Array.from(selectedItems));
      onClose();
      alert('Solicitação de cotação enviada com sucesso!');

    } catch (error) {
      console.error('Error sending quotation request:', error);
      alert('Erro ao enviar solicitação de cotação.');
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Nova Solicitação de Cotação</h2>
            <p className="text-gray-600">
              Pedido #{requisition.orderNumber} - {requisition.customer}
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {requisition.items.length === 0 ? (
          <div className="p-8 text-center bg-yellow-50 rounded-lg">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-yellow-800 mb-2">Nenhum Item Disponível</h3>
            <p className="text-yellow-700">
              Não há itens pendentes para cotação nesta requisição. Todos os itens já foram enviados para cotação ou estão em outro status.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Voltar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fornecedor <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${errors.supplier ? 'border-red-500' : ''}`}
                  required
                >
                  <option value="">Selecione um fornecedor</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                {errors.supplier && <p className="mt-1 text-sm text-red-500">{errors.supplier}</p>}
                {suppliers.length === 0 && (
                  <p className="mt-1 text-sm text-yellow-600">Não há fornecedores ativos cadastrados.</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Validade da Cotação <span className="text-red-500">*</span>
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className={`pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${errors.expiration ? 'border-red-500' : ''}`}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    required
                  />
                </div>
                {errors.expiration && <p className="mt-1 text-sm text-red-500">{errors.expiration}</p>}
              </div>
            </div>
            
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Observações e Instruções ao Fornecedor
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={3}
                placeholder="Informações adicionais para o fornecedor"
              />
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Itens para Cotação</h3>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === requisition.items.length}
                    onChange={(e) => handleToggleAllItems(e.target.checked)}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Selecionar Todos</span>
                </label>
              </div>
              
              {errors.items && <p className="text-sm text-red-500">{errors.items}</p>}
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        
                      </th>
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
                        Qtd
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dimensões
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Peso
                      </th>
                      <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Desenho
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {requisition.items.map(item => (
                      <tr key={item.id} className={selectedItems.has(item.id) ? 'bg-blue-50' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => handleToggleItem(item.id)}
                            className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <span className="font-mono text-xs">{item.traceabilityCode}</span>
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {item.material}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {item.dimensions}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {item.totalWeight.toLocaleString('pt-BR')} kg
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <input
                            type="text"
                            value={drawingAttachments[item.id] || ''}
                            onChange={(e) => handleSetDrawingAttachment(item.id, e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                            placeholder="URL ou nº do desenho"
                            disabled={!selectedItems.has(item.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
              >
                <Send className="h-5 w-5 mr-2" />
                Enviar Solicitação
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default QuotationRequestModal;