import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  Save, 
  X, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  Calendar,
  User,
  Building,
  FileText,
  Hash,
  Package
} from 'lucide-react';

const MaterialsRequisitionEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    requester: '',
    department: '',
    description: '',
    priority: '',
    status: '',
    requestDate: '',
    approvalDate: '',
    withdrawalDate: '',
    quantity: '',
    unit: '',
  });
  
  const [originalRequisition, setOriginalRequisition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Função para verificar se é apenas mudança de status para estoque
  const isOnlyStatusToStockUpdate = () => {
    if (!originalRequisition) return false;
    
    const statusChanged = formData.status === 'estoque' && originalRequisition.status !== 'estoque';
    
    const otherFieldsUnchanged = 
      formData.requester === originalRequisition.requester &&
      formData.department === originalRequisition.department &&
      formData.description === originalRequisition.description &&
      formData.priority === originalRequisition.priority &&
      String(formData.quantity) === String(originalRequisition.quantity) &&
      formData.unit === originalRequisition.unit;
    
    return statusChanged && otherFieldsUnchanged;
  };
  
  // Formatar data para input date
  const formatDateForInput = (date) => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    if (date.toDate) date = date.toDate();
    return date.toISOString().split('T')[0];
  };
  
  // Carregar dados da requisição
  useEffect(() => {
    const fetchRequisition = async () => {
      if (!id) {
        setError('ID da requisição não fornecido');
        setLoading(false);
        return;
      }
      
      try {
        const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          const requisitionData = {
            ...data,
            requestDate: formatDateForInput(data.requestDate),
            approvalDate: formatDateForInput(data.approvalDate),
            withdrawalDate: formatDateForInput(data.withdrawalDate),
            quantity: String(data.quantity || '')
          };
          
          setFormData(requisitionData);
          setOriginalRequisition(requisitionData);
        } else {
          setError('Requisição não encontrada');
        }
      } catch (err) {
        console.error('Erro ao buscar requisição:', err);
        setError('Erro ao carregar a requisição: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRequisition();
  }, [id]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };
  
  const validateForm = () => {
    if (isOnlyStatusToStockUpdate()) return true;
    
    const requiredFields = [
      { field: formData.requester?.trim(), name: 'Solicitante' },
      { field: formData.department?.trim(), name: 'Departamento' },
      { field: formData.description?.trim(), name: 'Descrição' },
      { field: formData.priority, name: 'Prioridade' },
      { field: formData.status, name: 'Status' },
      { field: formData.quantity, name: 'Quantidade' },
      { field: formData.unit?.trim(), name: 'Unidade' }
    ];
    
    const missingFields = requiredFields.filter(item => !item.field);
    
    if (missingFields.length > 0) {
      setError(`Campos obrigatórios: ${missingFields.map(f => f.name).join(', ')}`);
      return false;
    }
    
    const quantity = Number(formData.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      setError('Quantidade deve ser um número positivo');
      return false;
    }
    
    return true;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    
    try {
      if (isOnlyStatusToStockUpdate()) {
        const updateData = {
          status: 'estoque',
          withdrawalDate: Timestamp.fromDate(new Date())
        };
        
        const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
        await updateDoc(docRef, updateData);
        
        setSuccess('Status atualizado para "Retirado do Estoque" com sucesso!');
        setTimeout(() => navigate('/materials/requisitions'), 1500);
        return;
      }
      
      if (!validateForm()) return;
      
      const updateData = {
        requester: formData.requester.trim(),
        department: formData.department.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        status: formData.status,
        quantity: Number(formData.quantity),
        unit: formData.unit.trim(),
        requestDate: formData.requestDate ? Timestamp.fromDate(new Date(formData.requestDate)) : null,
        approvalDate: formData.approvalDate ? Timestamp.fromDate(new Date(formData.approvalDate)) : null,
        withdrawalDate: formData.withdrawalDate ? Timestamp.fromDate(new Date(formData.withdrawalDate)) : null,
        updatedAt: Timestamp.fromDate(new Date())
      };
      
      const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
      await updateDoc(docRef, updateData);
      
      setSuccess('Requisição atualizada com sucesso!');
      setTimeout(() => navigate('/materials/requisitions'), 1500);
      
    } catch (err) {
      console.error('Erro ao atualizar requisição:', err);
      setError('Erro ao salvar as alterações: ' + err.message);
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-lg text-gray-600">Carregando requisição...</span>
        </div>
      </div>
    );
  }
  
  if (!originalRequisition && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center space-x-3 text-red-600 mb-4">
              <AlertCircle className="h-6 w-6" />
              <h2 className="text-xl font-semibold">Requisição não encontrada</h2>
            </div>
            <p className="text-gray-600 mb-6">
              A requisição solicitada não foi encontrada ou ocorreu um erro ao carregar.
            </p>
            <button
              onClick={() => navigate('/materials/requisitions')}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Voltar para Lista
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Editar Requisição de Material
          </h1>
          <p className="text-sm text-gray-500">ID: {id}</p>
        </div>
        
        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <div className="flex">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <div className="ml-3">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}
        
        {isOnlyStatusToStockUpdate() && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <div className="flex">
              <CheckCircle className="h-5 w-5 text-blue-400" />
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  <strong>Modo atualização rápida:</strong> Apenas o status será alterado para "Retirado do Estoque"
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Status */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status *
              </label>
              <select
                name="status"
                value={formData.status || ''}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Selecione o status</option>
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="rejeitado">Rejeitado</option>
                <option value="estoque">Retirado do Estoque</option>
                <option value="concluido">Concluído</option>
              </select>
            </div>
            
            {/* Solicitante */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline h-4 w-4 mr-1" />
                Solicitante {!isOnlyStatusToStockUpdate() && '*'}
              </label>
              <input
                type="text"
                name="requester"
                value={formData.requester || ''}
                onChange={handleChange}
                required={!isOnlyStatusToStockUpdate()}
                disabled={isOnlyStatusToStockUpdate()}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isOnlyStatusToStockUpdate() ? 'bg-gray-100 text-gray-500' : ''
                }`}
              />
            </div>
            
            {/* Departamento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building className="inline h-4 w-4 mr-1" />
                Departamento {!isOnlyStatusToStockUpdate() && '*'}
              </label>
              <input
                type="text"
                name="department"
                value={formData.department || ''}
                onChange={handleChange}
                required={!isOnlyStatusToStockUpdate()}
                disabled={isOnlyStatusToStockUpdate()}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isOnlyStatusToStockUpdate() ? 'bg-gray-100 text-gray-500' : ''
                }`}
              />
            </div>
            
            {/* Descrição */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="inline h-4 w-4 mr-1" />
                Descrição {!isOnlyStatusToStockUpdate() && '*'}
              </label>
              <textarea
                name="description"
                value={formData.description || ''}
                onChange={handleChange}
                required={!isOnlyStatusToStockUpdate()}
                disabled={isOnlyStatusToStockUpdate()}
                rows={3}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isOnlyStatusToStockUpdate() ? 'bg-gray-100 text-gray-500' : ''
                }`}
              />
            </div>
            
            {/* Prioridade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prioridade {!isOnlyStatusToStockUpdate() && '*'}
              </label>
              <select
                name="priority"
                value={formData.priority || ''}
                onChange={handleChange}
                required={!isOnlyStatusToStockUpdate()}
                disabled={isOnlyStatusToStockUpdate()}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isOnlyStatusToStockUpdate() ? 'bg-gray-100 text-gray-500' : ''
                }`}
              >
                <option value="">Selecione a prioridade</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            
            {/* Quantidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Hash className="inline h-4 w-4 mr-1" />
                Quantidade {!isOnlyStatusToStockUpdate() && '*'}
              </label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity || ''}
                onChange={handleChange}
                required={!isOnlyStatusToStockUpdate()}
                disabled={isOnlyStatusToStockUpdate()}
                min="0"
                step="0.01"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isOnlyStatusToStockUpdate() ? 'bg-gray-100 text-gray-500' : ''
                }`}
              />
            </div>
            
            {/* Unidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Package className="inline h-4 w-4 mr-1" />
                Unidade {!isOnlyStatusToStockUpdate() && '*'}
              </label>
              <input
                type="text"
                name="unit"
                value={formData.unit || ''}
                onChange={handleChange}
                required={!isOnlyStatusToStockUpdate()}
                disabled={isOnlyStatusToStockUpdate()}
                placeholder="ex: kg, unidades, litros"
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isOnlyStatusToStockUpdate() ? 'bg-gray-100 text-gray-500' : ''
                }`}
              />
            </div>
            
            {/* Data da Solicitação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="inline h-4 w-4 mr-1" />
                Data da Solicitação
              </label>
              <input
                type="date"
                name="requestDate"
                value={formData.requestDate || ''}
                onChange={handleChange}
                disabled={isOnlyStatusToStockUpdate()}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  isOnlyStatusToStockUpdate() ? 'bg-gray-100 text-gray-500' : ''
                }`}
              />
            </div>
            
            {/* Data de Aprovação */}
            {(formData.status === 'aprovado' || formData.status === 'rejeitado') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Data de Aprovação/Rejeição
                </label>
                <input
                  type="date"
                  name="approvalDate"
                  value={formData.approvalDate || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
            
            {/* Data de Retirada */}
            {formData.status === 'estoque' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Data de Retirada
                </label>
                <input
                  type="date"
                  name="withdrawalDate"
                  value={formData.withdrawalDate || new Date().toISOString().split('T')[0]}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>
          
          {/* Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/materials/requisitions')}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </button>
            
            <button
              type="submit"
              disabled={saving}
              className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving 
                ? 'Salvando...' 
                : isOnlyStatusToStockUpdate() 
                  ? 'Marcar como Retirado' 
                  : 'Salvar Alterações'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialsRequisitionEdit;
