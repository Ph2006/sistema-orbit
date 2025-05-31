import React, { useState, useEffect, useRef } from 'react';
import { X, Edit, Info, Calendar, User, Clock, ListChecks as ListCheck } from 'lucide-react';
import { OrderItem } from '../types/kanban';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, addDays, startOfDay, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import { addWorkingDays } from '../utils/calendar';

interface ManufacturingStage {
  id: string;
  name: string;
  description: string;
  order: number;
  active: boolean;
  defaultDays?: number;
}

interface Stage {
  name: string;
  enabled: boolean;
  days: number;
  startDate: string;
  endDate: string;
  responsible: string;
}

interface ItemProgressModalProps {
  item: OrderItem;
  allItems?: OrderItem[]; // Optional prop to provide all items from the order
  onClose: () => void;
  onSave: (item: OrderItem) => void;
}

const ItemProgressModal: React.FC<ItemProgressModalProps> = ({ 
  item, 
  allItems = [], 
  onClose, 
  onSave 
}) => {
  const { calendar } = useSettingsStore();
  const [stages, setStages] = useState<Stage[]>([]);
  const [availableStages, setAvailableStages] = useState<ManufacturingStage[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>(() => {
    // Initialize progress from item.progress if it exists, otherwise use empty object
    return item.progress || {};
  });

  const [isEditingStages, setIsEditingStages] = useState(false);
  const [editedStages, setEditedStages] = useState<Stage[]>([]);
  const [teamMembers, setTeamMembers] = useState<{id: string; name: string}[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isAddingAllStages, setIsAddingAllStages] = useState(false);
  const [showCopyProgressModal, setShowCopyProgressModal] = useState(false);
  const [selectedSourceItemId, setSelectedSourceItemId] = useState<string>('');
  
  // Default stages list - used only for reference
  const defaultStagesList = [
    'Listagem de materiais',
    'Compra de materiais',
    'Recebimento de materiais',
    'Preparação',
    'Dobra externa',
    'Montagem',
    'Controle dimensional',
    'Solda',
    'Ensaio visual de solda',
    'Ensaio de Ultrassom',
    'Desempeno',
    'Acabamento inicial',
    'Ensaio de Líquido Penetrante',
    'Tratamento térmico',
    'Usinagem',
    'Furação',
    'Montagem de componentes',
    'Acabamento final',
    'Jato',
    'Emborrachamento',
    'Pintura',
    'Controle final',
    'Expedição'
  ];

  useEffect(() => {
    // Extract all stages from allItems
    const stagesFromItems = new Set<string>();
    allItems.forEach(currentItem => {
      if (currentItem.progress) {
        Object.keys(currentItem.progress).forEach(stage => {
          stagesFromItems.add(stage);
        });
      }
      
      if (currentItem.stagePlanning) {
        Object.keys(currentItem.stagePlanning).forEach(stage => {
          stagesFromItems.add(stage);
        });
      }
    });
    
    // Use these stages as a reference when loading available stages
    console.log("Stages found in other items:", Array.from(stagesFromItems));
  }, [allItems]);

  useEffect(() => {
    loadStages();
  }, []);

  useEffect(() => {
    // If an order ID is selected, load its items
    if (item.id) {
      loadTeamMembers();
    }
  }, [item.id]);

  const loadStages = async () => {
    try {
      setLoadingError(null);
      console.log("Loading manufacturing stages for item", item.id);
      
      // Load from database - use orderBy to respect database order
      const stagesSnapshot = await getDocs(
        query(collection(db, 'manufacturingStages'), orderBy('order', 'asc'))
      );
      
      let stagesData: ManufacturingStage[] = [];
      
      if (!stagesSnapshot.empty) {
        stagesData = stagesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ManufacturingStage[];
        
        console.log("Loaded stages from database:", stagesData.length);
      } else {
        console.log("No stages found in database");
      }
      
      setAvailableStages(stagesData);
      
      // Create initial stages from database stages
      if (stagesData.length > 0) {
        const initialStages: Stage[] = [];
        
        // Get existing progress if any
        const existingProgress = item.progress || {};
        
        // Get planning data if any
        const planningData = item.stagePlanning || {};
        
        // Create stages for each available stage from database
        stagesData.forEach(dbStage => {
          // Check if this stage has progress data
          const hasProgress = existingProgress[dbStage.name] !== undefined;
          
          // Get planning data or create default
          const planning = planningData[dbStage.name] || {
            days: dbStage.defaultDays || 1,
            startDate: new Date().toISOString().split('T')[0],
            endDate: addDays(new Date(), dbStage.defaultDays || 1).toISOString().split('T')[0],
            responsible: ''
          };
          
          // Add stage with enabled=false by default
          initialStages.push({
            name: dbStage.name,
            enabled: hasProgress, // Only enable if has progress
            days: planning.days,
            startDate: planning.startDate,
            endDate: planning.endDate,
            responsible: planning.responsible
          });
        });
        
        console.log("Setting initial stages:", initialStages.length);
        setStages(initialStages);
      } else {
        setStages([]);
      }
    } catch (error) {
      console.error('Error loading manufacturing stages:', error);
      setLoadingError('Erro ao carregar etapas de fabricação. Tente novamente ou configure as etapas no módulo de Etapas de Fabricação.');
    }
  };

  const loadTeamMembers = async () => {
    try {
      // Load team members from the database
      const teamSnapshot = await getDocs(collection(db, 'teamMembers'));
      if (!teamSnapshot.empty) {
        const members = teamSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as {id: string; name: string}[];
        setTeamMembers(members);
      }
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  useEffect(() => {
    // When available stages change, update edited stages
    if (stages.length > 0) {
      setEditedStages([...stages]);
    }
  }, [stages]);

  // Calculate next business day
  const getNextBusinessDay = (date: Date): Date => {
    let nextDay = addDays(date, 1);
    while (isWeekend(nextDay)) {
      nextDay = addDays(nextDay, 1);
    }
    return nextDay;
  };

  // Calculate end date based on start date and business days
  const calculateEndDate = (startDate: string, days: number): string => {
    if (!startDate) {
      return addDays(new Date(), days).toISOString().split('T')[0];
    }

    let date;
    try {
      date = new Date(startDate);
      if (isNaN(date.getTime())) {
        date = new Date();
      }
    } catch (e) {
      date = new Date();
    }

    if (days <= 0) {
      return date.toISOString().split('T')[0];
    }

    // Se for menor que 1, termina no mesmo dia
    if (days < 1) {
      return date.toISOString().split('T')[0];
    }

    // Para valores >= 1, somar os dias inteiros em dias úteis
    let diasInteiros = Math.floor(days);
    let fracao = days - diasInteiros;

    // Adiciona os dias inteiros (pulando finais de semana)
    while (diasInteiros > 0) {
      date = addDays(date, 1);
      if (!isWeekend(date)) {
        diasInteiros--;
      }
    }

    // Se houver fração, termina no mesmo dia útil
    // (poderia ser expandido para considerar expediente, mas para maioria dos casos basta isso)
    return date.toISOString().split('T')[0];
  };

  // Recalculate all dates when a stage's days or enabled status changes
  const recalculateDates = (stagesList: Stage[], changedStageName?: string): Stage[] => {
    // Sempre trabalhar só com as etapas habilitadas para o cálculo sequencial
    const enabledStages = stagesList.filter(stage => stage.enabled);
    if (enabledStages.length === 0) return stagesList;
    enabledStages.sort((a, b) => {
      const stageA = availableStages.find(s => s.name === a.name);
      const stageB = availableStages.find(s => s.name === b.name);
      return (stageA?.order || 0) - (stageB?.order || 0);
    });

    // Se não houver etapa alterada, recalcule tudo
    if (!changedStageName) {
      let currentDate;
      try {
        currentDate = new Date(enabledStages[0].startDate);
        if (isNaN(currentDate.getTime())) {
          currentDate = new Date();
        }
      } catch (e) {
        currentDate = new Date();
      }
      for (let i = 0; i < enabledStages.length; i++) {
        const stage = enabledStages[i];
        if (i > 0) {
          const prevStage = enabledStages[i - 1];
          stage.startDate = prevStage.endDate;
        } else {
          stage.startDate = new Date(stage.startDate).toISOString().split('T')[0];
        }
        stage.endDate = calculateEndDate(stage.startDate, stage.days);
      }
      // Atualiza apenas as etapas habilitadas, mantém as desabilitadas intactas
      return stagesList.map(stage => {
        const updatedStage = enabledStages.find(s => s.name === stage.name);
        return updatedStage ? { ...stage, ...updatedStage } : stage;
      });
    }

    // Se houver etapa alterada, recalcule a etapa alterada e todas as seguintes
    const idx = enabledStages.findIndex(s => s.name === changedStageName);
    if (idx === -1) return stagesList;
    // Recalcula a etapa alterada
    enabledStages[idx].endDate = calculateEndDate(enabledStages[idx].startDate, enabledStages[idx].days);
    // Propaga para as seguintes
    for (let i = idx + 1; i < enabledStages.length; i++) {
      const prevStage = enabledStages[i - 1];
      enabledStages[i].startDate = prevStage.endDate;
      enabledStages[i].endDate = calculateEndDate(enabledStages[i].startDate, enabledStages[i].days);
    }
    // Atualiza apenas as etapas habilitadas, mantém as desabilitadas intactas
    return stagesList.map(stage => {
      const updatedStage = enabledStages.find(s => s.name === stage.name);
      return updatedStage ? { ...stage, ...updatedStage } : stage;
    });
  };

  const handleProgressChange = (stageName: string, value: number) => {
    setProgress(prev => ({
      ...prev,
      [stageName]: Math.min(100, Math.max(0, value))
    }));
  };

  const toggleStageEnabled = (stageName: string) => {
    setStages(prev => {
      const updatedStages = prev.map(stage => 
        stage.name === stageName ? { ...stage, enabled: !stage.enabled } : stage
      );
      
      return recalculateDates(updatedStages, stageName);
    });

    // Remove progress for disabled stage
    if (stages.find(s => s.name === stageName)?.enabled) {
      setProgress(prev => {
        const { [stageName]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleStageDaysChange = (stageName: string, days: number) => {
    if (days < 0.1) return;
    
    setStages(prev => {
      const updatedStages = prev.map(stage => 
        stage.name === stageName ? { ...stage, days } : stage
      );
      
      return recalculateDates(updatedStages, stageName);
    });
  };

  const handleStageResponsibleChange = (stageName: string, responsible: string) => {
    setStages(prev => prev.map(stage => 
      stage.name === stageName ? { ...stage, responsible } : stage
    ));
  };

  const handleStageStartDateChange = (stageName: string, startDate: string) => {
    setStages(prev => {
      const stageIndex = prev.findIndex(s => s.name === stageName);
      if (stageIndex === -1) return prev;
      const newStages = [...prev];
      const stage = { ...newStages[stageIndex] };
      stage.startDate = startDate;
      stage.endDate = calculateEndDate(startDate, stage.days);
      newStages[stageIndex] = stage;
      return recalculateDates(newStages, stageName);
    });
  };

  // CORREÇÃO: Função de cópia de progresso corrigida
  const handleCopyProgress = () => {
    if (!selectedSourceItemId) return;
    
    // Find the source item
    const sourceItem = allItems.find(i => i.id === selectedSourceItemId);
    if (!sourceItem || !sourceItem.progress) return;
    
    // Copy progress data
    setProgress({ ...sourceItem.progress });
    
    // Also copy stage planning if available
    if (sourceItem.stagePlanning) {
      // Create new stages array with source item data
      const updatedStages = stages.map(stage => {
        const sourceStagePlan = sourceItem.stagePlanning?.[stage.name];
        
        if (sourceStagePlan) {
          return {
            ...stage,
            enabled: true,
            days: sourceStagePlan.days,
            startDate: sourceStagePlan.startDate,
            endDate: sourceStagePlan.endDate,
            responsible: sourceStagePlan.responsible
          };
        }
        return stage;
      });
      
      setStages(updatedStages);
    }
    
    // Close the copy modal
    setShowCopyProgressModal(false);
  };

  // CORREÇÃO: Função de submit corrigida
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Convert progress to final format, including only enabled stages
      const finalProgress = stages.reduce((acc, stage) => {
        if (stage.enabled) {
          acc[stage.name] = progress[stage.name] || 0;
        }
        return acc;
      }, {} as Record<string, number>);

      // Include stage planning data
      const stagePlanning = stages.reduce((acc, stage) => {
        if (stage.enabled) {
          acc[stage.name] = {
            days: stage.days,
            startDate: stage.startDate,
            endDate: stage.endDate,
            responsible: stage.responsible
          };
        }
        return acc;
      }, {} as Record<string, any>);

      // Calculate overall progress
      const overallProgress = calculateOverallProgress();

      // Update the item with new data
      const updatedItem = {
        ...item,
        progress: finalProgress,
        stagePlanning,
        overallProgress
      };

      console.log('Salvando item com progresso:', updatedItem);
      
      // Call the save function
      await onSave(updatedItem);
      
      console.log('Item salvo com sucesso');
    } catch (error) {
      console.error('Erro ao salvar progresso do item:', error);
      alert('Erro ao salvar progresso. Tente novamente.');
    }
  };

  const handleSaveStages = () => {
    setStages(recalculateDates(editedStages));
    setIsEditingStages(false);
  };

  const getProgressColor = (value: number) => {
    if (value === 100) return 'bg-green-500';
    if (value >= 70) return 'bg-blue-500';
    if (value >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const calculateOverallProgress = () => {
    const enabledStages = stages.filter(stage => stage.enabled);
    if (enabledStages.length === 0) return 0;
    
    const total = enabledStages.reduce((sum, stage) => sum + (progress[stage.name] || 0), 0);
    return Math.round(total / enabledStages.length);
  };

  // Sort stages by their order in the database
  const getSortedStages = (stageList: Stage[]) => {
    return [...stageList].sort((a, b) => {
      const stageA = availableStages.find(s => s.name === a.name);
      const stageB = availableStages.find(s => s.name === b.name);
      return (stageA?.order || 0) - (stageB?.order || 0);
    });
  };
  
  const handleAddAllStages = async () => {
    if (!availableStages || availableStages.length === 0) {
      setLoadingError('Nenhuma etapa de fabricação encontrada. Configure as etapas primeiro.');
      return;
    }
    
    setIsAddingAllStages(true);
    
    try {
      // Create a new list of stages with all active stages enabled
      const updatedStages = [...stages];
      
      // Enable all active stages
      availableStages
        .filter(s => s.active)
        .forEach(stage => {
          const existingStage = updatedStages.find(s => s.name === stage.name);
          if (existingStage) {
            existingStage.enabled = true;
          }
        });
      
      // Recalculate dates for all stages
      const recalculatedStages = recalculateDates(updatedStages);
      setStages(recalculatedStages);
      
      // Initialize progress for all enabled stages if not already set
      const updatedProgress = { ...progress };
      recalculatedStages
        .filter(s => s.enabled)
        .forEach(stage => {
          if (updatedProgress[stage.name] === undefined) {
            updatedProgress[stage.name] = 0;
          }
        });
      
      setProgress(updatedProgress);
    } catch (error) {
      console.error('Error adding all stages:', error);
      setLoadingError('Erro ao adicionar todas as etapas. Tente novamente.');
    } finally {
      setIsAddingAllStages(false);
    }
  };

  // Adicionar método para remover etapa e recalcular datas
  const handleRemoveStage = (stageName: string) => {
    setStages(prev => {
      const updatedStages = prev.filter(stage => stage.name !== stageName);
      return recalculateDates(updatedStages);
    });
  };

  console.log('Itens recebidos em allItems:', allItems.length, allItems);

  if (isEditingStages) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Selecionar Etapas Aplicáveis</h2>
            <button onClick={() => setIsEditingStages(false)}>
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex">
              <div className="flex-shrink-0">
                <Info className="h-5 w-5 text-blue-500" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Selecione as etapas que se aplicam a este item específico. 
                  Etapas não selecionadas não aparecerão no acompanhamento de progresso.
                </p>
              </div>
            </div>
          </div>

          {loadingError && (
            <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Info className="h-5 w-5 text-red-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{loadingError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {editedStages.length > 0 ? (
              getSortedStages(editedStages).map((stage, index) => (
                <div key={stage.name} className="flex items-center border p-3 rounded-lg">
                  <div className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 text-gray-700 font-medium mr-4">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">{stage.name}</span>
                  </div>
                  <div className="flex items-center ml-4">
                    <input
                      type="checkbox"
                      checked={stage.enabled}
                      onChange={() => {
                        setEditedStages(prev => {
                          const newStages = prev.map(s => 
                            s.name === stage.name ? {...s, enabled: !s.enabled} : s
                          );
                          return newStages;
                        });
                      }}
                      className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <label className="ml-2">
                      {stage.enabled ? "Aplicável" : "Não aplicável"}
                    </label>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-gray-500">
                  Nenhuma etapa de fabricação encontrada. 
                  Por favor, configure as etapas no módulo de Etapas de Fabricação.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={() => setIsEditingStages(false)}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveStages}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={editedStages.length === 0}
            >
              Salvar Seleção
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Progresso do Item</h2>
            <p className="text-gray-600">
              Item {item.itemNumber}: {item.code} - {item.description}
            </p>
            <div className="mt-2">
              <div className="text-sm font-medium text-gray-700">
                Progresso Total: {calculateOverallProgress()}%
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full transition-all ${getProgressColor(calculateOverallProgress())}`}
                  style={{ width: `${calculateOverallProgress()}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            {allItems.length > 1 && (
              <button
                onClick={() => setShowCopyProgressModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                title="Copiar Progresso de Outro Item"
              >
                <Duplicate className="h-5 w-5 mr-2" />
                Copiar Progresso
              </button>
            )}
            <button
              onClick={() => setIsEditingStages(true)}
              className="text-blue-600 hover:text-blue-800"
              title="Selecionar Etapas"
            >
              <Edit className="h-6 w-6" />
            </button>
            <button onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {loadingError && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex">
              <div className="flex-shrink-0">
                <Info className="h-5 w-5 text-red-500" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{loadingError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Button to add all standard stages */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex">
            <ListCheck className="h-6 w-6 text-blue-500 mr-3" />
            <div>
              <h3 className="font-medium text-blue-800">Adicionar todas as etapas</h3>
              <p className="text-sm text-blue-700 mt-1">
                Você pode incluir automaticamente todas as etapas padrão de fabricação para este item.
                Isso facilitará o acompanhamento completo do progresso de produção.
              </p>
              <button 
                onClick={handleAddAllStages}
                disabled={isAddingAllStages}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isAddingAllStages 
                  ? 'Adicionando etapas...' 
                  : 'Adicionar todas as etapas padrão'}
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {getSortedStages(stages).length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">
                Nenhuma etapa de fabricação configurada para este item.
                Clique no ícone de edição para selecionar etapas aplicáveis.
              </p>
            </div>
          ) : (
            getSortedStages(stages).filter(stage => stage.enabled).map(stage => (
              <div key={stage.name} className="space-y-2">
                <div className="border-t pt-4 mt-4 first:border-t-0 first:mt-0 first:pt-0">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium text-lg">{stage.name}</h3>
                    <div className="flex items-center space-x-3">
                      <span className={`text-sm px-2 py-1 rounded ${
                        stage.enabled
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {stage.enabled ? 'Executável' : 'Não executável'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleStageEnabled(stage.name)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                
                {stage.enabled && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          Dias Necessários
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={stage.days}
                          onChange={(e) => handleStageDaysChange(stage.name, parseFloat(e.target.value))}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          Data Início
                        </label>
                        <input
                          type="date"
                          value={stage.startDate}
                          onChange={(e) => handleStageStartDateChange(stage.name, e.target.value)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          Data Término
                        </label>
                        <input
                          type="date"
                          value={stage.endDate}
                          readOnly
                          className="w-full rounded-md border-gray-300 bg-gray-100 shadow-sm"
                        />
                      </div>
                      
                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                          <User className="h-4 w-4 mr-1" />
                          Responsável
                        </label>
                        {teamMembers.length > 0 ? (
                          <select
                            value={stage.responsible}
                            onChange={(e) => handleStageResponsibleChange(stage.name, e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                          >
                            <option value="">Selecione um responsável</option>
                            {teamMembers.map(member => (
                              <option key={member.id} value={member.name}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={stage.responsible}
                            onChange={(e) => handleStageResponsibleChange(stage.name, e.target.value)}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                            placeholder="Nome do responsável pela etapa"
                          />
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">Progresso</span>
                        <span className="text-gray-600">{progress[stage.name] || 0}%</span>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={progress[stage.name] || 0}
                          onChange={(e) => handleProgressChange(stage.name, parseInt(e.target.value))}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={progress[stage.name] || 0}
                          onChange={(e) => handleProgressChange(stage.name, parseInt(e.target.value))}
                          className="w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                        />
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
                        <div
                          className={`h-full transition-all ${getProgressColor(progress[stage.name] || 0)}`}
                          style={{ width: `${progress[stage.name] || 0}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}

          <div className="flex justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={onClose}
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

      {/* Copy Progress Modal */}
      {showCopyProgressModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Copiar Progresso de Outro Item</h3>
              <button onClick={() => setShowCopyProgressModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Selecione um item para copiar seu progresso e configurações de etapas.
                Isso irá sobrescrever os dados atuais.
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selecione o Item de Origem
              </label>
              <select
                value={selectedSourceItemId}
                onChange={(e) => setSelectedSourceItemId(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="">Selecione um item</option>
                {allItems
                  .filter(i => i.id !== item.id && i.progress && Object.keys(i.progress).length > 0)
                  .map(i => (
                    <option key={i.id} value={i.id}>
                      Item {i.itemNumber}: {i.code} - {calculateOverallProgresso(i.progress)}%
                    </option>
                  ))
                }
              </select>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCopyProgressModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCopyProgress}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                disabled={!selectedSourceItemId}
              >
                Copiar Progresso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// CORREÇÃO: Helper function to calculate overall progress for an item
const calculateOverallProgresso = (progress?: Record<string, number>): number => {
  if (!progress || Object.keys(progress).length === 0) return 0;
  const values = Object.values(progress);
  return Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
};

// Add Duplicate icon component
const Duplicate = (props: any) => {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="8" width="12" height="12" rx="2" ry="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
};

export default ItemProgressModal;
