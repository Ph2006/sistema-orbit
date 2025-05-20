import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  QualityDocument, 
  DocumentTemplate, 
  DocumentValidation, 
  NonConformity, 
  InspectionChecklistTemplate, 
  InspectionResult, 
  FiveWhyAnalysis, 
  QualityReport,
  DimensionalReport,
  LiquidPenetrantReport,
  VisualWeldingReport,
  UltrasonicReport,
  EngineeringCall
} from '../types/quality';
import { Order } from '../types/kanban';
import { Link, Check, X, Mail, Download, FileCheck, Plus, Settings, ExternalLink, Clock, Trash2, ChevronLeft, FileBarChart2, AlertCircle, ClipboardCheck, Layers, BookOpen, FileText, Search, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useOrderStore } from '../store/orderStore';
import DocumentTemplates from './DocumentTemplates';
import QualityMetrics from './QualityMetrics';
import NonConformityList from './NonConformityList';
import NonConformityForm from './NonConformityForm';
import ChecklistForm from './ChecklistForm';
import InspectionResultsList from './InspectionResultsList';
import InspectionForm from './InspectionForm';
import LessonsLearned from './LessonsLearned';
import InternalProcedures from './InternalProcedures';
import QualityReportsForm from './QualityReportsForm';
import EngineeringCallsTab from './EngineeringCallsTab';
import { useLocation } from 'react-router-dom';

// Tab definitions
type TabType = 'documents' | 'metrics' | 'nonconformities' | 'checklists' | 'lessons' | 'procedures' | 'reports' | 'engineering';

const QualityControl: React.FC = () => {
  // General state
  const [activeTab, setActiveTab] = useState<TabType>('documents');
  const [showTemplates, setShowTemplates] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  
  // Document-related state
  const [documents, setDocuments] = useState<QualityDocument[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [driveLink, setDriveLink] = useState('');
  const [uploaderEmail, setUploaderEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [validations, setValidations] = useState<DocumentValidation[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSendingValidation, setIsSendingValidation] = useState(false);
  
  // Non-conformity state
  const [nonConformities, setNonConformities] = useState<NonConformity[]>([]);
  const [selectedNonConformity, setSelectedNonConformity] = useState<NonConformity | null>(null);
  
  // Checklist state
  const [checklists, setChecklists] = useState<InspectionChecklistTemplate[]>([]);
  const [inspections, setInspections] = useState<InspectionResult[]>([]);
  const [selectedChecklist, setSelectedChecklist] = useState<InspectionChecklistTemplate | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<InspectionResult | null>(null);
  
  // Reports state
  const [reports, setReports] = useState<QualityReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<QualityReport | null>(null);
  const [reportType, setReportType] = useState<'dimensional' | 'liquid-penetrant' | 'visual-welding' | 'ultrasonic'>('dimensional');
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  
  const { orders } = useOrderStore();
  const location = useLocation();

  useEffect(() => {
    loadTemplates();
    
    // Check for orderId in URL query params
    const params = new URLSearchParams(location.search);
    const orderId = params.get('orderId');
    
    if (orderId) {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order);
      }
    }
  }, [showTemplates, location, orders]);

  useEffect(() => {
    if (selectedOrder) {
      // Load documents for selected order
      const documentsRef = collection(db, 'qualityDocuments');
      const q = query(documentsRef, where('orderId', '==', selectedOrder.id));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as QualityDocument[];
        setDocuments(docs);
      });

      // Load validations for selected order
      const validationsRef = collection(db, 'documentValidations');
      const validationsQuery = query(validationsRef, where('orderId', '==', selectedOrder.id));
      
      const validationsUnsubscribe = onSnapshot(validationsQuery, (snapshot) => {
        const vals = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as DocumentValidation[];
        setValidations(vals);
      });

      // Load non-conformities for selected order
      const nonConformitiesRef = collection(db, 'nonConformities');
      const nonConformitiesQuery = query(nonConformitiesRef, where('orderId', '==', selectedOrder.id));
      
      const nonConformitiesUnsubscribe = onSnapshot(nonConformitiesQuery, (snapshot) => {
        const ncs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as NonConformity[];
        setNonConformities(ncs);
      });

      // Load inspection results for selected order
      const inspectionsRef = collection(db, 'inspectionResults');
      const inspectionsQuery = query(inspectionsRef, where('orderId', '==', selectedOrder.id));
      
      const inspectionsUnsubscribe = onSnapshot(inspectionsQuery, (snapshot) => {
        const insps = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as InspectionResult[];
        setInspections(insps);
      });
      
      // Load quality reports for the selected order
      const reportsRef = collection(db, 'qualityReports');
      const reportsQuery = query(reportsRef, where('orderId', '==', selectedOrder.id));
      
      const reportsUnsubscribe = onSnapshot(reportsQuery, (snapshot) => {
        const qReps = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as QualityReport[];
        setReports(qReps);
      });

      // Set customer email if order has one
      if (selectedOrder.customerEmail) {
        setCustomerEmail(selectedOrder.customerEmail);
      }

      return () => {
        unsubscribe();
        validationsUnsubscribe();
        nonConformitiesUnsubscribe();
        inspectionsUnsubscribe();
        reportsUnsubscribe();
      };
    } else {
      setDocuments([]);
      setValidations([]);
      setNonConformities([]);
      setInspections([]);
      setReports([]);
      setCustomerEmail('');
    }
  }, [selectedOrder?.id]);

  // Load quality checklists for all orders
  useEffect(() => {
    const checklistsRef = collection(db, 'checklistTemplates');
    
    const unsubscribe = onSnapshot(checklistsRef, (snapshot) => {
      const templates = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InspectionChecklistTemplate[];
      setChecklists(templates);
    });
    
    return () => unsubscribe();
  }, []);

  const loadTemplates = async () => {
    try {
      const templatesRef = collection(db, 'documentTemplates');
      const snapshot = await getDocs(templatesRef);
      const temps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DocumentTemplate[];
      setTemplates(temps);
      setSelectedTemplate(null);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const handleAddDocument = async () => {
    if (!driveLink || !selectedTemplate || !selectedOrder || !uploaderEmail) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!uploaderEmail.includes('@')) {
      alert('Por favor, insira um email válido para o responsável pelo documento.');
      return;
    }

    if (!driveLink.includes('drive.google.com')) {
      alert('Por favor, insira um link válido do Google Drive.');
      return;
    }

    setLoading(true);
    try {
      const documentsRef = collection(db, 'qualityDocuments');
      const docData: Omit<QualityDocument, 'id'> = {
        orderId: selectedOrder.id,
        templateId: selectedTemplate.id,
        name: selectedTemplate.name,
        description: selectedTemplate.description,
        driveLink,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uploaderEmail,
        status: 'pending',
        required: selectedTemplate.required,
      };

      await addDoc(documentsRef, docData);
      
      setDriveLink('');
      setSelectedTemplate(null);
      setUploaderEmail('');
      
      alert('Documento adicionado com sucesso!');
    } catch (error) {
      console.error('Error adding document:', error);
      alert('Erro ao adicionar documento. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'qualityDocuments', documentId));
      
      // Also delete any associated validations
      const validationsSnapshot = await getDocs(
        query(collection(db, 'documentValidations'), where('documentId', '==', documentId))
      );
      
      const deletePromises = validationsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      alert('Documento excluído com sucesso!');
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Erro ao excluir documento. Por favor, tente novamente.');
    }
  };

  const handleDocumentAccess = async (document: QualityDocument) => {
    try {
      const docRef = doc(db, 'qualityDocuments', document.id);
      await updateDoc(docRef, {
        lastAccessed: new Date().toISOString(),
        status: 'verified'
      });
    } catch (error) {
      console.error('Error updating document access:', error);
    }
  };

  const handleSendValidationRequest = async () => {
    if (!customerEmail || !selectedOrder) return;

    if (!customerEmail.includes('@')) {
      alert('Por favor, insira um email válido para o cliente.');
      return;
    }

    // Check if there are any documents to validate
    if (documents.length === 0) {
      alert('Não há documentos para validar. Adicione pelo menos um documento antes de solicitar validação.');
      return;
    }

    // Check if all required documents are present
    const requiredTemplates = templates.filter(t => t.required);
    const missingRequired = requiredTemplates.filter(template => 
      !documents.some(doc => doc.templateId === template.id)
    );

    if (missingRequired.length > 0) {
      const missingDocs = missingRequired.map(t => t.name).join(', ');
      alert(`Documentos obrigatórios faltando: ${missingDocs}`);
      return;
    }

    setIsSendingValidation(true);
    try {
      const orderRef = doc(db, 'orders', selectedOrder.id);
      await updateDoc(orderRef, {
        customerEmail,
        validationRequestSentAt: new Date().toISOString(),
        status: 'waiting-docs' // Update order status
      });

      // Update all documents to pending status
      const updatePromises = documents.map(document => 
        updateDoc(doc(db, 'qualityDocuments', document.id), {
          status: 'pending'
        })
      );
      await Promise.all(updatePromises);

      alert('Solicitação de validação enviada com sucesso!');
    } catch (error) {
      console.error('Error sending validation request:', error);
      alert('Erro ao enviar solicitação de validação.');
    } finally {
      setIsSendingValidation(false);
    }
  };

  const getValidationStatus = (documentId: string) => {
    return validations.find(v => v.documentId === documentId);
  };

  const getValidationUrl = () => {
    if (!selectedOrder) return '';
    return `${window.location.origin}/validate/${selectedOrder.id}`;
  };

  // Handle saving a non-conformity
  const handleSaveNonConformity = async (nonConformity: NonConformity) => {
    try {
      if (nonConformity.id && nonConformity.id !== 'new') {
        // Update existing non-conformity
        const { id, ...updateData } = nonConformity;
        await updateDoc(doc(db, 'nonConformities', id), updateData);
      } else {
        // Create new non-conformity - properly remove the id field
        const { id, ...newNonConformityData } = nonConformity;
        await addDoc(collection(db, 'nonConformities'), {
          ...newNonConformityData,
          createdAt: new Date().toISOString()
        });
      }
      setSelectedNonConformity(null);
      setShowEditForm(false);
      alert('Não conformidade salva com sucesso!');
    } catch (error) {
      console.error('Error saving non-conformity:', error);
      alert('Erro ao salvar não conformidade.');
    }
  };

  // Handle saving a checklist template
  const handleSaveChecklistTemplate = async (checklist: InspectionChecklistTemplate) => {
    try {
      if (checklist.id && checklist.id !== 'new') {
        // Update
        await updateDoc(doc(db, 'checklistTemplates', checklist.id), {
          ...checklist,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Create - properly remove the id field
        const { id, ...checklistWithoutId } = checklist;
        await addDoc(collection(db, 'checklistTemplates'), {
          ...checklistWithoutId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      setSelectedChecklist(null);
      setShowEditForm(false);
      alert('Modelo de checklist salvo com sucesso!');
    } catch (error) {
      console.error('Error saving checklist template:', error);
      alert('Erro ao salvar modelo de checklist.');
    }
  };

  // Handle saving an inspection result
  const handleSaveInspection = async (inspection: InspectionResult) => {
    try {
      if (inspection.id && inspection.id !== 'new') {
        // Update - keep the id for updating existing document
        const inspectionRef = doc(db, 'inspectionResults', inspection.id);
        await updateDoc(inspectionRef, inspection);
      } else {
        // Create - properly remove the id field before adding to Firestore
        const { id, ...inspectionWithoutId } = inspection;
        await addDoc(collection(db, 'inspectionResults'), inspectionWithoutId);
      }
      setSelectedInspection(null);
      setShowEditForm(false);
      alert('Inspeção salva com sucesso!');
    } catch (error) {
      console.error('Error saving inspection:', error);
      alert('Erro ao salvar inspeção.');
    }
  };
  
  // Handle saving a quality report
  const handleSaveReport = async (report: QualityReport) => {
    try {
      // Update the updatedAt timestamp
      report.updatedAt = new Date().toISOString();
      
      if (report.id === 'new') {
        // Create a new report
        const { id, ...reportData } = report;
        await addDoc(collection(db, 'qualityReports'), reportData);
      } else {
        // Update an existing report
        const reportRef = doc(db, 'qualityReports', report.id);
        await updateDoc(reportRef, report);
      }
      
      setSelectedReport(null);
      setShowEditForm(false);
      alert('Relatório salvo com sucesso!');
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Erro ao salvar relatório.');
    }
  };
  
  // Delete a quality report
  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este relatório?')) {
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'qualityReports', reportId));
      alert('Relatório excluído com sucesso!');
    } catch (error) {
      console.error('Error deleting report:', error);
      alert('Erro ao excluir relatório.');
    }
  };

  // Filter orders based on search term
  const filteredOrders = orders.filter(order => {
    if (!searchTerm.trim()) return true;
    
    const term = searchTerm.toLowerCase().trim();
    return (
      order.orderNumber.toLowerCase().includes(term) ||
      order.customer.toLowerCase().includes(term) ||
      order.internalOrderNumber.toLowerCase().includes(term)
    );
  });

  // Filter reports by type
  const filteredReports = reports.filter(report => 
    reportType === 'dimensional' ? report.reportType === 'dimensional' :
    reportType === 'liquid-penetrant' ? report.reportType === 'liquid-penetrant' :
    reportType === 'visual-welding' ? report.reportType === 'visual-welding' :
    report.reportType === 'ultrasonic'
  );

  // Render tabs
  const renderTabs = () => (
    <div className="flex border-b mb-6 overflow-x-auto">
      <button
        onClick={() => setActiveTab('documents')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'documents' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <FileCheck className="h-5 w-5 inline-block mr-1" />
        Documentos
      </button>
      <button
        onClick={() => setActiveTab('metrics')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'metrics' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <FileBarChart2 className="h-5 w-5 inline-block mr-1" />
        Métricas e Indicadores
      </button>
      <button
        onClick={() => setActiveTab('nonconformities')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'nonconformities' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <AlertCircle className="h-5 w-5 inline-block mr-1" />
        Não Conformidades
      </button>
      <button
        onClick={() => setActiveTab('checklists')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'checklists' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <ClipboardCheck className="h-5 w-5 inline-block mr-1" />
        Checklists
      </button>
      <button
        onClick={() => setActiveTab('reports')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'reports' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <FileText className="h-5 w-5 inline-block mr-1" />
        Relatórios
      </button>
      <button
        onClick={() => setActiveTab('engineering')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'engineering' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <Mail className="h-5 w-5 inline-block mr-1" />
        Chamados para Engenharia
      </button>
      <button
        onClick={() => setActiveTab('lessons')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'lessons' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <BookOpen className="h-5 w-5 inline-block mr-1" />
        Lições Aprendidas
      </button>
      <button
        onClick={() => setActiveTab('procedures')}
        className={`px-4 py-2 whitespace-nowrap font-medium ${activeTab === 'procedures' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
      >
        <FileText className="h-5 w-5 inline-block mr-1" />
        Procedimentos
      </button>
    </div>
  );

  if (showTemplates) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Configurações de Documentos</h2>
          <button
            onClick={() => setShowTemplates(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ChevronLeft className="h-5 w-5 inline-block mr-1" />
            Voltar
          </button>
        </div>
        <DocumentTemplates />
      </div>
    );
  }

  if (showEditForm) {
    if (activeTab === 'nonconformities') {
      return (
        <NonConformityForm
          nonConformity={selectedNonConformity}
          order={selectedOrder}
          onSave={handleSaveNonConformity}
          onCancel={() => {
            setShowEditForm(false);
            setSelectedNonConformity(null);
          }}
        />
      );
    } else if (activeTab === 'checklists' && !selectedInspection) {
      return (
        <ChecklistForm
          checklist={selectedChecklist}
          onSave={handleSaveChecklistTemplate}
          onCancel={() => {
            setShowEditForm(false);
            setSelectedChecklist(null);
          }}
        />
      );
    } else if (activeTab === 'checklists' && selectedInspection) {
      return (
        <InspectionForm
          inspection={selectedInspection}
          checklists={checklists}
          order={selectedOrder}
          onSave={handleSaveInspection}
          onCancel={() => {
            setShowEditForm(false);
            setSelectedInspection(null);
          }}
        />
      );
    } else if (activeTab === 'reports' && selectedReport) {
      return (
        <QualityReportsForm
          report={selectedReport}
          order={selectedOrder}
          onSave={handleSaveReport}
          onCancel={() => {
            setShowEditForm(false);
            setSelectedReport(null);
          }}
        />
      );
    }
  }

  if (!selectedOrder) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Controle de Qualidade</h3>
          <div className="flex space-x-4">
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              <Settings className="h-5 w-5 mr-2" />
              Configurar Documentos
            </button>
            <button
              onClick={() => {
                setActiveTab('checklists');
                setShowEditForm(true);
                setSelectedChecklist({
                  id: 'new',
                  name: '',
                  description: '',
                  sections: [],
                  isActive: true,
                  createdAt: '',
                  updatedAt: '',
                  applicableToStages: []
                });
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 mr-2" />
              Novo Checklist
            </button>
          </div>
        </div>

        {/* Tab selection */}
        {renderTabs()}

        {/* Search bar for orders */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar pedido por número, cliente ou OS..."
            className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
          />
        </div>

        {/* Order selection grid */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium">Selecione um pedido para gerenciar</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map(order => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium">Pedido #{order.orderNumber}</h4>
                    <p className="text-sm text-gray-600">
                      Cliente: {order.customer} | OS: {order.internalOrderNumber}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOrder(order);
                    }}
                    className="flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200"
                  >
                    <Layers className="h-4 w-4 mr-1" />
                    Ver detalhes
                  </button>
                </div>
              </div>
            ))}
            
            {/* Show message when no orders match search */}
            {filteredOrders.length === 0 && (
              <div className="col-span-3 p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
                {searchTerm ? 'Nenhum pedido encontrado para esta busca.' : 'Nenhum pedido disponível.'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold">Controle de Qualidade</h3>
          <p className="text-gray-600">
            Pedido #{selectedOrder.orderNumber} - {selectedOrder.customer}
          </p>
        </div>
        <div className="flex space-x-4">
          {activeTab === 'documents' && (
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              <Settings className="h-5 w-5 mr-2" />
              Configurar Docs
            </button>
          )}

          {activeTab === 'nonconformities' && (
            <button
              onClick={() => {
                setSelectedNonConformity({
                  id: 'new',
                  orderId: selectedOrder.id,
                  itemId: selectedOrder.items[0]?.id || '',
                  title: '',
                  description: '',
                  severity: 'medium',
                  status: 'open',
                  createdAt: new Date().toISOString(),
                  createdBy: '',
                  followUpRequired: false,
                  impactedAreas: []
                });
                setShowEditForm(true);
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 mr-2" />
              Nova Não Conformidade
            </button>
          )}

          {activeTab === 'checklists' && (
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setSelectedChecklist({
                    id: 'new',
                    name: '',
                    description: '',
                    sections: [],
                    isActive: true,
                    createdAt: '',
                    updatedAt: '',
                    applicableToStages: []
                  });
                  setShowEditForm(true);
                }}
                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Novo Checklist
              </button>
              <button
                onClick={() => {
                  if (checklists.length === 0) {
                    alert('Crie um modelo de checklist primeiro.');
                    return;
                  }
                  setSelectedInspection({
                    id: 'new',
                    orderId: selectedOrder.id,
                    checklistId: checklists[0].id,
                    checklistName: checklists[0].name,
                    inspector: '',
                    inspectionDate: new Date().toISOString(),
                    status: 'passed',
                    sections: []
                  });
                  setShowEditForm(true);
                }}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Nova Inspeção
              </button>
            </div>
          )}
          
          {activeTab === 'reports' && (
            <button
              onClick={() => {
                setSelectedReport({
                  id: 'new',
                  orderId: selectedOrder.id,
                  itemId: selectedOrder.items[0]?.id || '',
                  reportType: reportType,
                  reportNumber: '',
                  inspector: '',
                  inspectionDate: new Date().toISOString().split('T')[0],
                  status: 'draft',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                });
                setShowEditForm(true);
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 mr-2" />
              Novo Relatório
            </button>
          )}

          {activeTab === 'procedures' && (
            <button
              onClick={() => {
                // Add a way to create a new procedure
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 mr-2" />
              Novo Procedimento
            </button>
          )}
          
          <button
            onClick={() => setSelectedOrder(null)}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            Voltar
          </button>
        </div>
      </div>

      {/* Tab selection */}
      {renderTabs()}

      {/* Tab content */}
      {activeTab === 'documents' && (
        <>
          {/* Add Document Section */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h4 className="font-semibold mb-4">Adicionar Documento</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Documento
                </label>
                <select
                  value={selectedTemplate?.id || ''}
                  onChange={(e) => {
                    const template = templates.find(t => t.id === e.target.value);
                    setSelectedTemplate(template || null);
                  }}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value="">Selecione um tipo</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email do Responsável
                </label>
                <input
                  type="email"
                  value={uploaderEmail}
                  onChange={(e) => setUploaderEmail(e.target.value)}
                  placeholder="responsavel@empresa.com"
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Link do Google Drive
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="url"
                    value={driveLink}
                    onChange={(e) => setDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  />
                  <button
                    onClick={handleAddDocument}
                    disabled={!driveLink || !selectedTemplate || !uploaderEmail || loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Validation Section */}
          <div className="mb-8 p-4 border rounded-lg bg-gray-50">
            <h4 className="font-semibold mb-4">Validação do Cliente</h4>
            <div className="space-y-4">
              <div className="flex items-end space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    E-mail do Cliente
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="cliente@empresa.com"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  />
                </div>
                <button
                  onClick={handleSendValidationRequest}
                  disabled={!customerEmail || isSendingValidation || documents.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Mail className="h-5 w-5 mr-2 inline-block" />
                  {isSendingValidation ? 'Enviando...' : 'Solicitar Validação'}
                </button>
              </div>

              {selectedOrder.validationRequestSentAt && (
                <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    Última solicitação enviada em: {format(new Date(selectedOrder.validationRequestSentAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                  <p className="text-sm text-blue-800 mt-2">
                    Link para validação: <a href={getValidationUrl()} target="_blank" rel="noopener noreferrer" className="underline">{getValidationUrl()}</a>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Documents List */}
          <div>
            <h4 className="font-semibold mb-4">Documentos do Pedido</h4>
            <div className="space-y-4">
              {documents.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Nenhum documento adicionado ainda.
                </p>
              ) : (
                documents.map(doc => {
                  const validation = getValidationStatus(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`p-4 rounded-lg border ${
                        doc.status === 'verified'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-medium flex items-center">
                            {doc.name}
                            {doc.required && (
                              <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                                Obrigatório
                              </span>
                            )}
                          </h5>
                          <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                          <p className="text-sm text-gray-500 mt-2">
                            Adicionado em: {format(new Date(doc.uploadedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </p>
                          <p className="text-sm text-gray-500">
                            Responsável: {doc.uploadedBy}
                          </p>
                          {doc.lastAccessed && (
                            <p className="text-sm text-green-600 mt-1">
                              Último acesso: {format(new Date(doc.lastAccessed), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className={`flex items-center px-3 py-1 rounded-full ${
                            doc.status === 'verified'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {doc.status === 'verified' ? (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Verificado
                              </>
                            ) : (
                              <>
                                <Clock className="h-4 w-4 mr-1" />
                                Pendente
                              </>
                            )}
                          </div>
                          <a
                            href={doc.driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleDocumentAccess(doc)}
                            className="flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200"
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Acessar
                          </a>
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="flex items-center px-3 py-1 bg-red-100 text-red-800 rounded-full hover:bg-red-200"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </button>
                        </div>
                      </div>

                      {validation && (
                        <div className={`mt-4 p-3 rounded-lg ${
                          validation.status === 'approved'
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                        }`}>
                          <div className="flex items-center">
                            {validation.status === 'approved' ? (
                              <Check className="h-4 w-4 text-green-600 mr-2" />
                            ) : (
                              <X className="h-4 w-4 text-red-600 mr-2" />
                            )}
                            <span className={validation.status === 'approved' ? 'text-green-800' : 'text-red-800'}>
                              {validation.status === 'approved' ? 'Aprovado' : 'Rejeitado'} por {validation.validatedBy}
                            </span>
                          </div>
                          {validation.comments && (
                            <p className="mt-2 text-sm text-gray-700">
                              Comentários: {validation.comments}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'metrics' && (
        <QualityMetrics 
          order={selectedOrder} 
          nonConformities={nonConformities} 
          inspections={inspections} 
          documents={documents}
        />
      )}

      {activeTab === 'nonconformities' && (
        <NonConformityList 
          nonConformities={nonConformities} 
          onEdit={nonConformity => {
            setSelectedNonConformity(nonConformity);
            setShowEditForm(true);
          }}
          onDelete={async (id) => {
            if (window.confirm('Tem certeza que deseja excluir esta não conformidade?')) {
              try {
                await deleteDoc(doc(db, 'nonConformities', id));
                alert('Não conformidade excluída com sucesso!');
              } catch (error) {
                console.error('Error deleting non-conformity:', error);
                alert('Erro ao excluir não conformidade.');
              }
            }
          }}
        />
      )}

      {activeTab === 'checklists' && (
        <InspectionResultsList 
          inspections={inspections} 
          checklists={checklists}
          onCreateInspection={() => {
            if (checklists.length === 0) {
              alert('Crie um modelo de checklist primeiro.');
              return;
            }
            setSelectedInspection({
              id: 'new',
              orderId: selectedOrder.id,
              checklistId: checklists[0].id,
              checklistName: checklists[0].name,
              inspector: '',
              inspectionDate: new Date().toISOString(),
              status: 'passed',
              sections: []
            });
            setShowEditForm(true);
          }}
          onViewInspection={(inspection) => {
            setSelectedInspection(inspection);
            setShowEditForm(true);
          }}
          onViewChecklistTemplate={(template) => {
            setSelectedChecklist(template);
            setShowEditForm(true);
          }}
          onCreateChecklistTemplate={() => {
            setSelectedChecklist({
              id: 'new',
              name: '',
              description: '',
              sections: [],
              isActive: true,
              createdAt: '',
              updatedAt: '',
              applicableToStages: []
            });
            setShowEditForm(true);
          }}
          onDeleteInspection={async (id) => {
            if (window.confirm('Tem certeza que deseja excluir esta inspeção?')) {
              try {
                await deleteDoc(doc(db, 'inspectionResults', id));
                alert('Inspeção excluída com sucesso!');
              } catch (error) {
                console.error('Error deleting inspection:', error);
                alert('Erro ao excluir inspeção.');
              }
            }
          }}
        />
      )}
      
      {activeTab === 'engineering' && (
        <EngineeringCallsTab selectedOrder={selectedOrder} />
      )}
      
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex items-center space-x-4 mb-6">
            <h3 className="text-lg font-medium">Relatórios de Ensaios</h3>
            
            <div className="flex p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setReportType('dimensional')}
                className={`px-3 py-1 rounded-md text-sm ${reportType === 'dimensional' ? 'bg-white shadow' : 'hover:bg-gray-200'}`}
              >
                Dimensional
              </button>
              <button
                onClick={() => setReportType('liquid-penetrant')}
                className={`px-3 py-1 rounded-md text-sm ${reportType === 'liquid-penetrant' ? 'bg-white shadow' : 'hover:bg-gray-200'}`}
              >
                Líquido Penetrante
              </button>
              <button
                onClick={() => setReportType('visual-welding')}
                className={`px-3 py-1 rounded-md text-sm ${reportType === 'visual-welding' ? 'bg-white shadow' : 'hover:bg-gray-200'}`}
              >
                Inspeção Visual
              </button>
              <button
                onClick={() => setReportType('ultrasonic')}
                className={`px-3 py-1 rounded-md text-sm ${reportType === 'ultrasonic' ? 'bg-white shadow' : 'hover:bg-gray-200'}`}
              >
                Ultrassom
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {filteredReports.length === 0 ? (
              <div className="text-center p-8 bg-gray-50 rounded-lg">
                <p className="text-gray-500">
                  {`Nenhum relatório de ${
                    reportType === 'dimensional' ? 'inspeção dimensional' :
                    reportType === 'liquid-penetrant' ? 'líquido penetrante' :
                    reportType === 'visual-welding' ? 'inspeção visual de solda' :
                    'ultrassom'
                  } encontrado para este pedido.`}
                </p>
                <button
                  onClick={() => {
                    // Create a new report with the selected type
                    const newReport = {
                      id: 'new',
                      orderId: selectedOrder.id,
                      itemId: selectedOrder.items[0]?.id || '',
                      reportType,
                      reportNumber: '', // Will be generated in the form
                      inspector: '',
                      inspectionDate: new Date().toISOString().split('T')[0],
                      status: 'draft' as const,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };
                    
                    setSelectedReport(newReport as QualityReport);
                    setShowEditForm(true);
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Plus className="h-5 w-5 inline-block mr-1" />
                  Criar Novo Relatório
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReports.map(report => (
                  <div
                    key={report.id}
                    className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between">
                      <div>
                        <h4 className="font-medium text-lg">
                          {report.reportNumber} - {
                            report.reportType === 'dimensional' ? 'Inspeção Dimensional' :
                            report.reportType === 'liquid-penetrant' ? 'Ensaio por Líquido Penetrante' :
                            report.reportType === 'visual-welding' ? 'Inspeção Visual de Solda' :
                            'Ensaio de Ultrassom'
                          }
                        </h4>
                        <div className="text-sm text-gray-500">
                          Data: {format(new Date(report.inspectionDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </div>
                        <div className="text-sm text-gray-500">
                          Inspetor: {report.inspector}
                        </div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            report.status === 'approved' ? 'bg-green-100 text-green-800' :
                            report.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            report.status === 'pending-review' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {report.status === 'approved' ? 'Aprovado' :
                             report.status === 'rejected' ? 'Reprovado' :
                             report.status === 'pending-review' ? 'Aguardando Revisão' :
                             'Rascunho'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setSelectedReport(report);
                            setShowEditForm(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded"
                          title="Editar"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          className="p-2 text-red-600 hover:bg-red-100 rounded"
                          title="Excluir"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'lessons' && (
        <LessonsLearned order={selectedOrder} />
      )}

      {activeTab === 'procedures' && (
        <InternalProcedures />
      )}
    </div>
  );
};

export default QualityControl;