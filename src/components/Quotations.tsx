import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronDown, 
  FileText, 
  Download, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Calendar, 
  Edit, 
  Trash2,
  AlertTriangle,
  Settings,
  ShoppingBag,
  Copy
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Quotation } from '../types/quotation';
import { Customer } from '../types/customer';
import { useQuotationStore } from '../store/quotationStore';
import { format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import QuotationModal from './QuotationModal';
import QuotationDashboard from './QuotationDashboard';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';
import { useNavigate } from 'react-router-dom';
import { useColumnStore } from '../store/columnStore';

// Helper function to sanitize data for Firestore
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeForFirestore(value);
  }
  
  return sanitized;
};

const Quotations: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [dateRangeFilter, setDateRangeFilter] = useState<{start?: string; end?: string}>({});
  
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('dashboard');
  const [conversionError, setConversionError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { companyLogo, companyName, companyCNPJ, companyResponsible } = useSettingsStore();
  const columnStore = useColumnStore();
  
  const { 
    quotations, 
    loading, 
    error,
    loadQuotations,
    subscribeToQuotations,
    addQuotation,
    updateQuotation,
    deleteQuotation,
    getNextQuoteNumber,
    approveQuotation,
    rejectQuotation,
    convertToOrder
  } = useQuotationStore();

  // Helper function to check if columns exist and initialize them if not
  const checkColumnsExist = async () => {
    try {
      // Check if columns exist
      if (!columnStore.columns || columnStore.columns.length === 0) {
        console.log("Columns not initialized, initializing now...");
        // Explicitly wait for column initialization to complete
        await columnStore.initializeDefaultColumns();
        
        // Double-check that columns were actually initialized
        if (!columnStore.columns || columnStore.columns.length === 0) {
          throw new Error("Columns were not properly initialized. Please set up your Kanban board first.");
        }
      }
      return true;
    } catch (error) {
      console.error("Error initializing columns:", error);
      throw error;
    }
  };

  useEffect(() => {
    // Load customers
    const loadCustomers = async () => {
      try {
        // Log the collection path being accessed
        const collectionPath = getCompanyCollection('customers');
        console.log(`Attempting to load customers from: ${collectionPath}`);
        
        const customersSnapshot = await getDocs(collection(db, collectionPath));
        const customersData = customersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Customer[];
        
        // Log the number of customers loaded
        console.log(`Loaded ${customersData.length} customers`);
        
        setCustomers(customersData);
      } catch (error) {
        console.error('Error loading customers:', error);
      }
    };
    
    loadCustomers();
    
    // Subscribe to quotations
    const unsubscribe = subscribeToQuotations();
    
    return () => unsubscribe();
  }, []);

  // Separate useEffect for initializing columns
  useEffect(() => {
    // Proactively initialize columns when component mounts
    const initColumns = async () => {
      try {
        // Only initialize if columns don't exist yet
        if (!columnStore.columns || columnStore.columns.length === 0) {
          await columnStore.initializeDefaultColumns();
          console.log("Kanban columns initialized on component mount");
        }
      } catch (error) {
        console.error("Error initializing columns on mount:", error);
      }
    };
    
    initColumns();
  }, []);

  const handleAddQuotation = async () => {
    // Get the next sequential quote number
    await getNextQuoteNumber();
    setSelectedQuotation(null);
    setIsModalOpen(true);
  };

  const handleEditQuotation = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setIsModalOpen(true);
  };

  const handleDeleteQuotation = async (quotation: Quotation) => {
    if (window.confirm(`Tem certeza que deseja excluir o orçamento #${quotation.number}?`)) {
      try {
        await deleteQuotation(quotation.id);
        alert('Orçamento excluído com sucesso!');
      } catch (error) {
        console.error('Error deleting quotation:', error);
        alert('Erro ao excluir orçamento.');
      }
    }
  };

  const handleSaveQuotation = async (quotation: Quotation) => {
    try {
      // Sanitize the quotation object to replace undefined values with null
      const sanitizedQuotation = sanitizeForFirestore(quotation);
      
      if (sanitizedQuotation.id === 'new') {
        // For new quotations, properly reset the ID before adding
        const { id, ...newQuotationData } = sanitizedQuotation;
        await addQuotation(newQuotationData);
        alert('Orçamento criado com sucesso!');
      } else {
        // If quotation was approved, and doesn't have a convertedToOrderId,
        // and the previous status wasn't approved, convert to order
        if (sanitizedQuotation.status === 'approved' && !sanitizedQuotation.convertedToOrderId && 
            selectedQuotation?.status !== 'approved') {
          if (window.confirm('Deseja converter este orçamento aprovado em pedido?')) {
            try {
              // Clear any previous error
              setConversionError(null);
              
              // First update the quotation
              await updateQuotation(sanitizedQuotation);
              
              // Ensure columns exist before proceeding
              // FIXED: Make sure to properly await the checkColumnsExist function
              await checkColumnsExist();
              
              // Now convert to order
              const orderId = await convertToOrder(sanitizedQuotation.id);
              alert(`Orçamento aprovado e convertido em pedido com sucesso! ID do Pedido: ${orderId}`);
              navigate('/orders');
              return;
            } catch (error) {
              console.error('Error converting quotation:', error);
              setConversionError("Erro ao converter orçamento em pedido. " + (error instanceof Error ? error.message : "Erro desconhecido."));
              alert('Erro ao converter orçamento em pedido. ' + (error instanceof Error ? error.message : "Erro desconhecido."));
              return;
            }
          }
        }
        
        await updateQuotation(sanitizedQuotation);
        alert('Orçamento atualizado com sucesso!');
      }
      
      setIsModalOpen(false);
      setSelectedQuotation(null);
    } catch (error) {
      console.error('Error saving quotation:', error);
      alert('Erro ao salvar orçamento.');
    }
  };

  const handleExportQuotation = (quotation: Quotation) => {
    // Create PDF document in landscape mode
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 15;
    const marginRight = 15;
    const contentWidth = pageWidth - marginLeft - marginRight;
    
    let y = 15;
    
    // 1. Identification of the Quotation
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', marginLeft, y, 40, 20);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`ORÇAMENTO #${quotation.number}`, pageWidth / 2, y + 10, {align: 'center'});
      y += 25;
    } else {
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`ORÇAMENTO #${quotation.number}`, pageWidth / 2, y + 5, {align: 'center'});
      y += 15;
    }
    
    // Add company and customer information in two columns
    const colWidth = (contentWidth - 10) / 2;
    
    // Company info box (left column)
    doc.setFillColor(245, 245, 245);
    doc.rect(marginLeft, y, colWidth, 35, 'F');
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('EMPRESA:', marginLeft + 5, y + 8);
    doc.setFont(undefined, 'normal');
    doc.text(companyName || 'Sua Empresa', marginLeft + 5, y + 16);
    
    if (companyCNPJ) {
      doc.text(`CNPJ: ${companyCNPJ}`, marginLeft + 5, y + 24);
    }
    
    if (companyResponsible) {
      doc.text(`Responsável: ${companyResponsible}`, marginLeft + 5, y + 32);
    }
    
    // Customer info box (right column)
    doc.setFillColor(245, 245, 245);
    doc.rect(marginLeft + colWidth + 10, y, colWidth, 35, 'F');
    
    // Find complete customer information
    const customer = customers.find(c => c.id === quotation.customerId);
    
    doc.setFont(undefined, 'bold');
    doc.text('CLIENTE:', marginLeft + colWidth + 15, y + 8);
    doc.setFont(undefined, 'normal');
    doc.text(quotation.customerName, marginLeft + colWidth + 15, y + 16);
    
    if (customer) {
      if (customer.cnpj) {
        doc.text(`CNPJ: ${customer.cnpj}`, marginLeft + colWidth + 15, y + 24);
      }
      
      if (customer.address) {
        const address = doc.splitTextToSize(customer.address, colWidth - 20);
        doc.text(address, marginLeft + colWidth + 15, y + 32, { maxWidth: colWidth - 20 });
      }
    }
    
    y += 40;
    
    // Add quote info box (dates and status)
    doc.setFillColor(245, 245, 245);
    doc.rect(marginLeft, y, contentWidth, 20, 'F');
    
    doc.setFont(undefined, 'bold');
    doc.text('INFORMAÇÕES DO ORÇAMENTO:', marginLeft + 5, y + 8);
    doc.setFont(undefined, 'normal');
    
    // Display date information in a horizontal layout
    const infoColWidth = contentWidth / 3;
    doc.text(`Data: ${format(new Date(quotation.createdAt), 'dd/MM/yyyy', { locale: ptBR })}`, 
      marginLeft + 5, y + 16);
    
    doc.text(`Validade: ${format(new Date(quotation.expiresAt || ''), 'dd/MM/yyyy', { locale: ptBR })}`, 
      marginLeft + infoColWidth, y + 16);
    
    doc.text(`Status: ${
      quotation.status === 'draft' ? 'Rascunho' : 
      quotation.status === 'sent' ? 'Aguardando aprovação' : 
      quotation.status === 'approved' ? 'Aprovado' : 
      quotation.status === 'rejected' ? 'Reprovado' : 'Informativo'
    }`, marginLeft + (infoColWidth * 2), y + 16);
    
    y += 25;
    
    // 2. Commercial Conditions
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('CONDIÇÕES COMERCIAIS:', marginLeft, y);
    y += 8;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    // Display commercial conditions in a horizontal layout
    doc.text(`Prazo de Pagamento: ${quotation.paymentTerms || 'A combinar'}`, marginLeft, y);
    y += 6;
    
    doc.text(`Prazo de Entrega: ${quotation.items.length > 0 
      ? Math.round(quotation.items.reduce((sum, item) => sum + item.leadTimeDays, 0) / quotation.items.length)
      : 0} dias úteis após aprovação`, marginLeft, y);
    y += 6;
    
    doc.text(`Condições de Entrega: ${quotation.deliveryTerms || 'FOB - Frete por conta do cliente'}`, marginLeft, y);
    y += 10;
    
    // 3. Included services - Technical scope and description
    if (quotation.includedServices && quotation.includedServices.length > 0) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('SERVIÇOS INCLUSOS:', marginLeft, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      // Get service labels
      const commonServices = [
        { id: 'materialSupply', label: 'Fornecimento de material' },
        { id: 'manufacture', label: 'Fabricação - Caldeiraria' },
        { id: 'machining', label: 'Fabricação - Usinagem' },
        { id: 'nonDestructiveTest', label: 'Ensaios não destrutivos' },
        { id: 'heatTreatment', label: 'Tratamento térmico de alívio de tensão' },
        { id: 'surfaceTreatment', label: 'Tratamento de superfície (pintura, galvanização, etc)' },
        { id: 'rubber', label: 'Emborrachamento' },
        { id: 'assembly', label: 'Montagem Mecânica' },
        { id: 'certification', label: 'Emissão de certificados e documentos da qualidade' },
        { id: 'fasteners', label: 'Itens de fixação' }
      ];
      
      const includedServiceLabels = quotation.includedServices
        .map(id => commonServices.find(s => s.id === id)?.label || id)
        .join(', ');
      
      const servicesText = doc.splitTextToSize(includedServiceLabels, contentWidth);
      doc.text(servicesText, marginLeft, y);
      y += servicesText.length * 5;
    }
    
    // Process details (technical specs) if available
    if (quotation.processDetails) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('DETALHES DO PROCESSO:', marginLeft, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const processText = doc.splitTextToSize(quotation.processDetails, contentWidth);
      doc.text(processText, marginLeft, y);
      y += processText.length * 5;
    }
    
    // 4. Notes and general conditions if provided
    if (quotation.notes) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('OBSERVAÇÕES E CONDIÇÕES GERAIS:', marginLeft, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const notesText = doc.splitTextToSize(quotation.notes, contentWidth);
      doc.text(notesText, marginLeft, y);
      y += notesText.length * 5;
    }
    
    // 5. Items table - Cost Composition
    y += 5;
    (doc as any).autoTable({
      startY: y,
      head: [
        [
          'Código', 
          'Descrição', 
          'Quant.', 
          'Peso Unitário',
          'Peso Total',
          'Preço Unit. s/ Imposto',
          'Preço Unit. c/ Imposto',
          'Imposto (%)',
          'Valor Total c/ Imposto',
          'Prazo'
        ]
      ],
      body: quotation.items.map(item => {
        const unitPriceWithTax = item.unitPrice + (item.unitPrice * (item.taxRate / 100));
        
        return [
          item.code,
          item.description,
          item.quantity.toString(),
          `${item.unitWeight.toLocaleString('pt-BR')} kg`,
          `${(item.totalWeight || 0).toLocaleString('pt-BR')} kg`,
          formatCurrency(item.unitPrice),
          formatCurrency(unitPriceWithTax),
          `${item.taxRate}%`,
          formatCurrency(item.totalWithTax),
          `${item.leadTimeDays} dias`
        ];
      }),
      foot: [
        [
          '', '', '', '', '', '', '', 'VALOR TOTAL:', 
          formatCurrency(quotation.totalWithTaxes),
          '',
        ]
      ],
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' }, // Code
        1: { cellWidth: 'auto', halign: 'left' }, // Description - LEFT aligned
        2: { cellWidth: 15, halign: 'center' }, // Quantity
        3: { cellWidth: 25, halign: 'center' }, // Unit Weight
        4: { cellWidth: 25, halign: 'center' }, // Total Weight
        5: { cellWidth: 30, halign: 'center' }, // Unit Price without tax
        6: { cellWidth: 30, halign: 'center' }, // Unit Price with tax
        7: { cellWidth: 20, halign: 'center' }, // Tax
        8: { cellWidth: 30, halign: 'center' }, // Total with tax
        9: { cellWidth: 20, halign: 'center' }, // Leadtime days
      },
      margin: { left: marginLeft, right: marginRight },
      showFoot: 'lastPage'  // Only show the total on the last page
    });
    
    // Add contact details, removing signature section
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    if (finalY + 30 > pageHeight) {
      doc.addPage();
      y = 20;
    } else {
      y = finalY;
    }
    
    // Add contact information
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('CONTATO PARA INFORMAÇÕES ADICIONAIS:', marginLeft, y);
    y += 8;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(companyResponsible || 'Responsável comercial', marginLeft, y);
    y += 6;
    doc.text(quotation.contactPerson ? `Contato cliente: ${quotation.contactPerson}` : '', marginLeft, y);
    
    // Add footer with date and page number
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        marginLeft, 
        pageHeight - 10
      );
      
      // Add the website in the center of the footer
      doc.text(
        'www.mecald.com.br',
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
      
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth - marginRight, 
        pageHeight - 10, 
        { align: 'right' }
      );
      
      // Reset text color
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save(`orcamento-${quotation.number}-${quotation.customerName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  // Função para duplicar orçamento
  const handleDuplicateQuotation = async (quotation: Quotation) => {
    // Buscar próximo número sequencial
    const nextNumber = await getNextQuoteNumber();
    // Criar novo orçamento com as mesmas informações, mas novo número e status draft
    const duplicatedQuotation: Quotation = {
      ...quotation,
      id: 'new',
      number: nextNumber,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedAt: undefined,
      rejectedAt: undefined,
      expiresAt: undefined,
      convertedToOrderId: undefined,
    };
    setSelectedQuotation(duplicatedQuotation);
    setIsModalOpen(true);
  };

  // Filter quotations based on search term, status, customer, and date range
  const filteredQuotations = quotations.filter(quotation => {
    // Apply search filter
    const matchesSearch = !searchTerm || 
      quotation.number.includes(searchTerm) ||
      quotation.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply status filter
    const matchesStatus = statusFilter.length === 0 || 
      statusFilter.includes(quotation.status);
    
    // Apply customer filter
    const matchesCustomer = !customerFilter || 
      quotation.customerId === customerFilter;
    
    // Apply date range filter
    let matchesDateRange = true;
    
    if (dateRangeFilter.start) {
      const startDate = new Date(dateRangeFilter.start);
      const quotationDate = new Date(quotation.createdAt);
      if (isAfter(startDate, quotationDate)) {
        matchesDateRange = false;
      }
    }
    
    if (dateRangeFilter.end) {
      const endDate = new Date(`${dateRangeFilter.end}T23:59:59`);
      const quotationDate = new Date(quotation.createdAt);
      if (isAfter(quotationDate, endDate)) {
        matchesDateRange = false;
      }
    }
    
    return matchesSearch && matchesStatus && matchesCustomer && matchesDateRange;
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Rascunho';
      case 'sent': return 'Aguardando aprovação';
      case 'approved': return 'Aprovado';
      case 'rejected': return 'Reprovado';
      case 'expired': return 'Informativo';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        status === 'draft' ? 'bg-gray-100 text-gray-800' :
        status === 'sent' ? 'bg-blue-100 text-blue-800' :
        status === 'approved' ? 'bg-green-100 text-green-800' :
        status === 'rejected' ? 'bg-red-100 text-red-800' :
        'bg-yellow-100 text-yellow-800'
      }`}>
        {status === 'draft' && <FileText className="h-3 w-3 mr-1" />}
        {status === 'sent' && <Clock className="h-3 w-3 mr-1" />}
        {status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
        {status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
        {status === 'expired' && <AlertTriangle className="h-3 w-3 mr-1" />}
        {getStatusLabel(status)}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Orçamentos</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab(activeTab === 'dashboard' ? 'list' : 'dashboard')}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            {activeTab === 'dashboard' ? (
              <>
                <FileText className="h-5 w-5 mr-2" />
                Ver Lista
              </>
            ) : (
              <>
                <Settings className="h-5 w-5 mr-2" />
                Dashboard
              </>
            )}
          </button>
          <button
            onClick={handleAddQuotation}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Novo Orçamento
          </button>
        </div>
      </div>

      {/* Error messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {conversionError && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{conversionError}</p>
              {conversionError.includes("Columns were not properly initialized") && (
                <button
                  onClick={() => navigate('/kanban')}
                  className="mt-2 inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Configurar Kanban
                </button>
              )}
            </div>
            <div className="ml-auto">
              <button 
                onClick={() => setConversionError(null)} 
                className="text-red-700 hover:text-red-900"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <QuotationDashboard />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por número ou cliente..."
                className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button 
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <Filter className="h-5 w-5 mr-2" />
              Filtros
              <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
            </button>

            {(statusFilter.length > 0 || customerFilter || dateRangeFilter.start || dateRangeFilter.end) && (
              <button
                onClick={() => {
                  setStatusFilter([]);
                  setCustomerFilter('');
                  setDateRangeFilter({});
                }}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {filterOpen && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <div className="space-y-2">
                  {['draft', 'sent', 'approved', 'rejected', 'expired'].map(status => (
                    <div key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`status-${status}`}
                        checked={statusFilter.includes(status)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setStatusFilter([...statusFilter, status]);
                          } else {
                            setStatusFilter(statusFilter.filter(s => s !== status));
                          }
                        }}
                        className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor={`status-${status}`} className="ml-2 text-sm text-gray-700">
                        {getStatusLabel(status)}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value="">Todos os clientes</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">De</label>
                    <input
                      type="date"
                      value={dateRangeFilter.start || ''}
                      onChange={(e) => setDateRangeFilter({...dateRangeFilter, start: e.target.value})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Até</label>
                    <input
                      type="date"
                      value={dateRangeFilter.end || ''}
                      onChange={(e) => setDateRangeFilter({...dateRangeFilter, end: e.target.value})}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quotations List */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Carregando orçamentos...</p>
            </div>
          ) : filteredQuotations.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum orçamento encontrado</h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || statusFilter.length > 0 || customerFilter || dateRangeFilter.start || dateRangeFilter.end
                  ? 'Não há orçamentos correspondentes aos filtros aplicados.'
                  : 'Comece criando seu primeiro orçamento.'}
              </p>
              <button
                onClick={handleAddQuotation}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="h-5 w-5 mr-2" />
                Novo Orçamento
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nº
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cliente
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor Total
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Prazo Fab.
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredQuotations.map((quotation, idx) => (
                      <tr 
                        key={quotation.id ? `${quotation.id}-${idx}` : idx}
                        className={`hover:bg-gray-50 ${
                          quotation.status === 'approved' ? 'bg-green-50' :
                          quotation.status === 'rejected' ? 'bg-red-50' :
                          ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            #{quotation.number}
                          </div>
                          {quotation.convertedToOrderId && (
                            <div className="text-xs mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                <ShoppingBag className="h-3 w-3 mr-1" />
                                Convertido em Pedido
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{quotation.customerName}</div>
                          {quotation.contactPerson && (
                            <div className="text-xs text-gray-500">Contato: {quotation.contactPerson}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {format(new Date(quotation.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                          </div>
                          {quotation.approvedAt && (
                            <div className="text-xs text-green-600">
                              Aprovado: {format(new Date(quotation.approvedAt), 'dd/MM/yyyy', { locale: ptBR })}
                            </div>
                          )}
                          {quotation.rejectedAt && (
                            <div className="text-xs text-red-600">
                              Rejeitado: {format(new Date(quotation.rejectedAt), 'dd/MM/yyyy', { locale: ptBR })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(quotation.totalWithTaxes)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {quotation.items.length} {quotation.items.length === 1 ? 'item' : 'itens'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(quotation.status)}
                          {quotation.expiresAt && quotation.status === 'sent' && (
                            <div className="text-xs text-gray-500 mt-1">
                              <Calendar className="h-3 w-3 inline-block mr-1" />
                              Válido até: {format(new Date(quotation.expiresAt), 'dd/MM/yyyy', { locale: ptBR })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {quotation.items.length > 0 
                              ? `${Math.round(quotation.items.reduce((sum, item) => sum + item.leadTimeDays, 0) / quotation.items.length)} dias`
                              : 'N/A'
                            }
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-1">
                          <button
                            onClick={() => handleExportQuotation(quotation)}
                            className="text-gray-600 hover:text-gray-900 inline-block"
                            title="Exportar Orçamento"
                          >
                            <Download className="h-5 w-5" />
                          </button>
                          
                          <button
                            onClick={() => handleEditQuotation(quotation)}
                            className="text-blue-600 hover:text-blue-800 inline-block"
                            title="Editar Orçamento"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          
                          {quotation.status === 'sent' && (
                            <>
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Deseja aprovar o orçamento #${quotation.number}?`)) {
                                    try {
                                      await approveQuotation(quotation.id);
                                      alert('Orçamento aprovado com sucesso!');
                                    } catch (error) {
                                      console.error('Error approving quotation:', error);
                                      alert('Erro ao aprovar orçamento.');
                                    }
                                  }
                                }}
                                className="text-green-600 hover:text-green-800 inline-block"
                                title="Aprovar Orçamento"
                              >
                                <CheckCircle className="h-5 w-5" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Deseja rejeitar o orçamento #${quotation.number}?`)) {
                                    try {
                                      await rejectQuotation(quotation.id);
                                      alert('Orçamento rejeitado.');
                                    } catch (error) {
                                      console.error('Error rejecting quotation:', error);
                                      alert('Erro ao rejeitar orçamento.');
                                    }
                                  }
                                }}
                                className="text-red-600 hover:text-red-800 inline-block"
                                title="Rejeitar Orçamento"
                              >
                                <XCircle className="h-5 w-5" />
                              </button>
                            </>
                          )}
                          {quotation.status === 'approved' && !quotation.convertedToOrderId && (
                            <button
                              onClick={async () => {
                                if (window.confirm(`Deseja converter o orçamento #${quotation.number} em pedido?`)) {
                                  try {
                                    // Clear any previous error
                                    setConversionError(null);
                                    
                                    // Ensure columns exist before proceeding - FIXED: Properly await initialization
                                    await checkColumnsExist();
                                    
                                    const orderId = await convertToOrder(quotation.id);
                                    alert(`Orçamento convertido em pedido com sucesso! ID: ${orderId}`);
                                    navigate('/orders');
                                  } catch (error) {
                                    console.error('Error converting quotation:', error);
                                    setConversionError("Erro ao converter orçamento em pedido. " + (error instanceof Error ? error.message : "Erro desconhecido."));
                                    alert('Erro ao converter orçamento em pedido. ' + (error instanceof Error ? error.message : "Erro desconhecido."));
                                  }
                                }
                              }}
                              className="text-purple-600 hover:text-purple-800 inline-block"
                              title="Converter em Pedido"
                            >
                              <ShoppingBag className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDuplicateQuotation(quotation)}
                            className="text-gray-600 hover:text-gray-900 inline-block"
                            title="Duplicar Orçamento"
                          >
                            <Copy className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteQuotation(quotation)}
                            className="text-red-600 hover:text-red-800 inline-block"
                            title="Excluir Orçamento"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Quotation Modal */}
      {isModalOpen && (
        <QuotationModal
          quotation={selectedQuotation}
          customers={customers}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedQuotation(null);
          }}
          onSave={handleSaveQuotation}
          onExport={handleExportQuotation}
        />
      )}
    </div>
  );
};

export default Quotations;