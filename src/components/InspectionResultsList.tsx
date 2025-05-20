import React from 'react';
import { Edit, Trash2, CheckCircle, XCircle, AlertCircle, Plus, Settings, FileText, Download } from 'lucide-react';
import { InspectionResult, InspectionChecklistTemplate } from '../types/quality';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';

interface InspectionResultsListProps {
  inspections: InspectionResult[];
  checklists: InspectionChecklistTemplate[];
  onCreateInspection: () => void;
  onViewInspection: (inspection: InspectionResult) => void;
  onViewChecklistTemplate: (template: InspectionChecklistTemplate) => void;
  onCreateChecklistTemplate: () => void;
  onDeleteInspection: (id: string) => void;
}

const InspectionResultsList: React.FC<InspectionResultsListProps> = ({
  inspections,
  checklists,
  onCreateInspection,
  onViewInspection,
  onViewChecklistTemplate,
  onCreateChecklistTemplate,
  onDeleteInspection,
}) => {
  const { companyLogo, companyName } = useSettingsStore();
  
  // Function to render status icon
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  };

  // Function to get appropriate status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Function to format a date string
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    } catch (error) {
      return dateString;
    }
  };

  // Function to format status for display
  const formatStatus = (status: string) => {
    switch (status) {
      case 'passed':
        return 'Aprovado';
      case 'failed':
        return 'Reprovado';
      case 'partial':
        return 'Aprovação Parcial';
      default:
        return status;
    }
  };

  // Function to export PDF
  const handleExportPDF = (inspection: InspectionResult) => {
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
    doc.text('RELATÓRIO DE INSPEÇÃO', 105, y, { align: 'center' });
    y += 12;
    
    // Add company name if available
    if (companyName) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 10;
    }
    
    // Add inspection details
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Checklist: ${inspection.checklistName}`, 20, y);
    y += 8;
    
    doc.text(`Inspetor: ${inspection.inspector}`, 20, y);
    y += 8;
    
    doc.text(`Data: ${formatDate(inspection.inspectionDate)}`, 20, y);
    y += 8;
    
    // Add status with color
    let statusText = '';
    if (inspection.status === 'passed') {
      doc.setTextColor(52, 168, 83); // Green
      statusText = 'APROVADO';
    } else if (inspection.status === 'partial') {
      doc.setTextColor(251, 188, 4); // Yellow
      statusText = 'APROVAÇÃO PARCIAL';
    } else {
      doc.setTextColor(234, 67, 53); // Red
      statusText = 'REPROVADO';
    }
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`Status: ${statusText}`, 20, y);
    y += 12;
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    
    // Add comments if any
    if (inspection.comments) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Comentários:', 20, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const commentLines = doc.splitTextToSize(inspection.comments, 170);
      doc.text(commentLines, 20, y);
      y += commentLines.length * 7 + 10;
    }
    
    // Iterate through sections
    inspection.sections.forEach((section, sIndex) => {
      // Add a new page if we're running out of space
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      // Section header
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(`${sIndex+1}. ${section.name}`, 20, y);
      y += 10;
      
      // Items table
      (doc as any).autoTable({
        head: [['Item', 'Resultado', 'Status', 'Comentários']],
        body: section.items.map((item, index) => [
          `${sIndex+1}.${index+1} ${item.description}${item.criticalItem ? ' [CRÍTICO]' : ''}`,
          typeof item.result === 'boolean' ? (item.result ? 'Conforme' : 'Não Conforme') : String(item.result || ''),
          item.passed ? 'Aprovado' : 'Reprovado',
          item.comments || '-'
        ]),
        startY: y,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 30 },
          2: { cellWidth: 30 },
          3: { cellWidth: 'auto' }
        },
        didDrawCell: function(data) {
          // Color the status cell based on pass/fail
          if (data.section === 'body' && data.column.index === 2) {
            const passed = section.items[data.row.index].passed;
            if (passed) {
              doc.setFillColor(230, 245, 230);
            } else {
              doc.setFillColor(254, 226, 226);
            }
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
            
            // Since this is a cell callback, we need to manually add the text
            if (data.cell.text && typeof data.cell.text === "string") {
              doc.setTextColor(0, 0, 0);
              doc.text(data.cell.text, data.cell.x + data.cell.padding.left, data.cell.y + data.cell.padding.top + 5);
            }
          }
        }
      });
      
      y = (doc as any).lastAutoTable.finalY + 15;
    });
    
    // Add summary statistics
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo da Inspeção', 20, y);
    y += 10;
    
    const allItems = inspection.sections.flatMap(s => s.items);
    const totalItems = allItems.length;
    const passedItems = allItems.filter(i => i.passed).length;
    const failedItems = totalItems - passedItems;
    const passRate = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Total de itens verificados: ${totalItems}`, 20, y);
    y += 8;
    
    doc.text(`Itens aprovados: ${passedItems} (${passRate}%)`, 20, y);
    y += 8;
    
    doc.text(`Itens reprovados: ${failedItems} (${100-passRate}%)`, 20, y);
    y += 15;
    
    // Add footer with date and website
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 20, 285);
      
      // Add website to footer
      doc.text('www.mecald.com.br', 105, 285, { align: 'center' });
      
      doc.text(`Página ${i} de ${pageCount}`, 195, 285, { align: 'right' });
    }
    
    // Save the PDF
    doc.save(`inspecao_${format(new Date(inspection.inspectionDate), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* Checklists Templates Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-medium">Modelos de Checklist</h4>
          <div className="flex space-x-2">
            <button
              onClick={onCreateChecklistTemplate}
              className="flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
            >
              <Plus className="h-4 w-4 mr-1" />
              Novo Modelo
            </button>
          </div>
        </div>

        {checklists.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500">Nenhum modelo de checklist encontrado.</p>
            <button
              onClick={onCreateChecklistTemplate}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 inline-block mr-1" />
              Criar Primeiro Modelo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {checklists.map(checklist => (
              <div 
                key={checklist.id} 
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onViewChecklistTemplate(checklist)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="font-medium">{checklist.name}</h5>
                    <p className="text-sm text-gray-600 mt-1">{checklist.description}</p>
                    <p className="text-sm text-gray-500 mt-2">
                      Atualizado: {formatDate(checklist.updatedAt)}
                    </p>
                    <div className="mt-2">
                      {checklist.isActive ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
                          Ativo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">
                          Inativo
                        </span>
                      )}
                      <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                        {checklist.sections.length} seções
                      </span>
                      <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">
                        {checklist.sections.reduce((sum, section) => sum + section.items.length, 0)} itens
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewChecklistTemplate(checklist);
                    }}
                    className="p-2 hover:bg-blue-100 rounded-full"
                  >
                    <Edit className="h-4 w-4 text-blue-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inspection Results Section */}
      <div className="space-y-4 mt-8 pt-8 border-t">
        <div className="flex justify-between items-center">
          <h4 className="text-lg font-medium">Inspeções Realizadas</h4>
          <button
            onClick={onCreateInspection}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Inspeção
          </button>
        </div>

        {inspections.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500">Nenhuma inspeção encontrada para este pedido.</p>
            <button
              onClick={onCreateInspection}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 inline-block mr-1" />
              Iniciar Inspeção
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {inspections.map(inspection => (
              <div 
                key={inspection.id} 
                className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onViewInspection(inspection)}
              >
                <div className="flex justify-between items-start p-4">
                  <div>
                    <div className="flex items-center space-x-3">
                      <h5 className="font-medium">{inspection.checklistName}</h5>
                      <span className={`px-2 py-0.5 text-xs rounded-full flex items-center ${getStatusColor(inspection.status)}`}>
                        {renderStatusIcon(inspection.status)}
                        <span className="ml-1">{formatStatus(inspection.status)}</span>
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-500 mt-2">
                      Inspetor: {inspection.inspector}
                    </p>
                    <p className="text-sm text-gray-500">
                      Data: {formatDate(inspection.inspectionDate)}
                    </p>

                    {/* Display section statistics */}
                    {inspection.sections.length > 0 && (
                      <div className="mt-2 space-x-2">
                        {inspection.sections.map(section => {
                          const totalItems = section.items.length;
                          const passedItems = section.items.filter(item => item.passed).length;
                          const passRate = Math.round((passedItems / totalItems) * 100);
                          
                          return (
                            <span 
                              key={section.id} 
                              className="inline-block px-2 py-1 text-xs rounded bg-gray-100"
                            >
                              {section.name}: {passedItems}/{totalItems} ({passRate}%)
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportPDF(inspection);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-full"
                      title="Exportar PDF"
                    >
                      <Download className="h-4 w-4 text-gray-600" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewInspection(inspection);
                      }}
                      className="p-2 hover:bg-blue-100 rounded-full"
                      title="Editar Inspeção"
                    >
                      <Edit className="h-4 w-4 text-blue-600" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Tem certeza que deseja excluir esta inspeção?')) {
                          onDeleteInspection(inspection.id);
                        }
                      }}
                      className="p-2 hover:bg-red-100 rounded-full"
                      title="Excluir Inspeção"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </button>
                  </div>
                </div>
                
                <div className={`p-3 border-t ${
                  inspection.status === 'passed' ? 'bg-green-50' :
                  inspection.status === 'failed' ? 'bg-red-50' :
                  'bg-yellow-50'
                }`}>
                  <div className="text-sm">
                    {inspection.comments ? (
                      <p className="italic">{inspection.comments}</p>
                    ) : (
                      <p className="text-gray-500 italic">Sem comentários adicionais</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InspectionResultsList;