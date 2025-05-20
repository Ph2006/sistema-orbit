import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Customer } from '../types/customer';

interface CustomerModalProps {
  customer: Customer | null;
  onClose: () => void;
  onSave: (customer: Customer) => void;
  cnpjList: string[]; // Lista de CNPJs existentes
  nextId: string; // Next sequential ID
}

const CustomerModal: React.FC<CustomerModalProps> = ({ customer, onClose, onSave, cnpjList, nextId }) => {
  const [formData, setFormData] = useState<Customer>({
    id: customer?.id || nextId,
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    cnpj: customer?.cnpj || '',
    createdAt: customer?.createdAt || new Date().toISOString(),
    category: customer?.category || '',
    segment: customer?.segment || '',
    notes: customer?.notes || '',
    contactPerson: customer?.contactPerson || '',
    contactPhone: customer?.contactPhone || '',
    status: customer?.status || 'active',
  });

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Verificar se o CNPJ já existe (exceto se for o mesmo cliente)
    if (cnpjList.includes(formData.cnpj) && (!customer || customer.cnpj !== formData.cnpj)) {
      setError('Este CNPJ já está cadastrado para outro cliente.');
      return;
    }

    // Ensure all required fields are present
    if (!formData.name.trim() || !formData.email.trim() || !formData.cnpj.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {customer ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border-l-4 border-red-500 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                ID do Cliente
              </label>
              <div className="flex mt-1">
                <input
                  type="text"
                  value={formData.id}
                  readOnly={true}
                  className="flex-grow rounded-md border-gray-300 bg-gray-100 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                ID gerado automaticamente em sequência.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nome
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                CNPJ
              </label>
              <input
                type="text"
                value={formData.cnpj}
                onChange={e => setFormData(prev => ({ ...prev, cnpj: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Segmento
              </label>
              <select
                value={formData.segment || ''}
                onChange={e => setFormData(prev => ({ ...prev, segment: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="">Selecione um segmento</option>
                <option value="Indústria">Indústria</option>
                <option value="Construção">Construção</option>
                <option value="Energia">Energia</option>
                <option value="Mineração">Mineração</option>
                <option value="Óleo e Gás">Óleo e Gás</option>
                <option value="Naval">Naval</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Categoria
              </label>
              <select
                value={formData.category || ''}
                onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="">Selecione uma categoria</option>
                <option value="Premium">Premium</option>
                <option value="Padrão">Padrão</option>
                <option value="Ocasional">Ocasional</option>
                <option value="Novo">Novo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={formData.status || 'active'}
                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' | 'lead' }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="lead">Lead</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Telefone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Pessoa de Contato
              </label>
              <input
                type="text"
                value={formData.contactPerson || ''}
                onChange={e => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Telefone do Contato
              </label>
              <input
                type="tel"
                value={formData.contactPhone || ''}
                onChange={e => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Endereço
            </label>
            <textarea
              value={formData.address}
              onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Observações
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={3}
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
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerModal;