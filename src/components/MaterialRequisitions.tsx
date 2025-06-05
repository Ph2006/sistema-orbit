import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  collection, 
  doc, 
  getDoc, 
  updateDoc, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';

// Importações do MUI - Verificar se todas estão instaladas
import { 
  Box, 
  Button, 
  FormControl, 
  InputLabel, 
  MenuItem, 
  Select, 
  TextField, 
  Typography,
  CircularProgress,
  Alert
} from '@mui/material';

// Importações do Date Picker - Verificar versão do MUI X
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ptBR } from 'date-fns/locale';

const MaterialsRequisitionEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Estado inicial do formulário
  const [formData, setFormData] = useState({
    requester: '',
    department: '',
    description: '',
    priority: '',
    status: '',
    requestDate: new Date(),
    approvalDate: null,
    withdrawalDate: null,
    quantity: '',
    unit: '',
  });
  
  const [originalRequisition, setOriginalRequisition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Função para verificar se é apenas mudança de status para estoque
  const isOnlyStatusToStockUpdate = () => {
    if (!originalRequisition) return false;
    
    // Verifica se mudou apenas o status para 'estoque'
    const statusChanged = formData.status === 'estoque' && originalRequisition.status !== 'estoque';
    
    // Verifica se outros campos importantes não foram alterados
    const otherFieldsUnchanged = 
      formData.requester === originalRequisition.requester &&
      formData.department === originalRequisition.department &&
      formData.description === originalRequisition.description &&
      formData.priority === originalRequisition.priority &&
      String(formData.quantity) === String(originalRequisition.quantity) &&
      formData.unit === originalRequisition.unit;
    
    return statusChanged && otherFieldsUnchanged;
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
          
          // Converter Timestamp para Date se necessário
          const requestDate = data.requestDate?.toDate ? data.requestDate.toDate() : new Date();
          const approvalDate = data.approvalDate?.toDate ? data.approvalDate.toDate() : null;
          const withdrawalDate = data.withdrawalDate?.toDate ? data.withdrawalDate.toDate() : null;
          
          const requisitionData = {
            ...data,
            requestDate,
            approvalDate,
            withdrawalDate,
            // Garantir que quantity seja string para o input
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
  
  // Manipular mudanças nos campos
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Manipular mudanças nas datas
  const handleDateChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Validação do formulário
  const validateForm = () => {
    // Pula validação se for apenas atualização de status para estoque
    if (isOnlyStatusToStockUpdate()) {
      return true;
    }
    
    // Validação completa
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
    
    // Validar se quantidade é um número positivo
    const quantity = Number(formData.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      setError('Quantidade deve ser um número positivo');
      return false;
    }
    
    return true;
  };
  
  // Enviar formulário
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Limpar erros anteriores
    
    try {
      // Verificar se é apenas atualização de status para estoque
      if (isOnlyStatusToStockUpdate()) {
        const updateData = {
          status: 'estoque',
          withdrawalDate: Timestamp.fromDate(new Date())
        };
        
        const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
        await updateDoc(docRef, updateData);
        
        console.log('Status atualizado para estoque com sucesso');
        navigate('/materials/requisitions');
        return;
      }
      
      // Validação completa para outras alterações
      if (!validateForm()) {
        return; // O erro já foi setado na função validateForm
      }
      
      // Preparar dados para salvar
      const updateData = {
        requester: formData.requester.trim(),
        department: formData.department.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        status: formData.status,
        quantity: Number(formData.quantity),
        unit: formData.unit.trim(),
        requestDate: formData.requestDate ? Timestamp.fromDate(formData.requestDate) : null,
        approvalDate: formData.approvalDate ? Timestamp.fromDate(formData.approvalDate) : null,
        withdrawalDate: formData.withdrawalDate ? Timestamp.fromDate(formData.withdrawalDate) : null,
        updatedAt: Timestamp.fromDate(new Date()) // Adicionar timestamp de atualização
      };
      
      // Atualizar documento no Firestore
      const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
      await updateDoc(docRef, updateData);
      
      console.log('Requisição atualizada com sucesso');
      navigate('/materials/requisitions');
      
    } catch (err) {
      console.error('Erro ao atualizar requisição:', err);
      setError('Erro ao salvar as alterações: ' + err.message);
    }
  };
  
  // Loading state
  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: '200px'
      }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Carregando requisição...</Typography>
      </Box>
    );
  }
  
  // Erro se não encontrou a requisição
  if (!originalRequisition && !loading) {
    return (
      <Box sx={{ mt: 4 }}>
        <Alert severity="error">
          Requisição não encontrada ou erro ao carregar.
        </Alert>
        <Button 
          variant="outlined" 
          onClick={() => navigate('/materials/requisitions')}
          sx={{ mt: 2 }}
        >
          Voltar para Lista
        </Button>
      </Box>
    );
  }
  
  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Editar Requisição de Material
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        ID: {id}
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {/* Indicador visual para atualização simples */}
      {isOnlyStatusToStockUpdate() && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Modo atualização rápida: Apenas o status será alterado para "Retirado do Estoque"
        </Alert>
      )}
      
      {/* Status - sempre visível e editável */}
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Status *</InputLabel>
        <Select
          name="status"
          value={formData.status || ''}
          onChange={handleChange}
          required
        >
          <MenuItem value="pendente">Pendente</MenuItem>
          <MenuItem value="aprovado">Aprovado</MenuItem>
          <MenuItem value="rejeitado">Rejeitado</MenuItem>
          <MenuItem value="estoque">Retirado do Estoque</MenuItem>
          <MenuItem value="concluido">Concluído</MenuItem>
        </Select>
      </FormControl>
      
      {/* Campos do formulário */}
      <TextField
        fullWidth
        margin="normal"
        label="Solicitante"
        name="requester"
        value={formData.requester || ''}
        onChange={handleChange}
        required={!isOnlyStatusToStockUpdate()}
        disabled={isOnlyStatusToStockUpdate()}
      />
      
      <TextField
        fullWidth
        margin="normal"
        label="Departamento"
        name="department"
        value={formData.department || ''}
        onChange={handleChange}
        required={!isOnlyStatusToStockUpdate()}
        disabled={isOnlyStatusToStockUpdate()}
      />
      
      <TextField
        fullWidth
        margin="normal"
        label="Descrição"
        name="description"
        multiline
        rows={3}
        value={formData.description || ''}
        onChange={handleChange}
        required={!isOnlyStatusToStockUpdate()}
        disabled={isOnlyStatusToStockUpdate()}
      />
      
      <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
        <InputLabel>Prioridade {!isOnlyStatusToStockUpdate() && '*'}</InputLabel>
        <Select
          name="priority"
          value={formData.priority || ''}
          onChange={handleChange}
          required={!isOnlyStatusToStockUpdate()}
          disabled={isOnlyStatusToStockUpdate()}
        >
          <MenuItem value="baixa">Baixa</MenuItem>
          <MenuItem value="media">Média</MenuItem>
          <MenuItem value="alta">Alta</MenuItem>
          <MenuItem value="urgente">Urgente</MenuItem>
        </Select>
      </FormControl>
      
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          fullWidth
          label="Quantidade"
          name="quantity"
          type="number"
          inputProps={{ min: 0, step: 0.01 }}
          value={formData.quantity || ''}
          onChange={handleChange}
          required={!isOnlyStatusToStockUpdate()}
          disabled={isOnlyStatusToStockUpdate()}
        />
        
        <TextField
          fullWidth
          label="Unidade"
          name="unit"
          value={formData.unit || ''}
          onChange={handleChange}
          required={!isOnlyStatusToStockUpdate()}
          disabled={isOnlyStatusToStockUpdate()}
          placeholder="ex: kg, unidades, litros"
        />
      </Box>
      
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ptBR}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <DatePicker
            label="Data da Solicitação"
            value={formData.requestDate}
            onChange={(date) => handleDateChange('requestDate', date)}
            disabled={isOnlyStatusToStockUpdate()}
            sx={{ minWidth: 200 }}
          />
          
          {(formData.status === 'aprovado' || formData.status === 'rejeitado') && (
            <DatePicker
              label="Data de Aprovação/Rejeição"
              value={formData.approvalDate}
              onChange={(date) => handleDateChange('approvalDate', date)}
              sx={{ minWidth: 200 }}
            />
          )}
          
          {formData.status === 'estoque' && (
            <DatePicker
              label="Data de Retirada"
              value={formData.withdrawalDate || new Date()}
              onChange={(date) => handleDateChange('withdrawalDate', date)}
              sx={{ minWidth: 200 }}
            />
          )}
        </Box>
      </LocalizationProvider>
      
      {/* Botões de ação */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        <Button
          type="button"
          variant="outlined"
          onClick={() => navigate('/materials/requisitions')}
          size="large"
        >
          Cancelar
        </Button>
        
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
        >
          {isOnlyStatusToStockUpdate() ? 'Marcar como Retirado' : 'Salvar Alterações'}
        </Button>
      </Box>
      
      {/* Informações de debug (remover em produção) */}
      {process.env.NODE_ENV === 'development' && (
        <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="caption" display="block">
            Debug Info:
          </Typography>
          <Typography variant="caption" display="block">
            Status Original: {originalRequisition?.status}
          </Typography>
          <Typography variant="caption" display="block">
            Status Atual: {formData.status}
          </Typography>
          <Typography variant="caption" display="block">
            Apenas Status Update: {isOnlyStatusToStockUpdate() ? 'Sim' : 'Não'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default MaterialsRequisitionEdit;
