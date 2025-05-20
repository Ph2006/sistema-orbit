import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronUp, ChevronLeft } from 'lucide-react';
import { InspectionChecklistTemplate, InspectionSection, InspectionItem } from '../types/quality';

interface ChecklistFormProps {
  checklist: InspectionChecklistTemplate | null;
  onSave: (checklist: InspectionChecklistTemplate) => void;
  onCancel: () => void;
}

const ChecklistForm: React.FC<ChecklistFormProps> = ({
  checklist,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<InspectionChecklistTemplate>({
    id: checklist?.id || 'new',
    name: checklist?.name || '',
    description: checklist?.description || '',
    sections: checklist?.sections || [],
    isActive: checklist?.isActive ?? true,
    createdAt: checklist?.createdAt || new Date().toISOString(),
    updatedAt: checklist?.updatedAt || new Date().toISOString(),
    applicableToStages: checklist?.applicableToStages || [],
  });

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(formData.sections.map(section => section.id))
  );

  useEffect(() => {
    if (checklist) {
      setFormData({
        ...checklist,
        updatedAt: new Date().toISOString() // Ensure updatedAt is set to now
      });
      
      // Set expanded sections based on the checklist
      setExpandedSections(new Set(checklist.sections.map(section => section.id)));
    }
  }, [checklist]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const handleAddSection = () => {
    const newSectionId = crypto.randomUUID();
    const newSection: InspectionSection = {
      id: newSectionId,
      name: `Nova Seção ${formData.sections.length + 1}`,
      items: [],
    };

    setFormData(prev => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
    
    // Expand the new section automatically
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      newSet.add(newSectionId);
      return newSet;
    });
  };

  const handleRemoveSection = (sectionId: string) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.filter(section => section.id !== sectionId),
    }));
  };

  const handleSectionNameChange = (sectionId: string, newName: string) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map(section => 
        section.id === sectionId ? { ...section, name: newName } : section
      ),
    }));
  };

  const handleAddItem = (sectionId: string) => {
    const newItem: InspectionItem = {
      id: crypto.randomUUID(),
      description: '',
      type: 'boolean',
      required: true,
      criticalItem: false,
    };

    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map(section => 
        section.id === sectionId 
          ? { ...section, items: [...section.items, newItem] } 
          : section
      ),
    }));
  };

  const handleRemoveItem = (sectionId: string, itemId: string) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map(section => 
        section.id === sectionId 
          ? { ...section, items: section.items.filter(item => item.id !== itemId) } 
          : section
      ),
    }));
  };

  const handleItemChange = (
    sectionId: string,
    itemId: string,
    field: keyof InspectionItem,
    value: any
  ) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map(section => 
        section.id === sectionId 
          ? { 
              ...section, 
              items: section.items.map(item => 
                item.id === itemId 
                  ? { ...item, [field]: value } 
                  : item
              ) 
            } 
          : section
      ),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Update updatedAt timestamp
    const updatedData = {
      ...formData,
      updatedAt: new Date().toISOString()
    };
    onSave(updatedData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold">
            {checklist?.id === 'new' || !checklist
              ? 'Novo Checklist de Inspeção'
              : 'Editar Checklist de Inspeção'}
          </h3>
        </div>
        <button
          onClick={onCancel}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <ChevronLeft className="h-5 w-5 mr-1" />
          Voltar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Checklist
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descrição
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={2}
            />
          </div>
        </div>

        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            id="isActive"
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
            Checklist Ativo
          </label>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h4 className="text-lg font-medium">Seções</h4>
            <button
              type="button"
              onClick={handleAddSection}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 mr-2 inline-block" />
              Adicionar Seção
            </button>
          </div>

          {formData.sections.length === 0 ? (
            <div className="text-center p-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">
                Nenhuma seção adicionada. Clique no botão acima para adicionar uma seção.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.sections.map(section => (
                <div key={section.id} className="border rounded-lg overflow-hidden">
                  <div 
                    className="p-4 bg-gray-50 flex justify-between items-center cursor-pointer"
                    onClick={() => toggleSection(section.id)}
                  >
                    <input
                      type="text"
                      value={section.name}
                      onChange={(e) => handleSectionNameChange(section.id, e.target.value)}
                      className="font-medium bg-transparent border-none focus:ring-0 w-full"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSection(section.id);
                        }}
                        className="p-1 text-red-600 hover:text-red-800 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {expandedSections.has(section.id) ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  {expandedSections.has(section.id) && (
                    <div className="p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h5 className="font-medium text-sm text-gray-700">Itens de Verificação</h5>
                        <button
                          type="button"
                          onClick={() => handleAddItem(section.id)}
                          className="text-sm px-3 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                        >
                          <Plus className="h-4 w-4 inline-block mr-1" />
                          Adicionar Item
                        </button>
                      </div>

                      {section.items.length === 0 ? (
                        <p className="text-center text-sm text-gray-500 py-4">
                          Nenhum item adicionado.
                        </p>
                      ) : (
                        <div className="space-y-3 mt-2">
                          {section.items.map((item, index) => (
                            <div key={item.id} className="border rounded-md p-3 bg-white">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 mr-4">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Descrição do Item
                                  </label>
                                  <input
                                    type="text"
                                    value={item.description}
                                    onChange={(e) => handleItemChange(section.id, item.id, 'description', e.target.value)}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                                    required
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(section.id, item.id)}
                                  className="p-1 text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tipo de Verificação
                                  </label>
                                  <select
                                    value={item.type}
                                    onChange={(e) => handleItemChange(section.id, item.id, 'type', e.target.value)}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                                  >
                                    <option value="boolean">Sim/Não</option>
                                    <option value="numeric">Numérico</option>
                                    <option value="text">Texto</option>
                                  </select>
                                </div>

                                {item.type === 'numeric' && (
                                  <>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Valor Esperado
                                      </label>
                                      <input
                                        type="number"
                                        value={item.expectedValue || ''}
                                        onChange={(e) => handleItemChange(section.id, item.id, 'expectedValue', parseFloat(e.target.value))}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tolerância
                                      </label>
                                      <input
                                        type="number"
                                        value={item.tolerance || ''}
                                        onChange={(e) => handleItemChange(section.id, item.id, 'tolerance', parseFloat(e.target.value))}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                                      />
                                    </div>
                                  </>
                                )}

                                {item.type === 'numeric' && (
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Unidade
                                    </label>
                                    <input
                                      type="text"
                                      value={item.unit || ''}
                                      onChange={(e) => handleItemChange(section.id, item.id, 'unit', e.target.value)}
                                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                                      placeholder="ex: mm, kg, °C"
                                    />
                                  </div>
                                )}

                                {item.type === 'text' && (
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                      Valor Esperado
                                    </label>
                                    <input
                                      type="text"
                                      value={item.expectedValue as string || ''}
                                      onChange={(e) => handleItemChange(section.id, item.id, 'expectedValue', e.target.value)}
                                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center space-x-6 mt-3">
                                <div className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`required-${item.id}`}
                                    checked={item.required}
                                    onChange={(e) => handleItemChange(section.id, item.id, 'required', e.target.checked)}
                                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                                  />
                                  <label htmlFor={`required-${item.id}`} className="ml-2 text-sm text-gray-700">
                                    Obrigatório
                                  </label>
                                </div>
                                
                                <div className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`critical-${item.id}`}
                                    checked={item.criticalItem}
                                    onChange={(e) => handleItemChange(section.id, item.id, 'criticalItem', e.target.checked)}
                                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                                  />
                                  <label htmlFor={`critical-${item.id}`} className="ml-2 text-sm text-gray-700">
                                    Item Crítico
                                  </label>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
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
  );
};

export default ChecklistForm;