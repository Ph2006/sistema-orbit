import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Calendar as CalendarIcon, 
  List, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Hourglass, 
  Package, 
  Ship, 
  ClipboardList, 
  Briefcase, 
  FileText, 
  Download,
  X
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot, 
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useOrderStore } from '../store/orderStore';
import { useSupplierStore } from '../store/supplierStore';
import { Order } from '../types/kanban';
import { MaterialRequisition, MaterialRequisitionItem, Supplier, QuotationRequest } from '../types/materials';
import MaterialRequisitionModal from './MaterialRequisitionModal';
import MaterialRequisitionDetailModal from './MaterialRequisitionDetailModal';
import QuotationRequestModal from './QuotationRequestModal';
import CuttingPlanCalculator from './CuttingPlanCalculator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuthStore } from '../store/authStore';
import { getAuth } from 'firebase/auth';

// Função para formatar datas com segurança
const formatDateSafely = (date: any, formatStr: string = 'dd/MM/yyyy'): string => {
  try {
    if (!date) return 'Data não informada';
    
    // Se é uma string, tentar converter
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date.toDate && typeof date.toDate === 'function') {
      // Firestore Timestamp
      dateObj = date.toDate();
    } else {
      return 'Data inválida';
    }
    
    // Verificar se a data é válida
    if (isNaN(dateObj.getTime())) {
      return 'Data inválida';
    }
    
    return format(dateObj, formatStr, { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar data:', error, 'Data original:', date);
    return 'Data inválida';
  }
};

// Função para obter a coleção correta baseada na empresa
const getCompanyCollection = (collectionName: string, companyId: string | null): string => {
  if (!companyId) {
    console.error("Company ID is not available.");
    throw new Error("Company ID is required but not available");
  }
  return `companies/${companyId}/${collectionName}`;
};

// Função de validação de dados
const validateRequisitionData = (requisition: MaterialRequisition): string[] => {
  const errors: string[] = [];
  
  if (!requisition.orderId) {
    errors.push('ID do pedido é obrigatório');
  }
  
  if (!requisition.requestDate) {
    errors.push('Data da requisição é obrigatória');
  } else {
    // Validar se a data é válida
    const date = new Date(requisition.requestDate);
    if (isNaN(date.getTime())) {
      errors.push('Data da requisição é inválida');
    }
  }
  
  if (!requisition.items || requisition.items.length === 0) {
    errors.push('Pelo menos um item é obrigatório');
  }
  
  return errors;
};

const MaterialRequisitions: React.FC = () => {
  const [requisitions, setRequisitions] = useState<MaterialRequisition[]>([]);
  const [quotations, setQuotations] = useState<QuotationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [isCuttingPlanModalOpen, setIsCuttingPlanModalOpen] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<MaterialRequisition | null>(null);
  const [activeTab, setActiveTab] = useState<'requisitions' | 'quotations' | 'cutting-plan'>('requisitions');
  
  const { orders } = useOrderStore();
  const { suppliers, loadSuppliers, subscribeToSuppliers } = useSupplierStore();
  const { companyId } = useAuthStore();

  // DEBUG: Registro do companyId
  useEffect(() => {
    console.log('[DEBUG] CompanyId atual:', companyId);
    const auth = getAuth();
    console.log('[DEBUG] Auth user:', auth.currentUser);
    console.log('[DEBUG] Auth user ID:', auth.currentUser?.uid);
  }, [companyId]);

  // Monitorar mudanças no modal
  useEffect(() => {
    console.log('👀 Modal state changed:', {
      isModalOpen,
      selectedRequisitionId: selectedRequisition?.id,
      selectedRequisitionData: selectedRequisition ? 'tem dados' : 'sem dados'
    });
  }, [isModalOpen, selectedRequisition]);

  // Early return se não houver companyId
  if (!companyId) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-red-800">Erro de Autenticação</h3>
          <p className="text-red-600 mt-2">
            Não foi possível identificar a empresa. Por favor, faça login novamente.
          </p>
          <button 
            onClick={() => {
              getAuth().signOut();
              window.location.href = '/login';
            }}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
          >
            Fazer Logout
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    // Subscribe to order updates
    const unsubscribe = useOrderStore.getState().subscribeToOrders();
    return () => unsubscribe();
  }, []);

  // Load suppliers when component mounts
  useEffect(() => {
    const unsubscribe = subscribeToSuppliers();
    
    if (suppliers.length === 0) {
      loadSuppliers();
    }
    
    return () => unsubscribe();
  }, [subscribeToSuppliers, loadSuppliers, suppliers.length]);

  useEffect(() => {
    let unsubscribeRequisitions: (() => void) | undefined;
    let unsubscribeQuotations: (() => void) | undefined;

    const setupListeners = async () => {
      if (!companyId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Configurar listener para requisições
        const requisitionsQuery = query(
          collection(db, getCompanyCollection('materialRequisitions', companyId)),
          orderBy('requestDate', 'desc')
        );
        console.log("Setting up requisition listener for companyId:", companyId);
        unsubscribeRequisitions = onSnapshot(
          requisitionsQuery,
          (snapshot) => {
            const requisitionsData = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as MaterialRequisition[];
            console.log('[DEBUG] Requisições carregadas:', requisitionsData.length);
            setRequisitions(requisitionsData);
            setLoading(false);
          },
          (error) => {
            console.error('Error listening to requisitions:', error);
            setLoading(false);
          }
        );
        // Configurar listener para cotações
        const quotationsQuery = query(
          collection(db, getCompanyCollection('quotationRequests', companyId)),
          orderBy('requestDate', 'desc')
        );
        console.log("Setting up quotation listener for companyId:", companyId);
        unsubscribeQuotations = onSnapshot(
          quotationsQuery,
          (snapshot) => {
            const quotationsData = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as QuotationRequest[];
            console.log('[DEBUG] Cotações carregadas:', quotationsData.length);
            setQuotations(quotationsData);
          },
          (error) => {
            console.error('Error listening to quotations:', error);
          }
        );
      } catch (error) {
        console.error('Error setting up listeners:', error);
        setLoading(false);
      }
    };
    setupListeners();
    // Cleanup function
    return () => {
      if (unsubscribeRequisitions) {
        unsubscribeRequisitions();
      }
      if (unsubscribeQuotations) {
        unsubscribeQuotations();
      }
    };
  }, [companyId]);

  // FUNÇÃO DE TESTE DO FIREBASE
  const testFirebaseConnection = async () => {
    if (!companyId) {
      console.error('[TEST] CompanyId não disponível');
      alert('CompanyId não disponível!');
      return;
    }

    try {
      const collectionPath = `companies/${companyId}/materialRequisitions`;
      console.log('[TEST] Testando conexão com:', collectionPath);
      
      // Tentar ler a coleção
      const testQuery = query(
        collection(db, collectionPath),
        orderBy('requestDate', 'desc')
      );
      
      const snapshot = await getDocs(testQuery);
      console.log('[TEST] Conexão OK - Documentos encontrados:', snapshot.size);
      
      // Tentar criar um documento de teste
      const testDoc = {
        test: true,
        timestamp: new Date().toISOString(),
        companyId: companyId,
        createdBy: 'teste-conexao'
      };
      
      const docRef = await addDoc(collection(db, collectionPath), testDoc);
      console.log('[TEST] Documento de teste criado:', docRef.id);
      
      // Remover o documento de teste
      await updateDoc(doc(db, collectionPath, docRef.id), { 
        deleted: true,
        deletedAt: new Date().toISOString()
      });
      console.log('[TEST] Documento de teste marcado como deletado');
      
      alert('✅ Teste de conexão com Firebase: SUCESSO');
      
    } catch (error) {
      console.error('[TEST] Erro no teste de conexão:', error);
      alert(`❌ Teste de conexão FALHOU: ${error.message}`);
    }
  };

  const handleAddRequisition = () => {
    console.log('➕ Adicionando nova requisição');
    setSelectedRequisition(null);
    setIsModalOpen(true);
  };

  const handleOpenCuttingPlan = () => {
    setIsCuttingPlanModalOpen(true);
  };

  const handleViewRequisition = (requisition: MaterialRequisition) => {
    console.log('👁️ Visualizando requisição:', requisition.id);
    setSelectedRequisition(requisition);
    setIsDetailModalOpen(true);
  };

  // FUNÇÃO DE EDIÇÃO COM DEBUG COMPLETO
  const handleEditRequisition = (requisition: MaterialRequisition) => {
    console.log('🔧 === CLICOU EM EDITAR ===');
    console.log('🔧 Requisição selecionada:', requisition);
    console.log('🔧 ID da requisição:', requisition.id);
    console.log('🔧 CompanyId atual:', companyId);
    console.log('🔧 Dados completos da requisição:', JSON.stringify(requisition, null, 2));
    
    // Verificar se o ID é válido
    if (!requisition.id || requisition.id === 'new') {
      console.error('❌ ID da requisição é inválido:', requisition.id);
      alert('Erro: ID da requisição é inválido');
      return;
    }
    
    console.log('✅ ID válido, definindo estado...');
    setSelectedRequisition(requisition);
    setIsModalOpen(true);
    console.log('✅ Modal deve estar aberto agora');
  };

  // FUNÇÃO DE SALVAMENTO COM LOGS DETALHADOS E VALIDAÇÃO MELHORADA
  const handleSaveRequisition = async (requisition: MaterialRequisition) => {
    console.log('💾 === INÍCIO DO SALVAMENTO ===');
    console.log('💾 Dados recebidos:', JSON.stringify(requisition, null, 2));
    console.log('💾 ID da requisição:', requisition.id);
    console.log('💾 CompanyId:', companyId);
    console.log('💾 É edição?', requisition.id !== 'new' && requisition.id);
    
    if (!companyId) {
      console.error('❌ CompanyId não disponível');
      alert('Erro: ID da empresa não disponível');
      return;
    }

    // Validar dados
    const validationErrors = validateRequisitionData(requisition);
    if (validationErrors.length > 0) {
      console.error('❌ Erros de validação:', validationErrors);
      alert('Erros encontrados:\n' + validationErrors.join('\n'));
      return;
    }

    try {
      // Preparar dados limpos com validação de datas
      console.log('🧹 Limpando dados...');
      const cleanedItems = requisition.items.map(item => ({
        id: item.id || '',
        description: item.description || '',
        material: item.material || '',
        quantity: Number(item.quantity) || 0,
        dimensions: item.dimensions || '',
        weight: Number(item.weight) || 0,
        status: item.status || 'pending',
        unitPrice: Number(item.unitPrice) || 0,
        totalPrice: Number(item.totalPrice) || 0,
        traceabilityCode: item.traceabilityCode || '',
        sentForQuotation: Boolean(item.sentForQuotation),
        deliveryDate: item.deliveryDate || null,
        supplier: item.supplier || '',
        notes: item.notes || ''
      }));

      const cleanedRequisition = {
        orderId: requisition.orderId,
        orderNumber: requisition.orderNumber || '',
        customer: requisition.customer || '',
        requestDate: requisition.requestDate || new Date().toISOString(),
        expectedDeliveryDate: requisition.expectedDeliveryDate || null,
        status: requisition.status || 'pending',
        items: cleanedItems,
        totalCost: Number(requisition.totalCost) || 0,
        budgetLimit: Number(requisition.budgetLimit) || 0,
        budgetExceeded: Boolean(requisition.budgetExceeded),
        notes: requisition.notes || '',
        createdBy: requisition.createdBy || 'sistema',
        createdAt: requisition.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log('✅ Dados limpos:', cleanedRequisition);

      const collectionPath = `companies/${companyId}/materialRequisitions`;
      console.log('📁 Collection path:', collectionPath);

      if (requisition.id === 'new' || !requisition.id) {
        // CRIAR NOVA
        console.log('➕ Criando nova requisição...');
        const docRef = await addDoc(collection(db, collectionPath), cleanedRequisition);
        console.log('✅ Criada com ID:', docRef.id);
        alert('✅ Requisição criada com sucesso!');
      } else {
        // ATUALIZAR EXISTENTE
        console.log('✏️ Atualizando requisição ID:', requisition.id);
        
        // Verificar se existe
        const docRef = doc(db, collectionPath, requisition.id);
        console.log('🔍 Verificando se documento existe...');
        
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          console.error('❌ Documento não encontrado no Firebase');
          console.error('❌ Path tentado:', `${collectionPath}/${requisition.id}`);
          alert('❌ Erro: Requisição não encontrada no banco de dados');
          return;
        }
        
        console.log('✅ Documento existe, dados atuais:', docSnap.data());
        console.log('✅ Iniciando atualização...');
        
        await updateDoc(docRef, cleanedRequisition);
        console.log('✅ Atualização concluída com sucesso!');
        alert('✅ Requisição atualizada com sucesso!');
      }

      // Fechar modal
      console.log('🚪 Fechando modal...');
      setIsModalOpen(false);
      setSelectedRequisition(null);
      
    } catch (error) {
      console.error('💥 ERRO COMPLETO:', error);
      console.error('💥 Error details:', {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
      
      let errorMessage = 'Erro desconhecido';
      if (error?.code) {
        switch (error.code) {
          case 'permission-denied':
            errorMessage = 'Sem permissão para esta operação';
            console.error('💥 PERMISSION DENIED - Verifique as regras do Firestore');
            break;
          case 'not-found':
            errorMessage = 'Documento não encontrado';
            console.error('💥 NOT FOUND - Documento foi deletado ou não existe');
            break;
          case 'unavailable':
            errorMessage = 'Serviço indisponível';
            console.error('💥 UNAVAILABLE - Firebase temporariamente indisponível');
            break;
          case 'failed-precondition':
            errorMessage = 'Falha na precondição';
            console.error('💥 FAILED PRECONDITION - Dados inválidos ou conflitantes');
            break;
          default:
            errorMessage = `Erro Firebase: ${error.message}`;
            console.error('💥 OTHER FIREBASE ERROR:', error.code);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(`❌ ${errorMessage}`);
    }
  };

  const handleCreateQuotation = (requisition: MaterialRequisition) => {
    setSelectedRequisition(requisition);
    setIsQuotationModalOpen(true);
  };

  // FUNÇÃO PARA EXCLUIR REQUISIÇÃO
  const handleDeleteRequisition = async (requisition: MaterialRequisition) => {
    console.log('🗑️ === TENTATIVA DE EXCLUSÃO ===');
    console.log('🗑️ Requisição:', requisition.id);
    
    if (!companyId) {
      alert('Erro: ID da empresa não disponível');
      return;
    }

    // Confirmação dupla para exclusão
    const confirmFirst = window.confirm(
      `❌ ATENÇÃO: Você tem certeza que deseja excluir a requisição do pedido #${requisition.orderNumber}?\n\n` +
      `Esta ação NÃO pode ser desfeita!`
    );
    
    if (!confirmFirst) {
      console.log('🗑️ Exclusão cancelada pelo usuário (primeira confirmação)');
      return;
    }

    const confirmSecond = window.confirm(
      `⚠️ CONFIRMAÇÃO FINAL:\n\n` +
      `Tem ABSOLUTA CERTEZA que deseja excluir permanentemente:\n` +
      `• Requisição do Pedido: #${requisition.orderNumber}\n` +
      `• Cliente: ${requisition.customer}\n` +
      `• ${requisition.items.length} itens\n` +
      `• Valor total: ${requisition.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\n` +
      `Digite "EXCLUIR" se tem certeza:`
    );

    if (!confirmSecond) {
      console.log('🗑️ Exclusão cancelada pelo usuário (segunda confirmação)');
      return;
    }

    // Solicitar palavra de confirmação
    const confirmationWord = window.prompt(
      `Para confirmar a exclusão, digite exatamente: EXCLUIR`
    );

    if (confirmationWord !== 'EXCLUIR') {
      console.log('🗑️ Palavra de confirmação incorreta:', confirmationWord);
      alert('❌ Palavra de confirmação incorreta. Exclusão cancelada.');
      return;
    }

    try {
      console.log('🗑️ Iniciando exclusão definitiva...');
      
      const collectionPath = `companies/${companyId}/materialRequisitions`;
      console.log('🗑️ Collection path:', collectionPath);

      // Verificar se a requisição existe antes de tentar excluir
      const docRef = doc(db, collectionPath, requisition.id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        console.error('❌ Requisição não encontrada para exclusão');
        alert('❌ Erro: Requisição não encontrada no banco de dados');
        return;
      }

      console.log('✅ Requisição encontrada, procedendo com exclusão...');

      // Excluir permanentemente
      await updateDoc(docRef, {
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: 'sistema' // Aqui você pode colocar o usuário atual
      });

      console.log('✅ Requisição excluída com sucesso!');
      alert('✅ Requisição excluída com sucesso!');

      // O listener automático vai atualizar a lista, mas podemos forçar uma atualização local
      setRequisitions(prevRequisitions => 
        prevRequisitions.filter(r => r.id !== requisition.id)
      );

    } catch (error) {
      console.error('💥 Erro ao excluir requisição:', error);
      
      let errorMessage = 'Erro desconhecido';
      if (error?.code) {
        switch (error.code) {
          case 'permission-denied':
            errorMessage = 'Sem permissão para excluir';
            break;
          case 'not-found':
            errorMessage = 'Requisição não encontrada';
            break;
          case 'unavailable':
            errorMessage = 'Serviço indisponível';
            break;
          default:
            errorMessage = `Erro Firebase: ${error.message}`;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(`❌ Erro ao excluir: ${errorMessage}`);
    }
  };

  const handleSaveQuotationRequest = async (quotation: QuotationRequest, itemIds: string[]) => {
    if (!companyId) {
      alert('Erro: ID da empresa não disponível. Por favor, faça login novamente.');
      return;
    }
    try {
      // Preparar dados simplificados
      const quotationData = {
        supplierId: quotation.supplierId,
        requestDate: quotation.requestDate,
        expirationDate: quotation.expirationDate,
        status: quotation.status,
        notes: quotation.notes || '',
        items: quotation.items.map(item => ({
          id: item.id,
          description: item.description || '',
          material: item.material || '',
          quantity: item.quantity || 0,
          dimensions: item.dimensions || '',
          weight: item.weight || 0,
          pricePerKg: item.pricePerKg || 0,
          ipiPercentage: item.ipiPercentage || 0,
          deliveryTime: item.deliveryTime || 0,
          finalPrice: item.finalPrice || 0
        })),
        createdAt: new Date().toISOString()
      };
      
      // Adicionar a cotação
      const docRef = await addDoc(
        collection(db, getCompanyCollection('quotationRequests', companyId)),
        quotationData
      );

      // Atualizar os itens da requisição
      if (selectedRequisition) {
        const updatedItems = selectedRequisition.items.map(item => {
          if (itemIds.includes(item.id)) {
            return {
              ...item,
              sentForQuotation: true
            };
          }
          return item;
        });

        await updateDoc(
          doc(db, getCompanyCollection('materialRequisitions', companyId), selectedRequisition.id),
          {
            items: updatedItems,
            updatedAt: new Date().toISOString()
          }
        );

        // Atualizar estado local
        setRequisitions(requisitions.map(r =>
          r.id === selectedRequisition.id
            ? { ...r, items: updatedItems, updatedAt: new Date().toISOString() }
            : r
        ));
      }
      
      setQuotations([...quotations, { ...quotation, id: docRef.id }]);
      setIsQuotationModalOpen(false);
      alert('Solicitação de cotação enviada com sucesso!');
    } catch (error) {
      console.error('Error saving quotation request:', error);
      alert(`Erro ao salvar solicitação de cotação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  };

  // Helper function to generate a traceability code
  const generateTraceabilityCode = (orderId: string, itemId: string): string => {
    const order = orders.find(o => o.id === orderId);
    const item = order?.items.find(i => i.id === itemId);
    
    if (!order || !item) return "TC-UNKNOWN";
    
    // Create a code with order number and item number
    return `TC-${order.orderNumber}-${item.itemNumber}`;
  };

  // Calculate 30% of the order budget
  const calculateBudgetLimit = (order: MaterialRequisition): number => {
    // Find the main order to get budget
    const mainOrder = orders.find(o => o.orderNumber === order.orderNumber);
    if (!mainOrder) return 0;
    
    // Calculate total budget from all items
    const totalBudget = mainOrder.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    
    // Return 30% of the budget
    return totalBudget * 0.3;
  };

  // Filter requisitions based on search term, status, and date (exclude deleted)
  const filteredRequisitions = requisitions.filter(req => {
    // Exclude deleted requisitions
    if (req.deleted) return false;
    
    // Apply search filter
    const matchesSearch = !searchTerm || 
      req.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.customer.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply status filter
    const matchesStatus = !statusFilter || req.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Get pending requisition items that need quotes
  const getPendingRequisitionItems = () => {
    return requisitions
      .filter(req => req.status !== 'complete' && req.status !== 'cancelled')
      .flatMap(req => ({
        requisition: req,
        pendingItems: req.items.filter(item => 
          item.status === 'pending' && !item.sentForQuotation
        )
      }))
      .filter(item => item.pendingItems.length > 0);
  };

  // Process orders for display
  const activeOrders = orders.filter(o => !o.deleted);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Requisições de Materiais</h2>
        <div className="flex space-x-4">
          {/* Botão de teste - REMOVER após resolver o problema */}
          <button
            onClick={testFirebaseConnection}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            🔥 Testar Firebase
          </button>
          
          <button
            onClick={handleOpenCuttingPlan}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileText className="h-5 w-5 mr-2" />
            Plano de Corte
          </button>
          <button
            onClick={handleAddRequisition}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Requisição
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button 
          onClick={() => setActiveTab('requisitions')} 
          className={`px-4 py-2 font-medium ${activeTab === 'requisitions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Package className="h-5 w-5 inline-block mr-2" />
          Requisições
        </button>
        <button 
          onClick={() => setActiveTab('quotations')} 
          className={`px-4 py-2 font-medium ${activeTab === 'quotations' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Package className="h-5 w-5 inline-block mr-2" />
          Cotações
        </button>
        <button 
          onClick={() => setActiveTab('cutting-plan')} 
          className={`px-4 py-2 font-medium ${activeTab === 'cutting-plan' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <FileText className="h-5 w-5 mr-2 inline-block" />
          Plano de Corte
        </button>
      </div>

      {activeTab === 'requisitions' && (
        <>
          {/* Search and filters */}
          <div className="mb-6 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por número do pedido ou cliente..."
                className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todos os status</option>
                <option value="pending">Pendente</option>
                <option value="partial">Recebimento Parcial</option>
                <option value="complete">Completa</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            
            {(statusFilter !== '' || searchTerm) && (
              <button
                onClick={() => {
                  setStatusFilter('');
                  setSearchTerm('');
                }}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {/* Requisitions list */}
          {loading ? (
            <div className="text-center py-12">
              <div className="text-lg text-gray-600">Carregando requisições...</div>
            </div>
          ) : filteredRequisitions.length === 0 ? (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center">
              <p className="text-gray-500">Nenhuma requisição de material encontrada.</p>
              <button
                onClick={handleAddRequisition}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 inline-block mr-2" />
                Nova Requisição
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredRequisitions.map(requisition => {
                // Check if budget is exceeded
                const budgetExceeded = requisition.budgetExceeded;
                
                // Get counts for each status
                const pendingItems = requisition.items.filter(item => item.status === 'pending').length;
                const orderedItems = requisition.items.filter(item => item.status === 'ordered').length;
                const receivedItems = requisition.items.filter(item => item.status === 'received' || item.status === 'stock').length;
                
                return (
                  <div key={requisition.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="p-4 bg-gray-50 flex justify-between items-start border-b">
                      <div>
                        <h3 className="text-xl font-bold">Requisição para Pedido #{requisition.orderNumber}</h3>
                        <p className="text-gray-600 mt-1">
                          Cliente: {requisition.customer}
                        </p>
                        <p className="text-gray-600">
                          Data da Solicitação: {formatDateSafely(requisition.requestDate)}
                        </p>
                        
                        {/* Budget info with warning if exceeded */}
                        {budgetExceeded && (
                          <div className="mt-2 bg-red-50 text-red-800 px-3 py-1 rounded-md inline-block">
                            <AlertTriangle className="h-4 w-4 inline-block mr-1" />
                            Orçamento excedido
                          </div>
                        )}
                        
                        <div className="flex mt-3 space-x-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            requisition.status === 'complete' 
                              ? 'bg-green-100 text-green-800' 
                              : requisition.status === 'partial'
                              ? 'bg-blue-100 text-blue-800'
                              : requisition.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {requisition.status === 'complete' 
                              ? 'Completa' 
                              : requisition.status === 'partial'
                              ? 'Parcial'
                              : requisition.status === 'cancelled'
                              ? 'Cancelada'
                              : 'Pendente'}
                          </span>
                          
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                            {requisition.items.length} itens
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        {(pendingItems > 0 && requisition.status !== 'cancelled') && (
                          <button
                            onClick={() => handleCreateQuotation(requisition)}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            <Download className="h-4 w-4 inline-block mr-1" />
                            Solicitar Cotação
                          </button>
                        )}
                        <button
                          onClick={() => handleViewRequisition(requisition)}
                          className="px-3 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                        >
                          <FileText className="h-4 w-4 inline-block mr-1" />
                          Detalhes
                        </button>
                        <button
                          onClick={() => handleEditRequisition(requisition)}
                          className="px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                        >
                          <Edit className="h-4 w-4 inline-block mr-1" />
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteRequisition(requisition)}
                          className="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                          title="Excluir Requisição"
                        >
                          <Trash2 className="h-4 w-4 inline-block mr-1" />
                          Excluir
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="text-sm text-gray-500">Pendentes</div>
                          <div className="text-xl font-bold">{pendingItems}</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="text-sm text-gray-500">Encomendados</div>
                          <div className="text-xl font-bold">{orderedItems}</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border">
                          <div className="text-sm text-gray-500">Recebidos</div>
                          <div className="text-xl font-bold">{receivedItems}</div>
                        </div>
                        <div className={`p-3 rounded-lg border ${
                          budgetExceeded ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                        }`}>
                          <div className="text-sm text-gray-500">
                            {budgetExceeded ? 'Custo Total (Excedido)' : 'Custo Total'}
                          </div>
                          <div className={`text-xl font-bold ${
                            budgetExceeded ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {requisition.totalCost.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL'
                            })}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Limite: {requisition.budgetLimit?.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL'
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'quotations' && (
        <>
          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-lg font-medium">Solicitações de Cotação</h3>
          </div>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Carregando cotações...</p>
            </div>
          ) : quotations.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma solicitação de cotação</h3>
              <p className="text-gray-600">
                Não há solicitações de cotação no momento. Vá para a aba de Requisições para criar uma nova.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {quotations.map(quotation => {
                const supplier = suppliers.find(s => s.id === quotation.supplierId);
                
                // Check if quotation is expired
                const expired = new Date() > new Date(quotation.expirationDate) && 
                                quotation.status === 'pending';
                
                return (
                  <div 
                    key={quotation.id} 
                    className={`bg-white rounded-lg shadow-md overflow-hidden border ${
                      quotation.status === 'responded' ? 'border-green-200' :
                      quotation.status === 'accepted' ? 'border-blue-200' :
                      expired ? 'border-red-200' :
                      'border-gray-200'
                    }`}
                  >
                    <div className={`p-4 ${
                      quotation.status === 'responded' ? 'bg-green-50' :
                      quotation.status === 'accepted' ? 'bg-blue-50' :
                      expired ? 'bg-red-50' :
                      'bg-gray-50'
                    }`}>
                      <div className="flex justify-between">
                        <h4 className="font-medium text-lg flex items-center">
                          Cotação para {supplier?.name || 'Fornecedor não encontrado'}
                          <span className={`ml-3 px-2 py-0.5 text-xs rounded-full ${
                            quotation.status === 'pending' && !expired ? 'bg-yellow-100 text-yellow-800' :
                            quotation.status === 'responded' ? 'bg-green-100 text-green-800' :
                            quotation.status === 'accepted' ? 'bg-blue-100 text-blue-800' :
                            quotation.status === 'expired' || expired ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {quotation.status === 'pending' && !expired ? 'Pendente' :
                             quotation.status === 'responded' ? 'Respondida' :
                             quotation.status === 'accepted' ? 'Aceita' :
                             'Expirada'}
                          </span>
                        </h4>
                        <div className="flex items-center text-sm text-gray-500">
                          <CalendarIcon className="h-4 w-4 mr-1" />
                          {formatDateSafely(quotation.requestDate)}
                        </div>
                      </div>
                      
                      <div className="text-sm text-gray-600 mt-1">
                        <span>Itens: {quotation.items.length}</span>
                        <span className="mx-2">|</span>
                        <span>Expira em: {formatDateSafely(quotation.expirationDate)}</span>
                        {quotation.responseDate && (
                          <>
                            <span className="mx-2">|</span>
                            <span>Respondida em: {formatDateSafely(quotation.responseDate)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Descrição
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Material
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Qtd
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Dimensões
                              </th>
                              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Peso
                              </th>
                              {quotation.status === 'responded' && (
                                <>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Preço/kg
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    IPI (%)
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Prazo
                                  </th>
                                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Preço Total
                                  </th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {quotation.items.map(item => (
                              <tr key={item.id}>
                                <td className="px-3 py-2 text-sm">{item.description}</td>
                                <td className="px-3 py-2 text-sm">{item.material}</td>
                                <td className="px-3 py-2 text-sm">{item.quantity}</td>
                                <td className="px-3 py-2 text-sm">{item.dimensions}</td>
                                <td className="px-3 py-2 text-sm">{item.weight.toLocaleString('pt-BR')} kg</td>
                                {quotation.status === 'responded' && (
                                  <>
                                    <td className="px-3 py-2 text-sm">
                                      {item.pricePerKg?.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                    </td>
                                    <td className="px-3 py-2 text-sm">
                                      {item.ipiPercentage?.toLocaleString('pt-BR')}%
                                    </td>
                                    <td className="px-3 py-2 text-sm">
                                      {item.deliveryTime} dias
                                    </td>
                                    <td className="px-3 py-2 text-sm font-medium">
                                      {item.finalPrice?.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {quotation.notes && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <h5 className="text-sm font-medium text-gray-700">Observações:</h5>
                          <p className="mt-1 text-sm text-gray-600">{quotation.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'cutting-plan' && (
        <CuttingPlanCalculator />
      )}

      {/* Material Requisition Modal */}
      {isModalOpen && (
        <MaterialRequisitionModal
          requisition={selectedRequisition}
          onClose={() => {
            console.log('🚪 Fechando modal via onClose');
            setIsModalOpen(false);
            setSelectedRequisition(null);
          }}
          onSave={handleSaveRequisition}
          orders={activeOrders}
          generateTraceabilityCode={generateTraceabilityCode}
          calculateBudgetLimit={calculateBudgetLimit}
        />
      )}

      {/* Material Requisition Detail Modal */}
      {isDetailModalOpen && selectedRequisition && (
        <MaterialRequisitionDetailModal
          requisition={selectedRequisition}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedRequisition(null);
          }}
          onEdit={() => {
            console.log('✏️ Mudando de detail para edit modal');
            setIsDetailModalOpen(false);
            setIsModalOpen(true);
          }}
          onDelete={handleDeleteRequisition}
        />
      )}

      {/* Quotation Request Modal */}
      {isQuotationModalOpen && selectedRequisition && (
        <QuotationRequestModal
          requisition={selectedRequisition}
          suppliers={suppliers.filter(s => s.status === 'active')}
          onClose={() => {
            setIsQuotationModalOpen(false);
            setSelectedRequisition(null);
          }}
          onSave={handleSaveQuotationRequest}
        />
      )}

      {/* Cutting Plan Modal */}
      {isCuttingPlanModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-6xl w-full h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Plano de Corte</h2>
              <button onClick={() => setIsCuttingPlanModalOpen(false)}>
                <X className="h-6 w-6" />
              </button>
            </div>
            <CuttingPlanCalculator />
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialRequisitions;
