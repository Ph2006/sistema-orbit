import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import WeldingMachineList from './WeldingMachineList';
import WeldingMachineCalibration from './WeldingMachineCalibration';
import { Settings, Calendar, Info, Plus, FileText, Upload, Trash2, Edit, FileCheck, FileBarChart2, XCircle } from 'lucide-react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import JSZip from 'jszip';

// Define types for different machine calibration data
interface BaseCalibrationData {
  date: string; // ISO string
  inspector: string;
  notes?: string;
  photos?: string[]; // Array of image URLs (e.g., from storage)
}

interface WeldingMachineCalibrationData extends BaseCalibrationData {
  electrodeNegative?: number; // Amperagem eletrodo negativo
  electrodePositive?: number; // Amperagem eletrodo positivo
  voltage?: number; // Tensão
  wireSpeed?: number; // Velocidade do arame
  gasFlow?: number; // Vazão do gás
}

interface CNCBenchCalibrationData extends BaseCalibrationData {
  axisX?: number; // Precisão eixo X
  axisY?: number; // Precisão eixo Y
  axisZ?: number; // Precisão eixo Z
  spindleAccuracy?: number; // Precisão do spindle
}

// Union type for calibration data
type CalibrationData = WeldingMachineCalibrationData | CNCBenchCalibrationData | BaseCalibrationData;

// Define types for machines
interface BaseMachine {
  id: string;
  name: string;
  identification: string; // Serial number, asset tag, etc.
  type: 'welding' | 'cnc' | 'other';
  calibrationInterval: number; // in months, e.g., 12 for 1 year
  createdAt: string;
  updatedAt: string;
}

interface WeldingMachine extends BaseMachine {
  type: 'welding';
  // Add specific welding machine fields if needed
}

interface CNCBench extends BaseMachine {
  type: 'cnc';
  // Add specific CNC bench fields if needed
}

// Union type for machines
type Machine = WeldingMachine | CNCBench | BaseMachine;

interface CalibrationRecord {
  id: string;
  machineId: string;
  calibrationDate: string; // ISO string
  calibrationData: CalibrationData; // Type depends on machine type
  validatedBy?: string;
  validationDate?: string; // ISO string
  createdAt: string;
}

const QualityCalibration: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [calibrationRecords, setCalibrationRecords] = useState<CalibrationRecord[]>([]);
  const [showMachineForm, setShowMachineForm] = useState(false);
  const [newMachine, setNewMachine] = useState<Partial<Machine>>({});
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [showCalibrationForm, setShowCalibrationForm] = useState(false);
  const [newCalibrationRecord, setNewCalibrationRecord] = useState<Partial<CalibrationRecord>>({});
  const [selectedMachineForCalibration, setSelectedMachineForCalibration] = useState<Machine | null>(null);
  const [filterMachineType, setFilterMachineType] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [showBatchExportModal, setShowBatchExportModal] = useState(false);

  // Load machines and calibration records
  useEffect(() => {
    const machinesRef = collection(db, 'machines');
    const unsubscribeMachines = onSnapshot(machinesRef, (snapshot) => {
      const machinesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Machine[];
      setMachines(machinesData);
    });

    const calibrationRecordsRef = collection(db, 'calibrationRecords');
    const unsubscribeCalibrations = onSnapshot(calibrationRecordsRef, (snapshot) => {
      const recordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as CalibrationRecord[];
      setCalibrationRecords(recordsData);
    });

    return () => { unsubscribeMachines(); unsubscribeCalibrations(); };
  }, []);

  // Handle adding/updating machines
  const handleSaveMachine = async () => {
    if (!newMachine.name || !newMachine.type || !newMachine.identification || !newMachine.calibrationInterval) {
      alert('Por favor, preencha todos os campos obrigatórios da máquina.');
      return;
    }

    try {
      if (editingMachine) {
        // Update existing machine
        const machineRef = doc(db, 'machines', editingMachine.id);
        await updateDoc(machineRef, newMachine);
        setEditingMachine(null);
      } else {
        // Add new machine
        await addDoc(collection(db, 'machines'), { ...newMachine, status: 'active', createdAt: new Date().toISOString() });
      }

      setShowMachineForm(false);
      setNewMachine({});
    } catch (error) {
      console.error('Error saving machine:', error);
      alert('Erro ao salvar máquina.');
    }
  };

  // Handle deleting machine
  const handleDeleteMachine = async (machineId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta máquina? Esta ação não pode ser desfeita.')) {
      try {
        await deleteDoc(doc(db, 'machines', machineId));
      } catch (error) {
        console.error('Error deleting machine:', error);
        alert('Erro ao excluir máquina.');
      }
    }
  };

  // Handle adding calibration records
  const handleSaveCalibrationRecord = async () => {
    if (!selectedMachineForCalibration || !newCalibrationRecord.calibrationDate || !newCalibrationRecord.calibrationData) {
       alert('Por favor, selecione uma máquina e preencha todos os campos obrigatórios da calibração.');
       return;
    }

    try {
       // Add new calibration record
       await addDoc(collection(db, 'calibrationRecords'), {
         ...newCalibrationRecord,
         machineId: selectedMachineForCalibration.id, // Link record to the selected machine
         createdAt: new Date().toISOString(),
         calibrationDate: new Date(newCalibrationRecord.calibrationDate).toISOString(), // Ensure ISO string
       });

       setShowCalibrationForm(false);
       setNewCalibrationRecord({});
       setSelectedMachineForCalibration(null);
    } catch (error) {
       console.error('Error saving calibration record:', error);
       alert('Erro ao salvar registro de calibração.');
    }
  };

  // Function to get the last calibration date for a machine
  const getLastCalibrationDate = (machineId: string): string | null => {
    const machineRecords = calibrationRecords.filter(record => record.machineId === machineId);
    if (machineRecords.length === 0) return null;
    
    // Sort records by date descending and take the first one
    const sortedRecords = machineRecords.sort((a, b) => 
      new Date(b.calibrationDate).getTime() - new Date(a.calibrationDate).getTime()
    );
    return sortedRecords[0].calibrationDate;
  };

  // Function to calculate the next calibration date
  const getNextCalibrationDate = (machine: Machine): string | null => {
    const lastCalibrationDate = getLastCalibrationDate(machine.id);
    if (!lastCalibrationDate) return null;
    
    const lastDate = new Date(lastCalibrationDate);
    // Use the calibrationInterval from the machine data
    const nextDate = addYears(lastDate, machine.calibrationInterval / 12); // Assuming calibrationInterval is in months
    return nextDate.toISOString().split('T')[0]; // Return in YYYY-MM-DD format for display
  };

  // Function to generate PDF report
  const generateCalibrationReport = (record: CalibrationRecord) => {
    const doc = new jsPDF();
    const machine = machines.find(m => m.id === record.machineId);
    if (!machine) return;

    // Add company logo and header
    doc.setFontSize(20);
    doc.text('Relatório de Calibração', 105, 20, { align: 'center' });
    
    // Add machine information
    doc.setFontSize(12);
    doc.text('Informações da Máquina:', 20, 40);
    doc.setFontSize(10);
    doc.text(`Nome: ${machine.name}`, 20, 50);
    doc.text(`Tipo: ${machine.type}`, 20, 55);
    doc.text(`Identificação: ${machine.identification}`, 20, 60);
    
    // Add calibration information
    doc.setFontSize(12);
    doc.text('Informações da Calibração:', 20, 80);
    doc.setFontSize(10);
    doc.text(`Data: ${format(new Date(record.calibrationDate), 'dd/MM/yyyy')}`, 20, 90);
    doc.text(`Inspetor: ${record.calibrationData.inspector || 'N/A'}`, 20, 95);
    
    // Add calibration data based on machine type
    let yPosition = 110;
    doc.setFontSize(12);
    doc.text('Dados da Calibração:', 20, yPosition);
    yPosition += 10;
    doc.setFontSize(10);

    if (machine.type === 'welding') {
      const data = record.calibrationData as WeldingMachineCalibrationData;
      doc.text(`Amperagem Eletrodo Negativo: ${data.electrodeNegative || 'N/A'} A`, 20, yPosition);
      yPosition += 7;
      doc.text(`Amperagem Eletrodo Positivo: ${data.electrodePositive || 'N/A'} A`, 20, yPosition);
      yPosition += 7;
      doc.text(`Tensão: ${data.voltage || 'N/A'} V`, 20, yPosition);
      yPosition += 7;
      doc.text(`Velocidade do Arame: ${data.wireSpeed || 'N/A'} m/min`, 20, yPosition);
      yPosition += 7;
      doc.text(`Vazão do Gás: ${data.gasFlow || 'N/A'} L/min`, 20, yPosition);
    } else if (machine.type === 'cnc') {
      const data = record.calibrationData as CNCBenchCalibrationData;
      doc.text(`Precisão Eixo X: ${data.axisX || 'N/A'} mm`, 20, yPosition);
      yPosition += 7;
      doc.text(`Precisão Eixo Y: ${data.axisY || 'N/A'} mm`, 20, yPosition);
      yPosition += 7;
      doc.text(`Precisão Eixo Z: ${data.axisZ || 'N/A'} mm`, 20, yPosition);
      yPosition += 7;
      doc.text(`Precisão do Spindle: ${data.spindleAccuracy || 'N/A'} mm`, 20, yPosition);
    } else {
      const data = record.calibrationData as BaseCalibrationData;
      if (data.notes) {
        doc.text('Notas:', 20, yPosition);
        yPosition += 7;
        const splitNotes = doc.splitTextToSize(data.notes, 170);
        doc.text(splitNotes, 20, yPosition);
      }
    }

    // Add validation information if available
    if (record.validatedBy) {
      yPosition += 15;
      doc.setFontSize(12);
      doc.text('Validação:', 20, yPosition);
      yPosition += 10;
      doc.setFontSize(10);
      doc.text(`Validado por: ${record.validatedBy}`, 20, yPosition);
      yPosition += 7;
      doc.text(`Data da Validação: ${format(new Date(record.validationDate || ''), 'dd/MM/yyyy')}`, 20, yPosition);
    }

    // Add footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, pageHeight - 20);
    doc.text('Página 1 de 1', 190, pageHeight - 20, { align: 'right' });

    // Save the PDF
    doc.save(`relatorio-calibracao-${machine.identification}-${format(new Date(record.calibrationDate), 'yyyyMMdd')}.pdf`);
  };

  // Function to check if a machine is due for calibration
  const isMachineDueForCalibration = (machine: Machine): boolean => {
    const lastCalibrationDate = getLastCalibrationDate(machine.id);
    if (!lastCalibrationDate) return true;
    
    const lastDate = new Date(lastCalibrationDate);
    const nextDate = addYears(lastDate, 1);
    return new Date() > nextDate;
  };

  // Function to get calibration status
  const getCalibrationStatus = (machine: Machine): { status: 'ok' | 'warning' | 'due'; message: string } => {
    const lastCalibrationDate = getLastCalibrationDate(machine.id);
    if (!lastCalibrationDate) return { status: 'due', message: 'Nunca calibrada' };
    
    const lastDate = new Date(lastCalibrationDate);
    const nextDate = addYears(lastDate, 1);
    const today = new Date();
    
    if (today > nextDate) {
      return { status: 'due', message: 'Vencida' };
    }
    
    const daysUntilDue = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 30) {
      return { status: 'warning', message: `Vence em ${daysUntilDue} dias` };
    }
    
    return { status: 'ok', message: 'Em dia' };
  };

  // Filter calibration records
  const filteredCalibrationRecords = calibrationRecords.filter(record => {
    const machine = machines.find(m => m.id === record.machineId);
    if (!machine) return false;
    
    if (filterMachineType && machine.type !== filterMachineType) return false;
    
    if (filterDateRange.start || filterDateRange.end) {
      const recordDate = new Date(record.calibrationDate);
      if (filterDateRange.start && recordDate < new Date(filterDateRange.start)) return false;
      if (filterDateRange.end && recordDate > new Date(filterDateRange.end)) return false;
    }
    
    return true;
  });

  // Function to get calibration statistics
  const getCalibrationStats = () => {
    const totalMachines = machines.length;
    const machinesDue = machines.filter(m => getCalibrationStatus(m).status === 'due').length;
    const machinesWarning = machines.filter(m => getCalibrationStatus(m).status === 'warning').length;
    const machinesOk = machines.filter(m => getCalibrationStatus(m).status === 'ok').length;
    
    const recentCalibrations = calibrationRecords
      .sort((a, b) => new Date(b.calibrationDate).getTime() - new Date(a.calibrationDate).getTime())
      .slice(0, 5);

    return {
      totalMachines,
      machinesDue,
      machinesWarning,
      machinesOk,
      recentCalibrations
    };
  };

  // Function to generate batch PDF reports
  const generateBatchReports = () => {
    if (selectedRecords.length === 0) {
      alert('Selecione pelo menos um registro para exportar.');
      return;
    }

    const selectedCalibrations = calibrationRecords.filter(r => selectedRecords.includes(r.id));
    
    // Create a zip file containing all reports
    const zip = new JSZip();
    
    selectedCalibrations.forEach(record => {
      const doc = new jsPDF();
      const machine = machines.find(m => m.id === record.machineId);
      if (!machine) return;

      // Add report content (reuse existing PDF generation logic)
      doc.setFontSize(20);
      doc.text('Relatório de Calibração', 105, 20, { align: 'center' });
      
      // ... (rest of the PDF generation code) ...

      // Add the PDF to the zip file
      zip.file(`calibracao-${machine.identification}-${format(new Date(record.calibrationDate), 'yyyyMMdd')}.pdf`, doc.output('blob'));
    });

    // Generate and download the zip file
    zip.generateAsync({ type: 'blob' }).then(content => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `relatorios-calibracao-${format(new Date(), 'yyyyMMdd')}.zip`;
      link.click();
    });
  };

  // Render Machine List Tab
  const renderMachineList = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Lista de Máquinas</h3>
        <button
          onClick={() => setShowMachineForm(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          Adicionar Máquina
        </button>
      </div>

      {/* Machine List Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identificação</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intervalo Calibração (Meses)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Calibração</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Próxima Calibração</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {machines.map(machine => {
              const lastCal = getLastCalibrationDate(machine.id);
              const nextCal = getNextCalibrationDate(machine);
              const status = getCalibrationStatus(machine);
              
              return (
                <tr key={machine.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{machine.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{machine.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{machine.identification}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{machine.calibrationInterval}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {lastCal ? format(new Date(lastCal), 'dd/MM/yyyy') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {nextCal ? format(new Date(nextCal), 'dd/MM/yyyy') : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      status.status === 'ok' ? 'bg-green-100 text-green-800' :
                      status.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {status.message}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => { setEditingMachine(machine); setShowMachineForm(true); }}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                      title="Editar"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMachine(machine.id)}
                      className="text-red-600 hover:text-red-900"
                      title="Excluir"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Machine Form Modal */}
      {showMachineForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">{editingMachine ? 'Editar Máquina' : 'Adicionar Nova Máquina'}</h3>
              <button onClick={() => { setShowMachineForm(false); setEditingMachine(null); setNewMachine({}); }}>
                <XCircle className="h-6 w-6 text-gray-500" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome da Máquina</label>
              <input
                type="text"
                value={newMachine.name || ''}
                onChange={(e) => setNewMachine({ ...newMachine, name: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tipo de Máquina</label>
              <select
                value={newMachine.type || ''}
                onChange={(e) => setNewMachine({ ...newMachine, type: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                required
              >
                <option value="">Selecione o tipo</option>
                <option value="welding">Máquina de Solda</option>
                <option value="cnc">Centro de Usinagem CNC</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Identificação (Número de Série/Tag)</label>
              <input
                type="text"
                value={newMachine.identification || ''}
                onChange={(e) => setNewMachine({ ...newMachine, identification: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                required
              />
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700">Intervalo de Calibração (Meses)</label>
              <input
                type="number"
                value={newMachine.calibrationInterval || ''}
                onChange={(e) => setNewMachine({ ...newMachine, calibrationInterval: parseInt(e.target.value) || 0 })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                required
              />
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700">Notas</label>
              <textarea
                value={newMachine.notes || ''}
                onChange={(e) => setNewMachine({ ...newMachine, notes: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowMachineForm(false); setEditingMachine(null); setNewMachine({}); }}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveMachine}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingMachine ? 'Salvar Alterações' : 'Adicionar Máquina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Render Dashboard Tab
  const renderDashboard = () => {
    const stats = getCalibrationStats();
    
    return (
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <h4 className="text-sm font-medium text-gray-500">Total de Máquinas</h4>
            <p className="text-2xl font-bold text-gray-900">{stats.totalMachines}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <h4 className="text-sm font-medium text-gray-500">Calibrações em Dia</h4>
            <p className="text-2xl font-bold text-green-600">{stats.machinesOk}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <h4 className="text-sm font-medium text-gray-500">Atenção Necessária</h4>
            <p className="text-2xl font-bold text-yellow-600">{stats.machinesWarning}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <h4 className="text-sm font-medium text-gray-500">Calibrações Vencidas</h4>
            <p className="text-2xl font-bold text-red-600">{stats.machinesDue}</p>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium mb-4">Alertas de Calibração</h3>
          <div className="space-y-4">
            {machines
              .filter(m => getCalibrationStatus(m).status !== 'ok')
              .map(machine => {
                const status = getCalibrationStatus(machine);
                return (
                  <div
                    key={machine.id}
                    className={`p-4 rounded-lg ${
                      status.status === 'due' ? 'bg-red-50 border border-red-200' :
                      'bg-yellow-50 border border-yellow-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{machine.name}</h4>
                        <p className="text-sm text-gray-600">{machine.identification}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        status.status === 'due' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {status.message}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Recent Calibrations */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium mb-4">Calibrações Recentes</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Máquina</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inspetor</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.recentCalibrations.map(record => {
                  const machine = machines.find(m => m.id === record.machineId);
                  if (!machine) return null;
                  return (
                    <tr key={record.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {machine.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(record.calibrationDate), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {record.calibrationData.inspector || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => generateCalibrationReport(record)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <FileText className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Render Calibration Records Tab
  const renderCalibrationRecords = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Registros de Calibração</h3>
        <button
          onClick={() => { setShowCalibrationForm(true); setSelectedMachineForCalibration(null); setNewCalibrationRecord({}); }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Registro de Calibração
        </button>
      </div>

      {/* Add batch export button */}
      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <button
            onClick={() => setShowBatchExportModal(true)}
            disabled={selectedRecords.length === 0}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <FileText className="h-5 w-5 mr-2" />
            Exportar Selecionados ({selectedRecords.length})
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm space-y-4">
        <h4 className="font-medium text-gray-700">Filtros</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Tipo de Máquina</label>
            <select
              value={filterMachineType}
              onChange={(e) => setFilterMachineType(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="">Todos os tipos</option>
              <option value="welding">Máquina de Solda</option>
              <option value="cnc">Centro de Usinagem CNC</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Data Inicial</label>
            <input
              type="date"
              value={filterDateRange.start}
              onChange={(e) => setFilterDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Data Final</label>
            <input
              type="date"
              value={filterDateRange.end}
              onChange={(e) => setFilterDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Update table to include checkboxes */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={selectedRecords.length === filteredCalibrationRecords.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRecords(filteredCalibrationRecords.map(r => r.id));
                    } else {
                      setSelectedRecords([]);
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Máquina</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data Calibração</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inspetor</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCalibrationRecords.map(record => {
              const machine = machines.find(m => m.id === record.machineId);
              if (!machine) return null;
              return (
                <tr key={record.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedRecords.includes(record.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRecords([...selectedRecords, record.id]);
                        } else {
                          setSelectedRecords(selectedRecords.filter(id => id !== record.id));
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{machine.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{machine.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(record.calibrationDate), 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.calibrationData.inspector || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => generateCalibrationReport(record)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                      title="Gerar Relatório PDF"
                    >
                      <FileText className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Batch Export Modal */}
      {showBatchExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Exportar Relatórios</h3>
            <p className="text-gray-600 mb-4">
              Você está prestes a exportar {selectedRecords.length} relatório(s) de calibração.
              Os relatórios serão baixados em um arquivo ZIP.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowBatchExportModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  generateBatchReports();
                  setShowBatchExportModal(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calibration Record Form Modal */}
      {showCalibrationForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Novo Registro de Calibração</h3>
              <button onClick={() => { setShowCalibrationForm(false); setSelectedMachineForCalibration(null); setNewCalibrationRecord({}); }}>
                 <XCircle className="h-6 w-6 text-gray-500" />
              </button>
            </div>

            {/* Step 1: Select Machine */}
            {!selectedMachineForCalibration && (
               <div>
                 <label className="block text-sm font-medium text-gray-700">Selecione a Máquina</label>
                 <select
                   value={newCalibrationRecord.machineId || ''}
                   onChange={(e) => {
                      const machine = machines.find(m => m.id === e.target.value);
                      setSelectedMachineForCalibration(machine || null);
                      setNewCalibrationRecord(prev => ({ ...prev, machineId: e.target.value, calibrationData: {} }));
                   }}
                   className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                   required
                 >
                   <option value="">Selecione uma máquina</option>
                   {machines.map(machine => (
                      <option key={machine.id} value={machine.id}>{machine.name} ({machine.identification})</option>
                   ))}
                 </select>
               </div>
            )}

            {/* Step 2: Fill Calibration Data (Shown after machine is selected) */}
            {selectedMachineForCalibration && (
                <div className="space-y-4">
                  <div>
                     <h4 className="text-lg font-medium text-gray-800">Calibração para: {selectedMachineForCalibration.name} ({selectedMachineForCalibration.identification})</h4>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700">Data da Calibração</label>
                     <input
                       type="date"
                       value={newCalibrationRecord.calibrationDate?.split('T')[0] || ''}
                       onChange={(e) => setNewCalibrationRecord({...newCalibrationRecord, calibrationDate: e.target.value})}
                       className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                       required
                     />
                  </div>
                   <div>
                     <label className="block text-sm font-medium text-gray-700">Inspetor</label>
                     <input
                       type="text"
                       value={(newCalibrationRecord.calibrationData as any)?.inspector || ''}
                       onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), inspector: e.target.value } }))}
                       className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                       required
                     />
                  </div>

                  {/* Dynamic fields based on machine type */}
                  {selectedMachineForCalibration.type === 'welding' && (
                    <div className="space-y-4">
                      <h4 className="text-md font-medium text-gray-700">Dados Específicos (Máquina de Solda)</h4>
                      <div>
                         <label className="block text-sm font-medium text-gray-700">Amperagem Eletrodo Negativo</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), electrodeNegative: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                      </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Amperagem Eletrodo Positivo</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), electrodePositive: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                      </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Tensão</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), voltage: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                      </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Velocidade do Arame</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), wireSpeed: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                      </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Vazão do Gás</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), gasFlow: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                      </div>
                    </div>
                  )}

                   {selectedMachineForCalibration.type === 'cnc' && (
                    <div className="space-y-4">
                      <h4 className="text-md font-medium text-gray-700">Dados Específicos (Centro de Usinagem CNC)</h4>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Precisão Eixo X</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), axisX: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                       </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Precisão Eixo Y</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), axisY: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                       </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Precisão Eixo Z</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), axisZ: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                       </div>
                       <div>
                         <label className="block text-sm font-medium text-gray-700">Precisão do Spindle</label>
                         <input type="number" onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), spindleAccuracy: parseFloat(e.target.value) || 0 } }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                       </div>
                    </div>
                  )}

                  {selectedMachineForCalibration.type === 'other' && (
                     <div className="space-y-4">
                        <h4 className="text-md font-medium text-gray-700">Dados Específicos (Outro Tipo de Máquina)</h4>
                        {/* Add generic fields or a way to add custom fields here if needed */}
                        <div>
                           <label className="block text-sm font-medium text-gray-700">Notas de Calibração</label>
                           <textarea
                             value={(newCalibrationRecord.calibrationData as any)?.notes || ''}
                             onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), notes: e.target.value } }))}
                             className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                           />
                        </div>
                     </div>
                  )}

                  {/* Common fields for all machine types */}
                   <div>
                     <label className="block text-sm font-medium text-gray-700">Notas Gerais (Opcional)</label>
                     <textarea
                       value={(newCalibrationRecord.calibrationData as any)?.notes || ''}
                       onChange={(e) => setNewCalibrationRecord(prev => ({ ...prev, calibrationData: { ...(prev.calibrationData as any), notes: e.target.value } }))}
                       className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                     />
                  </div>

                  {/* Add fields for photos/attachments if needed */}
                   {/* <div>
                     <label className="block text-sm font-medium text-gray-700">Anexar Fotos</label>
                     <input type="file" multiple onChange={(e) => { // Handle file uploads }} className="mt-1 block w-full" />
                   </div> */}

                  <div className="flex justify-end space-x-3 mt-6">
                    <button
                      onClick={() => { setShowCalibrationForm(false); setSelectedMachineForCalibration(null); setNewCalibrationRecord({}); }}
                      className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveCalibrationRecord}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Salvar Registro
                    </button>
                  </div>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Main render function for QualityCalibration component
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Calibração de Equipamentos</h2>
        <p className="text-gray-600 mt-1">
          Gerencie equipamentos e registros de calibração.
        </p>
      </div>

      <Tabs defaultValue="dashboard" onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="dashboard" className="flex items-center">
            <FileBarChart2 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="machines" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" />
            Máquinas
          </TabsTrigger>
          <TabsTrigger value="calibrations" className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            Registros de Calibração
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard">
          {renderDashboard()}
        </TabsContent>
        
        <TabsContent value="machines">
          {renderMachineList()}
        </TabsContent>
        
        <TabsContent value="calibrations">
          {renderCalibrationRecords()}
        </TabsContent>
      </Tabs>

    </div>
  );
};

export default QualityCalibration;