import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DocumentTemplate } from '../types/quality';
import { Plus, Edit, Trash2 } from 'lucide-react';
import DocumentTemplateModal from './DocumentTemplateModal';

const DocumentTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const templatesQuery = query(collection(db, 'documentTemplates'));
    const unsubscribe = onSnapshot(templatesQuery, (snapshot) => {
      const templatesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DocumentTemplate[];
      setTemplates(templatesData);
    });

    return () => unsubscribe();
  }, []);

  const handleAddTemplate = () => {
    setSelectedTemplate(null);
    setIsModalOpen(true);
  };

  const handleEditTemplate = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    setIsModalOpen(true);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (isDeleting) return;

    if (window.confirm('Tem certeza que deseja excluir este tipo de documento?')) {
      try {
        setIsDeleting(true);

        // Check if there are any documents using this template
        const documentsQuery = query(
          collection(db, 'qualityDocuments'),
          where('templateId', '==', templateId)
        );
        const documentsSnapshot = await getDocs(documentsQuery);

        if (!documentsSnapshot.empty) {
          // Get all documents using this template
          const documents = documentsSnapshot.docs;
          
          // Ask for confirmation to delete all related documents
          if (window.confirm(`Existem ${documents.length} documento(s) usando este modelo. Deseja excluir todos os documentos relacionados?`)) {
            // Delete all documents first
            const deletePromises = documents.map(async (doc) => {
              // Delete associated validations first
              const validationsQuery = query(
                collection(db, 'documentValidations'),
                where('documentId', '==', doc.id)
              );
              const validationsSnapshot = await getDocs(validationsQuery);
              const validationDeletePromises = validationsSnapshot.docs.map(validationDoc => 
                deleteDoc(validationDoc.ref)
              );
              await Promise.all(validationDeletePromises);
              
              // Then delete the document
              return deleteDoc(doc.ref);
            });
            
            await Promise.all(deletePromises);
            
            // Finally delete the template
            await deleteDoc(doc(db, 'documentTemplates', templateId));
            alert('Tipo de documento e documentos relacionados excluídos com sucesso!');
          } else {
            throw new Error('Operação cancelada pelo usuário.');
          }
        } else {
          // If no documents are using this template, just delete it
          await deleteDoc(doc(db, 'documentTemplates', templateId));
          alert('Tipo de documento excluído com sucesso!');
        }
      } catch (error) {
        console.error('Error deleting template:', error);
        alert(error instanceof Error ? error.message : 'Erro ao excluir tipo de documento. Por favor, tente novamente.');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleSaveTemplate = async (template: DocumentTemplate) => {
    if (isSaving) return;

    try {
      setIsSaving(true);
      const templateData = {
        name: template.name,
        description: template.description,
        required: template.required,
      };

      if (selectedTemplate) {
        // Check if the document exists before updating
        const templateRef = doc(db, 'documentTemplates', selectedTemplate.id);
        const templateDoc = await getDoc(templateRef);

        if (!templateDoc.exists()) {
          throw new Error('O modelo de documento não existe mais. Por favor, crie um novo.');
        }

        await updateDoc(templateRef, templateData);
      } else {
        await addDoc(collection(db, 'documentTemplates'), templateData);
      }

      setIsModalOpen(false);
      setSelectedTemplate(null);
      alert('Tipo de documento salvo com sucesso!');
    } catch (error) {
      console.error('Error saving template:', error);
      alert(error instanceof Error ? error.message : 'Erro ao salvar tipo de documento. Por favor, tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold">Tipos de Documentos</h3>
        <button
          onClick={handleAddTemplate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          disabled={isSaving || isDeleting}
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Tipo
        </button>
      </div>

      <div className="space-y-4">
        {templates.map(template => (
          <div
            key={template.id}
            className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium flex items-center">
                  {template.name}
                  {template.required && (
                    <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                      Obrigatório
                    </span>
                  )}
                </h4>
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEditTemplate(template)}
                  className="p-2 hover:bg-gray-200 rounded transition-colors"
                  disabled={isDeleting || isSaving}
                >
                  <Edit className="h-4 w-4 text-gray-600" />
                </button>
                <button
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="p-2 hover:bg-gray-200 rounded transition-colors"
                  disabled={isDeleting || isSaving}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {templates.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            Nenhum tipo de documento cadastrado.
          </p>
        )}
      </div>

      {isModalOpen && (
        <DocumentTemplateModal
          template={selectedTemplate}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTemplate(null);
          }}
          onSave={handleSaveTemplate}
        />
      )}
    </div>
  );
};

export default DocumentTemplates;