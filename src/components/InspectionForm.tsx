import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronDown, ChevronUp, Check, AlertCircle, Upload, Download, Camera, Image, Trash2 } from 'lucide-react';
import { InspectionResult, InspectionChecklistTemplate, InspectionResultSection, InspectionResultItem } from '../types/quality';
import { Order } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';

interface InspectionFormProps {
  inspection: InspectionResult | null;
  checklists: InspectionChecklistTemplate[];
  order: Order | null;
  onSave: (inspection: InspectionResult) => void;
  onCancel: () => void;
}

const InspectionForm: React.FC<InspectionFormProps> = ({
  inspection,
  checklists,
  order,
  onSave,
  onCancel,
}) => {
  const { companyLogo, companyName } = useSettingsStore();
  const [selectedChecklistId, setSelectedChecklistId] = useState<string>(
    inspection?.checklistId || (checklists.length > 0 ? checklists[0].id : '')
  );
  
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [photoUploads, setPhotoUploads] = useState<Record<string, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<InspectionResult>({
    id: inspection?.id || 'new',
    orderId: inspection?.orderId || order?.id || '',
    itemId: inspection?.itemId || '',
    checklistId: inspection?.checklistId || (checklists.length > 0 ? checklists[0].id : ''),
    checklistName: inspection?.checklistName || (checklists.length > 0 ? checklists[0].name : ''),
    inspector: inspection?.inspector || '',
    inspectionDate: inspection?.inspectionDate || new Date().toISOString(),
    status: inspection?.status || 'passed',
    comments: inspection?.comments || '',
    sections: inspection?.sections || [],
    photoAttachments: inspection?.photoAttachments || {},
  });

  // Expand all sections by default when checklist is selected
  useEffect(() => {
    const selectedChecklist = checklists.find(c => c.id === selectedChecklistId);
    if (selectedChecklist) {
      setExpandedSections(new Set(selectedChecklist.sections.map(section => section.id)));
    }
  }, [selectedChecklistId, checklists]);

  // Update form data when checklist selection changes
  useEffect(() => {
    if (inspection?.id !== 'new' && inspection) return; // Don't update existing inspection
    
    const selectedChecklist = checklists.find(c => c.id === selectedChecklistId);
    if (!selectedChecklist) return;
    
    const newSections: InspectionResultSection[] = selectedChecklist.sections.map(section => ({
      id: section.id,
      name: section.name,
      items: section.items.map(item => ({
        id: item.id,
        description: item.description,
        result: item.type === 'boolean' ? false : 
               item.type === 'numeric' ? (item.expectedValue as number || 0) : 
               item.type === 'text' ? (item.expectedValue as string || '') : false,
        passed: false,
        comments: '',
        criticalItem: item.criticalItem,
        photos: []
      }))
    }));
    
    setFormData(prev => ({
      ...prev,
      checklistId: selectedChecklist.id,
      checklistName: selectedChecklist.name,
      sections: newSections,
    }));
    
    // Initialize photo attachments if needed
    const initialPhotoAttachments: Record<string, string[]> = {};
    newSections.forEach(section => {
      section.items.forEach(item => {
        initialPhotoAttachments[item.id] = [];
      });
    });
    
    setPhotoUploads(initialPhotoAttachments);
    
    // Expand all sections when selecting a new checklist
    setExpandedSections(new Set(newSections.map(section => section.id)));
  }, [selectedChecklistId, checklists, inspection]);

  // Load existing photo attachments if any
  useEffect(() => {
    if (inspection && inspection.photoAttachments) {
      setPhotoUploads(inspection.photoAttachments);
    }
  }, [inspection]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const handleItemResultChange = (
    sectionId: string,
    itemId: string,
    value: boolean | number | string
  ) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        sections: prev.sections.map(section => {
          if (section.id === sectionId) {
            return {
              ...section,
              items: section.items.map(item => {
                if (item.id === itemId) {
                  const checklist = checklists.find(c => c.id === formData.checklistId);
                  const checklistSection = checklist?.sections.find(s => s.id === sectionId);
                  const checklistItem = checklistSection?.items.find(i => i.id === itemId);
                  
                  let passed = false;
                  
                  if (checklistItem) {
                    // Determine if the item passes inspection
                    if (checklistItem.type === 'boolean') {
                      passed = value === true;
                    } else if (checklistItem.type === 'numeric' && checklistItem.expectedValue !== undefined) {
                      const numericValue = value as number;
                      const expectedValue = checklistItem.expectedValue as number;
                      const tolerance = checklistItem.tolerance || 0;
                      
                      passed = numericValue >= (expectedValue - tolerance) && 
                              numericValue <= (expectedValue + tolerance);
                    } else if (checklistItem.type === 'text') {
                      // For text, if expected value is provided, it must match exactly
                      if (checklistItem.expectedValue) {
                        passed = (value as string) === checklistItem.expectedValue;
                      } else {
                        // If no expected value, any non-empty string passes
                        passed = (value as string).trim() !== '';
                      }
                    }
                  }
                  
                  return {
                    ...item,
                    result: value,
                    passed,
                  };
                }
                return item;
              }),
            };
          }
          return section;
        }),
      };

      // Calculate overall status based on items
      const allItems = updated.sections.flatMap(s => s.items);
      const criticalItems = allItems.filter(item => item.criticalItem);
      const failedCriticalItems = criticalItems.filter(item => !item.passed);
      
      let status: 'passed' | 'failed' | 'partial' = 'passed';
      
      if (failedCriticalItems.length > 0) {
        status = 'failed'; // Any failed critical item fails the inspection
      } else {
        const passedItems = allItems.filter(item => item.passed).length;
        const totalItems = allItems.length;
        const passRate = totalItems > 0 ? passedItems / totalItems : 1;
        
        if (passRate < 0.7) {
          status = 'failed'; // Less than 70% pass rate
        } else if (passRate < 1) {
          status = 'partial'; // Between 70% and 100% pass rate
        }
      }
      
      return {
        ...updated,
        status,
      };
    });
  };

  const handleItemStatusChange = (
    sectionId: string,
    itemId: string,
    status: 'approved' | 'rejected' | 'rework'
  ) => {
    // Convert status to boolean result
    const passed = status === 'approved';
    
    setFormData(prev => {
      const updated = {
        ...prev,
        sections: prev.sections.map(section => {
          if (section.id === sectionId) {
            return {
              ...section,
              items: section.items.map(item => {
                if (item.id === itemId) {
                  // For boolean type, update result as well
                  const newItem: InspectionResultItem = {
                    ...item,
                    passed
                  };
                  
                  // For boolean type items, also update the result
                  const checklist = checklists.find(c => c.id === formData.checklistId);
                  const checklistSection = checklist?.sections.find(s => s.id === sectionId);
                  const checklistItem = checklistSection?.items.find(i => i.id === itemId);
                  
                  if (checklistItem?.type === 'boolean') {
                    newItem.result = passed;
                  } else if (status === 'rework') {
                    // For rework, mark as failed but don't change result value
                    newItem.passed = false;
                  }
                  
                  return newItem;
                }
                return item;
              }),
            };
          }
          return section;
        }),
      };

      // Recalculate overall status
      const allItems = updated.sections.flatMap(s => s.items);
      const criticalItems = allItems.filter(item => item.criticalItem);
      const failedCriticalItems = criticalItems.filter(item => !item.passed);
      
      let newStatus: 'passed' | 'failed' | 'partial' = 'passed';
      
      if (failedCriticalItems.length > 0) {
        newStatus = 'failed';
      } else {
        const passedItems = allItems.filter(item => item.passed).length;
        const totalItems = allItems.length;
        const passRate = totalItems > 0 ? passedItems / totalItems : 1;
        
        if (passRate < 0.7) {
          newStatus = 'failed';
        } else if (passRate < 1) {
          newStatus = 'partial';
        }
      }
      
      return {
        ...updated,
        status: newStatus,
      };
    });
  };

  const handleItemCommentChange = (
    sectionId: string,
    itemId: string,
    comment: string
  ) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map(section => {
        if (section.id === sectionId) {
          return {
            ...section,
            items: section.items.map(item => {
              if (item.id === itemId) {
                return {
                  ...item,
                  comments: comment,
                };
              }
              return item;
            }),
          };
        }
        return section;
      }),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that all required fields are filled
    const requiredFieldsFilled = formData.inspector.trim() !== '';
    
    if (!requiredFieldsFilled) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    // Include photo attachments in the final data
    const finalData = {
      ...formData,
      photoAttachments: photoUploads
    };

    onSave(finalData);
  };

  // Handle photo upload
  const handlePhotoCapture = (itemId: string) => {
    setCurrentItemId(itemId);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentItemId) return;
    
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Convert file to data URL
    const file = files[0];
    const reader = new FileReader();
    
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPhotoUploads(prev => ({
        ...prev,
        [currentItemId]: [...(prev[currentItemId] || []), dataUrl]
      }));
    };
    
    reader.readAsDataURL(file);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (itemId: string, photoIndex: number) => {
    setPhotoUploads(prev => {
      const itemPhotos = [...(prev[itemId] || [])];
      itemPhotos.splice(photoIndex, 1);
      return {
        ...prev,
        [itemId]: itemPhotos
      };
    });
  };

  // Get checklist to display type information
  const selectedChecklist = checklists.find(c => c.id === formData.checklistId);

  // Export to PDF
  const handleExportPDF = () => {
    if (!order) return;
    
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
    y += 10;
    
    // Add company name if available
    if (companyName) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 8;
    }
    
    // Add order info
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Pedido: #${order.orderNumber} - ${order.customer}`, 20, y);
    y += 8;
    
    doc.text(`Inspetor: ${formData.inspector}`, 20, y);
    y += 8;
    
    doc.text(`Data: ${format(new Date(formData.inspectionDate), 'dd/MM/yyyy', { locale: ptBR })}`, 20, y);
    y += 8;
    
    doc.text(`Modelo de checklist: ${formData.checklistName}`, 20, y);
    y += 12;
    
    // Add status with color
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    
    if (formData.status === 'passed') {
      doc.setTextColor(52, 168, 83); // Green
      doc.text('Status: APROVADO', 20, y);
    } else if (formData.status === 'partial') {
      doc.setTextColor(251, 188, 4); // Yellow
      doc.text('Status: APROVAÇÃO PARCIAL', 20, y);
    } else {
      doc.setTextColor(234, 67, 53); // Red
      doc.text('Status: REPROVADO', 20, y);
    }
    
    // Reset text color
    doc.setTextColor(0, 0, 0);
    y += 12;
    
    // Add comments if any
    if (formData.comments) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Comentários gerais:', 20, y);
      y += 7;
      
      doc.setFont(undefined, 'normal');
      const commentLines = doc.splitTextToSize(formData.comments, 170);
      if (commentLines && Array.isArray(commentLines)) {
        doc.text(commentLines, 20, y);
        y += commentLines.length * 7 + 5;
      }
    }
    
    // Add checklist sections
    formData.sections.forEach((section, sectionIndex) => {
      // Add a new page if we're running out of space
      if (y > 240) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(`${sectionIndex + 1}. ${section.name}`, 20, y);
      y += 10;
      
      // Create table for items
      (doc as any).autoTable({
        startY: y,
        head: [['Item', 'Resultado', 'Status', 'Comentários']],
        body: section.items.map((item, index) => [
          `${sectionIndex + 1}.${index + 1} ${item.description}${item.criticalItem ? ' [CRÍTICO]' : ''}`,
          typeof item.result === 'boolean'
            ? item.result ? 'Sim' : 'Não'
            : String(item.result || ''),
          item.passed ? 'Aprovado' : 'Reprovado',
          item.comments || '-'
        ]),
        theme: 'striped',
        headStyles: {
          fillColor: [59, 130, 246], // Blue
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 30 },
          2: { cellWidth: 30 },
          3: { cellWidth: 'auto' }
        },
        styles: {
          overflow: 'linebreak',
          cellPadding: 3
        },
        didDrawCell: (data: any) => {
          // Color the status cell based on pass/fail
          if (data.section === 'body' && data.column.index === 2) {
            if (section.items[data.row.index].passed) {
              doc.setFillColor(209, 250, 229); // Light green
            } else {
              doc.setFillColor(254, 226, 226); // Light red
            }
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
            
            // Only add text if we have valid cell data
            const cellText = data.cell.text;
            if (cellText && cellText.length > 0 && typeof cellText === 'string') {
              doc.setTextColor(0, 0, 0);
              // Make sure coordinates are valid numbers
              const x = data.cell.x + data.cell.padding.left;
              const y = data.cell.y + data.cell.padding.top + 5;
              
              if (!isNaN(x) && !isNaN(y)) {
                doc.text(cellText, x, y);
              }
            }
          }
        }
      });
      
      y = (doc as any).lastAutoTable.finalY + 10;
      
      // Add photos for this section if any
      for (const item of section.items) {
        const photos = photoUploads[item.id];
        if (photos && photos.length > 0) {
          // Add a new page if we're running out of space
          if (y > 200) {
            doc.addPage();
            y = 20;
          }
          
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text(`Fotos - ${item.description}:`, 20, y);
          y += 10;
          
          // Only add up to 2 photos per item to keep report manageable
          const photosToAdd = photos.slice(0, 2);
          
          photosToAdd.forEach((photo, photoIndex) => {
            try {
              // Add photo with a width of 80mm (about 1/3 of the page width)
              const photoWidth = 80;
              const photoHeight = 60;
              
              // Position photos side by side if possible
              const xPosition = photoIndex % 2 === 0 ? 20 : 110;
              
              // Move to next row after every 2 photos
              if (photoIndex % 2 === 0 && photoIndex > 0) {
                y += photoHeight + 10;
              }
              
              // Add a new page if needed
              if (y + photoHeight > 270) {
                doc.addPage();
                y = 20;
              }
              
              doc.addImage(photo, 'JPEG', xPosition, y, photoWidth, photoHeight);
              
              // Only move y position down after adding a row of photos
              if (photoIndex % 2 === 1 || photoIndex === photosToAdd.length - 1) {
                y += photoHeight + 10;
              }
            } catch (error) {
              console.error('Error adding image to PDF:', error);
            }
          });
          
          y += 10; // Add some space after photos
        }
      }
    });
    
    // Add summary statistics
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo da Inspeção', 20, y);
    y += 10;
    
    const allItems = formData.sections.flatMap(s => s.items);
    const totalItems = allItems.length;
    const passedItems = allItems.filter(i => i.passed).length;
    const passRate = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Total de itens verificados: ${totalItems}`, 20, y);
    y += 7;
    
    doc.text(`Itens aprovados: ${passedItems} (${passRate}%)`, 20, y);
    y += 7;
    
    doc.text(`Itens reprovados: ${totalItems - passedItems} (${100 - passRate}%)`, 20, y);
    y += 7;
    
    const criticalItems = allItems.filter(i => i.criticalItem);
    const failedCriticalItems = criticalItems.filter(i => !i.passed);
    
    if (criticalItems.length > 0) {
      doc.text(`Itens críticos: ${criticalItems.length}`, 20, y);
      y += 7;
      
      doc.text(`Itens críticos reprovados: ${failedCriticalItems.length}`, 20, y);
      y += 7;
    }
    
    // Add signature area
    y += 10;
    
    doc.line(20, y, 90, y);
    y += 5;
    
    doc.text(`${formData.inspector}`, 55, y, { align: 'center' });
    y += 7;
    
    doc.text('Inspetor', 55, y, { align: 'center' });
    
    // Add date and page number to footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      
      // Add date at bottom left
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        20,
        285
      );
      
      // Add website at center
      doc.text(
        'www.mecald.com.br',
        105,
        285,
        { align: 'center' }
      );
      
      // Add page number at bottom right
      doc.text(
        `Página ${i} de ${totalPages}`,
        195,
        285,
        { align: 'right' }
      );
    }
    
    // Save PDF
    doc.save(`inspecao_${order.orderNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold">
            {inspection?.id === 'new' || !inspection ? 'Nova Inspeção' : 'Editar Inspeção'}
          </h3>
          {order && (
            <p className="text-gray-600">
              Pedido #{order.orderNumber} - {order.customer}
            </p>
          )}
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleExportPDF}
            className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar PDF
          </button>
          <button
            onClick={onCancel}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            Voltar
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modelo de Checklist
            </label>
            <select
              value={formData.checklistId}
              onChange={(e) => {
                setSelectedChecklistId(e.target.value);
              }}
              disabled={inspection?.id && inspection.id !== 'new'} // Disable changing checklist for existing inspections
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
              required
            >
              {checklists.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {checklists.length === 0 && (
              <p className="mt-2 text-sm text-red-600">
                Nenhum modelo de checklist encontrado. Por favor, crie um modelo primeiro.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data da Inspeção
            </label>
            <input
              type="date"
              value={formData.inspectionDate.split('T')[0]}
              onChange={(e) => setFormData({ ...formData, inspectionDate: new Date(e.target.value).toISOString() })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              required
            />
          </div>

          {order && order.items.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Específico (Opcional)
              </label>
              <select
                value={formData.itemId || ''}
                onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="">Todos os itens</option>
                {order.items.map(item => (
                  <option key={item.id} value={item.id}>
                    Item {item.itemNumber}: {item.code} - {item.description}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comentários Gerais
            </label>
            <textarea
              value={formData.comments || ''}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={2}
            />
          </div>
        </div>

        {/* Status Summary */}
        <div className={`p-4 rounded-lg ${
          formData.status === 'passed' ? 'bg-green-50 border border-green-200' :
          formData.status === 'failed' ? 'bg-red-50 border border-red-200' :
          'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center">
            {formData.status === 'passed' ? (
              <Check className="h-5 w-5 text-green-500 mr-2" />
            ) : formData.status === 'failed' ? (
              <X className="h-5 w-5 text-red-500 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
            )}
            <span className={`font-medium ${
              formData.status === 'passed' ? 'text-green-800' :
              formData.status === 'failed' ? 'text-red-800' :
              'text-yellow-800'
            }`}>
              Status da Inspeção: {
                formData.status === 'passed' ? 'Aprovado' :
                formData.status === 'failed' ? 'Reprovado' :
                'Aprovação Parcial'
              }
            </span>
          </div>
          
          {formData.sections.length > 0 && (
            <div className="mt-2 text-sm">
              {(() => {
                const allItems = formData.sections.flatMap(s => s.items);
                const totalItems = allItems.length;
                const passedItems = allItems.filter(i => i.passed).length;
                const passRate = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;
                
                const criticalItems = allItems.filter(i => i.criticalItem);
                const failedCriticalItems = criticalItems.filter(i => !i.passed);
                
                return (
                  <>
                    <p>
                      {passedItems} de {totalItems} itens aprovados ({passRate}%)
                    </p>
                    {failedCriticalItems.length > 0 && (
                      <p className="text-red-700 mt-1">
                        <AlertCircle className="h-4 w-4 inline-block mr-1" />
                        {failedCriticalItems.length} {failedCriticalItems.length === 1 ? 'item crítico falhou' : 'itens críticos falharam'}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Hidden file input for photo upload */}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />

        {/* Checklist Sections */}
        <div className="space-y-4">
          <h4 className="font-medium text-lg">Itens do Checklist</h4>
          
          {formData.sections.length === 0 ? (
            <div className="text-center p-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">
                Nenhum item de checklist encontrado. Selecione um modelo de checklist válido.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.sections.map((section) => (
                <div key={section.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="p-4 bg-gray-50 flex justify-between items-center cursor-pointer"
                    onClick={() => toggleSection(section.id)}
                  >
                    <h5 className="font-medium">{section.name}</h5>
                    {expandedSections.has(section.id) ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </div>
                  
                  {expandedSections.has(section.id) && (
                    <div className="p-4">
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                Item
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                Verificação
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border w-40">
                                Resultado
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                Status
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border">
                                Comentários
                              </th>
                              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border w-40">
                                Fotos
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {section.items.map((item, idx) => {
                              const checklist = checklists.find(c => c.id === formData.checklistId);
                              const checklistSection = checklist?.sections.find(s => s.id === section.id);
                              const checklistItem = checklistSection?.items.find(i => i.id === item.id);
                              const itemPhotos = photoUploads[item.id] || [];
                              
                              return (
                                <tr key={item.id} className={`${item.criticalItem ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border`}>
                                  <td className="px-4 py-2 whitespace-nowrap border">
                                    <div className="text-sm font-medium text-gray-900 flex items-center">
                                      {item.description}
                                      {item.criticalItem && (
                                        <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-800">
                                          Crítico
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap border">
                                    <div className="text-sm text-gray-900">
                                      {/* Show expected value info */}
                                      {checklistItem?.type === 'numeric' && (
                                        <div className="text-xs text-gray-500">
                                          Esperado: {checklistItem.expectedValue} {checklistItem.unit || ''} 
                                          {checklistItem.tolerance !== undefined && 
                                            <span> (±{checklistItem.tolerance})</span>
                                          }
                                        </div>
                                      )}
                                      {checklistItem?.type === 'text' && checklistItem.expectedValue && (
                                        <div className="text-xs text-gray-500">
                                          Esperado: {checklistItem.expectedValue as string}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 border">
                                    {checklistItem?.type === 'boolean' && (
                                      <select
                                        value={item.result ? 'true' : 'false'}
                                        onChange={(e) => handleItemResultChange(
                                          section.id, 
                                          item.id,
                                          e.target.value === 'true'
                                        )}
                                        className={`rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 w-full ${
                                          item.passed ? 'bg-green-50' : 'bg-red-50'
                                        }`}
                                      >
                                        <option value="true">Conforme</option>
                                        <option value="false">Não Conforme</option>
                                      </select>
                                    )}
                                    
                                    {checklistItem?.type === 'numeric' && (
                                      <input
                                        type="number"
                                        value={item.result as number}
                                        onChange={(e) => handleItemResultChange(
                                          section.id, 
                                          item.id,
                                          parseFloat(e.target.value)
                                        )}
                                        className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                                          item.passed ? 'bg-green-50' : 'bg-red-50'
                                        }`}
                                        step="any"
                                      />
                                    )}
                                    
                                    {checklistItem?.type === 'text' && (
                                      <input
                                        type="text"
                                        value={item.result as string}
                                        onChange={(e) => handleItemResultChange(
                                          section.id, 
                                          item.id,
                                          e.target.value
                                        )}
                                        className={`w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${
                                          item.passed ? 'bg-green-50' : 'bg-red-50'
                                        }`}
                                      />
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-center border">
                                    <div className="flex space-x-1 justify-center">
                                      <button
                                        type="button"
                                        onClick={() => handleItemStatusChange(section.id, item.id, 'approved')}
                                        className={`px-3 py-1 text-xs rounded ${
                                          item.passed 
                                            ? 'bg-green-600 text-white' 
                                            : 'bg-green-100 text-green-600 border border-green-200'
                                        }`}
                                      >
                                        <Check className="h-3 w-3 inline-block mr-1" />
                                        Aprovado
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleItemStatusChange(section.id, item.id, 'rejected')}
                                        className={`px-3 py-1 text-xs rounded ${
                                          !item.passed && !checklistItem?.type
                                            ? 'bg-red-600 text-white'
                                            : 'bg-red-100 text-red-600 border border-red-200'
                                        }`}
                                      >
                                        <X className="h-3 w-3 inline-block mr-1" />
                                        Rejeitado
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleItemStatusChange(section.id, item.id, 'rework')}
                                        className="px-3 py-1 text-xs rounded bg-orange-100 text-orange-600 border border-orange-200"
                                      >
                                        Retrabalho
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 border">
                                    <textarea
                                      value={item.comments || ''}
                                      onChange={(e) => handleItemCommentChange(
                                        section.id,
                                        item.id,
                                        e.target.value
                                      )}
                                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                                      placeholder="Comentários..."
                                      rows={2}
                                    />
                                  </td>
                                  <td className="px-4 py-2 border">
                                    <div className="flex flex-col space-y-2 items-center">
                                      <button
                                        type="button"
                                        onClick={() => handlePhotoCapture(item.id)}
                                        className="px-4 py-1 bg-blue-100 text-blue-600 rounded text-xs flex items-center"
                                      >
                                        <Camera className="h-3 w-3 mr-1" />
                                        Adicionar foto
                                      </button>
                                      
                                      {/* Photo previews */}
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {itemPhotos.map((photo, index) => (
                                          <div key={index} className="relative group">
                                            <img 
                                              src={photo} 
                                              alt={`Foto ${index + 1}`}
                                              className="h-12 w-12 object-cover rounded border"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleRemovePhoto(item.id, index)}
                                              className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
};

export default InspectionForm;