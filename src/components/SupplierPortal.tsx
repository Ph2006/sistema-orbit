import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
// Corrija as importações para evitar erros de build
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
// Certifique-se de importar corretamente os ícones
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';

const SupplierPortal = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' ou 'edit'
  const [currentSupplier, setCurrentSupplier] = useState(null);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    email: '',
    phone: '',
    address: '',
    category: '',
    notes: ''
  });

  // Buscar fornecedores
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
        setFilteredSuppliers(suppliersData);
      } catch (err) {
        console.error('Erro ao buscar fornecedores:', err);
        setError('Não foi possível carregar os fornecedores');
      } finally {
        setLoading(false);
      }
    };

    fetchSuppliers();
  }, []);

  // Atualiza os fornecedores filtrados quando o termo de busca mudar
  useEffect(() => {
    filterSuppliers(searchTerm);
  }, [searchTerm, suppliers]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Esta é a função que substitui B()
  const filterSuppliers = (term) => {
    if (!term) {
      setFilteredSuppliers(suppliers);
      return;
    }
    
    const filtered = suppliers.filter(supplier => 
      supplier.name?.toLowerCase().includes(term.toLowerCase()) ||
      supplier.category?.toLowerCase().includes(term.toLowerCase()) ||
      supplier.contact?.toLowerCase().includes(term.toLowerCase())
    );
    
    setFilteredSuppliers(filtered);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

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

  const handleDeleteSupplier = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este fornecedor?')) {
      try {
        await deleteDoc(doc(db, 'companies/mecaid/suppliers', id));
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

  const validateForm = () => {
    if (!formData.name?.trim()) return false;
    if (!formData.category?.trim()) return false;
    return true;
  };

  const handleSaveSupplier = async () => {
    try {
      if (!validateForm()) {
        setNotification({
          open: true,
          message: 'Nome e Categoria são campos obrigatórios',
          severity: 'error'
        });
        return;
      }

      if (dialogMode === 'add') {
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
        await updateDoc(doc(db, 'companies/mecaid/suppliers', currentSupplier.id), formData);
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
        message: `Erro ao ${dialogMode === 'add' ? 'adicionar' : 'atualizar'} fornecedor: ${err.message}`,
        severity: 'error'
      });
    }
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

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
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Buscar fornecedores"
          value={searchTerm}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
          }}
        />
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
            {filteredSuppliers.length > 0 ? (
              filteredSuppliers.map((supplier) => (
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
                  {searchTerm ? 'Nenhum fornecedor encontrado na busca' : 'Nenhum fornecedor cadastrado'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
                required
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
