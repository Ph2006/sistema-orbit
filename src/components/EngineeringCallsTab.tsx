import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Send, 
  X, 
  Calendar, 
  CalendarClock, 
  Mail, 
  Users, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  FileText,
  Search,
  Filter,
  ChevronDown,
  ExternalLink,
  Download,
  List,
  CheckSquare,
  AlertOctagon,
  PieChart
} from 'lucide-react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, getDoc } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { format, formatDistance, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Order } from '../types/kanban';
import { useAuthStore } from '../store/authStore';
import { EngineeringCall } from '../types/quality';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';

interface EngineeringCallsTabProps {
  selectedOrder: Order | null;
}

const EngineeringCallsTab: React.FC<EngineeringCallsTabProps> = ({ selectedOrder }) => {
  const [calls, setCalls] = useState<EngineeringCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<EngineeringCall | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'all' | 'open' | 'inProgress' | 'completed'>('all');
  const { user } = useAuthStore();
  const { companyLogo, companyName } = useSettingsStore();

  useEffect(() => {
    if (selectedOrder) {
      loadEngineeringCalls(selectedOrder.id);
    }
  }, [selectedOrder]);

  const loadEngineeringCalls = async (orderId: string) => {
    try {
      setLoading(true);
      const callsRef = collection(db, getCompanyCollection('engineeringCalls'));
      const callsQuery = query(callsRef, where('orderId', '==', orderId), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(callsQuery, (snapshot) => {
        const callsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as EngineeringCall[];
        setCalls(callsData);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading engineering calls:', error);
      setLoading(false);
    }
  };

  const filteredCalls = calls.filter(call => {
    // Apply search filter
    const matchesSearch = !searchTerm || 
      call.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply status filter
    const matchesStatus = statusFilter === 'all' || call.status === statusFilter;
    
    // Apply view mode filter
    const matchesViewMode = 
      viewMode === 'all' || 
      (viewMode === 'open' && call.status === 'pending') ||
      (viewMode === 'inProgress' && call.status === 'in-progress') ||
      (viewMode === 'completed' && call.status === 'completed');
    
    return matchesSearch && matchesStatus && matchesViewMode;
  });

  // Categorize calls by status for the view mode
  const openCalls = calls.filter(call => call.status === 'pending');
  const inProgressCalls = calls.filter(call => call.status === 'in-progress');
  const completedCalls = calls.filter(call => call.status === 'completed');

  const handleCreateCall = () => {
    if (!selectedOrder) return;
    
    setSelectedCall({
      id: 'new',
      orderId: selectedOrder.id,
      orderNumber: selectedOrder.orderNumber,
      customer: selectedOrder.customer,
      itemId: selectedOrder.items[0]?.id || '',
      itemNumber: selectedOrder.items[0]?.itemNumber.toString() || '',
      itemCode: selectedOrder.items[0]?.code || '',
      title: '',
      description: '',
      revision: '',
      status: 'pending',
      engineeringEmail: 'engenharia@empresa.com',
      ccEmails: [],
      createdAt: new Date().toISOString(),
      createdBy: user?.email || '',
      respondedAt: '',
      respondedBy: '',
      response: '',
      attachmentUrls: []
    });
    setIsModalOpen(true);
  };

  const handleEditCall = (call: EngineeringCall) => {
    setSelectedCall(call);
    setIsModalOpen(true);
  };

  const handleDeleteCall = async (callId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este chamado para engenharia?')) {
      try {
        await deleteDoc(doc(db, getCompanyCollection('engineeringCalls'), callId));
        alert('Chamado excluído com sucesso!');
      } catch (error) {
        console.error('Error deleting call:', error);
        alert('Erro ao excluir chamado. Por favor, tente novamente.');
      }
    }
  };

  const handleSaveCall = async (call: EngineeringCall) => {
    try {
      if (call.id === 'new') {
        // Create new call
        const { id, ...callData } = call;
        
        // Always set the current time as createdAt
        callData.createdAt = new Date().toISOString();
        
        // Add the call to Firestore
        const docRef = await addDoc(collection(db, getCompanyCollection('engineeringCalls')), callData);
        
        // Simulate sending email
        console.log(`Email sent to ${callData.engineeringEmail} with CC: ${callData.ccEmails.join(', ')}`);
        
        // Show success message to user
        alert('Chamado para engenharia criado com sucesso! Um email foi enviado para o departamento de engenharia.');
      } else {
        // Update existing call
        await updateDoc(doc(db, getCompanyCollection('engineeringCalls'), call.id), {
          title: call.title,
          description: call.description,
          revision: call.revision,
          itemId: call.itemId,
          itemCode: call.itemCode,
          itemNumber: call.itemNumber,
          status: call.status,
          engineeringEmail: call.engineeringEmail,
          ccEmails: call.ccEmails,
          response: call.response,
          attachmentUrls: call.attachmentUrls,
          // Update response information if responding now
          ...(call.status === 'completed' && !call.respondedAt ? {
            respondedAt: new Date().toISOString(),
            respondedBy: user?.email || ''
          } : {})
        });
        
        alert('Chamado atualizado com sucesso!');
      }
      
      setIsModalOpen(false);
      setSelectedCall(null);
    } catch (error) {
      console.error('Error saving engineering call:', error);
      alert('Erro ao salvar chamado. Por favor, tente novamente.');
    }
  };

  const handleExportPDF = (call?: EngineeringCall) => {
    try {
      // Create PDF in landscape mode
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm'
      });
      
      // Get page dimensions
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      let y = 20;
      
      // Add logo if available
      if (companyLogo) {
        doc.addImage(companyLogo, 'JPEG', 15, 10, 40, 20);
        y = 40;
      }
      
      // Add title
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      
      if (call) {
        // Single call export
        doc.text(`CHAMADO PARA ENGENHARIA #${calls.findIndex(c => c.id === call.id) + 1}`, pageWidth / 2, y, { align: 'center' });
      } else {
        // All calls export
        doc.text('CHAMADOS PARA ENGENHARIA', pageWidth / 2, y, { align: 'center' });
      }
      y += 10;
      
      // Add order info
      if (selectedOrder) {
        doc.setFontSize(14);
        doc.setFont(undefined, 'normal');
        doc.text(`Pedido: #${selectedOrder.orderNumber} - ${selectedOrder.customer}`, pageWidth / 2, y, { align: 'center' });
        y += 10;
      }
      
      // Add date
      doc.setFontSize(10);
      doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 15, y);
      
      // Add company name if available
      if (companyName) {
        doc.text(`Empresa: ${companyName}`, pageWidth - 15, y, { align: 'right' });
      }
      y += 10;
      
      if (call) {
        // Exporting a single call with detailed information
        exportSingleCall(doc, call, pageWidth, pageHeight, y);
      } else {
        // Exporting all calls
        // Add table with calls
        (doc as any).autoTable({
          startY: y,
          head: [
            ['Nº', 'Status', 'Data', 'Chamado', 'Código do Item', 'Revisão', 'Responsável', 'Engenharia', 'Prazo']
          ],
          body: filteredCalls.map((call, index) => [
            index + 1, // Enumeration for better tracking
            call.status === 'pending' ? 'Pendente' : 
            call.status === 'in-progress' ? 'Em análise' : 'Concluído',
            format(new Date(call.createdAt), 'dd/MM/yyyy', { locale: ptBR }),
            call.title,
            call.itemCode,
            call.revision || '-',
            call.createdBy,
            call.engineeringEmail + (call.ccEmails && call.ccEmails.length > 0 ? 
              `\nCC: ${call.ccEmails.join(', ')}` : ''),
            call.status === 'completed' ? 
              (call.respondedAt ? format(new Date(call.respondedAt), 'dd/MM/yyyy', { locale: ptBR }) : '-') :
              'Em aberto'
          ]),
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' }, // Nº
            1: { cellWidth: 25 }, // Status
            2: { cellWidth: 25 }, // Data
            3: { cellWidth: 'auto' }, // Chamado
            4: { cellWidth: 25 }, // Código
            5: { cellWidth: 20 }, // Revisão
            6: { cellWidth: 30 }, // Responsável
            7: { cellWidth: 40 }, // Engenharia (emails)
            8: { cellWidth: 25 } // Prazo
          },
          didDrawPage: (data: any) => {
            // Add footer with page number on each page
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(
              `Página ${data.pageNumber} de ${data.pageCount}`,
              pageWidth - 15, 
              pageHeight - 10, 
              { align: 'right' }
            );
            
            // Add date in the footer
            doc.text(
              `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
              15, 
              pageHeight - 10
            );
          }
        });
        
        // If there are calls with responses, add detailed info on new pages
        const callsWithResponse = filteredCalls.filter(call => call.response);
        
        if (callsWithResponse.length > 0) {
          // Add detail pages for each call that has a response
          callsWithResponse.forEach((call, index) => {
            // Add a new page
            doc.addPage();
            exportSingleCall(doc, call, pageWidth, pageHeight, 20, index + 1);
          });
        }
      }
      
      // Save the PDF
      const filename = call 
        ? `chamado_${calls.findIndex(c => c.id === call.id) + 1}_${call.itemCode}.pdf` 
        : `chamados_engenharia_${selectedOrder?.orderNumber || 'todos'}.pdf`;
      
      doc.save(filename);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Erro ao gerar PDF. Por favor, tente novamente.');
    }
  };

  // Helper function for exporting a single call to reduce code duplication
  const exportSingleCall = (
    doc: jsPDF, 
    call: EngineeringCall, 
    pageWidth: number,
    pageHeight: number,
    startY: number,
    callNumber?: number
  ) => {
    let y = startY;

    // Call number and title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    
    // If call number is provided explicitly, use it; otherwise find it in the calls array
    const displayCallNumber = callNumber || (calls.findIndex(c => c.id === call.id) + 1);
    doc.text(`CHAMADO Nº ${displayCallNumber}: ${call.title}`, pageWidth / 2, y, { align: 'center' });
    y += 15;
    
    // Call info in a box
    doc.setFillColor(240, 240, 240);
    doc.rect(15, y, pageWidth - 30, 50, 'F');
    
    // Call details
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Data de Abertura:', 20, y + 8);
    doc.text('Item:', 20, y + 16);
    doc.text('Revisão:', 20, y + 24);
    doc.text('Responsável:', 20, y + 32);
    doc.text('Status:', 20, y + 40);
    
    doc.setFont(undefined, 'normal');
    doc.text(format(new Date(call.createdAt), 'dd/MM/yyyy', { locale: ptBR }), 70, y + 8);
    doc.text(`${call.itemCode} (Item ${call.itemNumber})`, 70, y + 16);
    doc.text(call.revision || 'Não especificada', 70, y + 24);
    doc.text(call.createdBy || '-', 70, y + 32);
    doc.text(
      call.status === 'pending' ? 'Pendente' : 
      call.status === 'in-progress' ? 'Em análise' : 'Concluído',
      70, y + 40
    );
    
    // Email info
    doc.setFont(undefined, 'bold');
    doc.text('Email Engenharia:', pageWidth - 150, y + 8);
    doc.text('Cópia para (CC):', pageWidth - 150, y + 16);
    
    doc.setFont(undefined, 'normal');
    doc.text(call.engineeringEmail, pageWidth - 70, y + 8);
    doc.text(
      call.ccEmails && call.ccEmails.length > 0 ? call.ccEmails.join(', ') : 'Nenhum', 
      pageWidth - 70, y + 16
    );
    
    // Response info
    doc.setFont(undefined, 'bold');
    doc.text('Data de Resposta:', pageWidth - 150, y + 24);
    doc.text('Respondido por:', pageWidth - 150, y + 32);
    doc.text('Dias até Fechamento:', pageWidth - 150, y + 40);
    
    doc.setFont(undefined, 'normal');
    
    // Response date (or projected if not completed)
    const responseDate = call.respondedAt 
      ? format(new Date(call.respondedAt), 'dd/MM/yyyy', { locale: ptBR })
      : 'Pendente';
    doc.text(responseDate, pageWidth - 70, y + 24);
    
    // Who responded
    doc.text(call.respondedBy || 'Pendente', pageWidth - 70, y + 32);
    
    // Days to resolution
    let daysText = 'Pendente';
    if (call.respondedAt && call.createdAt) {
      const days = differenceInDays(new Date(call.respondedAt), new Date(call.createdAt));
      daysText = `${days} dias`;
    }
    doc.text(daysText, pageWidth - 70, y + 40);
    
    y += 60;
    
    // Description
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Descrição do Chamado:', 15, y);
    y += 8;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const descriptionLines = doc.splitTextToSize(call.description, pageWidth - 30);
    doc.text(descriptionLines, 15, y);
    y += descriptionLines.length * 5 + 10;
    
    // Response
    if (call.response) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Resposta da Engenharia:', 15, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const responseLines = doc.splitTextToSize(call.response, pageWidth - 30);
      doc.text(responseLines, 15, y);
      y += responseLines.length * 5 + 10;
    }
    
    // Attachments list
    if (call.attachmentUrls && call.attachmentUrls.length > 0) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Anexos:', 15, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      call.attachmentUrls.forEach((url, idx) => {
        doc.text(`${idx + 1}. ${url}`, 15, y);
        y += 5;
      });
    }
    
    // Add footer
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
      15, 
      pageHeight - 10
    );
    
    doc.text(
      `Página 1`,
      pageWidth - 15, 
      pageHeight - 10, 
      { align: 'right' }
    );
  };

  const getStatusCounts = () => {
    const pending = calls.filter(call => call.status === 'pending').length;
    const inProgress = calls.filter(call => call.status === 'in-progress').length;
    const completed = calls.filter(call => call.status === 'completed').length;
    return { pending, inProgress, completed, total: calls.length };
  };

  const counts = getStatusCounts();

  // Calculate the average resolution time for completed calls
  const calculateAverageResolutionTime = () => {
    const completedCallsWithDates = calls.filter(
      call => call.status === 'completed' && call.respondedAt && call.createdAt
    );
    
    if (completedCallsWithDates.length === 0) return null;
    
    const totalDays = completedCallsWithDates.reduce((total, call) => {
      const created = new Date(call.createdAt);
      const responded = new Date(call.respondedAt!);
      return total + differenceInDays(responded, created);
    }, 0);
    
    return totalDays / completedCallsWithDates.length;
  };

  const averageResolutionTime = calculateAverageResolutionTime();

  const renderCallItem = (call: EngineeringCall, index: number) => {
    // Calculate days open or days to resolution
    let daysInfo = null;
    if (call.status === 'completed' && call.respondedAt) {
      const createdDate = new Date(call.createdAt);
      const respondedDate = new Date(call.respondedAt);
      const days = differenceInDays(respondedDate, createdDate);
      daysInfo = (
        <span className="text-green-600 text-xs ml-3">
          Resolvido em {days} dias
        </span>
      );
    } else {
      const createdDate = new Date(call.createdAt);
      const now = new Date();
      const days = differenceInDays(now, createdDate);
      daysInfo = (
        <span className="text-yellow-600 text-xs ml-3">
          Aberto há {days} dias
        </span>
      );
    }
    
    return (
      <div 
        key={call.id} 
        className={`bg-white rounded-lg shadow-md overflow-hidden border ${
          call.status === 'completed' ? 'border-green-200' : 
          call.status === 'in-progress' ? 'border-blue-200' : 
          'border-yellow-200'
        }`}
      >
        <div className={`p-4 ${
          call.status === 'completed' ? 'bg-green-50' : 
          call.status === 'in-progress' ? 'bg-blue-50' : 
          'bg-yellow-50'
        }`}>
          <div className="flex justify-between">
            <div>
              <div className="flex items-center">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-200 text-gray-800 font-bold mr-2">
                  {index + 1}
                </span>
                <h3 className="font-medium text-lg">{call.title}</h3>
                <span className={`ml-3 px-2 py-0.5 text-xs rounded-full ${
                  call.status === 'completed' ? 'bg-green-100 text-green-800' :
                  call.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {call.status === 'completed' ? 'Concluído' : 
                  call.status === 'in-progress' ? 'Em análise' : 
                  'Em aberto'}
                </span>
                {daysInfo}
              </div>
              
              <p className="text-sm text-gray-600 mt-1">
                Item {call.itemNumber}: {call.itemCode}
              </p>
              
              <p className="text-sm text-gray-600">
                Revisão solicitada: <span className="font-medium">{call.revision || 'Não especificada'}</span>
              </p>
            </div>
            
            <div className="flex items-start space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportPDF(call);
                }}
                className="p-1 text-green-600 hover:bg-green-100 rounded"
                title="Exportar Chamado"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                onClick={() => handleEditCall(call)}
                className="p-1 hover:bg-blue-100 rounded"
                title="Editar chamado"
              >
                <ExternalLink className="h-5 w-5" />
              </button>
              
              {call.status !== 'completed' && (
                <button
                  onClick={() => handleDeleteCall(call.id)}
                  className="p-1 hover:bg-red-100 rounded"
                  title="Excluir chamado"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div className="p-4">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700">Descrição</h4>
            <p className="mt-1 text-sm">{call.description}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="flex items-center mb-1 text-gray-700">
                <Calendar className="h-4 w-4 mr-1 text-gray-500" />
                <span className="font-medium">Aberto em</span>
              </div>
              <div>
                {format(new Date(call.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
              </div>
              <div className="text-xs text-gray-500">{call.createdBy}</div>
            </div>
            
            <div>
              <div className="flex items-center mb-1 text-gray-700">
                <Mail className="h-4 w-4 mr-1 text-gray-500" />
                <span className="font-medium">Envio</span>
              </div>
              <div className="text-sm">
                <div>Para: {call.engineeringEmail}</div>
                {call.ccEmails?.length > 0 && (
                  <div className="text-xs text-gray-500">
                    CC: {call.ccEmails.join(', ')}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              {call.respondedAt ? (
                <>
                  <div className="flex items-center mb-1 text-gray-700">
                    <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                    <span className="font-medium">Respondido em</span>
                  </div>
                  <div>
                    {format(new Date(call.respondedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </div>
                  <div className="text-xs text-gray-500">{call.respondedBy}</div>
                </>
              ) : (
                <>
                  <div className="flex items-center mb-1 text-gray-700">
                    <Clock className="h-4 w-4 mr-1 text-yellow-500" />
                    <span className="font-medium">Aguardando resposta</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Previsão de fechamento: {format(new Date(new Date().setDate(new Date().getDate() + 7)), 'dd/MM/yyyy', { locale: ptBR })}
                  </div>
                </>
              )}
            </div>
          </div>
          
          {call.response && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
              <h4 className="text-sm font-medium text-gray-700">Resposta da Engenharia</h4>
              <p className="mt-1 text-sm">{call.response}</p>
            </div>
          )}
          
          {call.attachmentUrls && call.attachmentUrls.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700">Anexos</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {call.attachmentUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-3 py-2 bg-gray-100 rounded-md text-blue-600 hover:bg-gray-200 text-sm"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Anexo {index + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Chamados para Engenharia</h3>
        <div className="flex space-x-3">
          <button
            onClick={() => handleExportPDF()}
            className="flex items-center px-3 py-1.5 bg-green-100 text-green-800 rounded-md hover:bg-green-200"
            disabled={filteredCalls.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Exportar Todos
          </button>
          <button
            onClick={handleCreateCall}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Novo Chamado
          </button>
        </div>
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
        <div className="flex">
          <CalendarClock className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Chamados para Engenharia</h3>
            <p className="text-sm text-blue-700 mt-1">
              Use este recurso para solicitar revisões, esclarecimentos ou alterações em projetos para o departamento de engenharia.
              Os chamados podem ser acompanhados nesta tela e notificações serão enviadas por email para os envolvidos.
            </p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-gray-500 text-sm">Total de Chamados</p>
              <p className="font-bold text-lg">{counts.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-gray-500 text-sm">Em Aberto</p>
              <p className="font-bold text-lg">{counts.pending}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-lg bg-blue-100">
              <AlertOctagon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-gray-500 text-sm">Em Análise</p>
              <p className="font-bold text-lg">{counts.inProgress}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex items-start">
            <div className="p-2 rounded-lg bg-green-100">
              <CheckSquare className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-gray-500 text-sm">Resolvidos</p>
              <p className="font-bold text-lg">{counts.completed}</p>
              {averageResolutionTime !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  Tempo médio: {averageResolutionTime.toFixed(1)} dias
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setViewMode('all')}
          className={`px-3 py-2 ${viewMode === 'all' 
            ? 'text-blue-600 border-b-2 border-blue-600 font-medium' 
            : 'text-gray-500 hover:text-gray-700'}`}
        >
          <List className="h-4 w-4 inline-block mr-1" />
          Todos ({counts.total})
        </button>
        <button
          onClick={() => setViewMode('open')}
          className={`px-3 py-2 ${viewMode === 'open' 
            ? 'text-yellow-600 border-b-2 border-yellow-600 font-medium' 
            : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Clock className="h-4 w-4 inline-block mr-1" />
          Em Aberto ({counts.pending})
        </button>
        <button
          onClick={() => setViewMode('inProgress')}
          className={`px-3 py-2 ${viewMode === 'inProgress' 
            ? 'text-blue-600 border-b-2 border-blue-600 font-medium' 
            : 'text-gray-500 hover:text-gray-700'}`}
        >
          <AlertOctagon className="h-4 w-4 inline-block mr-1" />
          Em Análise ({counts.inProgress})
        </button>
        <button
          onClick={() => setViewMode('completed')}
          className={`px-3 py-2 ${viewMode === 'completed' 
            ? 'text-green-600 border-b-2 border-green-600 font-medium' 
            : 'text-gray-500 hover:text-gray-700'}`}
        >
          <CheckSquare className="h-4 w-4 inline-block mr-1" />
          Resolvidos ({counts.completed})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar chamado por título ou descrição..."
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

        {statusFilter !== 'all' && (
          <button
            onClick={() => setStatusFilter('all')}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {filterOpen && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            >
              <option value="all">Todos os status</option>
              <option value="pending">Em aberto</option>
              <option value="in-progress">Em análise</option>
              <option value="completed">Concluído</option>
            </select>
          </div>
        </div>
      )}

      {/* List of engineering calls */}
      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Carregando chamados...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum chamado encontrado</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all' || viewMode !== 'all'
                ? 'Não há chamados correspondentes aos filtros aplicados.'
                : 'Nenhum chamado aberto para este pedido. Clique em "Novo Chamado" para abrir uma solicitação para a engenharia.'}
            </p>
          </div>
        ) : (
          filteredCalls.map((call, index) => renderCallItem(call, index))
        )}
      </div>

      {/* Engineering call modal */}
      {isModalOpen && selectedCall && (
        <EngineeringCallModal
          call={selectedCall}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedCall(null);
          }}
          onSave={handleSaveCall}
          selectedOrder={selectedOrder}
        />
      )}
    </div>
  );
};

interface EngineeringCallModalProps {
  call: EngineeringCall;
  onClose: () => void;
  onSave: (call: EngineeringCall) => Promise<void>;
  selectedOrder: Order | null;
}

const EngineeringCallModal: React.FC<EngineeringCallModalProps> = ({
  call,
  onClose,
  onSave,
  selectedOrder
}) => {
  const [formData, setFormData] = useState<EngineeringCall>(call);
  const [newCcEmail, setNewCcEmail] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddCcEmail = () => {
    if (newCcEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCcEmail)) {
      setFormData({
        ...formData,
        ccEmails: [...(formData.ccEmails || []), newCcEmail]
      });
      setNewCcEmail('');
    }
  };

  const handleRemoveCcEmail = (email: string) => {
    setFormData({
      ...formData,
      ccEmails: formData.ccEmails.filter(e => e !== email)
    });
  };

  const handleAddAttachment = () => {
    if (newAttachmentUrl) {
      setFormData({
        ...formData,
        attachmentUrls: [...(formData.attachmentUrls || []), newAttachmentUrl]
      });
      setNewAttachmentUrl('');
    }
  };

  const handleRemoveAttachment = (url: string) => {
    setFormData({
      ...formData,
      attachmentUrls: formData.attachmentUrls?.filter(u => u !== url) || []
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || !formData.engineeringEmail) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving engineering call:', error);
      alert('Erro ao salvar chamado. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">
            {call.id === 'new' ? 'Novo Chamado para Engenharia' : 'Chamado para Engenharia'}
          </h3>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Item selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Item
              </label>
              <select
                value={formData.itemId}
                onChange={(e) => {
                  const selectedItem = selectedOrder?.items.find(item => item.id === e.target.value);
                  if (selectedItem) {
                    setFormData({
                      ...formData,
                      itemId: selectedItem.id,
                      itemNumber: selectedItem.itemNumber.toString(),
                      itemCode: selectedItem.code
                    });
                  }
                }}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              >
                <option value="">Selecione um item</option>
                {selectedOrder?.items.map(item => (
                  <option key={item.id} value={item.id}>
                    Item {item.itemNumber}: {item.code} - {item.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Revision string */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Revisão Solicitada
              </label>
              <input
                type="text"
                value={formData.revision}
                onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                placeholder="ex: Rev.B, 1.2, etc."
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título do Chamado*
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
              placeholder="Ex: Solicitação de revisão de tolerância dimensional"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição Detalhada*
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={4}
              required
              placeholder="Descreva detalhadamente o motivo da solicitação de revisão"
            />
          </div>

          {/* Engineering email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <Mail className="h-4 w-4 mr-1 text-gray-500" />
              Email do Departamento de Engenharia*
            </label>
            <input
              type="email"
              value={formData.engineeringEmail}
              onChange={(e) => setFormData({ ...formData, engineeringEmail: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
              placeholder="engenharia@empresa.com"
            />
          </div>

          {/* CC emails */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <Users className="h-4 w-4 mr-1 text-gray-500" />
              Outros Envolvidos em Cópia (CC)
            </label>
            <div className="flex">
              <input
                type="email"
                value={newCcEmail}
                onChange={(e) => setNewCcEmail(e.target.value)}
                className="flex-1 rounded-l-md border-r-0 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                placeholder="email@exemplo.com"
              />
              <button
                type="button"
                onClick={handleAddCcEmail}
                className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            
            {/* Display CC emails */}
            <div className="mt-2 flex flex-wrap gap-2">
              {formData.ccEmails?.map((email, index) => (
                <div key={index} className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
                  <span className="text-sm">{email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCcEmail(email)}
                    className="ml-2 text-gray-500 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {(!formData.ccEmails || formData.ccEmails.length === 0) && (
                <p className="text-sm text-gray-500">Nenhum destinatário em cópia adicionado</p>
              )}
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anexos (URLs)
            </label>
            <div className="flex">
              <input
                type="url"
                value={newAttachmentUrl}
                onChange={(e) => setNewAttachmentUrl(e.target.value)}
                className="flex-1 rounded-l-md border-r-0 border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://drive.google.com/..."
              />
              <button
                type="button"
                onClick={handleAddAttachment}
                className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            
            {/* Display attachments */}
            <div className="mt-2 flex flex-wrap gap-2">
              {formData.attachmentUrls?.map((url, index) => (
                <div key={index} className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
                  <FileText className="h-4 w-4 mr-1 text-gray-500" />
                  <span className="text-sm truncate max-w-xs">{url}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(url)}
                    className="ml-2 text-gray-500 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {(!formData.attachmentUrls || formData.attachmentUrls.length === 0) && (
                <p className="text-sm text-gray-500">Nenhum anexo adicionado</p>
              )}
            </div>
          </div>

          {/* If editing an existing call */}
          {call.id !== 'new' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Status do Chamado</h3>
              
              <div>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'pending' | 'in-progress' | 'completed' })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value="pending">Em aberto</option>
                  <option value="in-progress">Em análise</option>
                  <option value="completed">Concluído</option>
                </select>
              </div>
              
              {formData.status === 'completed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resposta da Engenharia
                  </label>
                  <textarea
                    value={formData.response}
                    onChange={(e) => setFormData({ ...formData, response: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    rows={4}
                    placeholder="Descreva a solução ou resposta fornecida pela engenharia"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>Salvando...</>
              ) : call.id === 'new' ? (
                <>
                  <Send className="h-5 w-5 mr-2" />
                  Enviar Chamado
                </>
              ) : (
                <>Salvar Chamado</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EngineeringCallsTab;