import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import WeldingMachineList from './WeldingMachineList';
import WeldingMachineCalibration from './WeldingMachineCalibration';
import { Settings, Calendar, Info } from 'lucide-react';

const QualityCalibration: React.FC = () => {
  const [activeTab, setActiveTab] = useState('machines');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Calibração de Equipamentos</h2>
        <p className="text-gray-600 mt-1">
          Gerencie equipamentos e registros de calibração para garantir a qualidade do processo de solda.
        </p>
      </div>

      <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg mb-6">
        <div className="flex">
          <Info className="h-5 w-5 text-blue-500 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-blue-800">Sobre Calibração de Equipamentos</h3>
            <p className="text-sm text-blue-700 mt-1">
              A calibração regular dos equipamentos de solda é essencial para garantir a qualidade e conformidade com as normas técnicas. 
              Os registros de calibração incluem fotos dos equipamentos e medidas detalhadas dos parâmetros.
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Para iniciar, cadastre suas máquinas na aba "Máquinas de Solda" e depois registre as calibrações na aba "Calibrações".
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="machines" onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="machines" className="flex items-center">
            <Settings className="h-4 w-4 mr-2" />
            Máquinas de Solda
          </TabsTrigger>
          <TabsTrigger value="calibrations" className="flex items-center">
            <Calendar className="h-4 w-4 mr-2" />
            Calibrações
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="machines">
          <WeldingMachineList />
        </TabsContent>
        
        <TabsContent value="calibrations">
          <WeldingMachineCalibration />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QualityCalibration;