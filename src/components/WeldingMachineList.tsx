import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Search, 
  Edit, 
  Filter, 
  ChevronDown, 
  AlertTriangle, 
  CheckCircle2, 
  Zap,
  Calendar,
  Info,
  Settings,
  Tool
} from 'lucide-react';
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
import { WeldingMachine, WeldingMachineCalibration } from '../types/quality';
import { format, isPast, addDays, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';

// Interface for form props
interface WeldingMachineFormProps {
  machine: WeldingMachine | null;
  onSave: (machine: WeldingMachine) => Promise<void>;
  onCancel: () => void;
}

// Component for the machine form
const WeldingMachineForm: React.FC<WeldingMachineFormProps> = ({
  machine,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState<WeldingMachine>({
    id: machine?.id || 'new',
    name: machine?.name || '',
    serialNumber: machine?.serialNumber || '',
    model: machine?.model || '',
    manufacturer: machine?.manufacturer || '',
    type: machine?.type || 'MIG/MAG',
    purchaseDate: machine?.purchaseDate || '',
    location: machine?.location || '',
    department: machine?.department || '',
    responsible: machine?.responsible || '',
    status: machine?.status || 'active',
    lastCalibrationDate: machine?.lastCalibrationDate || '',
    nextCalibrationDate: machine?.nextCalibrationDate || '',
    calibrationFrequency: machine?.calibrationFrequency || 365, // Default to yearly calibration
    notes: machine?.notes || '',
    photos: machine?.photos || [],
    createdAt: machine?.createdAt || new Date().toISOString()
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  
  // Load photo previews if editing
  useEffect(() => {
    const loadPhotos = async () => {
      if (machine?.photos && machine.photos.length > 0) {
        try {
          const urls = await Promise.all(
            machine.photos.map(async (photoPath) => {
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
  }, [machine]);
  
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
        const storageRef = ref(storage, `welding-machines/${formData.id || 'temp'}/${Date.now()}_${file.name}`);
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
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error("Error saving machine:", error);
      setError("Erro ao salvar máquina. Por favor, tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">
          {machine ? 'Editar Máquina de Solda' : 'Nova Máquina de Solda'}
        </h2>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-gray-100 rounded-full"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome da Máquina
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Nome da máquina de solda"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Modelo
            </label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Modelo da máquina"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de Série
            </label>
            <input
              type="text"
              value={formData.serialNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, serialNumber: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Número de série"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fabricante
            </label>
            <input
              type="text"
              value={formData.manufacturer}
              onChange={(e) => setFormData(prev => ({ ...prev, manufacturer: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Fabricante"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Máquina
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            >
              <option value="MIG/MAG">MIG/MAG</option>
              <option value="TIG">TIG</option>
              <option value="Stick">Eletrodo Revestido (Stick)</option>
              <option value="Plasma">Plasma</option>
              <option value="Spot">Solda Ponto</option>
              <option value="Other">Outro</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            >
              <option value="active">Ativo</option>
              <option value="maintenance">Em Manutenção</option>
              <option value="inactive">Inativo</option>
              <option value="retired">Descontinuado</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de Aquisição
            </label>
            <input
              type="date"
              value={formData.purchaseDate || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, purchaseDate: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Frequência de Calibração (dias)
            </label>
            <input
              type="number"
              value={formData.calibrationFrequency}
              onChange={(e) => setFormData(prev => ({ ...prev, calibrationFrequency: parseInt(e.target.value) }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              min="1"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Define a frequência com que esta máquina deve ser calibrada, em dias.
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Localização
            </label>
            <input
              type="text"
              value={formData.location || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Localização da máquina"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Departamento
            </label>
            <input
              type="text"
              value={formData.department || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Departamento responsável"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Responsável
            </label>
            <input
              type="text"
              value={formData.responsible || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, responsible: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Nome do responsável"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={3}
              placeholder="Observações adicionais sobre o equipamento..."
            />
          </div>
        </div>
        
        {/* Photos Section */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Fotos da Máquina
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
                <Loader className="h-4 w-4 inline-block animate-spin mr-1" />
              ) : (
                <Camera className="h-4 w-4 inline-block mr-1" />
              )}
              Adicionar Fotos
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
            {photoPreviewUrls.map((photoUrl, index) => (
              <div key={index} className="relative group border rounded-lg overflow-hidden">
                <img
                  src={photoUrl}
                  alt={`Foto ${index + 1} da máquina`}
                  className="w-full h-40 object-cover"
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
                <Image className="h-12 w-12 mx-auto text-gray-400" />
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
        
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 mr-4"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center">
                <Loader className="animate-spin h-5 w-5 mr-2" />
                Salvando...
              </div>
            ) : (
              <div className="flex items-center">
                <Save className="h-5 w-5 mr-2" />
                Salvar
              </div>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

// Main component for welding machine list
const WeldingMachineList: React.FC = () => {
  const [machines, setMachines] = useState<WeldingMachine[]>([]);
  const [filteredMachines, setFilteredMachines] = useState<WeldingMachine[]>([]);
  const [calibrations, setCalibrations] = useState<WeldingMachineCalibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<WeldingMachine | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Load machines and calibrations
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load machines
        const machinesRef = collection(db, getCompanyCollection('weldingMachines'));
        const machinesQuery = query(machinesRef, orderBy('name'));
        const machinesSnapshot = await getDocs(machinesQuery);
        
        const machinesData = machinesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as WeldingMachine[];
        
        setMachines(machinesData);
        setFilteredMachines(machinesData);
        
        // Load calibrations
        const calibrationsRef = collection(db, getCompanyCollection('weldingMachineCalibrations'));
        const calibrationsQuery = query(calibrationsRef, orderBy('calibrationDate', 'desc'));
        const calibrationsSnapshot = await getDocs(calibrationsQuery);
        
        const calibrationsData = calibrationsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as WeldingMachineCalibration[];
        
        setCalibrations(calibrationsData);
      } catch (error) {
        console.error("Error loading machines:", error);
        setError("Erro ao carregar máquinas de solda.");
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // Apply filters when search term, type filter, or status filter changes
  useEffect(() => {
    let filtered = [...machines];
    
    // Apply search term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(machine => 
        machine.name.toLowerCase().includes(term) ||
        machine.serialNumber.toLowerCase().includes(term) ||
        machine.model.toLowerCase().includes(term) ||
        machine.manufacturer.toLowerCase().includes(term)
      );
    }
    
    // Apply type filter
    if (typeFilter) {
      filtered = filtered.filter(machine => machine.type === typeFilter);
    }
    
    // Apply status filter
    if (statusFilter) {
      filtered = filtered.filter(machine => machine.status === statusFilter);
    }
    
    setFilteredMachines(filtered);
  }, [machines, searchTerm, typeFilter, statusFilter]);
  
  const handleSaveMachine = async (machine: WeldingMachine) => {
    try {
      setLoading(true);
      setError(null);
      
      if (machine.id === 'new') {
        // Add new machine
        const { id, ...machineData } = machine;
        
        const docRef = await addDoc(
          collection(db, getCompanyCollection('weldingMachines')),
          machineData
        );
        
        // Add to state
        setMachines(prev => [
          { ...machine, id: docRef.id },
          ...prev
        ]);
      } else {
        // Update existing machine
        const machineRef = doc(db, getCompanyCollection('weldingMachines'), machine.id);
        const { id, ...machineData } = machine;
        
        await updateDoc(machineRef, machineData);
        
        // Update state
        setMachines(prev => 
          prev.map(m => m.id === machine.id ? machine : m)
        );
      }
      
      setShowAddForm(false);
      setSelectedMachine(null);
    } catch (error) {
      console.error("Error saving machine:", error);
      setError("Erro ao salvar máquina. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleDeleteMachine = async (id: string) => {
    try {
      if (!window.confirm('Tem certeza que deseja excluir esta máquina? Todas as calibrações associadas serão perdidas.')) {
        return;
      }
      
      setLoading(true);
      
      // Check if there are calibrations for this machine
      const calibrationsRef = collection(db, getCompanyCollection('weldingMachineCalibrations'));
      const calibrationsQuery = query(calibrationsRef, where('machineId', '==', id));
      const calibrationsSnapshot = await getDocs(calibrationsQuery);
      
      // Delete all calibrations for this machine
      const batch = db.batch();
      calibrationsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete the machine
      const machineRef = doc(db, getCompanyCollection('weldingMachines'), id);
      batch.delete(machineRef);
      
      // Commit the batch
      await batch.commit();
      
      // Update state
      setMachines(prev => prev.filter(m => m.id !== id));
      setFilteredMachines(prev => prev.filter(m => m.id !== id));
      setCalibrations(prev => prev.filter(c => c.machineId !== id));
      
      setLoading(false);
    } catch (error) {
      console.error("Error deleting machine:", error);
      setError("Erro ao excluir máquina. Por favor, tente novamente.");
      setLoading(false);
    }
  };
  
  const handleEditMachine = (machine: WeldingMachine) => {
    setSelectedMachine(machine);
    setShowAddForm(true);
  };
  
  const getCalibrationStatus = (machine: WeldingMachine): 'valid' | 'expired' | 'warning' | 'none' => {
    // If no next calibration date, return 'none'
    if (!machine.nextCalibrationDate) return 'none';
    
    const nextCalibration = new Date(machine.nextCalibrationDate);
    const today = new Date();
    
    // If next calibration is already past, return 'expired'
    if (isPast(nextCalibration)) return 'expired';
    
    // If next calibration is within 30 days, return 'warning'
    const thirtyDaysFromNow = addDays(today, 30);
    if (isAfter(thirtyDaysFromNow, nextCalibration)) return 'warning';
    
    // Otherwise, return 'valid'
    return 'valid';
  };
  
  const getLastCalibration = (machineId: string): WeldingMachineCalibration | undefined => {
    const machineCalibrations = calibrations.filter(c => c.machineId === machineId);
    if (machineCalibrations.length === 0) return undefined;
    
    // Sort by calibration date (most recent first)
    machineCalibrations.sort((a, b) => 
      new Date(b.calibrationDate).getTime() - new Date(a.calibrationDate).getTime()
    );
    
    return machineCalibrations[0];
  };
  
  // If showing add/edit form, render the form
  if (showAddForm) {
    return (
      <WeldingMachineForm
        machine={selectedMachine}
        onSave={handleSaveMachine}
        onCancel={() => {
          setShowAddForm(false);
          setSelectedMachine(null);
        }}
      />
    );
  }
  
  // Otherwise, render the machine list
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Máquinas de Solda</h2>
        <button
          onClick={() => {
            setSelectedMachine(null);
            setShowAddForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-5 w-5 inline-block mr-2" />
          Nova Máquina
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
      
      <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg mb-6">
        <div className="flex">
          <Info className="h-5 w-5 text-blue-500 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-blue-800">Sobre Máquinas de Solda</h3>
            <p className="text-sm text-blue-700 mt-1">
              Gerencie as máquinas de solda da empresa, incluindo informações de calibração e manutenção.
              Você pode registrar as máquinas e as calibrações separadamente.
            </p>
          </div>
        </div>
      </div>
      
      {/* Filter bar */}
      <div className="flex flex-wrap gap-4 items-center mb-6">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, modelo, número de série..."
            className="w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="w-48">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os tipos</option>
            <option value="MIG/MAG">MIG/MAG</option>
            <option value="TIG">TIG</option>
            <option value="Stick">Eletrodo Revestido</option>
            <option value="Plasma">Plasma</option>
            <option value="Spot">Solda Ponto</option>
            <option value="Other">Outro</option>
          </select>
        </div>
        
        <div className="w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="maintenance">Em Manutenção</option>
            <option value="inactive">Inativo</option>
            <option value="retired">Descontinuado</option>
          </select>
        </div>
      </div>
      
      {loading ? (
        <div className="text-center py-12">
          <Loader className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-gray-600">Carregando máquinas de solda...</p>
        </div>
      ) : filteredMachines.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <Tool className="h-12 w-12" />
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhuma máquina encontrada</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm || typeFilter || statusFilter ? 
              'Nenhuma máquina corresponde aos filtros aplicados.' : 
              'Comece adicionando sua primeira máquina de solda.'}
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                setSelectedMachine(null);
                setShowAddForm(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-5 w-5 inline-block mr-2" />
              Nova Máquina
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMachines.map((machine) => {
            const calibrationStatus = getCalibrationStatus(machine);
            const lastCalibration = getLastCalibration(machine.id);
            
            return (
              <div 
                key={machine.id} 
                className={`border rounded-lg overflow-hidden ${
                  machine.status === 'inactive' ? 'border-gray-300' :
                  machine.status === 'maintenance' ? 'border-yellow-300' :
                  machine.status === 'retired' ? 'border-red-300' :
                  calibrationStatus === 'expired' ? 'border-red-300' :
                  calibrationStatus === 'warning' ? 'border-yellow-300' :
                  'border-green-300'
                }`}
              >
                <div className={`p-4 ${
                  machine.status === 'inactive' ? 'bg-gray-50' :
                  machine.status === 'maintenance' ? 'bg-yellow-50' :
                  machine.status === 'retired' ? 'bg-red-50' :
                  calibrationStatus === 'expired' ? 'bg-red-50' :
                  calibrationStatus === 'warning' ? 'bg-yellow-50' :
                  'bg-green-50'
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-lg">{machine.name}</h3>
                      <p className="text-sm text-gray-600">
                        {machine.model} | {machine.type}
                      </p>
                      <div className="text-sm text-gray-500">
                        S/N: {machine.serialNumber} | Fabricante: {machine.manufacturer}
                      </div>
                      
                      <div className="flex items-center mt-2 space-x-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          machine.status === 'active' ? 'bg-green-100 text-green-800' :
                          machine.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                          machine.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {machine.status === 'active' ? 'Ativo' :
                           machine.status === 'maintenance' ? 'Em Manutenção' :
                           machine.status === 'inactive' ? 'Inativo' :
                           'Descontinuado'}
                        </span>
                        
                        {calibrationStatus !== 'none' && (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            calibrationStatus === 'valid' ? 'bg-green-100 text-green-800' :
                            calibrationStatus === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {calibrationStatus === 'valid' ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Calibração em dia
                              </>
                            ) : calibrationStatus === 'warning' ? (
                              <>
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Calibração próxima
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Calibração vencida
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Zap className="h-6 w-6 text-indigo-500" />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-white">
                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    {machine.department && (
                      <div>
                        <p className="text-gray-500">Departamento</p>
                        <p>{machine.department}</p>
                      </div>
                    )}
                    {machine.location && (
                      <div>
                        <p className="text-gray-500">Localização</p>
                        <p>{machine.location}</p>
                      </div>
                    )}
                    {machine.responsible && (
                      <div>
                        <p className="text-gray-500">Responsável</p>
                        <p>{machine.responsible}</p>
                      </div>
                    )}
                    {machine.purchaseDate && (
                      <div>
                        <p className="text-gray-500">Aquisição</p>
                        <p>{format(new Date(machine.purchaseDate), 'dd/MM/yyyy', { locale: ptBR })}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t pt-4 mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium flex items-center">
                        <Calendar className="h-4 w-4 mr-1 text-blue-600" />
                        Informações de Calibração
                      </h4>
                    </div>
                    
                    <div className="text-sm">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-500">Frequência de calibração:</span>
                        <span>{machine.calibrationFrequency} dias</span>
                      </div>
                      
                      {lastCalibration ? (
                        <>
                          <div className="flex justify-between mb-2">
                            <span className="text-gray-500">Última calibração:</span>
                            <span>{format(new Date(lastCalibration.calibrationDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                          </div>
                          
                          <div className="flex justify-between">
                            <span className="text-gray-500">Próxima calibração:</span>
                            <span className={`${
                              calibrationStatus === 'expired' ? 'text-red-600 font-medium' : 
                              calibrationStatus === 'warning' ? 'text-yellow-600 font-medium' : ''
                            }`}>
                              {format(new Date(lastCalibration.nextCalibrationDate), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="text-gray-500 italic">Nenhuma calibração registrada</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 mt-4 pt-4 border-t">
                    <button
                      onClick={() => handleEditMachine(machine)}
                      className="px-3 py-1 bg-blue-100 text-blue-600 rounded-md hover:bg-blue-200"
                    >
                      <Edit className="h-4 w-4 inline-block mr-1" />
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteMachine(machine.id)}
                      className="px-3 py-1 bg-red-100 text-red-600 rounded-md hover:bg-red-200"
                    >
                      <Trash2 className="h-4 w-4 inline-block mr-1" />
                      Excluir
                    </button>
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

// Add missing Lucide React components
const X = (props: any) => (
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
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const Save = (props: any) => (
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
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const Camera = (props: any) => (
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
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const Loader = (props: any) => (
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
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const Image = (props: any) => (
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
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

export default WeldingMachineList;