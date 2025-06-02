import React, { useState } from 'react';
import { Order, OrderItem } from '../types/kanban';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Calendar, Clock, Target, CheckCircle, AlertCircle, TrendingUp, BarChart3 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface ItemProductionReportProps {
  order: Order;
}

// Declare jsPDF autoTable extension
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const ItemProductionReport: React.FC<ItemProductionReportProps> = ({ order }) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Calculate item progress
  const calculateItemProgress = (item: OrderItem): number => {
    if (!item.progress || Object.keys(item.progress).length === 0) return 0;
    const values = Object.values(item.progress);
    return Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
  };

  // Sort stages by execution order
  const sortStagesByExecutionOrder = (stages: Record<string, number>, stagePlanning: Record<string, any> = {}) => {
    return Object.entries(stages).sort(([stageNameA, _], [stageNameB, __]) => {
      const planningA = stagePlanning[stageNameA];
      const planningB = stagePlanning[stageNameB];
      
      if (planningA?.startDate && planningB?.startDate) {
        return new Date(planningA.startDate).getTime() - new Date(planningB.startDate).getTime();
      }
      
      if (planningA?.startDate) return -1;
      if (planningB?.startDate) return 1;
      
      return stageNameA.localeCompare(stageNameB);
    });
  };

  // Generate professional PDF report
  const generateProfessionalReport = (items: OrderItem[] = order.items || []) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    
    let y = margin;

    // Professional Header with company branding
    doc.setFillColor(25, 118, 210);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('CRONOGRAMA TÉCNICO DE PRODUÇÃO', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Relatório Executivo - ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageWidth / 2, 30, { align: 'center' });
    
    y = 50;
    doc.setTextColor(0, 0, 0);

    // Executive Summary Section
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, y, contentWidth, 45, 3, 3, 'FD');
    
    y += 8;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('📊 RESUMO EXECUTIVO', margin + 5, y);
    
    y += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    const totalItems = items.length;
    const completedItems = items.filter(item => calculateItemProgress(item) === 100).length;
    const overallProgress = totalItems > 0 ? Math.round(items.reduce((sum, item) => sum + calculateItemProgress(item), 0) / totalItems) : 0;
    const daysToDelivery = differenceInDays(new Date(order.deliveryDate), new Date());
    
    doc.text(`Pedido: #${order.orderNumber}`, margin + 5, y);
    doc.text(`Cliente: ${order.customer}`, margin + 5, y + 8);
    doc.text(`OS Interna: ${order.internalOrderNumber}`, margin + 5, y + 16);
    
    doc.text(`Itens: ${completedItems}/${totalItems} concluídos`, margin + 120, y);
    doc.text(`Progresso Geral: ${overallProgress}%`, margin + 120, y + 8);
    doc.text(`Prazo: ${daysToDelivery > 0 ? `${daysToDelivery} dias` : 'Vencido'}`, margin + 120, y + 16);
    
    y += 35;

    // Timeline Header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('🗓️ CRONOGRAMA DE PRODUÇÃO', margin, y);
    y += 15;

    // Process each item
    items.forEach((item, itemIndex) => {
      // Check if we need a new page
      if (y > pageHeight - 80) {
        doc.addPage();
        y = margin;
      }

      const itemProgress = calculateItemProgress(item);
      
      // Item Header
      doc.setFillColor(itemProgress === 100 ? 232 : 254, itemProgress === 100 ? 245 : 243, itemProgress === 100 ? 233 : 199);
      doc.roundedRect(margin, y, contentWidth, 25, 2, 2, 'F');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(itemProgress === 100 ? 21 : 180, itemProgress === 100 ? 128 : 83, itemProgress === 100 ? 61 : 9);
      doc.text(`Item ${item.itemNumber}: ${item.code}`, margin + 5, y + 8);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${item.description} | Qtd: ${item.quantity} | Peso: ${((item.quantity || 0) * (item.unitWeight || 0)).toFixed(1)}kg`, margin + 5, y + 18);
      
      // Progress indicator
      const progressBarWidth = 60;
      const progressBarX = pageWidth - margin - progressBarWidth - 5;
      
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(progressBarX, y + 5, progressBarWidth, 6, 3, 3, 'F');
      
      doc.setFillColor(itemProgress === 100 ? 34 : itemProgress >= 70 ? 59 : itemProgress >= 30 ? 245 : 239, 
                       itemProgress === 100 ? 197 : itemProgress >= 70 ? 130 : itemProgress >= 30 ? 158 : 68, 
                       itemProgress === 100 ? 94 : itemProgress >= 70 ? 246 : itemProgress >= 30 ? 11 : 68);
      doc.roundedRect(progressBarX, y + 5, (progressBarWidth * itemProgress) / 100, 6, 3, 3, 'F');
      
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(`${itemProgress}%`, progressBarX + progressBarWidth + 2, y + 10);
      
      y += 35;

      // Stages table if item has progress
      if (item.progress && Object.keys(item.progress).length > 0) {
        const sortedStages = sortStagesByExecutionOrder(item.progress, item.stagePlanning);
        
        // Table data
        const tableData = sortedStages.map(([stageName, stageProgress]) => {
          const planning = item.stagePlanning?.[stageName] || {};
          const status = stageProgress === 100 ? '✅ Concluído' : 
                        stageProgress > 0 ? `🔄 ${stageProgress}%` : '⏳ Pendente';
          
          let schedule = 'Não planejado';
          if (planning.startDate && planning.endDate) {
            schedule = `${format(new Date(planning.startDate), 'dd/MM', { locale: ptBR })} - ${format(new Date(planning.endDate), 'dd/MM', { locale: ptBR })}`;
          }
          
          return [
            stageName,
            schedule,
            planning.responsible || 'Não definido',
            status
          ];
        });
        
        doc.autoTable({
          head: [['Etapa de Produção', 'Cronograma', 'Responsável', 'Status']],
          body: tableData,
          startY: y,
          margin: { left: margin, right: margin },
          styles: { 
            fontSize: 8, 
            cellPadding: 3,
            lineColor: [200, 200, 200],
            lineWidth: 0.5
          },
          headStyles: { 
            fillColor: [37, 99, 235], 
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
          },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 35, halign: 'center' },
            2: { cellWidth: 40 },
            3: { cellWidth: 25, halign: 'center' }
          },
          willDrawCell: function(data: any) {
            if (data.section === 'body') {
              const statusText = data.row.cells[3].text[0];
              if (statusText.includes('✅')) {
                doc.setFillColor(240, 253, 244);
              } else if (statusText.includes('🔄')) {
                doc.setFillColor(254, 249, 195);
              } else {
                doc.setFillColor(254, 242, 242);
              }
              doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
            }
          }
        });
        
        y = doc.lastAutoTable.finalY + 15;
      }
      
      // Add separator between items
      if (itemIndex < items.length - 1) {
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
      }
    });

    // Footer with statistics
    if (y > pageHeight - 60) {
      doc.addPage();
      y = margin;
    }
    
    y += 10;
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(margin, y, contentWidth, 35, 3, 3, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('📈 INDICADORES DE PERFORMANCE', margin + 5, y + 12);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`• Progresso Médio: ${overallProgress}%`, margin + 5, y + 22);
    doc.text(`• Itens Concluídos: ${completedItems}/${totalItems}`, margin + 5, y + 30);
    
    doc.text(`• Prazo: ${format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 120, y + 22);
    doc.text(`• Status: ${daysToDelivery > 0 ? 'No Prazo' : 'Atrasado'}`, margin + 120, y + 30);

    // Add page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Página ${i} de ${totalPages} | Sistema Orbit - Gestão Industrial`,
        pageWidth / 2, 
        pageHeight - 10, 
        { align: 'center' }
      );
    }
    
    doc.save(`cronograma_tecnico_${order.orderNumber}_${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  const handleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  const selectedItemsList = order.items?.filter(item => selectedItems.has(item.id)) || [];

  return (
    <div className="p-6 bg-gradient-to-br from-gray-50 to-white">
      {/* Header */}
      <div className="mb-6">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
          <h1 className="text-2xl font-bold mb-2">Cronograma Técnico de Produção</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-semibold">Pedido:</span> #{order.orderNumber}
            </div>
            <div>
              <span className="font-semibold">Cliente:</span> {order.customer}
            </div>
            <div>
              <span className="font-semibold">OS:</span> {order.internalOrderNumber}
            </div>
            <div>
              <span className="font-semibold">Início:</span> {format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}
            </div>
            <div>
              <span className="font-semibold">Entrega:</span> {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
            </div>
            <div>
              <span className="font-semibold">Itens:</span> {order.items?.length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => generateProfessionalReport()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <Download className="h-5 w-5 mr-2" />
          Exportar Relatório Completo
        </button>
        
        {selectedItems.size > 0 && (
          <button
            onClick={() => generateProfessionalReport(selectedItemsList)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
          >
            <Download className="h-5 w-5 mr-2" />
            Exportar Selecionados ({selectedItems.size})
          </button>
        )}
        
        <button
          onClick={() => setSelectedItems(new Set())}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Limpar Seleção
        </button>
      </div>

      {/* Items List */}
      <div className="space-y-6">
        {order.items?.map((item) => {
          const itemProgress = calculateItemProgress(item);
          const isSelected = selectedItems.has(item.id);
          
          return (
            <div
              key={item.id}
              className={`bg-white rounded-lg border-2 transition-all duration-200 ${
                isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Item Header */}
              <div className="p-4 bg-gray-50 rounded-t-lg border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleItemSelection(item.id)}
                      className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Item {item.itemNumber}: {item.code}
                      </h3>
                      <p className="text-sm text-gray-600">{item.description}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                        <span>Qtd: {item.quantity}</span>
                        <span>Peso Unit: {item.unitWeight?.toFixed(3)}kg</span>
                        <span>Peso Total: {((item.quantity || 0) * (item.unitWeight || 0)).toFixed(1)}kg</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{itemProgress}%</div>
                    <div className="text-sm text-gray-500">Concluído</div>
                    <div className="w-24 bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          itemProgress === 100 ? 'bg-green-500' :
                          itemProgress >= 70 ? 'bg-blue-500' :
                          itemProgress >= 30 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${itemProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Stages Timeline */}
              {item.progress && Object.keys(item.progress).length > 0 && (
                <div className="p-4">
                  <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                    Cronograma de Etapas
                  </h4>
                  
                  <div className="space-y-3">
                    {sortStagesByExecutionOrder(item.progress, item.stagePlanning).map(([stageName, stageProgress], index, array) => {
                      const planning = item.stagePlanning?.[stageName] || {};
                      const isCompleted = stageProgress === 100;
                      const isInProgress = stageProgress > 0 && stageProgress < 100;
                      const isLast = index === array.length - 1;
                      
                      return (
                        <div key={stageName} className="relative">
                          {/* Timeline line */}
                          {!isLast && (
                            <div className="absolute left-6 top-12 w-0.5 h-8 bg-gray-300"></div>
                          )}
                          
                          <div className="flex items-start space-x-4">
                            {/* Status indicator */}
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              isCompleted ? 'bg-green-100 border-2 border-green-500' :
                              isInProgress ? 'bg-blue-100 border-2 border-blue-500' :
                              'bg-gray-100 border-2 border-gray-300'
                            }`}>
                              {isCompleted ? (
                                <CheckCircle className="h-6 w-6 text-green-600" />
                              ) : isInProgress ? (
                                <Clock className="h-6 w-6 text-blue-600" />
                              ) : (
                                <AlertCircle className="h-6 w-6 text-gray-400" />
                              )}
                            </div>
                            
                            {/* Stage info */}
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h5 className="font-medium text-gray-900">{stageName}</h5>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  isCompleted ? 'bg-green-100 text-green-800' :
                                  isInProgress ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {stageProgress}%
                                </span>
                              </div>
                              
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                {planning.startDate && (
                                  <div className="flex items-center text-gray-600">
                                    <Calendar className="h-4 w-4 mr-1" />
                                    <span>
                                      {format(new Date(planning.startDate), 'dd/MM/yyyy', { locale: ptBR })} - 
                                      {format(new Date(planning.endDate), 'dd/MM/yyyy', { locale: ptBR })}
                                    </span>
                                  </div>
                                )}
                                
                                {planning.days && (
                                  <div className="flex items-center text-gray-600">
                                    <Clock className="h-4 w-4 mr-1" />
                                    <span>{planning.days} dias úteis</span>
                                  </div>
                                )}
                                
                                {planning.responsible && (
                                  <div className="flex items-center text-gray-600">
                                    <Target className="h-4 w-4 mr-1" />
                                    <span>{planning.responsible}</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Progress bar for stage */}
                              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all ${
                                    isCompleted ? 'bg-green-500' :
                                    isInProgress ? 'bg-blue-500' :
                                    'bg-gray-400'
                                  }`}
                                  style={{ width: `${stageProgress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* No stages message */}
              {(!item.progress || Object.keys(item.progress).length === 0) && (
                <div className="p-4 text-center text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>Nenhuma etapa de produção registrada para este item.</p>
                  <p className="text-sm mt-1">Configure as etapas para acompanhar o progresso detalhado.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Statistics */}
      <div className="mt-8 bg-gradient-to-r from-gray-100 to-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
          Resumo do Projeto
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{order.items?.length || 0}</div>
            <div className="text-sm text-gray-600">Total de Itens</div>
          </div>
          
          <div className="bg-white rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {order.items?.filter(item => calculateItemProgress(item) === 100).length || 0}
            </div>
            <div className="text-sm text-gray-600">Itens Concluídos</div>
          </div>
          
          <div className="bg-white rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {order.items?.filter(item => {
                const progress = calculateItemProgress(item);
                return progress > 0 && progress < 100;
              }).length || 0}
            </div>
            <div className="text-sm text-gray-600">Em Andamento</div>
          </div>
          
          <div className="bg-white rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {order.items?.length > 0 ? 
                Math.round(order.items.reduce((sum, item) => sum + calculateItemProgress(item), 0) / order.items.length) : 0}%
            </div>
            <div className="text-sm text-gray-600">Progresso Geral</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemProductionReport;
