import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Column } from '../types/kanban';
import { useColumnStore } from '../store/columnStore';

interface ColumnModalProps {
  column: Column | null;
  onClose: () => void;
  onSave: (column: Column) => void;
}

const ColumnModal: React.FC<ColumnModalProps> = ({ column, onClose, onSave }) => {
  const { columns } = useColumnStore();
  const [columnTitle, setColumnTitle] = useState<string>(column?.title || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (column) {
      setColumnTitle(column.title);
    }
  }, [column]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      // Validate title
      if (!columnTitle.trim()) {
        setError('Por favor, informe um título para a coluna.');
        return;
      }

      // Check if the title is already in use (except for the current column)
      const titleExists = columns.some(c => 
        c.title.toLowerCase() === columnTitle.toLowerCase() && c.id !== column?.id
      );

      if (titleExists) {
        setError('Este nome de coluna já está em uso. Por favor, escolha outro.');
        return;
      }

      onSave({
        id: column?.id || crypto.randomUUID(),
        title: columnTitle,
        order: column?.order || columns.length + 1,
        orders: column?.orders || [],
      });
    } catch (error) {
      console.error('Error submitting column:', error);
      setError('Erro ao salvar coluna. Por favor, tente novamente.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {column ? 'Editar Coluna' : 'Nova Coluna'}
          </h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Título da Coluna
            </label>
            <input
              type="text"
              value={columnTitle}
              onChange={(e) => setColumnTitle(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            />
          </div>

          <div className="flex justify-end space-x-4">
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
    </div>
  );
};

export default ColumnModal;