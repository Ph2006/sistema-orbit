import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ProductionOrder } from '../types/productionOrder';
import { Order } from '../types/kanban';
import { Material, QualityCheckItem } from '../types/productionOrder';
import { useProductionOrderStore } from '../store/productionOrderStore';
import { useAuthStore } from '../store/authStore';
import { format, addDays } from 'date-fns';

interface ManufacturingStage {
  id: string;
  name: string;
  description: string;
  order: number;
  active: boolean;
}

interface ProductionOrderFormProps {
  order: ProductionOrder | null;
  mainOrders: Order[];
  onClose: () => void;
  onSuccess: () => void;
}

const ProductionOrderForm: React.FC<ProductionOrderFormProps> = ({
  order,
  mainOrders,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuthStore();
  const { addProductionOrder, updateProductionOrder, error } = useProductionOrderStore();

  const [formData, setFormData] = useState<Omit<ProductionOrder, 'id'>>({
    orderId: order?.orderId || '',
    itemId: order?.itemId || '',
    stageId: order?.stageId || '',
    stageName: order?.stageName || '',
    assignedTo: order?.assignedTo || '',
    status: order?.status || 'pending',
    priority: order?.priority || 'medium',
    plannedStartDate: order?.plannedStartDate || new Date().toISOString().split('T')[0],
    plannedEndDate: order?.plannedEndDate || addDays(new Date(), 1).toISOString().split('T')[0],
    actualStartDate: order?.actualStartDate || null,
    actualEndDate: order?.actualEndDate || null,
    notes: order?.notes || '',
    createdAt: order?.createdAt || new Date().toISOString(),
    updatedAt: order?.updatedAt || new Date().toISOString(),
    createdBy: order?.createdBy || user?.email || 'system',
    workInstructions: order?.workInstructions || [],
    materialsRequired: order?.materialsRequired || [],
    qualityChecklist: order?.qualityChecklist || [],
    startCode: order?.startCode || '',
    endCode: order?.endCode || '',
    history: order?.history || []
  });

  const [stages, setStages] = useState<ManufacturingStage[]>([]);
  const [items, setItems] = useState<{ id: string, code: string, description: string }[]>([]);
  const [newInstruction, setNewInstruction] = useState('');
  const [newMaterial, setNewMaterial] = useState<Material>({
    id: '',
    name: '',
    quantity: 1,
    unit: 'unid',
    available: true
  });
  const [newCheckItem, setNewCheckItem] = useState<QualityCheckItem>({
    id: '',
    description: '',
    checked: false
  });

  useEffect(() => {
    loadStages();
  }, []);

  useEffect(() => {
    // If an order ID is selected, load its items
    if (formData.orderId) {
      const selectedOrder = mainOrders.find(o => o.id === formData.orderId);
      if (selectedOrder) {
        setItems(selectedOrder.items.map(item => ({
          id: item.id,
          code: item.code,
          description: item.description
        })));
      } else {
        setItems([]);
      }
    } else {
      setItems([]);
    }
  }, [formData.orderId, mainOrders]);

  const loadStages = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'manufacturingStages'));
      const stagesData = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ManufacturingStage[];
      
      setStages(stagesData.filter(stage => stage.active).sort((a, b) => a.order - b.order));
    } catch (error) {
      console.error('Error loading stages:', error);
    }
  };

  const handleStageChange = (stageId: string) => {
    const selectedStage = stages.find(s => s.id === stageId);
    setFormData(prev => ({
      ...prev,
      stageId,
      stageName: selectedStage?.name || ''
    }));
  };

  const handleAddInstruction = () => {
    if (newInstruction.trim()) {
      setFormData(prev => ({
        ...prev,
        workInstructions: [...prev.workInstructions, newInstruction.trim()]
      }));
      setNewInstruction('');
    }
  };

  const handleRemoveInstruction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      workInstructions: prev.workInstructions.filter((_, i) => i !== index)
    }));
  };

  const handleAddMaterial = () => {
    if (newMaterial.name.trim()) {
      setFormData(prev => ({
        ...prev,
        materialsRequired: [
          ...prev.materialsRequired, 
          {
            ...newMaterial,
            id: crypto.randomUUID()
          }
        ]
      }));
      setNewMaterial({
        id: '',
        name: '',
        quantity: 1,
        unit: 'unid',
        available: true
      });
    }
  };

  const handleRemoveMaterial = (id: string) => {
    setFormData(prev => ({
      ...prev,
      materialsRequired: prev.materialsRequired.filter(m => m.id !== id)
    }));
  };

  const handleAddCheckItem = () => {
    if (newCheckItem.description.trim()) {
      setFormData(prev => ({
        ...prev,
        qualityChecklist: [
          ...prev.qualityChecklist, 
          {
            ...newCheckItem,
            id: crypto.randomUUID()
          }
        ]
      }));
      setNewCheckItem({
        id: '',
        description: '',
        checked: false
      });
    }
  };

  const handleRemoveCheckItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      qualityChecklist: prev.qualityChecklist.filter(item => item.id !== id)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Validate required fields
      if (!formData.orderId || !formData.itemId || !formData.stageId || !formData.stageName) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
      }
      
      if (order) {
        // Update existing order
        await updateProductionOrder({
          ...formData,
          id: order.id
        });
      } else {
        // Create new order
        await addProductionOrder(formData);
      }
      
      onSuccess();
    } catch (err) {
      console.error('Error saving production order:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {order ? 'Editar Ordem de Produção' : 'Nova Ordem de Produção'}
          </h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Order selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pedido
              </label>
              <select
                value={formData.orderId}
                onChange={(e) => setFormData({ ...formData, orderId: e.target.value, itemId: '' })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              >
                <option value="">Selecione um pedido</option>
                {mainOrders
                  .filter(o => !o.deleted) // Exclude deleted orders
                  .map(o => (
                    <option key={o.id} value={o.id}>
                      #{o.orderNumber} - {o.customer} (OS: {o.internalOrderNumber})
                    </option>
                  ))}
              </select>
            </div>

            {/* Item selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Item
              </label>
              <select
                value={formData.itemId}
                onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
                disabled={!formData.orderId}
              >
                <option value="">Selecione um item</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Stage selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Etapa de Produção
              </label>
              <select
                value={formData.stageId}
                onChange={(e) => handleStageChange(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              >
                <option value="">Selecione uma etapa</option>
                {stages.map(stage => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Assigned to */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsável
              </label>
              <input
                type="text"
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Nome do responsável"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              >
                <option value="pending">Pendente</option>
                <option value="in-progress">Em Andamento</option>
                <option value="completed">Concluído</option>
                <option value="on-hold">Em Espera</option>
                <option value="cancelled">Cancelado</option>
                <option value="delayed">Atrasado</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prioridade
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>

            {/* Planned start date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Planejada de Início
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="date"
                  value={formData.plannedStartDate.split('T')[0]}
                  onChange={(e) => setFormData({ ...formData, plannedStartDate: e.target.value })}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  required
                />
              </div>
            </div>

            {/* Planned end date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Planejada de Término
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="date"
                  value={formData.plannedEndDate.split('T')[0]}
                  onChange={(e) => setFormData({ ...formData, plannedEndDate: e.target.value })}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  required
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={3}
            />
          </div>

          {/* Work Instructions */}
          <div className="border-t pt-5">
            <h3 className="text-lg font-medium mb-3">Instruções de Trabalho</h3>
            <div className="space-y-2">
              {formData.workInstructions.map((instruction, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-6 text-gray-500">{index + 1}.</div>
                  <div className="flex-1 border rounded-md px-3 py-2 bg-gray-50">
                    {instruction}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveInstruction(index)}
                    className="ml-2 text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <div className="flex items-center space-x-2 mt-4">
                <input
                  type="text"
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Adicionar instrução..."
                />
                <button
                  type="button"
                  onClick={handleAddInstruction}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Materials Required */}
          <div className="border-t pt-5">
            <h3 className="text-lg font-medium mb-3">Materiais Necessários</h3>
            <div className="space-y-4">
              {formData.materialsRequired.map((material) => (
                <div key={material.id} className="flex items-center gap-2">
                  <div className="flex-1 grid grid-cols-3 gap-2 p-2 border rounded-md bg-gray-50">
                    <div>{material.name}</div>
                    <div>{material.quantity} {material.unit}</div>
                    <div>{material.available ? 'Disponível' : 'Indisponível'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMaterial(material.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mt-4 items-end">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={newMaterial.name}
                    onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    placeholder="Nome do material"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={newMaterial.quantity}
                    onChange={(e) => setNewMaterial({ ...newMaterial, quantity: Number(e.target.value) })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    placeholder="Qtd"
                    min="1"
                    step="1"
                  />
                </div>
                <div>
                  <select
                    value={newMaterial.unit}
                    onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  >
                    <option value="unid">unid</option>
                    <option value="kg">kg</option>
                    <option value="m">m</option>
                    <option value="m²">m²</option>
                    <option value="l">l</option>
                    <option value="pç">pç</option>
                  </select>
                </div>
                <div>
                  <select
                    value={newMaterial.available ? 'yes' : 'no'}
                    onChange={(e) => setNewMaterial({ ...newMaterial, available: e.target.value === 'yes' })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  >
                    <option value="yes">Disponível</option>
                    <option value="no">Indisponível</option>
                  </select>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleAddMaterial}
                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Plus className="h-5 w-5 mx-auto" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quality Checklist */}
          <div className="border-t pt-5">
            <h3 className="text-lg font-medium mb-3">Checklist de Qualidade</h3>
            <div className="space-y-2">
              {formData.qualityChecklist.map((item) => (
                <div key={item.id} className="flex items-center">
                  <div className="flex-1 border rounded-md px-3 py-2 bg-gray-50">
                    {item.description}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCheckItem(item.id)}
                    className="ml-2 text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <div className="flex items-center space-x-2 mt-4">
                <input
                  type="text"
                  value={newCheckItem.description}
                  onChange={(e) => setNewCheckItem({ ...newCheckItem, description: e.target.value })}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Adicionar item para verificação..."
                />
                <button
                  type="button"
                  onClick={handleAddCheckItem}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-4">
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
              {order ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductionOrderForm;