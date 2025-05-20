import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileCheck, 
  FileWarning,
  TrendingUp, 
  TrendingDown
} from 'lucide-react';
import { QualityDocument, DocumentValidation, NonConformity, InspectionResult } from '../types/quality';
import { Order } from '../types/kanban';

interface QualityMetricsProps {
  order: Order;
  nonConformities: NonConformity[];
  inspections: InspectionResult[];
  documents: QualityDocument[];
}

const QualityMetrics: React.FC<QualityMetricsProps> = ({
  order,
  nonConformities,
  inspections,
  documents
}) => {
  // Calculate document metrics
  const totalDocuments = documents.length;
  const verifiedDocuments = documents.filter(d => d.status === 'verified').length;
  const pendingDocuments = documents.filter(d => d.status === 'pending').length;
  const documentComplianceRate = totalDocuments > 0 
    ? Math.round((verifiedDocuments / totalDocuments) * 100) 
    : 0;

  // Calculate non-conformity metrics
  const openNonConformities = nonConformities.filter(nc => nc.status === 'open' || nc.status === 'in-progress').length;
  const resolvedNonConformities = nonConformities.filter(nc => nc.status === 'resolved' || nc.status === 'closed').length;
  const criticalNonConformities = nonConformities.filter(nc => nc.severity === 'critical').length;
  
  // Calculate inspection metrics
  const passedInspections = inspections.filter(i => i.status === 'passed').length;
  const failedInspections = inspections.filter(i => i.status === 'failed').length;
  const partialInspections = inspections.filter(i => i.status === 'partial').length;
  
  const passRate = inspections.length > 0 
    ? Math.round((passedInspections / inspections.length) * 100) 
    : 0;

  // Prepare data for charts
  const documentStatusData = [
    { name: 'Verificados', value: verifiedDocuments, color: '#10B981' },
    { name: 'Pendentes', value: pendingDocuments, color: '#F59E0B' }
  ];

  const nonConformityStatusData = [
    { name: 'Abertas', value: openNonConformities, color: '#EF4444' },
    { name: 'Resolvidas', value: resolvedNonConformities, color: '#10B981' }
  ];

  const nonConformitySeverityData = nonConformities.reduce((acc, nc) => {
    const severityName = nc.severity === 'low' ? 'Baixa' : 
                        nc.severity === 'medium' ? 'Média' : 
                        nc.severity === 'high' ? 'Alta' : 'Crítica';
                        
    const existing = acc.find(item => item.name === severityName);
    if (existing) {
      existing.value++;
    } else {
      acc.push({ 
        name: severityName, 
        value: 1, 
        color: nc.severity === 'low' ? '#60A5FA' : 
              nc.severity === 'medium' ? '#FBBF24' : 
              nc.severity === 'high' ? '#F97316' : 
              '#EF4444'
      });
    }
    return acc;
  }, [] as {name: string, value: number, color: string}[]);

  const inspectionStatusData = [
    { name: 'Aprovado', value: passedInspections, color: '#10B981' },
    { name: 'Parcial', value: partialInspections, color: '#F59E0B' },
    { name: 'Reprovado', value: failedInspections, color: '#EF4444' }
  ];

  // This would normally come from historical data
  const trendData = [
    { month: 'Jan', nc: 5, passRate: 78 },
    { month: 'Fev', nc: 3, passRate: 85 },
    { month: 'Mar', nc: 7, passRate: 80 },
    { month: 'Abr', nc: 2, passRate: 91 },
    { month: 'Mai', nc: 3, passRate: 88 },
    { month: 'Jun', nc: 1, passRate: 94 },
  ];

  // Helper to determine status color
  const getStatusColor = (value: number, thresholds: {warning: number, good: number}) => {
    if (value >= thresholds.good) return 'text-green-600';
    if (value >= thresholds.warning) return 'text-yellow-600'; 
    return 'text-red-600';
  };

  // Render a KPI card
  const renderKpiCard = (
    title: string, 
    value: number | string, 
    icon: React.ReactNode,
    color: string,
    detail?: string,
    trend?: { value: number, positive: boolean }
  ) => (
    <div className={`p-5 rounded-lg border border-gray-200 bg-gradient-to-br from-white to-${color}-50`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <div className="mt-2 flex items-center">
            <span className={`text-2xl font-bold ${color}`}>{value}</span>
            {trend && (
              <span className={`ml-2 flex items-center text-sm ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.positive 
                  ? <TrendingUp className="h-4 w-4 mr-1" /> 
                  : <TrendingDown className="h-4 w-4 mr-1" />
                }
                {Math.abs(trend.value)}%
              </span>
            )}
          </div>
          {detail && <p className="mt-1 text-sm text-gray-500">{detail}</p>}
        </div>
        <div className={`p-2 rounded-full bg-${color}-100`}>
          {icon}
        </div>
      </div>
    </div>
  );

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color || entry.fill }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {renderKpiCard(
          "Taxa de Conformidade", 
          `${documentComplianceRate}%`,
          <FileCheck className="h-6 w-6 text-green-600" />,
          "text-green-600",
          `${verifiedDocuments}/${totalDocuments} documentos verificados`
        )}
        
        {renderKpiCard(
          "Não Conformidades", 
          openNonConformities,
          <AlertCircle className="h-6 w-6 text-red-600" />,
          "text-red-600",
          `${criticalNonConformities} críticas`
        )}
        
        {renderKpiCard(
          "Taxa de Aprovação", 
          `${passRate}%`,
          <CheckCircle className="h-6 w-6 text-blue-600" />,
          "text-blue-600",
          `${passedInspections}/${inspections.length} inspeções aprovadas`
        )}
        
        {renderKpiCard(
          "Qualidade Geral", 
          getQualityRating(documentComplianceRate, openNonConformities, passRate),
          <CheckCircle className="h-6 w-6 text-purple-600" />,
          getQualityRatingColor(documentComplianceRate, openNonConformities, passRate),
          "Baseado em todos os indicadores"
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents Status */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium mb-4">Status dos Documentos</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={documentStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {documentStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Non-Conformities by Severity */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium mb-4">Não Conformidades por Severidade</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nonConformitySeverityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Quantidade">
                  {nonConformitySeverityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inspection Results */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium mb-4">Resultados das Inspeções</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={inspectionStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {inspectionStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quality Trends */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium mb-4">Tendências de Qualidade</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" orientation="left" stroke="#82ca9d" domain={[0, 100]} />
                <YAxis yAxisId="right" orientation="right" stroke="#8884d8" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="passRate" name="Taxa de Aprovação (%)" stroke="#82ca9d" activeDot={{ r: 8 }} />
                <Line yAxisId="right" type="monotone" dataKey="nc" name="Não Conformidades" stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Quality Indicators Table */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-medium mb-4">Indicadores de Qualidade</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Indicador</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Atual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meta</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tendência</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Taxa de Conformidade Documental</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(documentComplianceRate, { warning: 70, good: 90 })}`}>
                    {documentComplianceRate >= 90 ? 'Excelente' : documentComplianceRate >= 70 ? 'Satisfatório' : 'Insatisfatório'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{documentComplianceRate}%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">90%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <TrendingUp className="h-5 w-5 text-green-600 inline-block" />
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Taxa de Aprovação em Inspeções</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(passRate, { warning: 70, good: 85 })}`}>
                    {passRate >= 85 ? 'Excelente' : passRate >= 70 ? 'Satisfatório' : 'Insatisfatório'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{passRate}%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">85%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {passRate >= 85 ? (
                    <TrendingUp className="h-5 w-5 text-green-600 inline-block" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600 inline-block" />
                  )}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Não Conformidades Críticas</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${criticalNonConformities === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {criticalNonConformities === 0 ? 'Excelente' : 'Atenção Necessária'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{criticalNonConformities}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">0</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {criticalNonConformities === 0 ? (
                    <CheckCircle className="h-5 w-5 text-green-600 inline-block" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 inline-block" />
                  )}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Documentos Pendentes</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${pendingDocuments === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {pendingDocuments === 0 ? 'Completo' : 'Pendente'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{pendingDocuments}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">0</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {pendingDocuments === 0 ? (
                    <CheckCircle className="h-5 w-5 text-green-600 inline-block" />
                  ) : (
                    <FileWarning className="h-5 w-5 text-yellow-600 inline-block" />
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Quality Improvement Suggestions */}
      <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <h3 className="text-lg font-medium mb-4 text-blue-800">Sugestões de Melhoria</h3>
        <div className="space-y-4">
          {openNonConformities > 0 && (
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
              <p className="text-sm text-gray-800">
                Há {openNonConformities} não conformidade(s) em aberto. É recomendado resolver todas as não conformidades antes da entrega do pedido.
              </p>
            </div>
          )}
          {documentComplianceRate < 100 && (
            <div className="flex items-start">
              <FileWarning className="h-5 w-5 text-yellow-600 mr-2 mt-0.5" />
              <p className="text-sm text-gray-800">
                A taxa de conformidade documental está em {documentComplianceRate}%. Certifique-se de que todos os documentos estejam verificados e aprovados.
              </p>
            </div>
          )}
          {passRate < 85 && (
            <div className="flex items-start">
              <XCircle className="h-5 w-5 text-orange-600 mr-2 mt-0.5" />
              <p className="text-sm text-gray-800">
                A taxa de aprovação em inspeções está em {passRate}%, abaixo da meta de 85%. Revise os pontos falhos nas inspeções.
              </p>
            </div>
          )}
          {criticalNonConformities > 0 && (
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
              <p className="text-sm text-gray-800">
                Há {criticalNonConformities} não conformidade(s) crítica(s). Atenção prioritária é necessária para resolver estes problemas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper to calculate overall quality rating
function getQualityRating(
  documentComplianceRate: number,
  openNonConformities: number,
  passRate: number
): string {
  const score = 
    (documentComplianceRate * 0.3) + 
    (Math.max(0, 100 - openNonConformities * 10) * 0.3) + 
    (passRate * 0.4);

  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

// Helper to get color for quality rating
function getQualityRatingColor(
  documentComplianceRate: number,
  openNonConformities: number,
  passRate: number
): string {
  const rating = getQualityRating(documentComplianceRate, openNonConformities, passRate);
  
  switch (rating) {
    case 'A': return 'text-green-600';
    case 'B': return 'text-blue-600';
    case 'C': return 'text-yellow-600';
    case 'D': return 'text-orange-600';
    case 'E': return 'text-red-600';
    default: return 'text-gray-600';
  }
}

// Helper to get status color
function getStatusColor(value: number, thresholds: {warning: number, good: number}) {
  if (value >= thresholds.good) return 'bg-green-100 text-green-800';
  if (value >= thresholds.warning) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

export default QualityMetrics;