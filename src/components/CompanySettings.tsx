import React, { useState, useEffect } from 'react';
import { Save, Building, Calendar, User, ArrowLeft, Info, ImageIcon, FileText } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import CalendarSettingsModal from './CalendarSettingsModal';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import LogoUploadModal from './LogoUploadModal';
import { useAuthStore } from '../store/authStore';

const CompanySettings: React.FC = () => {
  const { 
    companyName, 
    companyCNPJ, 
    companyResponsible,
    companyLogo,
    calendar,
  } = useSettingsStore();
  
  const { loadSettingsFromFirestore, saveSettingsToFirestore } = useSettingsStore();
  const { companyId } = useAuthStore();

  const [formData, setFormData] = useState({
    name: companyName || '',
    cnpj: companyCNPJ || '',
    responsible: companyResponsible || ''
  });

  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  useEffect(() => {
    setFormData({
      name: companyName || '',
      cnpj: companyCNPJ || '',
      responsible: companyResponsible || ''
    });
  }, [companyName, companyCNPJ, companyResponsible]);

  useEffect(() => {
    if (companyId) {
      loadSettingsFromFirestore(companyId);
    }
  }, [companyId, loadSettingsFromFirestore]);

  const handleSave = async () => {
    if (!companyId) {
      setSaveError("ID da empresa não disponível. Não foi possível salvar.");
      return;
    }
    
    try {
      await saveSettingsToFirestore(companyId, {
        companyName: formData.name,
        companyCNPJ: formData.cnpj,
        companyResponsible: formData.responsible,
      });

      setSaveSuccess(true);
      setSaveError(null);
      
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveError("Erro ao salvar configurações. Por favor, tente novamente.");
    }
  };

  const formatWorkingHours = (day: string) => {
    if (!calendar || !calendar[day] || !calendar[day].enabled) {
      return 'Fechado';
    }

    return calendar[day].hours.map(hour => {
      return `${hour.start} - ${hour.end}`;
    }).join(', ');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Configurações da Empresa</h2>
        <button
          onClick={handleSave}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Save className="h-5 w-5 mr-2" />
          Salvar Configurações
        </button>
      </div>

      {saveSuccess && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
          <p className="text-green-800">Configurações salvas com sucesso!</p>
        </div>
      )}

      {saveError && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg border-l-4 border-red-500">
          <p className="text-red-800">{saveError}</p>
        </div>
      )}

      <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
        <div className="flex">
          <Info className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="font-medium text-blue-800">Informações da Empresa</h3>
            <p className="text-sm text-blue-700 mt-1">
              Configure as informações básicas da sua empresa e o calendário de trabalho.
              O calendário de trabalho será utilizado para calcular prazos mais precisos para tarefas e etapas de produção.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center mb-4">
            <Building className="h-5 w-5 mr-2 text-blue-600" />
            Dados da Empresa
          </h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nome da Empresa
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Razão Social"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CNPJ
            </label>
            <input
              type="text"
              value={formData.cnpj}
              onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Responsável
            </label>
            <input
              type="text"
              value={formData.responsible}
              onChange={(e) => setFormData({...formData, responsible: e.target.value})}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Nome do responsável"
            />
          </div>

          <div className="pt-4">
            <p className="text-gray-600 text-sm">
              Estas informações serão usadas em relatórios e exportações de documentos.
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium flex items-center mb-4">
            <Calendar className="h-5 w-5 mr-2 text-blue-600" />
            Calendário de Trabalho
          </h3>

          <div className="bg-gray-50 rounded-lg p-4 border mb-4">
            <div className="mb-3 flex justify-between">
              <p className="text-sm text-gray-700">
                Defina os dias e horários de funcionamento da empresa para melhor cálculo de prazos:
              </p>
              <button
                onClick={() => setIsCalendarModalOpen(true)}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Editar Calendário
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-medium">Dia</span>
                <span className="font-medium">Horários</span>
              </div>
              
              <div className="flex justify-between">
                <span>Segunda-feira</span>
                <span className={`text-sm ${calendar.monday.enabled ? 'text-green-600' : 'text-red-500'}`}>
                  {formatWorkingHours('monday')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Terça-feira</span>
                <span className={`text-sm ${calendar.tuesday.enabled ? 'text-green-600' : 'text-red-500'}`}>
                  {formatWorkingHours('tuesday')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Quarta-feira</span>
                <span className={`text-sm ${calendar.wednesday.enabled ? 'text-green-600' : 'text-red-500'}`}>
                  {formatWorkingHours('wednesday')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Quinta-feira</span>
                <span className={`text-sm ${calendar.thursday.enabled ? 'text-green-600' : 'text-red-500'}`}>
                  {formatWorkingHours('thursday')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Sexta-feira</span>
                <span className={`text-sm ${calendar.friday.enabled ? 'text-green-600' : 'text-red-500'}`}>
                  {formatWorkingHours('friday')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Sábado</span>
                <span className={`text-sm ${calendar.saturday.enabled ? 'text-green-600' : 'text-red-500'}`}>
                  {formatWorkingHours('saturday')}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span>Domingo</span>
                <span className={`text-sm ${calendar.sunday.enabled ? 'text-green-600' : 'text-red-500'}`}>
                  {formatWorkingHours('sunday')}
                </span>
              </div>
            </div>
          </div>
          
          <p className="text-gray-600 text-sm">
            Este calendário influencia diretamente no cálculo de prazos para tarefas,
            etapas de produção e estimativas de conclusão de pedidos.
          </p>
        </div>
      </div>

      <div className="mt-8 border-t pt-6">
        <h3 className="text-lg font-medium flex items-center mb-4">
          <FileText className="h-5 w-5 mr-2 text-blue-600" />
          Logo da Empresa para Relatórios
        </h3>
        
        <div className="flex items-start space-x-6">
          <div className="max-w-xs">
            {companyLogo ? (
              <img 
                src={companyLogo} 
                alt="Logo da empresa" 
                className="border rounded p-2 max-h-32 object-contain"
              />
            ) : (
              <div className="border rounded p-4 text-center bg-gray-50 h-32 flex items-center justify-center">
                <span className="text-gray-400">Nenhuma logo configurada</span>
              </div>
            )}
          </div>
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => setIsLogoModalOpen(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <ImageIcon className="h-5 w-5 mr-2" />
              {companyLogo ? 'Alterar Logo' : 'Adicionar Logo'}
            </button>
            <p className="text-sm text-gray-500">
              A logo será usada em todos os relatórios e documentos exportados pelo sistema,
              incluindo orçamentos, pedidos e relatórios de produção.
            </p>
          </div>
        </div>
      </div>

      {isCalendarModalOpen && (
        <CalendarSettingsModal
          calendar={calendar}
          onClose={() => setIsCalendarModalOpen(false)}
          onSave={(newCalendar) => {
            setCalendar(newCalendar);
            setIsCalendarModalOpen(false);
          }}
        />
      )}

      {isLogoModalOpen && (
        <LogoUploadModal onClose={() => setIsLogoModalOpen(false)} />
      )}
    </div>
  );
};

export default CompanySettings;