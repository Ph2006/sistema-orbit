import React, { useState, useEffect } from 'react';
import { 
  Search, 
  File, 
  FileText, 
  Link as LinkIcon, 
  Plus, 
  Edit, 
  Trash2, 
  Download,
  X,
  FolderPlus,
  Folder,
  ChevronUp,
  ChevronDown,
  Users
} from 'lucide-react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCustomerStore } from '../store/customerStore';
import { useSupplierStore } from '../store/supplierStore';

interface InternalDocument {
  id: string;
  title: string;
  code: string;
  description: string;
  version: string;
  documentType: 'procedure' | 'instruction' | 'form' | 'template' | 'other';
  category: string;
  fileUrl: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  authorType: 'company' | 'customer' | 'supplier' | 'other';
  authorId?: string;
  authorName: string;
  revisionDate: string;
}

interface DocumentCategory {
  id: string;
  name: string;
  order: number;
}

const InternalProcedures: React.FC = () => {
  const [documents, setDocuments] = useState<InternalDocument[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<InternalDocument | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  const [newCategory, setNewCategory] = useState({
    name: '',
    order: 0
  });

  // Get customers and suppliers for author selection
  const { customers } = useCustomerStore();
  const { suppliers } = useSupplierStore();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load categories
        const categoriesSnapshot = await getDocs(
          query(collection(db, 'documentCategories'), orderBy('order'))
        );
        
        const categoriesData = categoriesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as DocumentCategory[];
        
        setCategories(categoriesData);
        
        // Create a set of expanded categories (all by default)
        setExpandedCategories(new Set(categoriesData.map(c => c.id)));
        
        // Load documents
        const documentsSnapshot = await getDocs(
          query(collection(db, 'internalDocuments'), orderBy('createdAt', 'desc'))
        );
        
        const documentsData = documentsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as InternalDocument[];
        
        setDocuments(documentsData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading documents:', error);
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  const handleCreateDocument = () => {
    const newDoc: Omit<InternalDocument, 'id'> = {
      title: '',
      code: '',
      description: '',
      version: '1.0',
      documentType: 'procedure',
      category: categories.length > 0 ? categories[0].id : '',
      fileUrl: '',
      isPublic: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'sistema',
      authorType: 'company',
      authorName: '',
      revisionDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
    };
    
    setSelectedDocument({ ...newDoc, id: 'new' });
    setIsModalOpen(true);
  };

  const handleCreateCategory = async () => {
    try {
      if (!newCategory.name.trim()) {
        alert('Por favor, informe um nome para a categoria.');
        return;
      }
      
      // Set order to max order + 1 if not specified
      const order = newCategory.order || Math.max(0, ...categories.map(c => c.order)) + 1;
      
      const docRef = await addDoc(collection(db, 'documentCategories'), {
        name: newCategory.name,
        order
      });
      
      // Add to local state
      setCategories([...categories, { 
        id: docRef.id, 
        name: newCategory.name, 
        order 
      }]);
      
      // Reset form
      setNewCategory({ name: '', order: 0 });
      setIsCategoryModalOpen(false);
      
      alert('Categoria criada com sucesso!');
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Erro ao criar categoria.');
    }
  };

  const handleEditDocument = (document: InternalDocument) => {
    setSelectedDocument(document);
    setIsModalOpen(true);
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este documento?')) {
      try {
        await deleteDoc(doc(db, 'internalDocuments', documentId));
        setDocuments(documents.filter(d => d.id !== documentId));
        alert('Documento excluído com sucesso!');
      } catch (error) {
        console.error('Error deleting document:', error);
        alert('Erro ao excluir documento.');
      }
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta categoria? Os documentos associados serão movidos para a categoria padrão.')) {
      try {
        await deleteDoc(doc(db, 'documentCategories', categoryId));
        
        // Update state
        setCategories(categories.filter(c => c.id !== categoryId));
        
        // If there are documents in this category, we should move them
        // to another category or just remove the category
        const defaultCategory = categories.find(c => c.id !== categoryId);
        
        if (defaultCategory) {
          // Move documents to default category
          const docsToUpdate = documents.filter(d => d.category === categoryId);
          
          for (const document of docsToUpdate) {
            await updateDoc(doc(db, 'internalDocuments', document.id), {
              category: defaultCategory.id,
              updatedAt: new Date().toISOString()
            });
          }
          
          // Update local state
          setDocuments(documents.map(d => 
            d.category === categoryId 
              ? { ...d, category: defaultCategory.id } 
              : d
          ));
        }
        
        alert('Categoria excluída com sucesso!');
      } catch (error) {
        console.error('Error deleting category:', error);
        alert('Erro ao excluir categoria.');
      }
    }
  };

  const handleSaveDocument = async (document: InternalDocument) => {
    try {
      if (document.id === 'new') {
        // Create
        const { id, ...docData } = document;
        
        const docRef = await addDoc(collection(db, 'internalDocuments'), docData);
        
        // Update local state
        setDocuments([...documents, { ...document, id: docRef.id }]);
      } else {
        // Update
        await updateDoc(doc(db, 'internalDocuments', document.id), {
          title: document.title,
          code: document.code,
          description: document.description,
          version: document.version,
          documentType: document.documentType,
          category: document.category,
          fileUrl: document.fileUrl,
          isPublic: document.isPublic,
          updatedAt: new Date().toISOString(),
          authorType: document.authorType,
          authorId: document.authorId,
          authorName: document.authorName,
          revisionDate: document.revisionDate
        });
        
        // Update local state
        setDocuments(documents.map(d => 
          d.id === document.id ? document : d
        ));
      }
      
      setIsModalOpen(false);
      setSelectedDocument(null);
      
      alert(document.id === 'new' ? 'Documento adicionado com sucesso!' : 'Documento atualizado com sucesso!');
    } catch (error) {
      console.error('Error saving document:', error);
      alert('Erro ao salvar documento.');
    }
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = !searchTerm || 
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !categoryFilter || doc.category === categoryFilter;
    const matchesType = !typeFilter || doc.documentType === typeFilter;
    
    return matchesSearch && matchesCategory && matchesType;
  });

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Sem categoria';
  };

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case 'procedure':
        return <FileText className="h-6 w-6 text-blue-500" />;
      case 'instruction':
        return <File className="h-6 w-6 text-green-500" />;
      case 'form':
        return <File className="h-6 w-6 text-purple-500" />;
      case 'template':
        return <File className="h-6 w-6 text-orange-500" />;
      default:
        return <File className="h-6 w-6 text-gray-500" />;
    }
  };

  const getDocumentTypeName = (type: string) => {
    switch (type) {
      case 'procedure':
        return 'Procedimento';
      case 'instruction':
        return 'Instrução de Trabalho';
      case 'form':
        return 'Formulário';
      case 'template':
        return 'Modelo';
      default:
        return 'Outro';
    }
  };

  const getAuthorName = (authorType: string, authorId?: string): string => {
    if (!authorId) return '';
    
    if (authorType === 'customer') {
      const customer = customers.find(c => c.id === authorId);
      return customer?.name || 'Cliente não encontrado';
    }
    
    if (authorType === 'supplier') {
      const supplier = suppliers.find(s => s.id === authorId);
      return supplier?.name || 'Fornecedor não encontrado';
    }
    
    return '';
  };

  const handleDocumentAccess = async (document: InternalDocument) => {
    try {
      const url = new URL(document.fileUrl);
      window.open(url.href, '_blank');
    } catch (error) {
      // Try to assume it's a relative path or malformed URL
      window.open(document.fileUrl, '_blank');
    }
  };

  // Group documents by category for display
  const documentsByCategory = categories.reduce((acc, category) => {
    acc[category.id] = filteredDocuments.filter(doc => doc.category === category.id);
    return acc;
  }, {} as Record<string, InternalDocument[]>);

  // Get uncategorized documents (documents not assigned to any existing category)
  const uncategorizedDocuments = filteredDocuments.filter(doc => 
    !categories.some(category => category.id === doc.category)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Procedimentos Internos</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            <FolderPlus className="h-5 w-5 mr-2" />
            Nova Categoria
          </button>
          <button
            onClick={handleCreateDocument}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Novo Documento
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por título, código ou descrição..."
            className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todos os tipos</option>
            <option value="procedure">Procedimentos</option>
            <option value="instruction">Instruções de Trabalho</option>
            <option value="form">Formulários</option>
            <option value="template">Modelos</option>
            <option value="other">Outros</option>
          </select>
        </div>
        
        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todas as categorias</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow-lg p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Carregando documentos...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="bg-white rounded-lg shadow-lg p-12 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum documento encontrado
          </h3>
          <p className="text-gray-600 mb-8">
            {searchTerm || categoryFilter || typeFilter 
              ? 'Não há documentos correspondentes aos filtros aplicados.' 
              : 'Comece adicionando seu primeiro documento de procedimento interno.'}
          </p>
          <button
            onClick={handleCreateDocument}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Adicionar Documento
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Category View */}
          {!categoryFilter && !searchTerm && !typeFilter ? (
            <>
              {categories.map(category => {
                const categoryDocs = documentsByCategory[category.id] || [];
                const isExpanded = expandedCategories.has(category.id);

                if (categoryDocs.length === 0) return null;
                
                return (
                  <div key={category.id} className="bg-white rounded-lg shadow-lg">
                    <div 
                      className="p-4 bg-gray-50 border-b flex justify-between items-center cursor-pointer"
                      onClick={() => toggleCategory(category.id)}
                    >
                      <div className="flex items-center">
                        <Folder className="h-5 w-5 text-blue-500 mr-2" />
                        <h3 className="font-medium">{category.name}</h3>
                        <span className="ml-3 text-sm text-gray-500">
                          {categoryDocs.length} documento(s)
                        </span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCategory(category.id);
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="divide-y divide-gray-200">
                        {categoryDocs.map(doc => (
                          <div key={doc.id} className="p-4 hover:bg-gray-50 flex items-start">
                            <div className="flex-shrink-0 mr-4">
                              {getDocumentTypeIcon(doc.documentType)}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between">
                                <div>
                                  <h4 className="font-medium text-gray-900">{doc.title}</h4>
                                  <div className="text-sm text-gray-500">
                                    Código: {doc.code} | Versão: {doc.version} | {getDocumentTypeName(doc.documentType)}
                                  </div>
                                  <div className="text-sm text-gray-500 mt-1 flex items-center">
                                    <Users className="h-4 w-4 mr-1" />
                                    Autor: {doc.authorName}
                                  </div>
                                </div>
                                <div className="flex space-x-2">
                                  {doc.fileUrl && (
                                    <button
                                      onClick={() => handleDocumentAccess(doc)}
                                      className="text-blue-600 hover:text-blue-800"
                                      title="Baixar/Abrir"
                                    >
                                      <Download className="h-5 w-5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleEditDocument(doc)}
                                    className="text-gray-600 hover:text-gray-800"
                                    title="Editar"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDocument(doc.id)}
                                    className="text-red-600 hover:text-red-800"
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                </div>
                              </div>
                              <p className="mt-1 text-sm text-gray-600">{doc.description}</p>
                              <div className="mt-2 text-xs text-gray-500">
                                <span className="inline-block mr-3">
                                  Atualizado em {format(new Date(doc.updatedAt), 'dd/MM/yyyy', { locale: ptBR })}
                                </span>
                                <span className="inline-block">
                                  Revisão prevista: {format(new Date(doc.revisionDate), 'dd/MM/yyyy', { locale: ptBR })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Uncategorized Documents */}
              {uncategorizedDocuments.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg">
                  <div className="p-4 bg-gray-50 border-b">
                    <h3 className="font-medium">Sem Categoria</h3>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {uncategorizedDocuments.map(doc => (
                      <div key={doc.id} className="p-4 hover:bg-gray-50 flex items-start">
                        <div className="flex-shrink-0 mr-4">
                          {getDocumentTypeIcon(doc.documentType)}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{doc.title}</h4>
                              <div className="text-sm text-gray-500">
                                Código: {doc.code} | Versão: {doc.version} | {getDocumentTypeName(doc.documentType)}
                              </div>
                              <div className="text-sm text-gray-500 mt-1 flex items-center">
                                <Users className="h-4 w-4 mr-1" />
                                Autor: {doc.authorName}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              {doc.fileUrl && (
                                <button
                                  onClick={() => handleDocumentAccess(doc)}
                                  className="text-blue-600 hover:text-blue-800"
                                  title="Baixar/Abrir"
                                >
                                  <Download className="h-5 w-5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleEditDocument(doc)}
                                className="text-gray-600 hover:text-gray-800"
                                title="Editar"
                              >
                                <Edit className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Excluir"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{doc.description}</p>
                          <div className="mt-2 text-xs text-gray-500">
                            <span className="inline-block mr-3">
                              Atualizado em {format(new Date(doc.updatedAt), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                            <span className="inline-block">
                              Revisão prevista: {format(new Date(doc.revisionDate), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            // List View when filtering
            <div className="bg-white rounded-lg shadow-lg">
              <div className="p-4 bg-gray-50 border-b">
                <h3 className="font-medium">Resultados da Busca</h3>
                <p className="text-sm text-gray-500">
                  {filteredDocuments.length} documento(s) encontrado(s)
                </p>
              </div>
              <div className="divide-y divide-gray-200">
                {filteredDocuments.map(doc => (
                  <div key={doc.id} className="p-4 hover:bg-gray-50 flex items-start">
                    <div className="flex-shrink-0 mr-4">
                      {getDocumentTypeIcon(doc.documentType)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{doc.title}</h4>
                          <div className="text-sm text-gray-500">
                            Código: {doc.code} | Versão: {doc.version} | {getDocumentTypeName(doc.documentType)}
                          </div>
                          <div className="text-sm text-gray-500">
                            Categoria: {getCategoryName(doc.category)}
                          </div>
                          <div className="text-sm text-gray-500 mt-1 flex items-center">
                            <Users className="h-4 w-4 mr-1" />
                            Autor: {doc.authorName}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {doc.fileUrl && (
                            <button
                              onClick={() => handleDocumentAccess(doc)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Baixar/Abrir"
                            >
                              <Download className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEditDocument(doc)}
                            className="text-gray-600 hover:text-gray-800"
                            title="Editar"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-red-600 hover:text-red-800"
                            title="Excluir"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{doc.description}</p>
                      <div className="mt-2 text-xs text-gray-500">
                        <span className="inline-block mr-3">
                          Atualizado em {format(new Date(doc.updatedAt), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                        <span className="inline-block">
                          Revisão prevista: {format(new Date(doc.revisionDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Modal */}
      {isModalOpen && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {selectedDocument.id === 'new' ? 'Novo Documento' : 'Editar Documento'}
              </h3>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedDocument(null);
                }}
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSaveDocument(selectedDocument);
            }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Título do Documento
                  </label>
                  <input
                    type="text"
                    value={selectedDocument.title}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      title: e.target.value
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código do Documento
                  </label>
                  <input
                    type="text"
                    value={selectedDocument.code}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      code: e.target.value
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    placeholder="Ex: PRO-001, IT-002, etc."
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Categoria
                  </label>
                  <select
                    value={selectedDocument.category}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      category: e.target.value
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  >
                    <option value="">Sem categoria</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Documento
                  </label>
                  <select
                    value={selectedDocument.documentType}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      documentType: e.target.value as any
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    required
                  >
                    <option value="procedure">Procedimento</option>
                    <option value="instruction">Instrução de Trabalho</option>
                    <option value="form">Formulário</option>
                    <option value="template">Modelo</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Versão
                  </label>
                  <input
                    type="text"
                    value={selectedDocument.version}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      version: e.target.value
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    placeholder="Ex: 1.0, 2.1, etc."
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data da Próxima Revisão
                  </label>
                  <input
                    type="date"
                    value={selectedDocument.revisionDate.split('T')[0]}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      revisionDate: new Date(e.target.value).toISOString()
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                    required
                  />
                </div>

                {/* Author selection field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Autor
                  </label>
                  <select
                    value={selectedDocument.authorType}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      authorType: e.target.value as 'company' | 'customer' | 'supplier' | 'other',
                      authorId: '',
                      authorName: e.target.value === 'company' ? 'Empresa' : ''
                    })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  >
                    <option value="company">Empresa</option>
                    <option value="customer">Cliente</option>
                    <option value="supplier">Fornecedor</option>
                    <option value="other">Outro</option>
                  </select>
                </div>

                {/* Author selection based on type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Autor
                  </label>
                  {selectedDocument.authorType === 'company' ? (
                    <input
                      type="text"
                      value={selectedDocument.authorName || 'Empresa'}
                      onChange={(e) => setSelectedDocument({
                        ...selectedDocument,
                        authorName: e.target.value
                      })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      required
                    />
                  ) : selectedDocument.authorType === 'customer' ? (
                    <select
                      value={selectedDocument.authorId || ''}
                      onChange={(e) => {
                        const customerId = e.target.value;
                        const customer = customers.find(c => c.id === customerId);
                        setSelectedDocument({
                          ...selectedDocument,
                          authorId: customerId,
                          authorName: customer?.name || ''
                        });
                      }}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      required
                    >
                      <option value="">Selecione um cliente</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  ) : selectedDocument.authorType === 'supplier' ? (
                    <select
                      value={selectedDocument.authorId || ''}
                      onChange={(e) => {
                        const supplierId = e.target.value;
                        const supplier = suppliers.find(s => s.id === supplierId);
                        setSelectedDocument({
                          ...selectedDocument,
                          authorId: supplierId,
                          authorName: supplier?.name || ''
                        });
                      }}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      required
                    >
                      <option value="">Selecione um fornecedor</option>
                      {suppliers.map(supplier => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={selectedDocument.authorName || ''}
                      onChange={(e) => setSelectedDocument({
                        ...selectedDocument,
                        authorName: e.target.value
                      })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      placeholder="Nome do autor"
                      required
                    />
                  )}
                </div>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <textarea
                  value={selectedDocument.description}
                  onChange={(e) => setSelectedDocument({
                    ...selectedDocument,
                    description: e.target.value
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  rows={3}
                  placeholder="Breve descrição do documento e sua aplicação"
                  required
                />
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL do Arquivo
                </label>
                <div className="flex">
                  <div className="flex-1 relative">
                    <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={selectedDocument.fileUrl}
                      onChange={(e) => setSelectedDocument({
                        ...selectedDocument,
                        fileUrl: e.target.value
                      })}
                      className="w-full pl-10 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                      placeholder="URL do documento (Google Drive, SharePoint, etc.)"
                      required
                    />
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Insira um link para o documento. Você pode usar Google Drive, OneDrive, SharePoint ou qualquer outro serviço de armazenamento.
                </p>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={selectedDocument.isPublic}
                    onChange={(e) => setSelectedDocument({
                      ...selectedDocument,
                      isPublic: e.target.checked
                    })}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isPublic" className="ml-2 text-sm text-gray-700">
                    Documento disponível publicamente (sem restrição de acesso)
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setSelectedDocument(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Nova Categoria</h3>
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCategory();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da Categoria
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({
                    ...newCategory,
                    name: e.target.value
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: Gestão da Qualidade, Produção, etc."
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ordem de Exibição
                </label>
                <input
                  type="number"
                  value={newCategory.order || ''}
                  onChange={(e) => setNewCategory({
                    ...newCategory,
                    order: parseInt(e.target.value) || 0
                  })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ordem numérica para exibição (opcional)"
                  min="0"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Define a ordem em que as categorias serão exibidas. Deixe em branco para a categoria ser adicionada no final.
                </p>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InternalProcedures;