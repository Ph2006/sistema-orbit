import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  Box, 
  Button, 
  Typography, 
  TextField, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Snackbar,
  Alert,
  CircularProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';

const SupplierPortal = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' ou 'edit'
  const [currentSupplier, setCurrentSupplier] = useState(null);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    email: '',
    phone: '',
    address: '',
    category: '',
    notes: ''
  });

  // Buscar fornecedores do Firestore
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, 'companies/mecaid/suppliers'));
        const querySnapshot = await getDocs(q);
        
        const suppliersData = [];
        querySnapshot.forEach((doc) => {
          suppliersData.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        setSuppliers(suppliersData);
      } catch (err) {
        console.error('Erro ao buscar fornecedores:', err);
        setError('Não foi possível carregar os fornecedores');
      } finally {
        setLoading(false);
      }
    };

    fetchSuppliers();
  }, []);

  // Manipulador de mudanças no formulário
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Abrir diálogo para adicionar novo fornecedor
  const handleAddSupplier = () => {
    setDialogMode('add');
    setFormData({
      name: '',
      contact: '',
      email: '',
      phone: '',
      address: '',
      category: '',
      notes: ''
    });
    setOpenDialog(true);
  };

  // Abrir diálogo para editar fornecedor existente
  const handleEditSupplier = (supplier) => {
    setDialogMode('edit');
    setCurrentSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      contact: supplier.contact || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      category: supplier.category || '',
      notes: supplier.notes || ''
    });
    setOpenDialog(true);
  };

  // Confirmar exclusão de fornecedor
  const handleDeleteSupplier = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este fornecedor?')) {
      try {
        await deleteDoc(doc(db, 'companies/mecaid/suppliers', id));
        
        // Atualizar lista removendo o item
        setSuppliers(suppliers.filter(supplier => supplier.id !== id));
        
        setNotification({
          open: true,
          message: 'Fornecedor excluído com sucesso',
          severity: 'success'
        });
      } catch (err) {
        console.error('Erro ao excluir fornecedor:', err);
        setNotification({
          open: true,
          message: 'Erro ao excluir fornecedor',
          severity: 'error'
        });
      }
    }
  };

  // Salvar fornecedor (adicionar ou atualizar)
  const handleSaveSupplier = async () => {
    try {
      if (dialogMode === 'add') {
        // Adicionar novo fornecedor
        const docRef = await addDoc(collection(db, 'companies/mecaid/suppliers'), formData);
        
        const newSupplier = {
          id: docRef.id,
          ...formData
        };
        
        setSuppliers([...suppliers, newSupplier]);
        setNotification({
          open: true,
          message: 'Fornecedor adicionado com sucesso',
          severity: 'success'
        });
      } else {
        // Atualizar fornecedor existente
        await updateDoc(doc(db, 'companies/mecaid/suppliers', currentSupplier.id), formData);
        
        // Atualizar lista local
        setSuppliers(suppliers.map(supplier => {
          if (supplier.id === currentSupplier.id) {
            return { ...supplier, ...formData };
          }
          return supplier;
        }));
        
        setNotification({
          open: true,
          message: 'Fornecedor atualizado com sucesso',
          severity: 'success'
        });
      }
      
      setOpenDialog(false);
    } catch (err) {
      console.error('Erro ao salvar fornecedor:', err);
      setNotification({
        open: true,
        message: `Erro ao ${dialogMode === 'add' ? 'adicionar' : 'atualizar'} fornecedor`,
        severity: 'error'
      });
    }
  };

  // Esta função substitui a anterior que estava causando o erro "B is not a function"
  const filterSuppliers = (searchTerm) => {
    // Implementação correta da função de filtro
    if (!searchTerm) return suppliers;
    
    return suppliers.filter(supplier => 
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Fechar notificação
  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  // Fechar diálogo
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  // Substitui a chamada problemática em B() da linha 99 por uma solução correta
  const displayedSuppliers = filterSuppliers(''); // Ao invés de usar B() diretamente

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Portal de Fornecedores</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />}
          onClick={handleAddSupplier}
        >
          Novo Fornecedor
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Categoria</TableCell>
              <TableCell>Contato</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedSuppliers.length > 0 ? (
              displayedSuppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>{supplier.name}</TableCell>
                  <TableCell>{supplier.category}</TableCell>
                  <TableCell>{supplier.contact}</TableCell>
                  <TableCell>{supplier.email}</TableCell>
                  <TableCell>{supplier.phone}</TableCell>
                  <TableCell>
                    <IconButton 
                      size="small" 
                      color="primary"
                      onClick={() => handleEditSupplier(supplier)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => handleDeleteSupplier(supplier.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  Nenhum fornecedor cadastrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Diálogo de adição/edição de fornecedor */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Adicionar Novo Fornecedor' : 'Editar Fornecedor'}
        </DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Nome do Fornecedor"
              name="name"
              value={formData.name}
              onChange={handleChange}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                margin="normal"
                fullWidth
                label="Nome do Contato"
                name="contact"
                value={formData.contact}
                onChange={handleChange}
              />
              <TextField
                margin="normal"
                fullWidth
                label="Categoria"
                name="category"
                value={formData.category}
                onChange={handleChange}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                margin="normal"
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
              />
              <TextField
                margin="normal"
                fullWidth
                label="Telefone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />
            </Box>
            <TextField
              margin="normal"
              fullWidth
              label="Endereço"
              name="address"
              value={formData.address}
              onChange={handleChange}
            />
            <TextField
              margin="normal"
              fullWidth
              label="Observações"
              name="notes"
              multiline
              rows={3}
              value={formData.notes}
              onChange={handleChange}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSaveSupplier} variant="contained" color="primary">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notificação de sucesso/erro */}
      <Snackbar 
        open={notification.open} 
        autoHideDuration={6000} 
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SupplierPortal;
