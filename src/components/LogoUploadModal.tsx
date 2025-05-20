import React, { useState } from 'react';
import { X, Upload, Image, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';

interface LogoUploadModalProps {
  onClose: () => void;
}

const LogoUploadModal: React.FC<LogoUploadModalProps> = ({ onClose }) => {
  const { companyLogo, setCompanyLogo } = useSettingsStore();
  const [previewLogo, setPreviewLogo] = useState<string | null>(companyLogo);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreviewLogo(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLogo = () => {
    setCompanyLogo(previewLogo);
    onClose();
  };

  const handleClearLogo = () => {
    setPreviewLogo(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Logo da Empresa</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <p className="text-gray-600 mb-6">
          Faça upload da logo da sua empresa para ser exibida em todos os relatórios gerados. 
          Recomendamos uma imagem no formato PNG ou JPEG com tamanho aproximado de 400x200 pixels.
        </p>
        
        <div 
          className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {previewLogo ? (
            <div className="flex flex-col items-center">
              <div className="mb-4 border p-4 bg-gray-50 rounded">
                <img 
                  src={previewLogo} 
                  alt="Logo preview" 
                  className="max-h-40 max-w-full object-contain"
                />
              </div>
              <button 
                onClick={handleClearLogo}
                className="flex items-center px-3 py-1 text-sm text-red-600 hover:text-red-800"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remover logo
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Image className="h-16 w-16 text-gray-400 mb-4" />
              <p className="text-gray-500 mb-4">Arraste e solte sua logo aqui ou clique para selecionar</p>
              <label className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                <Upload className="h-5 w-5 inline-block mr-2" />
                Selecionar Arquivo
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSaveLogo}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            disabled={!previewLogo}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoUploadModal;