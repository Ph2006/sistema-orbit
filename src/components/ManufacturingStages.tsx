import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';

interface ManufacturingStage {
  id: string;
  name: string;
  description: string;
  order: number;
  active: boolean;
  createdAt: string;
}

// ManufacturingStages component for managing production stages
const ManufacturingStages: React.FC = () => {
  const [stages, setStages] = useState<ManufacturingStage[]>([]);
  const [newStage, setNewStage] = useState({ name: '', description: '', order: 0 });
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState({ name: '', description: '', order: 0 });
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load stages from Firestore on component mount
  useEffect(() => {
    loadStages();
  }, []);

  const loadStages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const stagesRef = collection(db, getCompanyCollection('manufacturingStages'));
      const stagesQuery = query(stagesRef, orderBy('order', 'asc'));
      const snapshot = await getDocs(stagesQuery);
      
      const stagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ManufacturingStage[];
      
      setStages(stagesData);
    } catch (error) {
      console.error('Error loading stages:', error);
      setError('Erro ao carregar etapas de fabricação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStage = async () => {
    if (!newStage.name.trim()) return;
    
    try {
      const stageToAdd = {
        ...newStage,
        order: stages.length + 1,
        active: true,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, getCompanyCollection('manufacturingStages')), stageToAdd);
      
      setStages([...stages, { ...stageToAdd, id: docRef.id }]);
      setNewStage({ name: '', description: '', order: 0 });
    } catch (error) {
      console.error('Error adding stage:', error);
      setError('Erro ao adicionar etapa. Tente novamente.');
    }
  };

  const handleDeleteStage = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta etapa?')) {
      try {
        await deleteDoc(doc(db, getCompanyCollection('manufacturingStages'), id));
        
        const updatedStages = stages.filter(stage => stage.id !== id);
        // Reorder remaining stages
        const reorderedStages = updatedStages.map((stage, index) => ({
          ...stage,
          order: index + 1
        }));
        
        // Update order numbers in Firestore
        await Promise.all(
          reorderedStages.map(stage =>
            updateDoc(doc(db, getCompanyCollection('manufacturingStages'), stage.id), {
              order: stage.order
            })
          )
        );
        
        setStages(reorderedStages);
      } catch (error) {
        console.error('Error deleting stage:', error);
        setError('Erro ao excluir etapa. Tente novamente.');
      }
    }
  };

  const handleEditStage = (id: string) => {
    const stageToEdit = stages.find(stage => stage.id === id);
    if (stageToEdit) {
      setIsEditing(id);
      setEditingStage({ ...stageToEdit });
    }
  };

  const handleSaveEdit = async () => {
    if (!isEditing) return;
    
    try {
      const updatedStage = {
        ...editingStage,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(doc(db, getCompanyCollection('manufacturingStages'), isEditing), updatedStage);
      
      const updatedStages = stages.map(stage => 
        stage.id === isEditing ? { ...stage, ...updatedStage } : stage
      );
      
      setStages(updatedStages);
      setIsEditing(null);
      setEditingStage({ name: '', description: '', order: 0 });
    } catch (error) {
      console.error('Error updating stage:', error);
      setError('Erro ao atualizar etapa. Tente novamente.');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(null);
    setEditingStage({ name: '', description: '', order: 0 });
  };

  const handleMoveStage = async (id: string, direction: 'up' | 'down') => {
    const stageIndex = stages.findIndex(stage => stage.id === id);
    if (
      (direction === 'up' && stageIndex === 0) || 
      (direction === 'down' && stageIndex === stages.length - 1)
    ) {
      return; // Can't move further in this direction
    }
    
    try {
      const newStages = [...stages];
      const targetIndex = direction === 'up' ? stageIndex - 1 : stageIndex + 1;
      
      // Swap the stages
      [newStages[stageIndex], newStages[targetIndex]] = [newStages[targetIndex], newStages[stageIndex]];
      
      // Update order numbers
      const reorderedStages = newStages.map((stage, index) => ({
        ...stage,
        order: index + 1
      }));
      
      // Update order numbers in Firestore
      await Promise.all(
        reorderedStages.map(stage =>
          updateDoc(doc(db, getCompanyCollection('manufacturingStages'), stage.id), {
            order: stage.order
          })
        )
      );
      
      setStages(reorderedStages);
    } catch (error) {
      console.error('Error moving stage:', error);
      setError('Erro ao mover etapa. Tente novamente.');
    }
  };

  const toggleStageExpansion = (id: string) => {
    setExpandedStages(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Sort stages by order
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  if (loading) {
    return (
      <div className="container mx-auto px-4">
        <div className="text-center py-8">
          <p className="text-gray-600">Carregando etapas de fabricação...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4">
        <div className="text-center py-8">
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadStages}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Etapas de Fabricação</h2>
        <p className="text-gray-600 mb-4">
          Configure as etapas do processo de fabricação para acompanhar o progresso dos pedidos.
        </p>
        
        {/* Form to add new stage */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Adicionar Nova Etapa</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Etapa</label>
              <input
                type="text"
                value={newStage.name}
                onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: Corte, Montagem, Pintura..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input
                type="text"
                value={newStage.description}
                onChange={(e) => setNewStage({ ...newStage, description: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                placeholder="Descrição da etapa..."
              />
            </div>
          </div>
          <button
            onClick={handleAddStage}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus size={18} className="mr-2" />
            Adicionar Etapa
          </button>
        </div>
        
        {/* List of existing stages */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Etapas Configuradas</h3>
          
          {sortedStages.length === 0 ? (
            <p className="text-gray-500 italic">Nenhuma etapa configurada. Adicione etapas acima.</p>
          ) : (
            <div className="space-y-4">
              {sortedStages.map((stage) => (
                <div
                  key={stage.id}
                  className={`border ${isEditing === stage.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'} rounded-lg p-4 transition-all`}
                >
                  {isEditing === stage.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Etapa</label>
                          <input
                            type="text"
                            value={editingStage.name}
                            onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                          <input
                            type="text"
                            value={editingStage.description}
                            onChange={(e) => setEditingStage({ ...editingStage, description: e.target.value })}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                      <div className="flex space-x-2 justify-end">
                        <button
                          onClick={handleCancelEdit}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm rounded text-gray-700 bg-white hover:bg-gray-100"
                        >
                          <X size={16} className="mr-1" />
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        >
                          <Save size={16} className="mr-1" />
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-3">
                          <div className="bg-blue-100 text-blue-800 font-semibold rounded-full w-7 h-7 flex items-center justify-center text-sm">
                            {stage.order}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-800 text-lg">{stage.name}</h4>
                            <button 
                              onClick={() => toggleStageExpansion(stage.id)}
                              className="text-sm text-blue-600 hover:underline flex items-center mt-1"
                            >
                              {expandedStages[stage.id] ? (
                                <>
                                  <ChevronUp size={14} className="mr-1" />
                                  Ocultar detalhes
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={14} className="mr-1" />
                                  Ver detalhes
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => handleMoveStage(stage.id, 'up')}
                            disabled={stage.order === 1}
                            className={`p-1 rounded-full ${stage.order === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`}
                            title="Mover para cima"
                          >
                            <ChevronUp size={18} />
                          </button>
                          <button
                            onClick={() => handleMoveStage(stage.id, 'down')}
                            disabled={stage.order === stages.length}
                            className={`p-1 rounded-full ${stage.order === stages.length ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`}
                            title="Mover para baixo"
                          >
                            <ChevronDown size={18} />
                          </button>
                          <button
                            onClick={() => handleEditStage(stage.id)}
                            className="p-1 rounded-full text-blue-600 hover:bg-blue-50"
                            title="Editar"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteStage(stage.id)}
                            className="p-1 rounded-full text-red-600 hover:bg-red-50"
                            title="Excluir"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      
                      {expandedStages[stage.id] && (
                        <div className="mt-3 ml-10 text-gray-600 text-sm">
                          <p><span className="font-medium">Descrição:</span> {stage.description || 'Nenhuma descrição fornecida'}</p>
                          <p className="mt-1"><span className="font-medium">Criado em:</span> {new Date(stage.createdAt).toLocaleString('pt-BR')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManufacturingStages;