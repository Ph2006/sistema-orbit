import React, { useState, useEffect } from 'react';
import { X, Plus, Tag, Trash2 } from 'lucide-react';
import { Supplier } from '../types/materials';

interface SupplierModalProps {
  supplier: Supplier | null;
  onClose: () => void;
  onSave: (supplier: Supplier) => void;
  existingCategories: string[];
}

const SupplierModal: React.FC<SupplierModalProps> = ({
  supplier,
  onClose,
  onSave,
  existingCategories
}) => {
  const [formData, setFormData] = useState<Supplier>({
    id: supplier?.id || 'new',
    name: supplier?.name || '',
    tradeName: supplier?.tradeName || '',
    cnpj: supplier?.cnpj || '',
    stateRegistration: supplier?.stateRegistration || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    address: supplier?.address || '',
    contactPerson: supplier?.contactPerson || '',
    category: supplier?.category || [],
    lastOrderDate: supplier?.lastOrderDate || '',
    evaluationScore: supplier?.evaluationScore || 0,
    paymentTerms: supplier?.paymentTerms || '',
    deliveryTimeAvg: supplier?.deliveryTimeAvg || 0,
    status: supplier?.status || 'active',
    notes: supplier?.notes || '',
    createdAt: supplier?.createdAt || new Date().toISOString()
  });
  
  const [newCategory, setNewCategory] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }
    
    if (!formData.cnpj.trim()) {
      newErrors.cnpj = 'CNPJ é obrigatório';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'E-mail inválido';
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Telefone é obrigatório';
    }
    
    if (formData.category.length === 0) {
      newErrors.category = 'Pelo menos uma categoria é obrigatória';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    
    if (!formData.category.includes(newCategory.trim())) {
      setFormData(prev => ({
        ...prev,
        category: [...prev.category, newCategory.trim()]
      }));
    }
    
    setNewCategory('');
  };

  const handleRemoveCategory = (category: string) => {
    setFormData(prev => ({
      ...prev,
      category: prev.category.filter(cat => cat !== category)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {supplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          </h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Razão Social <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${errors.name ? 'border-red-500' : ''}`}
                placeholder="Razão Social"
                required
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome Fantasia
              </label>
              <input
                type="text"
                value={formData.tradeName || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, tradeName: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Nome Fantasia"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CNPJ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.cnpj}
                onChange={(e) => setFormData(prev => ({ ...prev, cnpj: e.target.value }))}
                className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${errors.cnpj ? 'border-red-500' : ''}`}
                placeholder="00.000.000/0000-00"
                required
              />
              {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inscrição Estadual
              </label>
              <input
                type="text"
                value={formData.stateRegistration || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, stateRegistration: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Inscrição Estadual"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mail <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${errors.email ? 'border-red-500' : ''}`}
                placeholder="contato@empresa.com.br"
                required
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${errors.phone ? 'border-red-500' : ''}`}
                placeholder="(00) 0000-0000"
                required
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Endereço
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={2}
                placeholder="Endereço completo"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pessoa de Contato
              </label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Nome do contato responsável"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' | 'blocked' }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="blocked">Bloqueado</option>
              </select>
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categorias de Materiais <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Adicionar categoria (ex: Aço, Parafusos, etc)"
                  list="categories"
                />
                <datalist id="categories">
                  {existingCategories.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
              
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.category.map(category => (
                  <div key={category} className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
                    <Tag className="h-3 w-3 text-gray-500 mr-1" />
                    <span className="text-sm">{category}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(category)}
                      className="ml-2 text-gray-500 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {formData.category.length === 0 && (
                  <p className="text-sm text-gray-500 py-1">Nenhuma categoria adicionada.</p>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condições de Pagamento
              </label>
              <input
                type="text"
                value={formData.paymentTerms || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, paymentTerms: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: 30/60/90 dias"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prazo Médio de Entrega (dias)
              </label>
              <input
                type="number"
                value={formData.deliveryTimeAvg || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, deliveryTimeAvg: parseInt(e.target.value) }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Prazo médio em dias"
                min="0"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={3}
                placeholder="Informações adicionais sobre o fornecedor"
              />
            </div>
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
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierModal;