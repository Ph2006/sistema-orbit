import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  FileText, 
  Download, 
  Edit, 
  Trash2, 
  BookOpen, 
  X,
  Save,
  Lightbulb,
  Users,
  CalendarIcon,
  AlertTriangle,
  CheckCircle,
  ExternalLink
} from 'lucide-react';
import { collection, query, where, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useAuthStore } from '../store/authStore';
import { Order } from '../types/kanban';

interface Lesson {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  title: string;
  situation: string;
  rootCause: string;
  actionTaken: string;
  preventiveAction: string;
  improvedProcess: string;
  category: 'success' | 'failure' | 'improvement';
  createdAt: string;
  createdBy: string;
  responsible: string;
  status: 'open' | 'implemented' | 'verified';
  verifiedAt?: string;
  verifiedBy?: string;
}

interface LessonsLearnedProps {
  order?: Order;
}

const LessonsLearned: React.FC<LessonsLearnedProps> = ({ order }) => {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  
  const { user } = useAuthStore();

  useEffect(() => {
    let lessonsQuery;
    setLoading(true);
    setIndexError(null);
    
    try {
      if (order) {
        // If an order is provided, only load lessons for that order
        // Using try-catch to handle potential index errors
        try {
          lessonsQuery = query(
            collection(db, 'lessonsLearned'),
            where('orderId', '==', order.id),
            orderBy('createdAt', 'desc')
          );
        } catch (error) {
          // Fallback query without orderBy if index error occurs
          console.error("Error creating query:", error);
          lessonsQuery = query(
            collection(db, 'lessonsLearned'),
            where('orderId', '==', order.id)
          );
          setIndexError("https://console.firebase.google.com/v1/r/project/sistema-orbit/firestore/indexes?create_composite=ClRwcm9qZWN0cy9zaXN0ZW1hLW9yYml0L2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9sZXNzb25zTGVhcm5lZC9pbmRleGVzL18QARoLCgdvcmRlcklkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg");
        }
      } else {
        // Otherwise load all lessons
        lessonsQuery = query(
          collection(db, 'lessonsLearned'),
          orderBy('createdAt', 'desc')
        );
      }
      
      const unsubscribe = onSnapshot(lessonsQuery, 
        (snapshot) => {
          const lessonsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Lesson[];
          
          // If we're using the fallback query without orderBy, sort manually
          if (indexError) {
            lessonsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
          
          setLessons(lessonsData);
          setLoading(false);
        },
        (error) => {
          console.error("Error in snapshot listener:", error);
          // Check if the error is about missing index
          if (error.code === 'failed-precondition' && error.message.includes('index')) {
            // Extract the URL from the error message
            const matches = error.message.match(/(https:\/\/console\.firebase\.google\.com\/[^\s]+)/);
            if (matches && matches[1]) {
              setIndexError(matches[1]);
              
              // Fallback: fetch without ordering when index is missing
              const fallbackQuery = query(
                collection(db, 'lessonsLearned'),
                where('orderId', '==', order?.id)
              );
              
              const unsubFallback = onSnapshot(fallbackQuery, (snapshot) => {
                const lessonsData = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
                })) as Lesson[];
                
                // Sort manually since we can't use orderBy
                lessonsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                
                setLessons(lessonsData);
                setLoading(false);
              });
              
              return unsubFallback;
            }
          }
          
          setLoading(false);
        }
      );
      
      return () => unsubscribe();
    } catch (error) {
      console.error("Error setting up query:", error);
      setLoading(false);
      return () => {};
    }
  }, [order?.id]);

  const handleCreateLesson = () => {
    // Prepare a new lesson with default values
    const newLesson: Omit<Lesson, 'id'> = {
      orderId: order?.id || '',
      orderNumber: order?.orderNumber || '',
      customer: order?.customer || '',
      title: '',
      situation: '',
      rootCause: '',
      actionTaken: '',
      preventiveAction: '',
      improvedProcess: '',
      category: 'improvement',
      createdAt: new Date().toISOString(),
      createdBy: user?.email || 'Usuário desconhecido',
      responsible: user?.email || '',
      status: 'open',
    };
    
    setSelectedLesson({ ...newLesson, id: 'new' });
    setIsModalOpen(true);
  };

  const handleEditLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setIsModalOpen(true);
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta lição aprendida?')) {
      try {
        await deleteDoc(doc(db, 'lessonsLearned', lessonId));
        alert('Lição excluída com sucesso!');
      } catch (error) {
        console.error('Error deleting lesson:', error);
        alert('Erro ao excluir lição aprendida.');
      }
    }
  };

  const handleSaveLesson = async (lesson: Lesson) => {
    try {
      if (lesson.id === 'new') {
        // Create new lesson
        const { id, ...lessonData } = lesson;
        await addDoc(collection(db, 'lessonsLearned'), lessonData);
        alert('Lição aprendida adicionada com sucesso!');
      } else {
        // Update existing lesson
        await updateDoc(doc(db, 'lessonsLearned', lesson.id), {
          title: lesson.title,
          situation: lesson.situation,
          rootCause: lesson.rootCause,
          actionTaken: lesson.actionTaken,
          preventiveAction: lesson.preventiveAction,
          improvedProcess: lesson.improvedProcess,
          category: lesson.category,
          responsible: lesson.responsible,
          status: lesson.status,
          verifiedAt: lesson.status === 'verified' && !lesson.verifiedAt ? 
                      new Date().toISOString() : lesson.verifiedAt,
          verifiedBy: lesson.status === 'verified' && !lesson.verifiedBy ?
                      user?.email : lesson.verifiedBy
        });
        alert('Lição aprendida atualizada com sucesso!');
      }
      
      setIsModalOpen(false);
      setSelectedLesson(null);
    } catch (error) {
      console.error('Error saving lesson:', error);
      alert('Erro ao salvar lição aprendida.');
    }
  };

  const handleExportPDF = () => {
    // Create a PDF document
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Registro de Lições Aprendidas', 105, 20, { align: 'center' });
    
    // Add filters information
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    let subtitleText = 'Todas as lições aprendidas';
    if (order) {
      subtitleText = `Lições aprendidas para o pedido #${order.orderNumber} - ${order.customer}`;
    } 
    else if (categoryFilter !== 'all' || statusFilter !== 'all') {
      const categoryText = categoryFilter !== 'all' ? 
                          (categoryFilter === 'success' ? 'Sucessos' : 
                           categoryFilter === 'failure' ? 'Falhas' : 
                           'Melhorias') : '';
      
      const statusText = statusFilter !== 'all' ? 
                         (statusFilter === 'open' ? 'Em aberto' : 
                          statusFilter === 'implemented' ? 'Implementadas' : 
                          'Verificadas') : '';
      
      subtitleText = `Filtro: ${categoryText}${categoryText && statusText ? ' - ' : ''}${statusText}`;
    }
    
    doc.text(subtitleText, 105, 30, { align: 'center' });
    doc.text(`Data de geração: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 105, 35, { align: 'center' });
    
    // Filter lessons based on current filters
    let filteredLessons = [...lessons];
    
    if (categoryFilter !== 'all') {
      filteredLessons = filteredLessons.filter(lesson => lesson.category === categoryFilter);
    }
    
    if (statusFilter !== 'all') {
      filteredLessons = filteredLessons.filter(lesson => lesson.status === statusFilter);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredLessons = filteredLessons.filter(lesson => 
        lesson.title.toLowerCase().includes(term) ||
        lesson.orderNumber.toLowerCase().includes(term) ||
        lesson.customer.toLowerCase().includes(term) ||
        lesson.situation.toLowerCase().includes(term)
      );
    }
    
    // Create a table with the lessons
    (doc as any).autoTable({
      startY: 45,
      head: [['Pedido', 'Categoria', 'Título', 'Responsável', 'Status', 'Data']],
      body: filteredLessons.map(lesson => [
        `#${lesson.orderNumber}`,
        lesson.category === 'success' ? 'Sucesso' : 
        lesson.category === 'failure' ? 'Falha' : 'Melhoria',
        lesson.title,
        lesson.responsible,
        lesson.status === 'open' ? 'Em aberto' :
        lesson.status === 'implemented' ? 'Implementada' : 'Verificada',
        format(new Date(lesson.createdAt), 'dd/MM/yyyy', { locale: ptBR })
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      }
    });
    
    // Add a page for each lesson
    filteredLessons.forEach((lesson, index) => {
      // Add a new page for each lesson
      doc.addPage();
      
      // Add lesson title
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(`Lição Aprendida: ${lesson.title}`, 105, 20, { align: 'center' });
      
      // Add metadata
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      // Add a colored box for metadata
      const boxY = 30;
      const boxHeight = 40;
      
      // Choose background color based on category
      if (lesson.category === 'success') {
        doc.setFillColor(240, 253, 244); // green-50
      } else if (lesson.category === 'failure') {
        doc.setFillColor(254, 242, 242); // red-50
      } else {
        doc.setFillColor(239, 246, 255); // blue-50
      }
      
      doc.rect(20, boxY, 170, boxHeight, 'F');
      
      // Add metadata text
      doc.text(`Pedido: #${lesson.orderNumber} - ${lesson.customer}`, 25, boxY + 10);
      doc.text(`Categoria: ${
        lesson.category === 'success' ? 'Sucesso' : 
        lesson.category === 'failure' ? 'Falha' : 'Melhoria'
      }`, 25, boxY + 20);
      doc.text(`Status: ${
        lesson.status === 'open' ? 'Em aberto' :
        lesson.status === 'implemented' ? 'Implementada' : 'Verificada'
      }`, 25, boxY + 30);
      
      doc.text(`Criado em: ${format(new Date(lesson.createdAt), 'dd/MM/yyyy', { locale: ptBR })}`, 120, boxY + 10);
      doc.text(`Responsável: ${lesson.responsible}`, 120, boxY + 20);
      
      if (lesson.verifiedAt && lesson.status === 'verified') {
        doc.text(`Verificado em: ${format(new Date(lesson.verifiedAt), 'dd/MM/yyyy', { locale: ptBR })}`, 120, boxY + 30);
      }
      
      // Add content
      let y = boxY + boxHeight + 10;
      
      // Situation
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Situação Encontrada:', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      const situationLines = doc.splitTextToSize(lesson.situation, 170);
      doc.text(situationLines, 20, y);
      y += situationLines.length * 6;
      
      // Root Cause
      y += 10;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Causa Raiz:', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      const rootCauseLines = doc.splitTextToSize(lesson.rootCause, 170);
      doc.text(rootCauseLines, 20, y);
      y += rootCauseLines.length * 6;
      
      // Action Taken
      y += 10;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Ação Tomada:', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      const actionTakenLines = doc.splitTextToSize(lesson.actionTaken, 170);
      doc.text(actionTakenLines, 20, y);
      y += actionTakenLines.length * 6;
      
      // Preventive Action
      y += 10;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Ação Preventiva:', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      const preventiveActionLines = doc.splitTextToSize(lesson.preventiveAction, 170);
      doc.text(preventiveActionLines, 20, y);
      y += preventiveActionLines.length * 6;
      
      // Improved Process
      y += 10;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Processo Melhorado:', 20, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      
      const improvedProcessLines = doc.splitTextToSize(lesson.improvedProcess, 170);
      doc.text(improvedProcessLines, 20, y);
    });
    
    // Add page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Página ${i} de ${pageCount}`,
        195, 
        285, 
        { align: 'right' }
      );
      
      // Reset text color for next page
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save('licoes-aprendidas.pdf');
  };

  // Filter lessons based on search and filters
  const filteredLessons = lessons.filter(lesson => {
    const matchesSearch = !searchTerm || 
      lesson.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lesson.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lesson.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lesson.situation.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || lesson.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || lesson.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Function to get appropriate status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Em aberto
          </span>
        );
      case 'implemented':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Implementada
          </span>
        );
      case 'verified':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Verificada
          </span>
        );
      default:
        return null;
    }
  };

  // Function to get category badge
  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'success':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Sucesso
          </span>
        );
      case 'failure':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Falha
          </span>
        );
      case 'improvement':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Lightbulb className="h-3 w-3 mr-1" />
            Melhoria
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {indexError && (
        <div className="p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400 mb-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mr-3 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">Índice do Firestore necessário</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Esta funcionalidade requer a criação de um índice no Firebase. Por favor, clique no link abaixo 
                para criar o índice necessário (você precisa ter acesso de administrador ao projeto).
              </p>
              <a 
                href={indexError} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="mt-2 inline-flex items-center text-sm font-medium text-yellow-800 hover:text-yellow-900"
              >
                Criar índice no Firebase Console
                <ExternalLink className="ml-1 h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      )}
      
      {isModalOpen && selectedLesson ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {selectedLesson.id === 'new' ? 'Nova Lição Aprendida' : 'Editar Lição Aprendida'}
              </h3>
              <button onClick={() => {
                setIsModalOpen(false);
                setSelectedLesson(null);
              }}>
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form className="space-y-6" onSubmit={(e) => {
              e.preventDefault();
              handleSaveLesson(selectedLesson);
            }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Título
                  </label>
                  <input
                    type="text"
                    value={selectedLesson.title}
                    onChange={(e) => setSelectedLesson({
                      ...selectedLesson,
                      title: e.target.value
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pedido
                  </label>
                  <input
                    type="text"
                    value={`#${selectedLesson.orderNumber} - ${selectedLesson.customer}`}
                    disabled={!!order}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 bg-gray-100"
                    readOnly
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoria
                  </label>
                  <select
                    value={selectedLesson.category}
                    onChange={(e) => setSelectedLesson({
                      ...selectedLesson,
                      category: e.target.value as 'success' | 'failure' | 'improvement'
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  >
                    <option value="success">Sucesso</option>
                    <option value="failure">Falha</option>
                    <option value="improvement">Melhoria</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={selectedLesson.status}
                    onChange={(e) => setSelectedLesson({
                      ...selectedLesson,
                      status: e.target.value as 'open' | 'implemented' | 'verified'
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  >
                    <option value="open">Em aberto</option>
                    <option value="implemented">Implementada</option>
                    <option value="verified">Verificada</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Responsável
                  </label>
                  <input
                    type="text"
                    value={selectedLesson.responsible}
                    onChange={(e) => setSelectedLesson({
                      ...selectedLesson,
                      responsible: e.target.value
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Criação
                  </label>
                  <input
                    type="text"
                    value={format(new Date(selectedLesson.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 bg-gray-100"
                    readOnly
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Situação Encontrada
                </label>
                <textarea
                  value={selectedLesson.situation}
                  onChange={(e) => setSelectedLesson({
                    ...selectedLesson,
                    situation: e.target.value
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  rows={4}
                  required
                  placeholder="Descreva a situação, contexto ou problema encontrado"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Causa Raiz
                </label>
                <textarea
                  value={selectedLesson.rootCause}
                  onChange={(e) => setSelectedLesson({
                    ...selectedLesson,
                    rootCause: e.target.value
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  rows={3}
                  required
                  placeholder="Indique a(s) causa(s) raiz identificada(s)"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ação Tomada
                </label>
                <textarea
                  value={selectedLesson.actionTaken}
                  onChange={(e) => setSelectedLesson({
                    ...selectedLesson,
                    actionTaken: e.target.value
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  rows={3}
                  required
                  placeholder="Descreva as ações tomadas para resolver a situação"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ação Preventiva
                </label>
                <textarea
                  value={selectedLesson.preventiveAction}
                  onChange={(e) => setSelectedLesson({
                    ...selectedLesson,
                    preventiveAction: e.target.value
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  rows={3}
                  required
                  placeholder="Descreva as ações preventivas para evitar recorrência"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Processo Melhorado
                </label>
                <textarea
                  value={selectedLesson.improvedProcess}
                  onChange={(e) => setSelectedLesson({
                    ...selectedLesson,
                    improvedProcess: e.target.value
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  rows={3}
                  required
                  placeholder="Descreva os processos que foram melhorados ou atualizados"
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedLesson(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Save className="h-5 w-5 inline-block mr-1" />
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center">
              <BookOpen className="h-6 w-6 mr-2 text-blue-600" />
              {order 
                ? `Lições Aprendidas - Pedido #${order.orderNumber}`
                : 'Lições Aprendidas'}
            </h2>
            <div className="flex space-x-3">
              <button
                onClick={handleExportPDF}
                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <Download className="h-5 w-5 mr-2" />
                Exportar PDF
              </button>
              <button
                onClick={handleCreateLesson}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Nova Lição
              </button>
            </div>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
            <div className="flex items-start">
              <Lightbulb className="h-6 w-6 text-blue-500 mr-3" />
              <div>
                <h3 className="font-medium text-blue-800">Requisito da ISO 9001:2015</h3>
                <p className="text-sm text-blue-700 mt-1">
                  As lições aprendidas são parte do requisito de melhoria contínua (Seção 10) da ISO 9001.
                  Documente experiências, sucessos e falhas para melhorar processos e evitar a repetição de problemas.
                </p>
                {!order && (
                  <p className="text-sm text-blue-700 mt-1">
                    Use os filtros para visualizar lições de todos os pedidos por categoria ou status.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 items-center mb-6">
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por título, pedido ou situação..."
                className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todas as categorias</option>
                <option value="success">Sucessos</option>
                <option value="failure">Falhas</option>
                <option value="improvement">Melhorias</option>
              </select>
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos os status</option>
                <option value="open">Em aberto</option>
                <option value="implemented">Implementadas</option>
                <option value="verified">Verificadas</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Carregando lições aprendidas...</p>
            </div>
          ) : filteredLessons.length === 0 ? (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhuma lição aprendida encontrada
              </h3>
              <p className="text-gray-600 mb-8">
                {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all' 
                  ? 'Não há lições correspondentes aos filtros aplicados.' 
                  : order 
                    ? `Este pedido ainda não possui nenhuma lição aprendida registrada.`
                    : 'Comece registrando sua primeira lição aprendida.'}
              </p>
              <button
                onClick={handleCreateLesson}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center"
              >
                <Plus className="h-5 w-5 mr-2" />
                Registrar Nova Lição
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredLessons.map(lesson => (
                <div
                  key={lesson.id}
                  className="bg-white rounded-lg shadow-lg p-6 border-l-4 hover:shadow-xl transition-shadow duration-200 group relative"
                  style={{ 
                    borderLeftColor: lesson.category === 'success' ? '#22c55e' : 
                                    lesson.category === 'failure' ? '#ef4444' : '#3b82f6'
                  }}
                >
                  <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex space-x-2">
                    <button
                      onClick={() => handleEditLesson(lesson)}
                      className="p-1 rounded hover:bg-gray-100"
                      title="Editar"
                    >
                      <Edit className="h-5 w-5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => handleDeleteLesson(lesson.id)}
                      className="p-1 rounded hover:bg-gray-100"
                      title="Excluir"
                    >
                      <Trash2 className="h-5 w-5 text-red-500" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold line-clamp-1">{lesson.title}</h3>
                    <div className="flex space-x-2">
                      {getCategoryBadge(lesson.category)}
                      {getStatusBadge(lesson.status)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 text-gray-400 mr-2" />
                      <span>
                        <span className="text-gray-500">Pedido:</span> #{lesson.orderNumber}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Users className="h-4 w-4 text-gray-400 mr-2" />
                      <span>
                        <span className="text-gray-500">Responsável:</span> {lesson.responsible}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                      <span>
                        <span className="text-gray-500">Criada em:</span> {format(new Date(lesson.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Situação Encontrada</h4>
                    <p className="text-gray-600 text-sm line-clamp-2">{lesson.situation}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Causa Raiz</h4>
                      <p className="text-gray-600 text-sm line-clamp-3">{lesson.rootCause}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Ação Tomada</h4>
                      <p className="text-gray-600 text-sm line-clamp-3">{lesson.actionTaken}</p>
                    </div>
                  </div>
                  
                  <button 
                    className="mt-4 text-blue-600 hover:text-blue-800 text-sm flex items-center"
                    onClick={() => handleEditLesson(lesson)}
                  >
                    Ver detalhes e editar
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LessonsLearned;