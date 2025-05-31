import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Building, FileText, Package, CheckCircle } from 'lucide-react';
import { Order } from '../types/kanban';
import { Project } from '../types/project';

interface OrderModalProps {
  order: Order;
  onClose: () => void;
  onSave: (order: Order) => void;
  projects: Project[];
}

// Função para formatar data para input
const formatDateForInput = (date: any): string => {
  try {
    if (!date) return '';
    
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (date && typeof date.seconds === 'number') {
      dateObj = new Date(date.seconds * 1000);
    } else {
      return '';
    }
    
    if (isNaN(dateObj.getTime())) return '';
    
    return dateObj.toISOString().split('T')[0];
  } catch (error) {
    console.error('Erro ao formatar data para input:', error);
    return '';
  }
};

const OrderModal: React.FC<OrderModalProps> = ({
  order,
  onClose,
  onSave,
  projects
}) => {
  const [formData, setFormData] = useState<Order>({
    ...order,
    orderNumber: order.orderNumber || '',
    internalOrderNumber: order.internalOrderNumber || '',
    customer: order.customer || '',
    customerName: order.customerName || '',
    projectId: order.projectId || '',
    projectName: order.projectName || '',
    startDate: order.startDate || new Date().toISOString(),
    deliveryDate: order.deliveryDate || '',
    completedDate: order.completedDate || null,
    status: order.status || 'in-progress',
    totalWeight: order.totalWeight || 0,
    description: order.description || '',
    notes: order.notes || '',
    checklist: order.checklist || {
      drawings: false,
      inspectionTestPlan: false,
      paintPlan: false
    },
    items: order.items || [],
    overallProgress: order.overallProgress || 0,
    columnId: order.columnId || null,
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: order.updatedAt || new Date().toISOString(),
    deleted: order.deleted || false,
    statusHistory: order.statusHistory || [],
    lastExportDate: order.lastExportDate || null
  });

  useEffect(() => {
    if (formData.projectId) {
      const selectedProject = projects.find(p => p.id === formData.projectId);
      if (selectedProject) {
        setFormData(prev => ({
          ...prev,
          projectName: selectedProject.name
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        projectName: ''
      }));
    }
  }, [formData.projectId, projects]);

  const handleInputChange = (field: keyof Order, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleChecklistChange = (field: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [field]: checked
      }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.orderNumber.trim()) {
      alert('Número do pedido é obrigatório');
      return;
    }
    
    if (!formData.customer.trim()) {
      alert('Cliente é obrigatório');
      return;
    }
    
    if (!formData.deliveryDate) {
      alert('Data de entrega é obrigatória');
      return;
    }

    const orderToSave: Order = {
      ...formData,
      startDate: formData.startDate || new Date().toISOString(),
      deliveryDate: formData.deliveryDate || '',
      completedDate: formData.completedDate || null,
      updatedAt: new Date().toISOString()
    };

    onSave(orderToSave);
  };

  const statusOptions = [
    { value: 'in-progress', label: 'Em Andamento' },
    { value: 'delayed', label: 'Atrasado' },
    { value: 'waiting-docs', label: 'Aguardando Documentação' },
    { value: 'completed', label: 'Completo' },
    { value: 'ready', label: 'Pronto para Embarque' },
    { value: 'urgent', label: 'Urgente' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {order.id === 'new' ? 'Novo Pedido' : `Pedido #${formData.orderNumber}`}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Package className="h-4 w-4 inline-block mr-1" />
                Número do Pedido *
              </label>
              <input
                type="text"
                value={formData.orderNumber}
                onChange={(e) => handleInputChange('orderNumber', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ex: 4500202310"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FileText className="h-4 w-4 inline-block mr-1" />
                OS Interna *
              </label>
              <input
                type="text"
                value={formData.internalOrderNumber}
                onChange={(e) => handleInputChange('internalOrderNumber', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ex: 774/25"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="h-4 w-4 inline-block mr-1" />
                Cliente *
              </label>
              <input
                type="text"
                value={formData.customer}
                onChange={(e) => handleInputChange('customer', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Nome do cliente"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Building className="h-4 w-4 inline-block mr-1" />
                Projeto do Cliente
              </label>
              <select
                value={formData.projectId || ''}
                onChange={(e) => handleInputChange('projectId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecione um projeto</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Peso Total (kg)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.totalWeight || ''}
                onChange={(e) => handleInputChange('totalWeight', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="h-4 w-4 inline-block mr-1" />
                Data de Início *
              </label>
              <input
                type="date"
                value={formatDateForInput(formData.startDate)}
                onChange={(e) => handleInputChange('startDate', e.target.value ? new Date(e.target.value).toISOString() : '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="h-4 w-4 inline-block mr-1" />
                Data de Entrega *
              </label>
              <input
                type="date"
                value={formatDateForInput(formData.deliveryDate)}
                onChange={(e) => handleInputChange('deliveryDate', e.target.value ? new Date(e.target.value).toISOString() : '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <CheckCircle className="h-4 w-4 inline-block mr-1" />
                Data de Conclusão
              </label>
              <input
                type="date"
                value={formatDateForInput(formData.completedDate)}
                onChange={(e) => handleInputChange('completedDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Pode ser antes ou depois da data de entrega programada
              </p>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Descrição do pedido..."
            />
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Observações adicionais..."
            />
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Checklist de Documentação
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.checklist?.drawings || false}
                  onChange={(e) => handleChecklistChange('drawings', e.target.checked)}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Desenhos</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.checklist?.inspectionTestPlan || false}
                  onChange={(e) => handleChecklistChange('inspectionTestPlan', e.target.checked)}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Plano de Inspeção</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.checklist?.paintPlan || false}
                  onChange={(e) => handleChecklistChange('paintPlan', e.target.checked)}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Plano de Pintura</span>
              </label>
            </div>
          </div>

          <div className="mt-8 flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {order.id === 'new' ? 'Criar Pedido' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OrderModal;
