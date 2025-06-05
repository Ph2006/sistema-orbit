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
// Corrija a importação do MUI para evitar erros de build
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
// Importe corretamente o DatePicker da versão mais recente
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ptBR } from 'date-fns/locale';

const MaterialsRequisitionEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
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
  const [isOnlyStatusUpdate, setIsOnlyStatusUpdate] = useState(false);
  
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
            withdrawalDate
          };
          
          setFormData(requisitionData);
          setOriginalRequisition(requisitionData);
        } else {
          setError('Requisição não encontrada');
        }
      } catch (err) {
        console.error('Erro ao buscar requisição:', err);
        setError('Erro ao carregar a requisição');
      } finally {
        setLoading(false);
      }
    };
    
    fetchRequisition();
  }, [id]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Detecta se é apenas mudança para "estoque"
    if (name === 'status' && value === 'estoque' && originalRequisition?.status !== 'estoque') {
      setIsOnlyStatusUpdate(true);
    } else if (name === 'status') {
      setIsOnlyStatusUpdate(false);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleDateChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const validateForm = () => {
    // Pula validação se for apenas atualização para estoque
    if (isOnlyStatusUpdate) return true;
    
    if (!formData.requester?.trim()) return false;
    if (!formData.department?.trim()) return false;
    if (!formData.description?.trim()) return false;
    if (!formData.priority) return false;
    if (!formData.quantity) return false;
    if (!formData.unit?.trim()) return false;
    
    return true;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Atualização somente para estoque
      if (isOnlyStatusUpdate) {
        const updateData = {
          status: 'estoque',
          withdrawalDate: Timestamp.fromDate(new Date())
        };
        
        const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
        await updateDoc(docRef, updateData);
        
        console.log('Status atualizado para estoque');
        navigate('/materials/requisitions');
        return;
      }
      
      // Validação completa
      if (!validateForm()) {
        setError('Por favor, preencha todos os campos obrigatórios');
        return;
      }
      
      // Preparar dados para salvar
      const updateData = {
        ...formData,
        requestDate: formData.requestDate ? Timestamp.fromDate(formData.requestDate) : null,
        approvalDate: formData.approvalDate ? Timestamp.fromDate(formData.approvalDate) : null,
        withdrawalDate: formData.withdrawalDate ? Timestamp.fromDate(formData.withdrawalDate) : null,
        // Certifique-se de que os valores numéricos sejam realmente números
        quantity: Number(formData.quantity)
      };
      
      const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
      await updateDoc(docRef, updateData);
      
      console.log('Requisição atualizada com sucesso');
      navigate('/materials/requisitions');
      
    } catch (err) {
      console.error('Erro ao atualizar requisição:', err);
      setError('Erro ao salvar as alterações: ' + err.message);
    }
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Editar Requisição de Material
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Status</InputLabel>
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
      
      {/* Campos adicionais apenas se não for atualização simples */}
      {!isOnlyStatusUpdate && (
        <>
          <TextField
            fullWidth
            margin="normal"
            label="Solicitante"
            name="requester"
            value={formData.requester || ''}
            onChange={handleChange}
            required
          />
          
          <TextField
            fullWidth
            margin="normal"
            label="Departamento"
            name="department"
            value={formData.department || ''}
            onChange={handleChange}
            required
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
            required
          />
          
          <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
            <InputLabel>Prioridade</InputLabel>
            <Select
              name="priority"
              value={formData.priority || ''}
              onChange={handleChange}
              required
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
              value={formData.quantity || ''}
              onChange={handleChange}
              required
            />
            
            <TextField
              fullWidth
              label="Unidade"
              name="unit"
              value={formData.unit || ''}
              onChange={handleChange}
              required
            />
          </Box>
          
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ptBR}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <DatePicker
                label="Data da Solicitação"
                value={formData.requestDate}
                onChange={(date) => handleDateChange('requestDate', date)}
              />
              
              {(formData.status === 'aprovado' || formData.status === 'rejeitado') && (
                <DatePicker
                  label="Data de Aprovação/Rejeição"
                  value={formData.approvalDate}
                  onChange={(date) => handleDateChange('approvalDate', date)}
                />
              )}
              
              {formData.status === 'estoque' && (
                <DatePicker
                  label="Data de Retirada"
                  value={formData.withdrawalDate}
                  onChange={(date) => handleDateChange('withdrawalDate', date)}
                />
              )}
            </Box>
          </LocalizationProvider>
        </>
      )}
      
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
        <Button
          type="button"
          variant="outlined"
          onClick={() => navigate('/materials/requisitions')}
        >
          Cancelar
        </Button>
        
        <Button
          type="submit"
          variant="contained"
          color="primary"
        >
          {isOnlyStatusUpdate ? 'Atualizar Status' : 'Salvar Alterações'}
        </Button>
      </Box>
    </Box>
  );
};

export default MaterialsRequisitionEdit;
