import React from 'react';
import { Edit, Trash2, AlertCircle, Download } from 'lucide-react';
import { NonConformity } from '../types/quality';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import { useSettingsStore } from '../store/settingsStore';

interface NonConformityListProps {
  nonConformities: NonConformity[];
  onEdit: (nonConformity: NonConformity) => void;
  onDelete: (id: string) => void;
}

const NonConformityList: React.FC<NonConformityListProps> = ({
  nonConformities,
  onEdit,
  onDelete,
}) => {
  const { companyLogo, companyName } = useSettingsStore();
  
  // Function to get appropriate status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-red-100 text-red-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Function to format severity for display
  const formatSeverity = (severity: string) => {
    switch (severity) {
      case 'low':
        return 'Baixa';
      case 'medium':
        return 'Média';
      case 'high':
        return 'Alta';
      case 'critical':
        return 'Crítica';
      default:
        return severity;
    }
  };

  // Function to format status for display
  const formatStatus = (status: string) => {
    switch (status) {
      case 'open':
        return 'Aberta';
      case 'in-progress':
        return 'Em Andamento';
      case 'resolved':
        return 'Resolvida';
      case 'closed':
        return 'Fechada';
      default:
        return status;
    }
  };
  
  // Function to export a non-conformity to PDF
  const handleExportNonConformity = (nonConformity: NonConformity) => {
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
    doc.text('REGISTRO DE NÃO CONFORMIDADE', 105, y, { align: 'center' });
    y += 10;
    
    if (companyName) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 10;
    }
    
    // NC details
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('1. Informações da Não Conformidade', 15, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Título:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(nonConformity.title, 60, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Data de Criação:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(format(new Date(nonConformity.createdAt), 'dd/MM/yyyy', { locale: ptBR }), 60, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Severidade:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(
      nonConformity.severity === 'low' ? 'Baixa' :
      nonConformity.severity === 'medium' ? 'Média' :
      nonConformity.severity === 'high' ? 'Alta' : 'Crítica',
      60, y
    );
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Status:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(
      nonConformity.status === 'open' ? 'Aberta' :
      nonConformity.status === 'in-progress' ? 'Em Andamento' :
      nonConformity.status === 'resolved' ? 'Resolvida' : 'Fechada',
      60, y
    );
    y += 10;
    
    // Description
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('2. Descrição', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const descLines = doc.splitTextToSize(nonConformity.description, 180);
    doc.text(descLines, 15, y);
    y += descLines.length * 7;
    
    // Root Cause
    if (nonConformity.rootCause) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('3. Causa Raiz', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      const rootCauseLines = doc.splitTextToSize(nonConformity.rootCause, 180);
      doc.text(rootCauseLines, 15, y);
      y += rootCauseLines.length * 7;
    }
    
    // Preventive Action
    if (nonConformity.preventiveAction) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('4. Ação Preventiva', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      const preventiveLines = doc.splitTextToSize(nonConformity.preventiveAction, 180);
      doc.text(preventiveLines, 15, y);
      y += preventiveLines.length * 7;
    }
    
    // Add 5 Whys analysis if available
    if (nonConformity.fiveWhys) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('5. Análise 5 Porquês', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.text('Problema:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const problemLines = doc.splitTextToSize(nonConformity.fiveWhys.problem, 180);
      doc.text(problemLines, 15, y);
      y += problemLines.length * 7 + 5;
      
      nonConformity.fiveWhys.whys.forEach((why, index) => {
        if (!why) return;
        
        doc.setFont(undefined, 'bold');
        doc.text(`Por quê ${index + 1}:`, 15, y);
        y += 7;
        
        doc.setFont(undefined, 'normal');
        const whyLines = doc.splitTextToSize(why, 180);
        doc.text(whyLines, 15, y);
        y += whyLines.length * 7 + 3;
      });
      
      doc.setFont(undefined, 'bold');
      doc.text('Causa Raiz:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const rootCauseLines = doc.splitTextToSize(nonConformity.fiveWhys.rootCause, 180);
      doc.text(rootCauseLines, 15, y);
      y += rootCauseLines.length * 7 + 5;
      
      doc.setFont(undefined, 'bold');
      doc.text('Plano de Ação Corretiva:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const planLines = doc.splitTextToSize(nonConformity.fiveWhys.correctionPlan, 180);
      doc.text(planLines, 15, y);
      y += planLines.length * 7;
    }
    
    // Impacted Areas
    if (nonConformity.impactedAreas && nonConformity.impactedAreas.length > 0) {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('6. Áreas Impactadas', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      nonConformity.impactedAreas.forEach((area, index) => {
        doc.text(`• ${area}`, 15, y);
        y += 7;
      });
    }
    
    // Resolution
    if (nonConformity.status === 'resolved' || nonConformity.status === 'closed') {
      y += 5;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('7. Resolução', 15, y);
      y += 10;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('Data de Resolução:', 15, y);
      doc.setFont(undefined, 'normal');
      doc.text(format(new Date(nonConformity.resolvedAt || new Date()), 'dd/MM/yyyy', { locale: ptBR }), 100, y);
      y += 7;
      
      doc.setFont(undefined, 'bold');
      doc.text('Resolvido por:', 15, y);
      doc.setFont(undefined, 'normal');
      doc.text(nonConformity.resolvedBy || '-', 100, y);
      y += 10;
      
      doc.setFont(undefined, 'bold');
      doc.text('Descrição da Solução:', 15, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const resolutionLines = doc.splitTextToSize(nonConformity.resolutionDescription || '', 180);
      doc.text(resolutionLines, 15, y);
      y += resolutionLines.length * 7;
    }
    
    // Add page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${pageCount}`,
        105, 
        287, 
        { align: 'center' }
      );
      // Reset text color for next page
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save(`nao-conformidade-${nonConformity.id}.pdf`);
  };
  
  // Function to export 5 whys analysis for a non-conformity
  const handleExportFiveWhys = (nonConformity: NonConformity) => {
    if (!nonConformity.fiveWhys) return;
    
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
    doc.text('ANÁLISE 5 PORQUÊS', 105, y, { align: 'center' });
    y += 10;
    
    if (companyName) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 10;
    }
    
    // NC Title
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Não Conformidade: ${nonConformity.title}`, 15, y);
    y += 10;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Data:', 15, y);
    doc.setFont(undefined, 'normal');
    doc.text(format(new Date(), 'dd/MM/yyyy', { locale: ptBR }), 50, y);
    y += 15;
    
    // 5 Whys content
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('1. PROBLEMA IDENTIFICADO', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const problemLines = doc.splitTextToSize(nonConformity.fiveWhys.problem, 180);
    doc.text(problemLines, 15, y);
    y += problemLines.length * 7 + 10;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('2. ANÁLISE 5 PORQUÊS', 15, y);
    y += 10;
    
    const filteredWhys = nonConformity.fiveWhys.whys.filter(why => why.trim() !== '');
    
    filteredWhys.forEach((why, index) => {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Por quê ${index + 1}:`, 15, y);
      y += 7;
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      const whyLines = doc.splitTextToSize(why, 180);
      doc.text(whyLines, 15, y);
      y += whyLines.length * 7 + 5;
      
      // Draw arrow if not the last why
      if (index < filteredWhys.length - 1) {
        doc.setDrawColor(100, 100, 100);
        doc.line(25, y - 2, 25, y + 5); // Vertical line
        doc.line(25, y + 5, 30, y + 5); // Horizontal line
        doc.line(27, y + 3, 30, y + 5); // Arrow head top
        doc.line(27, y + 7, 30, y + 5); // Arrow head bottom
        y += 10;
      }
    });
    
    y += 5;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('3. CAUSA RAIZ IDENTIFICADA', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const rootCauseLines = doc.splitTextToSize(nonConformity.fiveWhys.rootCause, 180);
    doc.text(rootCauseLines, 15, y);
    y += rootCauseLines.length * 7 + 10;
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('4. PLANO DE AÇÃO CORRETIVA', 15, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const planLines = doc.splitTextToSize(nonConformity.fiveWhys.correctionPlan, 180);
    doc.text(planLines, 15, y);
    
    // Add footer with date and page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${pageCount}`,
        105, 
        287, 
        { align: 'center' }
      );
      // Reset text color for next page
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    doc.save(`analise-5-porques-${nonConformity.title.replace(/\s+/g, '-')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold">Não Conformidades</h4>
      </div>

      {nonConformities.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <p className="text-gray-500">Nenhuma não conformidade encontrada para este pedido.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {nonConformities.map(nc => (
            <div key={nc.id} className="border rounded-lg overflow-hidden">
              <div className="p-4 flex justify-between items-start">
                <div>
                  <div className="flex items-center mb-2 space-x-3">
                    <h5 className="font-medium">{nc.title}</h5>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(nc.status)}`}>
                      {formatStatus(nc.status)}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getSeverityBadgeColor(nc.severity)}`}>
                      {formatSeverity(nc.severity)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{nc.description}</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleExportNonConformity(nc)}
                    className="p-1 text-green-600 hover:text-green-800 rounded"
                    title="Exportar NC"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                  {nc.fiveWhys && (
                    <button
                      onClick={() => handleExportFiveWhys(nc)}
                      className="p-1 text-indigo-600 hover:text-indigo-800 rounded"
                      title="Exportar 5 Porquês"
                    >
                      <Download className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(nc)}
                    className="p-1 text-blue-600 hover:text-blue-800 rounded"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => onDelete(nc.id)}
                    className="p-1 text-red-600 hover:text-red-800 rounded"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 border-t text-sm">
                <div className="flex justify-between items-center">
                  <div className="text-gray-600">
                    Criado em: {format(new Date(nc.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </div>
                  {nc.followUpRequired && (
                    <div className="text-yellow-600 font-medium flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Requer acompanhamento
                    </div>
                  )}
                </div>
                {nc.resolvedAt && (
                  <div className="text-gray-600 mt-1">
                    Resolvido em: {format(new Date(nc.resolvedAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </div>
                )}
                {nc.impactedAreas && nc.impactedAreas.length > 0 && (
                  <div className="text-gray-600 mt-2">
                    Áreas impactadas: {nc.impactedAreas.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NonConformityList;