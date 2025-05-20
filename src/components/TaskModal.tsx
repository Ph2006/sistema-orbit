import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Task } from '../types/gantt';
import { useTaskStore } from '../store/taskStore';

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task) => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onSave }) => {
  const { tasks } = useTaskStore();
  const [formData, setFormData] = useState<Task>({
    id: task?.id || crypto.randomUUID(),
    name: task?.name || '',
    description: task?.description || '',
    color: task?.color || '#3B82F6',
    order: task?.order || (tasks.length > 0 ? Math.max(...tasks.map(t => t.order)) + 1 : 1),
  });

  // Validate order when tasks change
  useEffect(() => {
    if (!task && tasks.length > 0) {
      setFormData(prev => ({
        ...prev,
        order: Math.max(...tasks.map(t => t.order)) + 1
      }));
    }
  }, [tasks, task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure order is unique
    const existingTask = tasks.find(t => t.order === formData.order && t.id !== formData.id);
    if (existingTask) {
      // If order exists, shift all tasks with equal or higher order up by 1
      const updatedTasks = tasks.map(t => 
        t.order >= formData.order && t.id !== formData.id
          ? { ...t, order: t.order + 1 }
          : t
      );
      
      // Update all shifted tasks in the store
      updatedTasks.forEach(t => {
        if (t.order !== formData.order) {
          useTaskStore.getState().updateTask(t);
        }
      });
    }

    onSave(formData);
  };

  const handleOrderChange = (newOrder: number) => {
    if (newOrder < 1) return;
    setFormData(prev => ({ ...prev, order: newOrder }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {task ? 'Editar Tarefa' : 'Nova Tarefa'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome da Tarefa
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cor
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                className="h-10 w-20 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              />
              <div 
                className="flex-1 h-10 rounded-md border"
                style={{ backgroundColor: formData.color }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ordem
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={formData.order}
                onChange={(e) => handleOrderChange(parseInt(e.target.value))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                min="1"
                required
              />
              <span className="text-sm text-gray-500">
                (Total: {tasks.length})
              </span>
            </div>
            {tasks.length > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                Ordem atual: {tasks.map(t => `${t.name} (${t.order})`).join(', ')}
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;