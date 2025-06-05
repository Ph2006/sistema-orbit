import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase'; // ✅ CORRIGIDO: Caminho correto
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
  
  // Carregar dados da requisição - CORRIGIDO para usar companies/mecald
  useEffect(() => {
    const fetchRequisition = async () => {
      if (!id) {
        setError('ID da requisição não fornecido');
        setLoading(false);
        return;
      }
      
      try {
        const docRef = doc(db, 'companies/mecald/materialsRequisitions', id); // ✅ CORRIGIDO
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
        
        const docRef = doc(db, 'companies/mecald/materialsRequisitions', id); // ✅ CORRIGIDO
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
      
      const docRef = doc(db, 'companies/mecald/materialsRequisitions', id); // ✅ CORRIGIDO
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
