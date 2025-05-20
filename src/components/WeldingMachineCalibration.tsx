import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Filter, ChevronDown, Calendar, CheckCircle2, AlertTriangle, Download, Zap, Printer, Sliders, PenTool as Tool, FileText, Info, X } from 'lucide-react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  where, 
  getDoc 
} from 'firebase/firestore';
import { db, getCompanyCollection, storage } from '../lib/firebase';
import { WeldingMachine, WeldingMachineCalibration as CalibrationModel, WeldingMachineParameter } from '../types/quality';
import { format, isPast, addDays, isBefore, parseISO, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { jsPDF } from 'jspdf';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';

// Calibration Report Form Component
const CalibrationReportForm: React.FC<{
  calibration: CalibrationModel | null;
  machines: WeldingMachine[];
  onSave: (calibration: CalibrationModel) => Promise<void>;
  onCancel: () => void;
}> = ({ calibration, machines, onSave, onCancel }) => {
  const { user } = useAuthStore();
  const [formData, setFormData] = useState<CalibrationModel>({
    id: calibration?.id || 'new',
    machineId: calibration?.machineId || '',
    machineName: calibration?.machineName || '',
    serialNumber: calibration?.serialNumber || '',
    model: calibration?.model || '',
    manufacturer: calibration?.manufacturer || '',
    calibrationDate: calibration?.calibrationDate || new Date().toISOString(),
    nextCalibrationDate: calibration?.nextCalibrationDate || addDays(new Date(), 365).toISOString(),
    calibratedBy: calibration?.calibratedBy || user?.email || '',
    calibrationStandard: calibration?.calibrationStandard || 'AWS D1.1',
    parameters: calibration?.parameters || [],
    notes: calibration?.notes || '',
    photos: calibration?.photos || [],
    attachments: calibration?.attachments || [],
    status: calibration?.status || 'valid',
    approvedBy: calibration?.approvedBy || '',
    approvalDate: calibration?.approvalDate || '',
    createdBy: calibration?.createdBy || user?.email || '',
    createdAt: calibration?.createdAt || new Date().toISOString(),
    updatedAt: calibration?.updatedAt || new Date().toISOString()
  });
  
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When machine selection changes, update machine details
  useEffect(() => {
    if (formData.machineId) {
      const machine = machines.find(m => m.id === formData.machineId);
      if (machine) {
        setFormData(prev => ({
          ...prev,
          machineName: machine.name,
          serialNumber: machine.serialNumber,
          model: machine.model,
          manufacturer: machine.manufacturer
        }));
      }
    }
  }, [formData.machineId, machines]);

  // Load photo previews if editing
  useEffect(() => {
    const loadPhotos = async () => {
      if (calibration?.photos && calibration.photos.length > 0) {
        try {
          const urls = await Promise.all(
            calibration.photos.map(async photoPath => {
              if (photoPath.startsWith('http')) {
                return photoPath;
              }
              
              try {
                const url = await getDownloadURL(ref(storage, photoPath));
                return url;
              } catch (error) {
                console.error("Error getting photo URL:", error);
                return photoPath; // Fallback
              }
            })
          );
          
          setPhotoPreviewUrls(urls);
        } catch (error) {
          console.error("Error loading photos:", error);
        }
      }
    };
    
    loadPhotos();
  }, [calibration]);

  // Calculate the next calibration date based on the machine's calibration frequency
  useEffect(() => {
    if (formData.machineId && formData.calibrationDate) {
      const machine = machines.find(m => m.id === formData.machineId);
      if (machine && machine.calibrationFrequency) {
        const calibrationDate = new Date(formData.calibrationDate);
        const nextDate = addDays(calibrationDate, machine.calibrationFrequency);
        setFormData(prev => ({ 
          ...prev, 
          nextCalibrationDate: nextDate.toISOString() 
        }));
      }
    }
  }, [formData.machineId, formData.calibrationDate, machines]);

  const handleAddParameter = () => {
    const newParameter: WeldingMachineParameter = {
      id: crypto.randomUUID(),
      name: '',
      nominalValue: 0,
      measuredValue: 0,
      tolerance: 0,
      unit: 'A', // Default to Amperes for welding machines
      isWithinTolerance: true
    };
    
    setFormData(prev => ({
      ...prev,
      parameters: [...prev.parameters, newParameter]
    }));
  };

  const handleRemoveParameter = (parameterId: string) => {
    setFormData(prev => ({
      ...prev,
      parameters: prev.parameters.filter(p => p.id !== parameterId)
    }));
  };

  const handleParameterChange = (
    parameterId: string,
    field: keyof WeldingMachineParameter,
    value: any
  ) => {
    setFormData(prev => {
      const updatedParameters = prev.parameters.map(param => {
        if (param.id === parameterId) {
          const updatedParam = { ...param, [field]: value };
          
          // Automatically calculate if the parameter is within tolerance
          if (field === 'nominalValue' || field === 'measuredValue' || field === 'tolerance') {
            const nominal = field === 'nominalValue' ? value : param.nominalValue;
            const measured = field === 'measuredValue' ? value : param.measuredValue;
            const tolerance = field === 'tolerance' ? value : param.tolerance;
            
            const lowerBound = nominal - tolerance;
            const upperBound = nominal + tolerance;
            
            updatedParam.isWithinTolerance = measured >= lowerBound && measured <= upperBound;
          }
          
          return updatedParam;
        }
        return param;
      });
      
      return { ...prev, parameters: updatedParameters };
    });
  };

  // Handle photo upload
  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsLoading(true);
    
    try {
      const newPhotoPaths: string[] = [];
      const newPreviewUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Convert to data URL
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        // Compress image
        const compressedDataUrl = await compressImage(dataUrl);
        
        // Upload to Firebase Storage
        const storageRef = ref(storage, `calibrations/${formData.id || 'temp'}/${Date.now()}_${file.name}`);
        await uploadString(storageRef, compressedDataUrl, 'data_url');
        
        // Get the download URL
        const photoUrl = await getDownloadURL(storageRef);
        
        newPhotoPaths.push(storageRef.fullPath);
        newPreviewUrls.push(photoUrl);
      }
      
      // Update form data
      setFormData(prev => ({
        ...prev,
        photos: [...prev.photos, ...newPhotoPaths]
      }));
      
      // Update previews
      setPhotoPreviewUrls(prev => [...prev, ...newPreviewUrls]);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error("Error adding photos:", error);
      setError("Erro ao adicionar fotos. Por favor, tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Utility function to compress image
  const compressImage = async (dataUrl: string, maxWidth = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const width = Math.min(maxWidth, img.width);
        const ratio = width / img.width;
        const height = img.height * ratio;
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl); // Fallback to original if no context
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl); // Fallback to original on error
    });
  };

  // Remove photo
  const handleRemovePhoto = (index: number) => {
    setFormData(prev => {
      const newPhotos = [...prev.photos];
      newPhotos.splice(index, 1);
      return { ...prev, photos: newPhotos };
    });
    
    setPhotoPreviewUrls(prev => {
      const newUrls = [...prev];
      newUrls.splice(index, 1);
      return newUrls;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Validate form data
      if (!formData.machineId || !formData.calibrationDate || !formData.calibratedBy) {
        setError("Por favor, preencha todos os campos obrigatórios.");
        setIsLoading(false);
        return;
      }
      
      if (formData.parameters.length === 0) {
        setError("Adicione pelo menos um parâmetro de calibração.");
        setIsLoading(false);
        return;
      }
      
      // Update machine's last calibration date
      const machineRef = doc(db, getCompanyCollection('weldingMachines'), formData.machineId);
      await updateDoc(machineRef, {
        lastCalibrationDate: formData.calibrationDate,
        nextCalibrationDate: formData.nextCalibrationDate
      });
      
      await onSave(formData);
      setIsLoading(false);
    } catch (error) {
      console.error("Error saving calibration:", error);
      setError("Erro ao salvar calibração. Por favor, tente novamente.");
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">
          {calibration ? 'Editar Calibração' : 'Nova Calibração'}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-gray-100 rounded-full"
          title="Fechar"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Máquina de Solda *
            </label>
            <select
              value={formData.machineId}
              onChange={(e) => setFormData(prev => ({ ...prev, machineId: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
              disabled={!!calibration} // Não permitir mudar a máquina se editando
            >
              <option value="">Selecione uma máquina</option>
              {machines.map(machine => (
                <option key={machine.id} value={machine.id}>
                  {machine.name} - {machine.serialNumber} ({machine.type})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data da Calibração *
            </label>
            <input
              type="date"
              value={formData.calibrationDate.split('T')[0]}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                calibrationDate: new Date(e.target.value).toISOString()
              }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Próxima Calibração *
            </label>
            <input
              type="date"
              value={formData.nextCalibrationDate.split('T')[0]}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                nextCalibrationDate: new Date(e.target.value).toISOString()
              }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Responsável pela Calibração *
            </label>
            <input
              type="text"
              value={formData.calibratedBy}
              onChange={(e) => setFormData(prev => ({ ...prev, calibratedBy: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
              placeholder="Nome do técnico ou empresa"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Norma/Padrão de Calibração
            </label>
            <input
              type="text"
              value={formData.calibrationStandard}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                calibrationStandard: e.target.value 
              }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Ex: AWS D1.1, ISO 17662"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status da Calibração
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                status: e.target.value as 'valid' | 'expired' | 'pending'
              }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            >
              <option value="valid">Válido</option>
              <option value="pending">Pendente de Aprovação</option>
              <option value="expired">Expirado</option>
            </select>
          </div>
        </div>
        
        {/* Parameters Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Parâmetros de Calibração</h3>
            <button
              type="button"
              onClick={handleAddParameter}
              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 inline-block mr-1" />
              Adicionar Parâmetro
            </button>
          </div>
          
          {formData.parameters.length === 0 ? (
            <div className="text-center p-6 bg-gray-50 rounded-lg">
              <p className="text-gray-500">Nenhum parâmetro de calibração adicionado.</p>
              <p className="text-sm text-gray-400 mt-1">Clique no botão acima para adicionar parâmetros.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.parameters.map((parameter, index) => (
                <div 
                  key={parameter.id} 
                  className={`p-4 rounded-lg border ${
                    parameter.isWithinTolerance ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex justify-between">
                    <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Nome do Parâmetro
                        </label>
                        <input
                          type="text"
                          value={parameter.name}
                          onChange={(e) => handleParameterChange(parameter.id, 'name', e.target.value)}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          placeholder="Ex: Corrente de Saída"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Valor Nominal
                        </label>
                        <div className="flex">
                          <input
                            type="number"
                            value={parameter.nominalValue}
                            onChange={(e) => handleParameterChange(parameter.id, 'nominalValue', parseFloat(e.target.value))}
                            className="flex-1 rounded-l-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                            placeholder="0"
                            step="0.01"
                            required
                          />
                          <select
                            value={parameter.unit}
                            onChange={(e) => handleParameterChange(parameter.id, 'unit', e.target.value)}
                            className="rounded-r-md border-l-0 border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm bg-gray-50"
                          >
                            <option value="A">A (Amperes)</option>
                            <option value="V">V (Volts)</option>
                            <option value="Hz">Hz (Hertz)</option>
                            <option value="m/min">m/min (Metros por minuto)</option>
                            <option value="L/min">L/min (Litros por minuto)</option>
                            <option value="°C">°C (Celsius)</option>
                          </select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Valor Medido
                        </label>
                        <input
                          type="number"
                          value={parameter.measuredValue}
                          onChange={(e) => handleParameterChange(parameter.id, 'measuredValue', parseFloat(e.target.value))}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          placeholder="0"
                          step="0.01"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Tolerância (±)
                        </label>
                        <input
                          type="number"
                          value={parameter.tolerance}
                          onChange={(e) => handleParameterChange(parameter.id, 'tolerance', parseFloat(e.target.value))}
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                          placeholder="0"
                          step="0.01"
                          min="0"
                          required
                        />
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleRemoveParameter(parameter.id)}
                      className="ml-4 p-1 text-red-600 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                  
                  <div className="mt-2 text-sm">
                    {parameter.isWithinTolerance ? (
                      <div className="flex items-center text-green-700">
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        <span>Dentro da tolerância ({parameter.nominalValue - parameter.tolerance} - {parameter.nominalValue + parameter.tolerance} {parameter.unit})</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-red-700">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        <span>Fora da tolerância ({parameter.nominalValue - parameter.tolerance} - {parameter.nominalValue + parameter.tolerance} {parameter.unit})</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Observações */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observações
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            rows={3}
            placeholder="Observações adicionais sobre a calibração..."
          />
        </div>
        
        {/* Photos Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Fotos da Calibração
            </label>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleAddPhoto}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Carregando...
                </span>
              ) : (
                <span className="flex items-center">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Fotos
                </span>
              )}
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photoPreviewUrls.map((photoUrl, index) => (
              <div key={index} className="relative group border rounded-lg overflow-hidden h-40">
                <img
                  src={photoUrl}
                  alt={`Foto ${index + 1} da calibração`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="bg-red-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 text-center">
                  Foto {index + 1}
                </div>
              </div>
            ))}
            
            {photoPreviewUrls.length === 0 && (
              <div className="col-span-full text-center py-8 bg-gray-50 rounded-lg">
                <div className="h-12 w-12 mx-auto text-gray-400">
                  <FileText className="h-12 w-12" />
                </div>
                <p className="text-gray-500 mt-2">Nenhuma foto adicionada</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  disabled={isLoading}
                >
                  {isLoading ? 'Carregando...' : 'Adicionar Fotos'}
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
                Salvando...
              </>
            ) : (
              <>
                <span className="mr-2">Salvar Calibração</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

const WeldingMachineCalibration: React.FC = () => {
  const [calibrations, setCalibrations] = useState<CalibrationModel[]>([]);
  const [machines, setMachines] = useState<WeldingMachine[]>([]);
  const [filteredCalibrations, setFilteredCalibrations] = useState<CalibrationModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCalibration, setSelectedCalibration] = useState<CalibrationModel | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [machineFilter, setMachineFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const { companyLogo, companyName, companyResponsible } = useSettingsStore();
  
  // Load calibrations and machines
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load calibrations
        const calibrationsRef = collection(db, getCompanyCollection('weldingMachineCalibrations'));
        const calibrationsQuery = query(calibrationsRef, orderBy('calibrationDate', 'desc'));
        const calibrationsSnapshot = await getDocs(calibrationsQuery);
        
        const calibrationsData = calibrationsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CalibrationModel[];
        
        setCalibrations(calibrationsData);
        setFilteredCalibrations(calibrationsData);
        
        // Load machines
        const machinesRef = collection(db, getCompanyCollection('weldingMachines'));
        const machinesQuery = query(machinesRef, where('status', '!=', 'retired'));
        const machinesSnapshot = await getDocs(machinesQuery);
        
        const machinesData = machinesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as WeldingMachine[];
        
        setMachines(machinesData);
      } catch (error) {
        console.error("Error loading calibrations:", error);
        setError("Erro ao carregar relatórios de calibração.");
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // Apply filters when search term, status filter, or machine filter changes
  useEffect(() => {
    let filtered = [...calibrations];
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(calibration => 
        calibration.machineName.toLowerCase().includes(term) ||
        calibration.serialNumber.toLowerCase().includes(term) ||
        calibration.calibratedBy.toLowerCase().includes(term)
      );
    }
    
    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter(calibration => calibration.status === statusFilter);
    }
    
    // Apply machine filter
    if (machineFilter) {
      filtered = filtered.filter(calibration => calibration.machineId === machineFilter);
    }
    
    setFilteredCalibrations(filtered);
  }, [calibrations, searchTerm, statusFilter, machineFilter]);
  
  const handleSaveCalibration = async (calibration: CalibrationModel) => {
    try {
      setLoading(true);
      setError(null);
      
      // Update machine's last calibration information
      const machineRef = doc(db, getCompanyCollection('weldingMachines'), calibration.machineId);
      await updateDoc(machineRef, {
        lastCalibrationDate: calibration.calibrationDate,
        nextCalibrationDate: calibration.nextCalibrationDate
      });
      
      if (calibration.id === 'new') {
        // Add new calibration
        const { id, ...calibrationData } = calibration;
        
        const docRef = await addDoc(
          collection(db, getCompanyCollection('weldingMachineCalibrations')),
          calibrationData
        );
        
        // Add to state
        setCalibrations(prev => [
          { ...calibration, id: docRef.id },
          ...prev
        ]);
      } else {
        // Update existing calibration
        const calibrationRef = doc(db, getCompanyCollection('weldingMachineCalibrations'), calibration.id);
        const { id, ...calibrationData } = calibration;
        
        await updateDoc(calibrationRef, calibrationData);
        
        // Update state
        setCalibrations(prev => 
          prev.map(c => c.id === calibration.id ? calibration : c)
        );
      }
      
      setShowAddForm(false);
      setSelectedCalibration(null);
    } catch (error) {
      console.error("Error saving calibration:", error);
      setError("Erro ao salvar calibração. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteCalibration = async (id: string) => {
    try {
      if (!window.confirm('Tem certeza que deseja excluir este relatório de calibração?')) {
        return;
      }
      
      setLoading(true);
      
      // Delete the calibration
      const calibrationRef = doc(db, getCompanyCollection('weldingMachineCalibrations'), id);
      await deleteDoc(calibrationRef);
      
      // Update state
      setCalibrations(prev => prev.filter(c => c.id !== id));
      setFilteredCalibrations(prev => prev.filter(c => c.id !== id));
      
      setLoading(false);
    } catch (error) {
      console.error("Error deleting calibration:", error);
      setError("Erro ao excluir calibração. Por favor, tente novamente.");
      setLoading(false);
    }
  };
  
  const handleEditCalibration = (calibration: CalibrationModel) => {
    setSelectedCalibration(calibration);
    setShowAddForm(true);
  };
  
  const getCalibrationStatus = (calibration: CalibrationModel): 'valid' | 'expired' | 'warning' | 'pending' => {
    if (calibration.status === 'pending') return 'pending';
    
    const nextCalibration = new Date(calibration.nextCalibrationDate);
    const today = new Date();
    
    // If next calibration is already past, return 'expired'
    if (isPast(nextCalibration)) return 'expired';
    
    // If next calibration is within 30 days, return 'warning'
    const thirtyDaysFromNow = addDays(today, 30);
    if (isAfter(thirtyDaysFromNow, nextCalibration)) return 'warning';
    
    // Otherwise, return 'valid'
    return 'valid';
  };
  
  const exportCalibrationReport = (calibration: CalibrationModel) => {
    // Create PDF document in portrait mode
    const doc = new jsPDF();
    
    // Set up initial settings
    let y = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', margin, y, 40, 20);
      
      // Add title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('RELATÓRIO DE CALIBRAÇÃO', pageWidth / 2, y + 10, { align: 'center' });
      y += 25;
    } else {
      // If no logo, just add title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('RELATÓRIO DE CALIBRAÇÃO', pageWidth / 2, y, { align: 'center' });
      y += 15;
    }
    
    // Add company name if available
    if (companyName) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(companyName, pageWidth / 2, y, { align: 'center' });
      y += 10;
    }
    
    // Add calibration info box
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, contentWidth, 40, 'F');
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('MÁQUINA:', margin + 5, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${calibration.machineName} | ${calibration.manufacturer} ${calibration.model}`, margin + 45, y + 8);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Nº SÉRIE:', margin + 5, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.text(calibration.serialNumber, margin + 45, y + 16);
    
    doc.setFont('helvetica', 'bold');
    doc.text('DATA CALIBRAÇÃO:', margin + 5, y + 24);
    doc.setFont('helvetica', 'normal');
    doc.text(format(new Date(calibration.calibrationDate), 'dd/MM/yyyy', { locale: ptBR }), margin + 45, y + 24);
    
    doc.setFont('helvetica', 'bold');
    doc.text('PRÓXIMA CALIBRAÇÃO:', margin + 5, y + 32);
    doc.setFont('helvetica', 'normal');
    doc.text(format(new Date(calibration.nextCalibrationDate), 'dd/MM/yyyy', { locale: ptBR }), margin + 45, y + 32);
    
    doc.setFont('helvetica', 'bold');
    doc.text('RESPONSÁVEL:', margin + 110, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(calibration.calibratedBy, margin + 150, y + 8);
    
    doc.setFont('helvetica', 'bold');
    doc.text('NORMA/PADRÃO:', margin + 110, y + 16);
    doc.setFont('helvetica', 'normal');
    doc.text(calibration.calibrationStandard, margin + 150, y + 16);
    
    y += 50;
    
    // Add parameters table
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PARÂMETROS DE CALIBRAÇÃO', margin, y);
    y += 8;
    
    // Create the table for parameters
    (doc as any).autoTable({
      startY: y,
      head: [['Parâmetro', 'Nominal', 'Medido', 'Tolerância', 'Unidade', 'Status']],
      body: calibration.parameters.map(param => [
        param.name,
        param.nominalValue.toString(),
        param.measuredValue.toString(),
        `± ${param.tolerance}`,
        param.unit,
        param.isWithinTolerance ? 'Conforme' : 'Não Conforme'
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246], // Blue
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        5: {
          fontStyle: 'bold',
          halign: 'center'
        }
      },
      createdCell: function(cell: any, data: any) {
        // Color status column based on conformity
        if (data.column.index === 5) {
          if (cell.raw === 'Conforme') {
            cell.styles.fillColor = [240, 250, 240];
            cell.styles.textColor = [34, 197, 94];
          } else {
            cell.styles.fillColor = [254, 242, 242];
            cell.styles.textColor = [220, 38, 38];
          }
        }
      }
    });
    
    // Add observations if any
    y = (doc as any).lastAutoTable.finalY + 15;
    
    if (calibration.notes) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('OBSERVAÇÕES', margin, y);
      y += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Split the text to handle line breaks
      const textLines = doc.splitTextToSize(calibration.notes, contentWidth);
      doc.text(textLines, margin, y);
      y += textLines.length * 6 + 10;
    }
    
    // Add approval section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('APROVAÇÃO', margin, y);
    y += 8;
    
    if (calibration.approvedBy) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Aprovado por: ${calibration.approvedBy}`, margin, y);
      y += 6;
      
      if (calibration.approvalDate) {
        doc.text(`Data de aprovação: ${format(new Date(calibration.approvalDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin, y);
      }
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Pendente de aprovação', margin, y);
      
      // Add signature line
      y += 15;
      doc.line(margin, y, margin + 80, y);
      y += 5;
      doc.text(companyResponsible || 'Responsável Técnico', margin + 20, y);
    }
    
    // Add footer with page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        margin,
        doc.internal.pageSize.getHeight() - 10
      );
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'right' }
      );
      
      // Reset text color
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    const machine = machines.find(m => m.id === calibration.machineId);
    const filename = `calibracao_${machine?.name.replace(/\s+/g, '_') || calibration.machineName}_${format(new Date(calibration.calibrationDate), 'dd-MM-yyyy')}.pdf`;
    doc.save(filename);
  };
  
  // Helper function to get status color and info
  const getStatusInfo = (status: 'valid' | 'expired' | 'warning' | 'pending') => {
    switch (status) {
      case 'valid':
        return {
          bgColor: 'bg-green-100 border-green-200',
          textColor: 'text-green-800',
          icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
          label: 'Válido'
        };
      case 'expired':
        return {
          bgColor: 'bg-red-100 border-red-200',
          textColor: 'text-red-800',
          icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
          label: 'Expirado'
        };
      case 'warning':
        return {
          bgColor: 'bg-yellow-100 border-yellow-200',
          textColor: 'text-yellow-800',
          icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
          label: 'Expira em breve'
        };
      case 'pending':
        return {
          bgColor: 'bg-blue-100 border-blue-200',
          textColor: 'text-blue-800',
          icon: <Clock className="h-5 w-5 text-blue-500" />,
          label: 'Pendente'
        };
      default:
        return {
          bgColor: 'bg-gray-100 border-gray-200',
          textColor: 'text-gray-800',
          icon: <Info className="h-5 w-5 text-gray-500" />,
          label: 'Desconhecido'
        };
    }
  };
  
  // If showing add/edit form, render the form
  if (showAddForm) {
    return (
      <CalibrationReportForm 
        calibration={selectedCalibration}
        machines={machines}
        onSave={handleSaveCalibration}
        onCancel={() => {
          setShowAddForm(false);
          setSelectedCalibration(null);
        }}
      />
    );
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Relatórios de Calibração</h2>
        <button
          onClick={() => {
            setSelectedCalibration(null);
            setShowAddForm(true);
          }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          Nova Calibração
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
        <div className="flex">
          <Info className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Sobre Calibrações de Máquinas de Solda</h3>
            <p className="text-sm text-blue-700 mt-1">
              Gerencie os registros de calibração das máquinas de solda da empresa. As calibrações devem ser realizadas
              periodicamente conforme a frequência definida para cada máquina, geralmente anualmente.
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Os relatórios de calibração são documentos importantes para garantir a conformidade com normas
              de qualidade como ISO 9001 e requisitos específicos dos clientes.
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-4 items-center mb-6">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por máquina, nº série..."
              className="pl-10 w-full rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 py-2"
            />
          </div>
        </div>
        
        <div className="w-48">
          <select
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas as máquinas</option>
            {machines.map(machine => (
              <option key={machine.id} value={machine.id}>{machine.name}</option>
            ))}
          </select>
        </div>
        
        <div className="w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os status</option>
            <option value="valid">Válido</option>
            <option value="expired">Expirado</option>
            <option value="pending">Pendente</option>
          </select>
        </div>
      </div>

      {/* Calibration Reports List */}
      {loading ? (
        <div className="text-center py-12">
          <svg className="animate-spin h-8 w-8 mx-auto text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-600">Carregando relatórios de calibração...</p>
        </div>
      ) : filteredCalibrations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Sliders className="h-12 w-12 mx-auto text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">Nenhuma Calibração Encontrada</h3>
          <p className="mt-1 text-gray-500">
            {searchTerm || statusFilter || machineFilter ? 
              'Nenhuma calibração corresponde aos filtros aplicados.' : 
              'Nenhum relatório de calibração registrado ainda.'}
          </p>
          <button
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            onClick={() => {
              setSelectedCalibration(null);
              setShowAddForm(true);
            }}
          >
            <Plus className="h-5 w-5 mr-1" />
            Nova Calibração
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCalibrations.map((calibration) => {
            const calibrationStatus = getCalibrationStatus(calibration);
            const statusInfo = getStatusInfo(calibrationStatus);
            
            // Calculate days until next calibration
            const today = new Date();
            const nextCalibrationDate = new Date(calibration.nextCalibrationDate);
            const daysUntil = Math.floor((nextCalibrationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            // Get machine info
            const machine = machines.find(m => m.id === calibration.machineId);
            
            return (
              <div 
                key={calibration.id} 
                className={`border rounded-lg overflow-hidden shadow-sm ${statusInfo.bgColor}`}
              >
                <div className="p-4 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-lg">
                        {calibration.machineName}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {calibration.model} | S/N: {calibration.serialNumber}
                      </p>
                      <div className="flex items-center mt-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.textColor} bg-white`}>
                          {statusInfo.icon}
                          <span className="ml-1">{statusInfo.label}</span>
                        </span>
                        {machine?.type && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {machine.type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Zap className="h-6 w-6 text-yellow-500" />
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-white">
                  <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                    <div>
                      <p className="text-gray-500">Data da Calibração</p>
                      <p>{format(new Date(calibration.calibrationDate), 'dd/MM/yyyy', { locale: ptBR })}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Próxima Calibração</p>
                      <p className={calibrationStatus === 'expired' ? 'text-red-600 font-medium' : ''}>
                        {format(new Date(calibration.nextCalibrationDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </p>
                    </div>
                    
                    {daysUntil > 0 ? (
                      <div>
                        <p className="text-gray-500">Dias até vencimento</p>
                        <p className={daysUntil <= 30 ? 'text-yellow-600 font-medium' : ''}>
                          {daysUntil} dias
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-500">Vencimento</p>
                        <p className="text-red-600 font-medium">
                          {Math.abs(daysUntil)} dias atrás
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-500">Técnico Responsável</p>
                      <p>{calibration.calibratedBy}</p>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <p className="text-sm text-gray-500">Parâmetros:</p>
                    <div className="mt-1">
                      {calibration.parameters.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Nenhum parâmetro registrado</p>
                      ) : (
                        <div className="space-y-1">
                          {calibration.parameters.map((param, index) => (
                            <div 
                              key={param.id || index} 
                              className={`text-sm px-3 py-1.5 rounded ${param.isWithinTolerance ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}
                            >
                              {param.name}: {param.measuredValue} {param.unit} {param.isWithinTolerance ? '✓' : '✗'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t">
                    <div className="text-sm text-gray-500">
                      {calibration.notes ? (
                        <div className="flex items-center">
                          <Info className="h-4 w-4 mr-1" />
                          <span className="truncate max-w-[200px]" title={calibration.notes}>
                            {calibration.notes}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={() => exportCalibrationReport(calibration)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Exportar Relatório"
                      >
                        <Printer className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleEditCalibration(calibration)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                        title="Editar Calibração"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCalibration(calibration.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Excluir Calibração"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WeldingMachineCalibration;

// Add missing icon components
const Edit = (props: any) => (
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
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const Trash2 = (props: any) => (
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
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);