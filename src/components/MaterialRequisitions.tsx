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
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
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
    // outros campos conforme necessário
  });
  
  const [originalRequisition, setOriginalRequisition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOnlyStatusUpdate, setIsOnlyStatusUpdate] = useState(false);
  
  // Buscar os dados da requisição
  useEffect(() => {
    const fetchRequisition = async () => {
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
    
    if (id) {
      fetchRequisition();
    }
  }, [id]);
  
  // Manipular alterações no formulário
  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Verificar se é apenas uma alteração de status para "estoque"
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
  
  // Manipular alterações de data
  const handleDateChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Validar formulário
  const validateForm = () => {
    // Se for apenas atualização de status para estoque, pular validação
    if (isOnlyStatusUpdate) return true;
    
    // Validação completa para outros casos
    if (!formData.requester) return false;
    if (!formData.department) return false;
    if (!formData.description) return false;
    if (!formData.priority) return false;
    if (!formData.quantity) return false;
    if (!formData.unit) return false;
    
    return true;
  };
  
  // Enviar formulário
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      // Se for apenas atualização de status para estoque
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
      
      // Caso contrário, verificar todos os campos
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
      };
      
      // Atualizar documento
      const docRef = doc(db, 'companies/mecaid/materialsRequisitions', id);
      await updateDoc(docRef, updateData);
      
      console.log('Requisição atualizada com sucesso');
      navigate('/materials/requisitions');
      
    } catch (err) {
      console.error('Erro ao atualizar requisição:', err);
      setError('Erro ao salvar as alterações');
    }
  };
  
  if (loading) return <Typography>Carregando...</Typography>;
  if (error && !isOnlyStatusUpdate) return <Typography color="error">{error}</Typography>;
  
  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Editar Requisição de Material
      </Typography>
      
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
      
      {/* Renderizar outros campos apenas se não for atualização simples de status */}
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
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
              
              {(formData.status === 'aprovado' || formData.status === 'rejeitado') && (
                <DatePicker
                  label="Data de Aprovação/Rejeição"
                  value={formData.approvalDate}
                  onChange={(date) => handleDateChange('approvalDate', date)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              )}
              
              {formData.status === 'estoque' && (
                <DatePicker
                  label="Data de Retirada"
                  value={formData.withdrawalDate}
                  onChange={(date) => handleDateChange('withdrawalDate', date)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
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
