import React, { useState, useEffect } from 'react';
import { X, Save, Download, FilePlus, Camera, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { QualityReport, DimensionalReport, LiquidPenetrantReport, VisualWeldingReport, UltrasonicReport } from '../types/quality';
import { Order } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface QualityReportsFormProps {
  report: QualityReport;
  order: Order | null;
  onSave: (report: QualityReport) => Promise<void>;
  onCancel: () => void;
}

const QualityReportsForm: React.FC<QualityReportsFormProps> = ({ report, order, onSave, onCancel }) => {
  const { companyName, companyLogo } = useSettingsStore();
  const [formData, setFormData] = useState<QualityReport>(report);
  const [photos, setPhotos] = useState<{id: string; dataUrl: string}[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Initialize with all sections expanded
    const sections: Record<string, boolean> = {};
    sections.basicInfo = true;
    sections.measurements = true;
    sections.findings = true;
    sections.equipment = true;
    setExpandedSections(sections);
  }, []);

  // Set the report number if it's a new report
  useEffect(() => {
    if (report.id === 'new' && !report.reportNumber) {
      const reportPrefix = 
        report.reportType === 'dimensional' ? 'DIM' :
        report.reportType === 'liquid-penetrant' ? 'LP' :
        report.reportType === 'visual-welding' ? 'VT' :
        'UT';

      const reportNumber = `${reportPrefix}-${order?.orderNumber || 'XXX'}-${format(new Date(), 'yyyyMMdd')}-001`;
      setFormData(prev => ({
        ...prev,
        reportNumber
      }));
    }
  }, [report, order]);

  // Function to handle file upload for photos
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotos([...photos, {
        id: crypto.randomUUID(),
        dataUrl
      }]);
    };
    reader.readAsDataURL(file);
  };

  // Function to remove a photo
  const handleRemovePhoto = (photoId: string) => {
    setPhotos(photos.filter(photo => photo.id !== photoId));
  };

  // Function to toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Function to render the specific form based on report type
  const renderReportTypeForm = () => {
    switch (formData.reportType) {
      case 'dimensional':
        return renderDimensionalForm();
      case 'liquid-penetrant':
        return renderLiquidPenetrantForm();
      case 'visual-welding':
        return renderVisualWeldingForm();
      case 'ultrasonic':
        return renderUltrasonicForm();
      case 'painting':
        return renderPaintingForm();
      default:
        return null;
    }
  };

  // Function to render dimensional report form
  const renderDimensionalForm = () => {
    const dimensionalData = formData as DimensionalReport;
    
    return (
      <>
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('equipment')}>
            <h3 className="text-lg font-medium">Equipamento e Condições</h3>
            {expandedSections.equipment ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
          
          {expandedSections.equipment && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Norma de Referência
                </label>
                <input
                  type="text"
                  value={dimensionalData.standard || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    standard: e.target.value
                  } as DimensionalReport)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: ABNT NBR 15516"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número do Desenho
                </label>
                <input
                  type="text"
                  value={dimensionalData.drawingNumber || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    drawingNumber: e.target.value
                  } as DimensionalReport)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: DWG-123-456"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Revisão do Desenho
                </label>
                <input
                  type="text"
                  value={dimensionalData.drawingRevision || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    drawingRevision: e.target.value
                  } as DimensionalReport)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: Rev. A"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Equipamento Utilizado
                </label>
                <input
                  type="text"
                  value={dimensionalData.equipment || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    equipment: e.target.value
                  } as DimensionalReport)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: Paquímetro Digital Mitutoyo"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temperatura (°C)
                </label>
                <input
                  type="number"
                  value={dimensionalData.temperature || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    temperature: parseFloat(e.target.value)
                  } as DimensionalReport)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: 23.5"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Umidade (%)
                </label>
                <input
                  type="number"
                  value={dimensionalData.humidity || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    humidity: parseFloat(e.target.value)
                  } as DimensionalReport)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  placeholder="Ex: 65"
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('measurements')}>
            <h3 className="text-lg font-medium">Medições</h3>
            {expandedSections.measurements ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
          
          {expandedSections.measurements && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dimensão</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Nominal</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tolerância (+/-)</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Medido</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidade</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {dimensionalData.measurements?.map((measurement, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{measurement.dimensionName}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{measurement.nominalValue}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                          +{measurement.tolerance.upper} / -{measurement.tolerance.lower}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{measurement.actualValue}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{measurement.unit}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            measurement.isWithinTolerance 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {measurement.isWithinTolerance ? 'Conforme' : 'Não Conforme'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => {
                              // Delete measurement logic
                              const updatedMeasurements = [...(dimensionalData.measurements || [])];
                              updatedMeasurements.splice(index, 1);
                              setFormData({
                                ...formData,
                                measurements: updatedMeasurements
                              } as DimensionalReport);
                            }}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Form to add a new measurement */}
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                <h4 className="text-sm font-medium mb-3">Adicionar Nova Medição</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Dimensão
                    </label>
                    <input
                      type="text"
                      id="new-dimension"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                      placeholder="Ex: Diâmetro, Largura"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Valor Nominal
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="new-nominal"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tolerância Superior
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="new-tolerance-upper"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tolerância Inferior
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="new-tolerance-lower"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Valor Medido
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="new-actual"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Unidade
                    </label>
                    <select
                      id="new-unit"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                    >
                      <option value="mm">mm</option>
                      <option value="cm">cm</option>
                      <option value="m">m</option>
                      <option value="in">in</option>
                      <option value="°">° (graus)</option>
                    </select>
                  </div>
                </div>
                
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const dimensionName = (document.getElementById('new-dimension') as HTMLInputElement).value;
                      const nominalValue = parseFloat((document.getElementById('new-nominal') as HTMLInputElement).value);
                      const upper = parseFloat((document.getElementById('new-tolerance-upper') as HTMLInputElement).value);
                      const lower = parseFloat((document.getElementById('new-tolerance-lower') as HTMLInputElement).value);
                      const actualValue = parseFloat((document.getElementById('new-actual') as HTMLInputElement).value);
                      const unit = (document.getElementById('new-unit') as HTMLSelectElement).value;
                      
                      if (!dimensionName || isNaN(nominalValue) || isNaN(upper) || isNaN(lower) || isNaN(actualValue)) {
                        alert('Todos os campos são obrigatórios e devem ser numéricos');
                        return;
                      }
                      
                      const isWithinTolerance = 
                        actualValue >= (nominalValue - lower) && 
                        actualValue <= (nominalValue + upper);
                      
                      const newMeasurement = {
                        id: crypto.randomUUID(),
                        dimensionName,
                        nominalValue,
                        actualValue,
                        unit,
                        tolerance: { upper, lower },
                        isWithinTolerance
                      };
                      
                      setFormData({
                        ...formData,
                        measurements: [...(dimensionalData.measurements || []), newMeasurement]
                      } as DimensionalReport);
                      
                      // Clear form fields
                      (document.getElementById('new-dimension') as HTMLInputElement).value = '';
                      (document.getElementById('new-nominal') as HTMLInputElement).value = '';
                      (document.getElementById('new-tolerance-upper') as HTMLInputElement).value = '';
                      (document.getElementById('new-tolerance-lower') as HTMLInputElement).value = '';
                      (document.getElementById('new-actual') as HTMLInputElement).value = '';
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Adicionar Medição
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  // Function to render liquid penetrant report form 
  const renderLiquidPenetrantForm = () => {
    const lpData = formData as LiquidPenetrantReport;
    
    return (
      <div className="border-t pt-6 mt-6">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('lpDetails')}>
          <h3 className="text-lg font-medium">Detalhes do Ensaio de Líquido Penetrante</h3>
          {expandedSections.lpDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        
        {expandedSections.lpDetails && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Norma de Referência
              </label>
              <input
                type="text"
                value={lpData.standard || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  standard: e.target.value
                } as LiquidPenetrantReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: ASME V, Article 6"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material
              </label>
              <input
                type="text"
                value={lpData.material || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  material: e.target.value
                } as LiquidPenetrantReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: Aço Carbono ASTM A36"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condição da Superfície
              </label>
              <input
                type="text"
                value={lpData.surfaceCondition || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  surfaceCondition: e.target.value
                } as LiquidPenetrantReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: Jateada, Lixada"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Penetrante
              </label>
              <input
                type="text"
                value={lpData.penetrantType || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  penetrantType: e.target.value
                } as LiquidPenetrantReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: Tipo II, post-emulsificável"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Método de Penetrante
              </label>
              <select
                value={lpData.penetrantMethod || 'visible'}
                onChange={(e) => setFormData({
                  ...formData,
                  penetrantMethod: e.target.value as 'visible' | 'fluorescent'
                } as LiquidPenetrantReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="visible">Visível (Colorido)</option>
                <option value="fluorescent">Fluorescente</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Critérios de Aceitação
              </label>
              <input
                type="text"
                value={lpData.acceptanceCriteria || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  acceptanceCriteria: e.target.value
                } as LiquidPenetrantReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: ASME VIII Div. 1 Ap.8"
                required
              />
            </div>
          </div>
        )}
        
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('lpFindings')}>
            <h3 className="text-lg font-medium">Observações e Descontinuidades</h3>
            {expandedSections.lpFindings ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
          
          {expandedSections.lpFindings && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Localização</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dimensão</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resultado</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {lpData.findings?.map((finding, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{finding.locationDescription}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{finding.indicationType}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{finding.size} {finding.unit}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            finding.result === 'acceptable' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {finding.result === 'acceptable' ? 'Aceitável' : 'Rejeitável'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => {
                              // Delete finding logic
                              const updatedFindings = [...(lpData.findings || [])];
                              updatedFindings.splice(index, 1);
                              setFormData({
                                ...formData,
                                findings: updatedFindings
                              } as LiquidPenetrantReport);
                            }}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Function to render visual welding report form
  const renderVisualWeldingForm = () => {
    const vtData = formData as VisualWeldingReport;
    
    return (
      <div className="border-t pt-6 mt-6">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('vtDetails')}>
          <h3 className="text-lg font-medium">Detalhes do Ensaio Visual de Solda</h3>
          {expandedSections.vtDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        
        {expandedSections.vtDetails && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Norma de Referência
              </label>
              <input
                type="text"
                value={vtData.standard || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  standard: e.target.value
                } as VisualWeldingReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: AWS D1.1"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Referência do Desenho
              </label>
              <input
                type="text"
                value={vtData.drawingReference || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  drawingReference: e.target.value
                } as VisualWeldingReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: DWG-123-456"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Junta
              </label>
              <input
                type="text"
                value={vtData.weldJointType || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  weldJointType: e.target.value
                } as VisualWeldingReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: Topo, Ângulo"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Posição de Solda
              </label>
              <input
                type="text"
                value={vtData.weldPosition || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  weldPosition: e.target.value
                } as VisualWeldingReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: 1G, 2F"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material
              </label>
              <input
                type="text"
                value={vtData.material || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  material: e.target.value
                } as VisualWeldingReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: Aço Carbono ASTM A36"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Processo de Soldagem
              </label>
              <input
                type="text"
                value={vtData.weldingProcess || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  weldingProcess: e.target.value
                } as VisualWeldingReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: GMAW, SMAW"
                required
              />
            </div>
          </div>
        )}
        
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('vtJoints')}>
            <h3 className="text-lg font-medium">Juntas de Solda</h3>
            {expandedSections.vtJoints ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
          
          {expandedSections.vtJoints && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID da Junta</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Localização</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resultado</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {vtData.weldJoints?.map((joint, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{joint.jointId}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{joint.location}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            joint.result === 'acceptable' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {joint.result === 'acceptable' ? 'Aceitável' : 'Rejeitável'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => {
                              // Delete joint logic
                              const updatedJoints = [...(vtData.weldJoints || [])];
                              updatedJoints.splice(index, 1);
                              setFormData({
                                ...formData,
                                weldJoints: updatedJoints
                              } as VisualWeldingReport);
                            }}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Function to render ultrasonic report form
  const renderUltrasonicForm = () => {
    const utData = formData as UltrasonicReport;
    
    return (
      <div className="border-t pt-6 mt-6">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('utDetails')}>
          <h3 className="text-lg font-medium">Detalhes do Ensaio de Ultrassom</h3>
          {expandedSections.utDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        
        {expandedSections.utDetails && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Norma de Referência
              </label>
              <input
                type="text"
                value={utData.standard || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  standard: e.target.value
                } as UltrasonicReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: ASME V, Article 4"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material
              </label>
              <input
                type="text"
                value={utData.material || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  material: e.target.value
                } as UltrasonicReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: Aço Carbono ASTM A36"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Espessura (mm)
              </label>
              <input
                type="number"
                step="0.01"
                value={utData.thickness || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  thickness: parseFloat(e.target.value)
                } as UltrasonicReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: 10.5"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Técnica de Varredura
              </label>
              <select
                value={utData.scanTechnique || 'pulse-echo'}
                onChange={(e) => setFormData({
                  ...formData,
                  scanTechnique: e.target.value as any
                } as UltrasonicReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              >
                <option value="pulse-echo">Pulso-Eco</option>
                <option value="through-transmission">Transparência</option>
                <option value="phased-array">Phased Array</option>
                <option value="TOFD">TOFD</option>
                <option value="other">Outro</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Critérios de Aceitação
              </label>
              <input
                type="text"
                value={utData.acceptanceCriteria || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  acceptanceCriteria: e.target.value
                } as UltrasonicReport)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: ASME VIII Div. 1 Ap.12"
                required
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPaintingForm = () => (
    <div className="space-y-4">
      {/* 1. Identificação do Projeto */}
      <h3 className="text-lg font-bold mt-4">1. Identificação do Projeto</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Nome do cliente" className="input" />
        <input type="text" placeholder="Nome do projeto ou obra" className="input" />
        <input type="text" placeholder="Local da aplicação" className="input" />
        <input type="text" placeholder="Nº do contrato ou ordem de serviço" className="input" />
        <input type="date" placeholder="Data(s) da aplicação" className="input" />
        <input type="text" placeholder="Responsável pela aplicação" className="input" />
        <input type="text" placeholder="Responsável pela inspeção" className="input" />
      </div>
      {/* 2. Especificação Técnica da Pintura */}
      <h3 className="text-lg font-bold mt-4">2. Especificação Técnica da Pintura</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Tipo de sistema de pintura" className="input" />
        <input type="text" placeholder="Número de demãos e produtos usados" className="input" />
        <input type="text" placeholder="Espessura requerida por demão e total (DFT)" className="input" />
        <input type="text" placeholder="Cor (RAL ou Munsell)" className="input" />
        <input type="text" placeholder="Condições ambientais permitidas" className="input" />
      </div>
      {/* 3. Condições Ambientais na Aplicação */}
      <h3 className="text-lg font-bold mt-4">3. Condições Ambientais na Aplicação</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Temperatura ambiente e da superfície" className="input" />
        <input type="text" placeholder="Umidade relativa do ar" className="input" />
        <input type="text" placeholder="Ponto de orvalho (com cálculo)" className="input" />
        <input type="text" placeholder="Condição do clima" className="input" />
      </div>
      {/* 4. Preparação da Superfície */}
      <h3 className="text-lg font-bold mt-4">4. Preparação da Superfície</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Tipo de preparação" className="input" />
        <input type="text" placeholder="Padrão de limpeza" className="input" />
        <input type="text" placeholder="Perfil de rugosidade" className="input" />
        <input type="datetime-local" placeholder="Data/hora da preparação" className="input" />
        <input type="text" placeholder="Equipamento e abrasivo utilizado" className="input" />
      </div>
      {/* 5. Aplicação da Tinta */}
      <h3 className="text-lg font-bold mt-4">5. Aplicação da Tinta</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Produto aplicado e fabricante" className="input" />
        <input type="text" placeholder="Nº do lote da tinta e validade" className="input" />
        <input type="text" placeholder="Ferramenta usada" className="input" />
        <input type="text" placeholder="Mistura, catalisador e diluente usados" className="input" />
        <input type="text" placeholder="Tempo de indução e pot-life" className="input" />
        <input type="text" placeholder="Intervalo entre demãos" className="input" />
        <input type="text" placeholder="Espessura aplicada (DFT)" className="input" />
      </div>
      {/* 6. Ensaios e Inspeções Realizadas */}
      <h3 className="text-lg font-bold mt-4">6. Ensaios e Inspeções Realizadas</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Medição de espessura (por área)" className="input" />
        <input type="text" placeholder="Teste de aderência" className="input" />
        <input type="text" placeholder="Teste de cura" className="input" />
        <input type="text" placeholder="Teste de continuidade" className="input" />
        <input type="text" placeholder="Observação de falhas" className="input" />
      </div>
      {/* 7. Registros Fotográficos */}
      <h3 className="text-lg font-bold mt-4">7. Registros Fotográficos</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Fotos da preparação de superfície" className="input" />
        <input type="text" placeholder="Fotos da aplicação" className="input" />
        <input type="text" placeholder="Fotos dos instrumentos utilizados" className="input" />
        <input type="text" placeholder="Fotos da condição final" className="input" />
      </div>
      {/* 8. Observações Adicionais */}
      <h3 className="text-lg font-bold mt-4">8. Observações Adicionais</h3>
      <textarea className="input" placeholder="Não conformidades, correções, restrições, interferências..."></textarea>
      {/* 9. Assinaturas */}
      <h3 className="text-lg font-bold mt-4">9. Assinaturas</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" placeholder="Pintor ou equipe de aplicação" className="input" />
        <input type="text" placeholder="Inspetor de pintura" className="input" />
        <input type="text" placeholder="Cliente (opcional)" className="input" />
      </div>
    </div>
  );

  // Function to handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Prepare data for saving
      const reportToSave = {
        ...formData,
        updatedAt: new Date().toISOString()
      };

      // Save report
      await onSave(reportToSave);
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Erro ao salvar relatório. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Function to export report to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    let y = 20;

    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 15, 10, 40, 20);
      y = 40;
    }

    // Add title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    
    let title = 'RELATÓRIO DE INSPEÇÃO';
    switch(formData.reportType) {
      case 'dimensional':
        title = 'RELATÓRIO DE INSPEÇÃO DIMENSIONAL';
        break;
      case 'liquid-penetrant':
        title = 'RELATÓRIO DE ENSAIO POR LÍQUIDO PENETRANTE';
        break;
      case 'visual-welding':
        title = 'RELATÓRIO DE INSPEÇÃO VISUAL DE SOLDA';
        break;
      case 'ultrasonic':
        title = 'RELATÓRIO DE ENSAIO ULTRASÔNICO';
        break;
      case 'painting':
        title = 'RELATÓRIO DE INSPEÇÃO DE PINTURA';
        break;
    }
    
    doc.text(title, 105, y, { align: 'center' });
    y += 10;

    // Add company name if available
    if (companyName) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 8;
    }

    // Add report details
    doc.setFontSize(11);
    doc.text(`Relatório Nº: ${formData.reportNumber}`, 15, y);
    y += 7;
    doc.text(`Data da Inspeção: ${format(new Date(formData.inspectionDate), 'dd/MM/yyyy', { locale: ptBR })}`, 15, y);
    y += 7;
    doc.text(`Inspetor: ${formData.inspector}`, 15, y);
    y += 7;

    if (order) {
      doc.text(`Pedido: #${order.orderNumber} - ${order.customer}`, 15, y);
      y += 7;
      
      // Add item details if available
      const item = order.items.find(i => i.id === formData.itemId);
      if (item) {
        doc.text(`Item: ${item.code} - ${item.description}`, 15, y);
        y += 7;
      }
    }

    doc.text(`Status: ${
      formData.status === 'approved' ? 'Aprovado' :
      formData.status === 'rejected' ? 'Reprovado' :
      formData.status === 'pending-review' ? 'Aguardando Revisão' :
      'Rascunho'
    }`, 15, y);
    y += 15;

    // Add specific report details based on type
    if (formData.reportType === 'dimensional') {
      const dimensionalData = formData as DimensionalReport;
      
      // Equipment section
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('INFORMAÇÕES DO ENSAIO', 15, y);
      y += 7;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Norma de Referência: ${dimensionalData.standard || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Número do Desenho: ${dimensionalData.drawingNumber || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Revisão do Desenho: ${dimensionalData.drawingRevision || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Equipamento Utilizado: ${dimensionalData.equipment || 'N/A'}`, 15, y);
      y += 15;
      
      // Measurements table
      if (dimensionalData.measurements && dimensionalData.measurements.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('MEDIÇÕES', 15, y);
        y += 10;
        
        (doc as any).autoTable({
          startY: y,
          head: [['Dimensão', 'Nominal', 'Tolerância', 'Medido', 'Unidade', 'Resultado']],
          body: dimensionalData.measurements.map(m => [
            m.dimensionName,
            m.nominalValue,
            `+${m.tolerance.upper} / -${m.tolerance.lower}`,
            m.actualValue,
            m.unit,
            m.isWithinTolerance ? 'Conforme' : 'Não Conforme'
          ]),
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255]
          },
          columnStyles: {
            5: { 
              halign: 'center',
              cellCallback: function(cell, data) {
                if (data.row.section === 'body') {
                  const isConforme = cell.raw === 'Conforme';
                  cell.styles.fillColor = isConforme ? [209, 250, 229] : [254, 226, 226];
                  cell.styles.textColor = isConforme ? [6, 95, 70] : [153, 27, 27];
                }
              }
            }
          }
        });
        
        y = (doc as any).lastAutoTable.finalY + 15;
      }
    }
    else if (formData.reportType === 'liquid-penetrant') {
      // Add liquid penetrant specific details
      const lpData = formData as LiquidPenetrantReport;
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('INFORMAÇÕES DO ENSAIO', 15, y);
      y += 7;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Norma de Referência: ${lpData.standard || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Material: ${lpData.material || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Condição da Superfície: ${lpData.surfaceCondition || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Tipo de Penetrante: ${lpData.penetrantType || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Método: ${lpData.penetrantMethod === 'visible' ? 'Visível (Colorido)' : 'Fluorescente'}`, 15, y);
      y += 6;
      doc.text(`Critérios de Aceitação: ${lpData.acceptanceCriteria || 'N/A'}`, 15, y);
      y += 15;
      
      // Findings table
      if (lpData.findings && lpData.findings.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('INDICAÇÕES ENCONTRADAS', 15, y);
        y += 10;
        
        (doc as any).autoTable({
          startY: y,
          head: [['Localização', 'Tipo', 'Tamanho', 'Resultado', 'Observações']],
          body: lpData.findings.map(f => [
            f.locationDescription,
            f.indicationType,
            `${f.size} ${f.unit}`,
            f.result === 'acceptable' ? 'Aceitável' : 'Rejeitável',
            f.comments || '-'
          ]),
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255]
          },
          columnStyles: {
            3: { 
              halign: 'center',
              cellCallback: function(cell, data) {
                if (data.row.section === 'body') {
                  const isAcceptable = cell.raw === 'Aceitável';
                  cell.styles.fillColor = isAcceptable ? [209, 250, 229] : [254, 226, 226];
                  cell.styles.textColor = isAcceptable ? [6, 95, 70] : [153, 27, 27];
                }
              }
            }
          }
        });
        
        y = (doc as any).lastAutoTable.finalY + 15;
      }
    }
    else if (formData.reportType === 'visual-welding') {
      // Add visual welding specific details
      const vtData = formData as VisualWeldingReport;
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('INFORMAÇÕES DO ENSAIO', 15, y);
      y += 7;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Norma de Referência: ${vtData.standard || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Desenho de Referência: ${vtData.drawingReference || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Tipo de Junta: ${vtData.weldJointType || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Posição de Solda: ${vtData.weldPosition || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Material: ${vtData.material || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Processo de Soldagem: ${vtData.weldingProcess || 'N/A'}`, 15, y);
      y += 15;
      
      // Weld Joints table
      if (vtData.weldJoints && vtData.weldJoints.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('JUNTAS INSPECIONADAS', 15, y);
        y += 10;
        
        (doc as any).autoTable({
          startY: y,
          head: [['ID da Junta', 'Localização', 'Resultado', 'Observações']],
          body: vtData.weldJoints.map(j => [
            j.jointId,
            j.location,
            j.result === 'acceptable' ? 'Aceitável' : 'Rejeitável',
            j.comments || '-'
          ]),
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255]
          },
          columnStyles: {
            2: { 
              halign: 'center',
              cellCallback: function(cell, data) {
                if (data.row.section === 'body') {
                  const isAcceptable = cell.raw === 'Aceitável';
                  cell.styles.fillColor = isAcceptable ? [209, 250, 229] : [254, 226, 226];
                  cell.styles.textColor = isAcceptable ? [6, 95, 70] : [153, 27, 27];
                }
              }
            }
          }
        });
        
        y = (doc as any).lastAutoTable.finalY + 15;
      }
    }
    else if (formData.reportType === 'ultrasonic') {
      // Add ultrasonic specific details
      const utData = formData as UltrasonicReport;
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('INFORMAÇÕES DO ENSAIO', 15, y);
      y += 7;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Norma de Referência: ${utData.standard || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Material: ${utData.material || 'N/A'}`, 15, y);
      y += 6;
      doc.text(`Espessura: ${utData.thickness || 'N/A'} mm`, 15, y);
      y += 6;
      doc.text(`Técnica: ${
        utData.scanTechnique === 'pulse-echo' ? 'Pulso-Eco' :
        utData.scanTechnique === 'through-transmission' ? 'Transparência' :
        utData.scanTechnique === 'phased-array' ? 'Phased Array' :
        utData.scanTechnique === 'TOFD' ? 'TOFD' : 'Outro'
      }`, 15, y);
      y += 6;
      doc.text(`Critérios de Aceitação: ${utData.acceptanceCriteria || 'N/A'}`, 15, y);
      y += 15;
      
      // Indications table
      if (utData.indications && utData.indications.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('INDICAÇÕES ENCONTRADAS', 15, y);
        y += 10;
        
        (doc as any).autoTable({
          startY: y,
          head: [['Localização', 'Tipo', 'Profundidade', 'Tamanho', 'Resultado']],
          body: utData.indications.map(i => [
            `${i.locationType} - ${i.locationDetails}`,
            i.indicationType,
            `${i.depth} mm`,
            `${i.size.length} x ${i.size.width || 'N/A'} mm`,
            i.result === 'acceptable' ? 'Aceitável' : 'Rejeitável'
          ]),
          theme: 'striped',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255]
          },
          columnStyles: {
            4: { 
              halign: 'center',
              cellCallback: function(cell, data) {
                if (data.row.section === 'body') {
                  const isAcceptable = cell.raw === 'Aceitável';
                  cell.styles.fillColor = isAcceptable ? [209, 250, 229] : [254, 226, 226];
                  cell.styles.textColor = isAcceptable ? [6, 95, 70] : [153, 27, 27];
                }
              }
            }
          }
        });
        
        y = (doc as any).lastAutoTable.finalY + 15;
      }
    }
    else if (formData.reportType === 'painting') {
      // Add painting specific details
      renderPaintingForm();
    }

    // Add photos section if there are photos
    if (photos.length > 0) {
      doc.addPage();
      y = 20;
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('FOTOGRAFIAS', 15, y);
      y += 15;

      // Calculate dimensions for photos (2 per row)
      const photoWidth = 85;
      const photoHeight = 65;
      const margin = 15;
      const col2X = margin + photoWidth + 10;
      
      for (let i = 0; i < photos.length; i++) {
        const isEvenRow = i % 2 === 0;
        const xPos = isEvenRow ? margin : col2X;
        
        // Add a new page if we run out of space
        if (y + photoHeight > 270) {
          doc.addPage();
          y = 20;
        }
        
        try {
          doc.addImage(photos[i].dataUrl, 'JPEG', xPos, y, photoWidth, photoHeight);
          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.text(`Foto ${i + 1}`, xPos, y + photoHeight + 5);
          
          // Only move to next row after every second photo
          if (!isEvenRow || i === photos.length - 1) {
            y += photoHeight + 10;
          }
        } catch (error) {
          console.error('Error adding image to PDF:', error);
          // Add error text instead of image
          doc.setFontSize(10);
          doc.text('Erro ao adicionar imagem', xPos, y + 20);
          if (!isEvenRow || i === photos.length - 1) {
            y += photoHeight + 10;
          }
        }
      }
    }

    // Add comments section
    if (formData.comments) {
      // Add a new page if we're close to the bottom
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('OBSERVAÇÕES', 15, y);
      y += 10;
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const commentLines = doc.splitTextToSize(formData.comments, 180);
      doc.text(commentLines, 15, y);
      y += commentLines.length * 5 + 10;
    }

    // Add signature and approval section
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('APROVAÇÃO', 15, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Inspetor: ${formData.inspector}`, 15, y);
    y += 20;
    
    doc.line(15, y, 80, y);
    doc.text('Assinatura', 45, y+5);
    y += 10;

    // Add date at the bottom
    doc.setFontSize(8);
    doc.text(`Relatório gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 15, 280);

    // Add page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Página ${i} de ${pageCount}`, 195, 280, { align: 'right' });
    }

    // Save the PDF
    doc.save(`Relatorio_${formData.reportType}_${formData.reportNumber.replace(/\//g, '_')}.pdf`);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">
          {report.id === 'new' ? 'Novo Relatório' : 'Editar Relatório'}
          {' '}
          {report.reportType === 'dimensional' ? 'Dimensional' :
           report.reportType === 'liquid-penetrant' ? 'de Líquido Penetrante' :
           report.reportType === 'visual-welding' ? 'de Inspeção Visual de Solda' :
           report.reportType === 'ultrasonic' ? 'de Ultrassom' : 'de Pintura'}
        </h2>
        <div className="flex space-x-3">
          {report.id !== 'new' && (
            <button
              type="button"
              onClick={handleExportPDF}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
            >
              <Download className="h-5 w-5 mr-2" />
              Exportar PDF
            </button>
          )}
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('basicInfo')}>
          <h3 className="text-lg font-medium">Informações Básicas</h3>
          {expandedSections.basicInfo ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        
        {expandedSections.basicInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número do Relatório
              </label>
              <input
                type="text"
                value={formData.reportNumber}
                onChange={(e) => setFormData({ ...formData, reportNumber: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: DIM-001-2025"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inspetor
              </label>
              <input
                type="text"
                value={formData.inspector}
                onChange={(e) => setFormData({ ...formData, inspector: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Nome do inspetor"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data da Inspeção
              </label>
              <input
                type="date"
                value={formData.inspectionDate.split('T')[0]}
                onChange={(e) => setFormData({ ...formData, inspectionDate: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>
            
            {order && (
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Inspecionado
                </label>
                <select
                  value={formData.itemId}
                  onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  required
                >
                  <option value="">Selecione um item</option>
                  {order.items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.code} - {item.description}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="draft">Rascunho</option>
                <option value="pending-review">Aguardando Revisão</option>
                <option value="approved">Aprovado</option>
                <option value="rejected">Rejeitado</option>
              </select>
            </div>
            
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.comments || ''}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={3}
                placeholder="Observações gerais sobre a inspeção"
              />
            </div>
          </div>
        )}

        {/* Report type specific form */}
        {renderReportTypeForm()}

        {/* Photos section */}
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('photos')}>
            <h3 className="text-lg font-medium">Fotografias</h3>
            {expandedSections.photos ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
          
          {expandedSections.photos && (
            <div className="mt-4">
              <div className="flex items-center space-x-4 mb-4">
                <input
                  type="file"
                  id="photo-upload"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <label
                  htmlFor="photo-upload"
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Adicionar Foto
                </label>
              </div>
              
              {photos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {photos.map((photo, index) => (
                    <div key={photo.id} className="border rounded-lg overflow-hidden">
                      <img
                        src={photo.dataUrl}
                        alt={`Foto ${index + 1}`}
                        className="w-full h-40 object-cover"
                      />
                      <div className="p-3 flex justify-between items-center">
                        <span className="text-sm font-medium">Foto {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(photo.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
                  <Camera className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">Nenhuma foto adicionada</p>
                  <p className="text-gray-400 text-sm mt-1">Clique em "Adicionar Foto" para incluir fotografias da inspeção</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-6">
          <button
            type="button"
            onClick={handleExportPDF}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar PDF
          </button>
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
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                Salvar
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default QualityReportsForm;