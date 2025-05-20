import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, BarChart, Search, Filter, Users, ChevronDown, AlertTriangle } from 'lucide-react';
import { collection, getDocs, setDoc, updateDoc, deleteDoc, doc, query, where, writeBatch, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, getCompanyCollection } from '../lib/firebase';
import { Customer } from '../types/customer';
import CustomerModal from './CustomerModal';

const Customers: React.FC = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [segmentFilter, setSegmentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [nextId, setNextId] = useState<string>("01");

  useEffect(() => {
    loadCustomers();
  }, []);

  // Function to get the next sequential ID
  const calculateNextId = (existingCustomers: Customer[]) => {
    try {
      if (existingCustomers.length === 0) return "01";

      // Try to find numeric IDs
      const numericIds = existingCustomers
        .map(customer => {
          // Try to extract a number if ID is numeric or starts with digits
          const match = customer.id.match(/^(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(id => id > 0);

      if (numericIds.length === 0) return "01";

      // Find the maximum ID and increment
      const maxId = Math.max(...numericIds);
      return (maxId + 1).toString().padStart(2, '0');
    } catch (error) {
      console.error("Error calculating next ID:", error);
      return "01"; // Fallback to "01" in case of error
    }
  };

  const loadCustomers = async () => {
    try {
      // Use company-specific collection path
      const querySnapshot = await getDocs(collection(db, getCompanyCollection('customers')));
      const customersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      
      setCustomers(customersData);

      // Calculate next ID
      const nextSequentialId = calculateNextId(customersData);
      setNextId(nextSequentialId);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const handleAddCustomer = () => {
    setSelectedCustomer(null);
    setIsModalOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    // Deep copy to avoid reference issues
    setSelectedCustomer(JSON.parse(JSON.stringify(customer)));
    setIsModalOpen(true);
  };

  const handleViewFinancials = (customer: Customer) => {
    navigate(`/financial?customerId=${customer.id}`);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!customerId) {
      console.error('Invalid customer ID:', customerId);
      alert('Erro ao excluir cliente: ID inválido.');
      return;
    }
    
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
      try {
        setIsDeleting(true);
        
        // Check if the document exists before deleting
        const customerRef = doc(db, getCompanyCollection('customers'), customerId);
        const customerDoc = await getDoc(customerRef);
        
        if (!customerDoc.exists()) {
          setIsDeleting(false);
          alert('Cliente não encontrado. Pode ter sido excluído por outro usuário.');
          await loadCustomers(); // Reload the list to reflect current state
          return;
        }
        
        // Delete the customer document
        await deleteDoc(customerRef);
        console.log('Customer deleted successfully:', customerId);
        // Reload customers after deletion
        await loadCustomers();
        alert('Cliente excluído com sucesso!');
        setIsDeleting(false);
      } catch (error) {
        console.error('Error deleting customer:', error);
        setIsDeleting(false);
        alert('Erro ao excluir cliente. Por favor, tente novamente.');
      }
    }
  };

  const handleDeleteAllCustomers = async () => {
    // Double confirmation for this destructive action
    if (!window.confirm('ATENÇÃO: Você está prestes a excluir TODOS os clientes. Esta ação não pode ser desfeita. Deseja continuar?')) {
      return;
    }
    
    if (!window.confirm('Última chance: Tem certeza que deseja excluir TODOS os clientes permanentemente?')) {
      return;
    }
    
    try {
      setIsDeletingAll(true);
      
      // Get all customers from the company-specific collection
      const querySnapshot = await getDocs(collection(db, getCompanyCollection('customers')));
      
      if (querySnapshot.empty) {
        alert('Não há clientes para excluir.');
        setIsDeletingAll(false);
        return;
      }
      
      // Use a batch for better performance
      const batch = writeBatch(db);
      querySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Commit the batch
      await batch.commit();
      
      // Reload customers (should be empty now)
      await loadCustomers();
      
      setIsDeletingAll(false);
      alert(`${querySnapshot.docs.length} clientes foram excluídos com sucesso.`);
    } catch (error) {
      console.error('Error deleting all customers:', error);
      setIsDeletingAll(false);
      alert('Erro ao excluir todos os clientes. Por favor, tente novamente.');
    }
  };

  const handleSaveCustomer = async (customer: Customer) => {
    try {
      if (customer.id) {
        // Check if the customer already exists
        const customerRef = doc(db, getCompanyCollection('customers'), customer.id);
        
        if (selectedCustomer) {
          // This is an existing customer we're updating
          const customerDoc = await getDoc(customerRef);
          
          if (!customerDoc.exists()) {
            throw new Error('Cliente não encontrado. Pode ter sido excluído por outro usuário.');
          }
          
          // Update the existing customer
          await updateDoc(customerRef, {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
            cnpj: customer.cnpj,
            category: customer.category,
            segment: customer.segment,
            notes: customer.notes,
            contactPerson: customer.contactPerson,
            contactPhone: customer.contactPhone,
            status: customer.status
          });
          
          alert('Cliente atualizado com sucesso!');
        } else {
          // This is a new customer with a pre-generated ID
          const customerData = {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
            cnpj: customer.cnpj,
            category: customer.category,
            segment: customer.segment,
            notes: customer.notes,
            contactPerson: customer.contactPerson,
            contactPhone: customer.contactPhone,
            status: customer.status,
            createdAt: new Date().toISOString()
          };
          
          // Use setDoc instead of addDoc to specify the document ID
          await setDoc(customerRef, customerData);
          
          alert('Cliente adicionado com sucesso!');
        }
      }
      
      await loadCustomers();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving customer:', error);
      alert(`Erro ao salvar cliente: ${error instanceof Error ? error.message : 'Por favor, tente novamente.'}`);
    }
  };

  // Lista de CNPJs para verificação de duplicidade
  const cnpjList = customers.map(customer => customer.cnpj);

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = !searchTerm || 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.cnpj.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !categoryFilter || customer.category === categoryFilter;
    const matchesSegment = !segmentFilter || customer.segment === segmentFilter;
    const matchesStatus = !statusFilter || customer.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesSegment && matchesStatus;
  });
  
  // Get all available categories and segments for filters
  const categories = [...new Set(customers.map(c => c.category).filter(Boolean))];
  const segments = [...new Set(customers.map(c => c.segment).filter(Boolean))];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Clientes</h2>
        <div className="flex space-x-4">
          {customers.length > 0 && (
            <button
              onClick={handleDeleteAllCustomers}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              disabled={isDeletingAll || isDeleting}
            >
              <Trash2 className="h-5 w-5 mr-2" />
              {isDeletingAll ? 'Excluindo...' : 'Limpar Todos'}
            </button>
          )}
          <button
            onClick={handleAddCustomer}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            disabled={isDeleting || isDeletingAll}
          >
            <Plus className="h-5 w-5 mr-2" />
            Novo Cliente
          </button>
        </div>
      </div>

      {isDeletingAll && (
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Excluindo todos os clientes. Por favor, aguarde...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de pesquisa e filtros */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou email..."
            className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isDeletingAll}
          />
        </div>

        <button 
          onClick={() => setFilterOpen(!filterOpen)}
          className="flex items-center px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
          disabled={isDeletingAll}
        >
          <Filter className="h-5 w-5 mr-2" />
          Filtros
          <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
        </button>

        {(categoryFilter || segmentFilter || statusFilter) && (
          <button
            onClick={() => {
              setCategoryFilter('');
              setSegmentFilter('');
              setStatusFilter('');
            }}
            className="text-blue-600 hover:text-blue-800 text-sm"
            disabled={isDeletingAll}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {filterOpen && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              disabled={isDeletingAll}
            >
              <option value="">Todas as categorias</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              disabled={isDeletingAll}
            >
              <option value="">Todos os segmentos</option>
              {segments.map(segment => (
                <option key={segment} value={segment}>{segment}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              disabled={isDeletingAll}
            >
              <option value="">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="lead">Leads</option>
            </select>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CNPJ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Segmento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{customer.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                      {customer.status === 'inactive' && (
                        <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          Inativo
                        </span>
                      )}
                      {customer.status === 'lead' && (
                        <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Lead
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{customer.cnpj}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{customer.category || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{customer.segment || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {customer.status === 'active' ? 'Ativo' : 
                       customer.status === 'inactive' ? 'Inativo' : 
                       customer.status === 'lead' ? 'Lead' : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleViewFinancials(customer)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                      title="Ver Financeiro"
                      disabled={isDeleting || isDeletingAll}
                    >
                      <BarChart className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleEditCustomer(customer)}
                      className="text-blue-600 hover:text-blue-900 mr-4"
                      title="Editar Cliente"
                      disabled={isDeleting || isDeletingAll}
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(customer.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Excluir Cliente"
                      disabled={isDeleting || isDeletingAll}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
              
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    {customers.length === 0 ? 
                      'Nenhum cliente cadastrado. Clique em "Novo Cliente" para adicionar o primeiro cliente.' : 
                      'Nenhum cliente encontrado. Tente ajustar os filtros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <CustomerModal
          customer={selectedCustomer}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveCustomer}
          cnpjList={cnpjList}
          nextId={nextId}
        />
      )}
    </div>
  );
};

export default Customers;