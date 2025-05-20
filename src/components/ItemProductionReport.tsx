import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, ChevronDown, ChevronRight, QrCode, Info, Loader2 } from 'lucide-react';
import { OrderItem, Order } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import QRCodeDisplay from './QRCodeDisplay';
import { calculateItemProgress } from '../utils/progress';
import { useParams } from 'react-router-dom';
import { useOrderStore } from '../store/orderStore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const ItemProductionReport: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { companyLogo } = useSettingsStore();
  const { getOrder, updateOrder } = useOrderStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);

  useEffect(() => {
    const loadOrder = async () => {
      if (orderId) {
        try {
          setLoading(true);
          const orderData = await getOrder(orderId);
          setOrder(orderData);
        } catch (error) {
          console.error('Error loading order:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    
    loadOrder();
  }, [orderId, getOrder]);

  const onBack = () => {
    window.history.back();
  };

  const toggleItem = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const handleGenerateQR = (item: OrderItem, stage: string) => {
    setSelectedItem(item);
    setSelectedStage(stage);
    setShowQRModal(true);
  };

  const generateQRCode = (itemId: string, stage: string) => {
    // Create a unique code that can be scanned to update progress
    // Format: orderId|itemId|stage
    return `OP_UPDATE|${order?.id}|${itemId}|${stage}`;
  };

  const handleUpdateItemField = async (itemId: string, field: keyof OrderItem, value: any) => {
    if (!order) return;
    
    const updatedItems = order.items.map(item => 
      item.id === itemId ? {...item, [field]: value} : item
    );
    
    const updatedOrder = {...order, items: updatedItems};
    setOrder(updatedOrder);
    
    try {
      // Save changes to database
      await updateOrder(updatedOrder);
    } catch (error) {
      console.error('Error updating order:', error);
    }
  };

  // Sort stages by execution order (planning dates)
  const sortStagesByExecutionOrder = (stages: Record<string, number>, stagePlanning: Record<string, any> = {}) => {
    return Object.entries(stages).sort(([stageNameA, _], [stageNameB, __]) => {
      // Get planning data if available
      const planningA = stagePlanning[stageNameA];
      const planningB = stagePlanning[stageNameB];
      
      // If both have planning data with start dates, sort by start date
      if (planningA?.startDate && planningB?.startDate) {
        return new Date(planningA.startDate).getTime() - new Date(planningB.startDate).getTime();
      }
      
      // If only one has planning data, prioritize the one with data
      if (planningA?.startDate) return -1;
      if (planningB?.startDate) return 1;
      
      // Fallback to stage name comparison for consistent ordering
      return stageNameA.localeCompare(stageNameB);
    });
  };

  // Check if an item is fully completed
  const isItemCompleted = (item: OrderItem): boolean => {
    if (!item.progress || Object.keys(item.progress).length === 0) return false;
    return Object.values(item.progress).every(progress => progress === 100);
  };

  const printItemReport = (item: OrderItem) => {
    if (!order) return;
    
    const doc = new jsPDF();
    
    // Set document properties for A4 page (210 x 297 mm)
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15; // default margin in mm
    const contentWidth = pageWidth - (margin * 2);
    
    // Add logo and title to first page
    let y = margin;
    if (companyLogo) {
      // Calculate logo size to maintain aspect ratio, max height 25mm
      const logoHeight = 20;
      const logoWidth = 40;
      
      doc.addImage(companyLogo, 'JPEG', margin, y, logoWidth, logoHeight);
      
      // Center the title text
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text('Detalhes do Pedido', pageWidth / 2, y + 10, { align: 'center' });
      
      y += logoHeight + 5; // Move down past the logo
    } else {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text('Detalhes do Pedido', pageWidth / 2, y + 10, { align: 'center' });
      y += 15;
    }

    // Order header section - use light blue background
    doc.setFillColor(240, 245, 255);
    doc.setDrawColor(210, 225, 240);
    doc.roundedRect(margin, y, contentWidth, 35, 2, 2, 'FD');
    
    // Order details
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Pedido #${order.orderNumber}`, margin + 5, y + 8);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Cliente: ${order.customer}`, margin + 5, y + 16);
    doc.text(`OS: ${order.internalOrderNumber}`, margin + 5, y + 24);
    doc.text(`Início: ${format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 5, y + 32);
    doc.text(`Entrega: ${format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 80, y + 32);
    
    y += 40;

    // Item header with green background for completed items
    const itemFullyCompleted = isItemCompleted(item);
    
    if (itemFullyCompleted) {
      doc.setFillColor(230, 245, 230); // Light green for completed items
    } else {
      doc.setFillColor(240, 240, 240); // Light gray for in-progress items
    }
    doc.roundedRect(margin, y, contentWidth, 42, 2, 2, 'FD');

    // Item details
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Item ${item.itemNumber}: ${item.code}`, margin + 5, y + 8);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Descrição: ${item.description}`, margin + 5, y + 16);
    doc.text(`Quantidade: ${item.quantity}`, margin + 5, y + 24);
    doc.text(`Peso Unitário: ${item.unitWeight.toLocaleString('pt-BR')} kg`, margin + 75, y + 24);
    doc.text(`Peso Total: ${item.totalWeight.toLocaleString('pt-BR')} kg`, margin + 135, y + 24);
    
    // Add NF and LE info for completed items with a nice green background
    if (itemFullyCompleted) {
      // Subtle green background for NF/LE section
      doc.setFillColor(220, 240, 220);
      doc.roundedRect(margin, y + 28, contentWidth, 12, 1, 1, 'F');
      
      doc.setFont("helvetica", "bold");
      const hasNF = item.invoiceNumber && item.invoiceNumber.trim() !== '';
      const hasLE = item.expeditionLE && item.expeditionLE.trim() !== '';
      const hasDate = item.expeditionDate && item.expeditionDate.trim() !== '';

      if (hasNF) {
        doc.text(`NF: ${item.invoiceNumber}`, margin + 5, y + 36);
      }
      
      if (hasLE) {
        doc.text(`LE: ${item.expeditionLE}`, hasNF ? margin + 75 : margin + 5, y + 36);
      }
      
      if (hasDate) {
        const datePosition = hasNF && hasLE ? margin + 135 : 
                            (hasNF || hasLE) ? margin + 75 : margin + 5;
        doc.text(`Data: ${format(new Date(item.expeditionDate), 'dd/MM/yyyy', { locale: ptBR })}`, datePosition, y + 36);
      }
      
      doc.setFont("helvetica", "normal");
    }
    
    // Increase y for completed items with NF/LE info
    y += 46;
    
    // Progress bar section
    const itemProgress = calculateItemProgress(item.progress);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Progresso: ${itemProgress}%`, margin, y + 4);
    
    // Progress bar background
    doc.setFillColor(230, 230, 230);
    doc.roundedRect(margin + 45, y, contentWidth - 45, 8, 2, 2, 'F');
    
    // Progress bar fill - color based on completion level
    if (itemProgress === 100) {
      doc.setFillColor(60, 180, 75); // Green for 100%
    } else if (itemProgress >= 70) {
      doc.setFillColor(65, 105, 225); // Blue for ≥ 70%
    } else if (itemProgress >= 30) {
      doc.setFillColor(255, 165, 0); // Orange for ≥ 30%
    } else {
      doc.setFillColor(220, 20, 60); // Crimson for < 30%
    }
    
    if (itemProgress > 0) {
      const fillWidth = (itemProgress / 100) * (contentWidth - 45);
      doc.roundedRect(margin + 45, y, fillWidth, 8, 2, 2, 'F');
    }
    
    y += 14;

    // Only add stage details if there's progress data
    if (item.progress && Object.keys(item.progress).length > 0) {
      // Add table header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Etapas de Produção", margin, y);
      y += 8;
      
      // Table headers with auto-table for better layout handling
      const stagePlanning = item.stagePlanning || {};
      
      // Sort stages by execution order (planning start dates)
      const sortedStages = sortStagesByExecutionOrder(item.progress, stagePlanning);
      
      // Define columns for the auto-table
      const columns = [
        {header: 'Etapa', dataKey: 'stage'},
        {header: 'Progresso', dataKey: 'progress'},
        {header: 'Datas', dataKey: 'dates'}
      ];
      
      // Prepare data rows
      const data = sortedStages.map(([stageName, stageProgress]) => {
        const planning = stagePlanning[stageName] || {};
        let dates = '';
        
        if (planning.startDate && planning.endDate) {
          dates = `${format(new Date(planning.startDate), 'dd/MM/yy', { locale: ptBR })} - ${format(new Date(planning.endDate), 'dd/MM/yy', { locale: ptBR })}`;
        }
        
        return {
          stage: stageName,
          progress: `${stageProgress}%`,
          dates: dates
        };
      });
      
      if (data.length > 0) {
        (doc as any).autoTable({
          startY: y,
          columns: columns,
          body: data,
          theme: 'grid',
          headStyles: { 
            fillColor: [240, 240, 240], 
            textColor: [0, 0, 0], 
            fontStyle: 'bold'
          },
          columnStyles: {
            stage: { cellWidth: 80 },
            progress: { cellWidth: 25, halign: 'center' },
            dates: { cellWidth: 50 }
          },
          styles: {
            fontSize: 8,
            cellPadding: 3,
            overflow: 'linebreak'
          },
          willDrawCell: function(data: any) {
            if (data.section === 'body') {
              // Get progress value from the progress column (remove the '%' character)
              const progressText = data.row.cells.progress.text;
              const progress = parseInt(progressText);
              
              // Color the row background for completed stages (100%)
              if (progress === 100) {
                doc.setFillColor(230, 250, 230); // Light green for completed
                doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
              }
            }
          }
        });
        
        // Update y position after table
        y = (doc as any).lastAutoTable.finalY + 15;
        
        // Summary of completed stages
        const completedStages = sortedStages.filter(([_, progress]) => progress === 100).map(([stage]) => stage);
        const totalStages = sortedStages.length;
        
        doc.setFont("helvetica", "bold");
        doc.text(`Etapas Concluídas: ${completedStages.length} de ${totalStages}`, margin, y);
        y += 6;
        
        // List of completed stages
        if (completedStages.length > 0) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          
          const completedText = `Etapas concluídas: ${completedStages.join(', ')}`;
          const textLines = doc.splitTextToSize(completedText, contentWidth);
          
          doc.text(textLines, margin, y);
        }
      } else {
        doc.setFont("helvetica", "normal");
        doc.text("Não há dados de progresso registrados para este item.", margin, y);
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.text("Não há dados de progresso registrados para este item.", margin, y);
    }

    // Add pagination
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${totalPages}`,
        pageWidth / 2, 
        pageHeight - 10, 
        { align: 'center' }
      );
      // Reset text color for next page
      doc.setTextColor(0, 0, 0);
    }
    
    doc.save(`relatorio-${order.orderNumber}-item${item.itemNumber}.pdf`);
  };

  const printAllItems = () => {
    if (!order) return;
    
    order.items.forEach(item => {
      printItemReport(item);
    });
  };

  // Display loading state while fetching order
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <button
              onClick={onBack}
              className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 mr-4"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold">Relatório de Produção por Item</h2>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600">Carregando detalhes do pedido...</p>
          <p className="text-sm text-gray-500 mt-2">Se o problema persistir, o pedido pode não existir ou foi removido.</p>
        </div>
      </div>
    );
  }

  // If order is undefined, show error state
  if (!order) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <button
              onClick={onBack}
              className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 mr-4"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold">Relatório de Produção por Item</h2>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-red-600 font-medium">Pedido não encontrado</p>
          <p className="text-sm text-gray-500 mt-2">Verifique se o ID do pedido está correto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold">Relatório de Produção por Item</h2>
            <p className="text-gray-600">
              Pedido #{order.orderNumber} - {order.customer}
            </p>
          </div>
        </div>
        <button
          onClick={printAllItems}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Download className="h-5 w-5 mr-2" />
          Exportar Todos os Itens
        </button>
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-800 mb-1">Nova Funcionalidade de Rastreamento</h3>
            <p className="text-sm text-blue-700 mt-1">
              Cada etapa de produção agora possui um QR code específico. Escaneie com o app Orbit para atualizar o progresso diretamente do chão de fábrica.
            </p>
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        {order.items.map(item => {
          const isExpanded = expandedItems.has(item.id);
          const itemProgress = calculateItemProgress(item.progress);
          const itemCompleted = isItemCompleted(item);
          
          return (
            <div key={item.id} className="border rounded-lg overflow-hidden">
              <div 
                className="p-4 bg-gray-50 flex justify-between items-center cursor-pointer"
                onClick={() => toggleItem(item.id)}
              >
                <div>
                  <div className="font-medium">
                    Item {item.itemNumber}: {item.code}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {item.description}
                  </div>
                  <div className="text-sm text-gray-600">
                    Quantidade: {item.quantity} | Peso Total: {item.totalWeight.toLocaleString('pt-BR')}kg
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="mr-6 text-right">
                    <div className="text-sm text-gray-600">Progresso</div>
                    <div className="font-medium">{itemProgress}%</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      printItemReport(item);
                    }}
                    className="p-2 bg-gray-100 rounded-md hover:bg-gray-200 mr-2"
                    title="Exportar Relatório deste Item"
                  >
                    <Download className="h-5 w-5 text-gray-600" />
                  </button>
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
              
              {isExpanded && (
                <div className="p-4 divide-y">
                  <div className="pb-3">
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                      <div 
                        className={`h-2.5 rounded-full ${
                          itemProgress === 100 ? 'bg-green-500' :
                          itemProgress >= 70 ? 'bg-blue-500' :
                          itemProgress >= 30 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${itemProgress}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="pt-3 space-y-4">
                    {/* NF/LE fields for completed items - with green styling */}
                    {itemCompleted && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-green-50 rounded-lg border border-green-200 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-green-800 mb-1">
                            Nota Fiscal do Item
                          </label>
                          <input
                            type="text"
                            value={item.invoiceNumber || ''}
                            onChange={(e) => handleUpdateItemField(item.id, 'invoiceNumber', e.target.value)}
                            className="w-full rounded-md border-green-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200"
                            placeholder="Número da NF"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-green-800 mb-1">
                            LE do Item (Lista de Embarque)
                          </label>
                          <input
                            type="text"
                            value={item.expeditionLE || ''}
                            onChange={(e) => handleUpdateItemField(item.id, 'expeditionLE', e.target.value)}
                            className="w-full rounded-md border-green-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200"
                            placeholder="Número da LE"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-green-800 mb-1">
                            Data de Expedição
                          </label>
                          <input
                            type="date"
                            value={item.expeditionDate || ''}
                            onChange={(e) => handleUpdateItemField(item.id, 'expeditionDate', e.target.value)}
                            className="w-full rounded-md border-green-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200"
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Stage Planning Section */}
                    {item.stagePlanning && Object.keys(item.stagePlanning).length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3">Planejamento de Etapas</h4>
                        <div className="space-y-3">
                          {sortStagesByExecutionOrder(item.progress || {}, item.stagePlanning).map(([stage, _]) => {
                            const planning = item.stagePlanning?.[stage] || {};
                            if (!planning.startDate) return null;
                            
                            return (
                              <div key={stage} className="border rounded-md p-3 bg-gray-50">
                                <div className="font-medium">{stage}</div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm">
                                  <div>
                                    <span className="text-gray-500 mr-1">Início:</span> 
                                    {format(new Date(planning.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                                  </div>
                                  <div>
                                    <span className="text-gray-500 mr-1">Término:</span>
                                    {format(new Date(planning.endDate), 'dd/MM/yyyy', { locale: ptBR })}
                                  </div>
                                  <div>
                                    <span className="text-gray-500 mr-1">Duração:</span>
                                    {planning.days} dias úteis
                                  </div>
                                </div>
                                <div className="text-sm mt-1">
                                  <span className="text-gray-500 mr-1">Responsável:</span>
                                  {planning.responsible || 'Não definido'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Progress Stages Section */}
                    <h4 className="font-medium">Etapas de Produção</h4>
                    
                    {item.progress && Object.keys(item.progress).length > 0 ? (
                      <div className="space-y-4">
                        <table className="min-w-full border-collapse border">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="py-2 px-3 border text-left text-sm">Etapa</th>
                              <th className="py-2 px-3 border text-center text-sm" style={{width: '120px'}}>Progresso</th>
                              <th className="py-2 px-3 border text-left text-sm">Datas</th>
                              <th className="py-2 px-3 border text-center text-sm" style={{width: '70px'}}>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortStagesByExecutionOrder(item.progress, item.stagePlanning).map(([stage, progress]) => {
                              const planning = item.stagePlanning?.[stage] || {};
                              return (
                                <tr key={stage} className={progress === 100 ? 'bg-green-50' : ''}>
                                  <td className="py-2 px-3 border text-sm">{stage}</td>
                                  <td className="py-2 px-3 border">
                                    <div className="flex flex-col items-center">
                                      <div className="text-sm font-medium mb-1">{progress}%</div>
                                      <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                          className={`h-2 rounded-full ${
                                            progress === 100 ? 'bg-green-500' :
                                            progress >= 70 ? 'bg-blue-500' :
                                            progress >= 30 ? 'bg-yellow-500' :
                                            'bg-red-500'
                                          }`}
                                          style={{ width: `${progress}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 border text-sm">
                                    {planning.startDate && (
                                      <>
                                        <div>{format(new Date(planning.startDate), 'dd/MM/yy', { locale: ptBR })} - {format(new Date(planning.endDate), 'dd/MM/yy', { locale: ptBR })}</div>
                                        {planning.responsible && (
                                          <div className="text-xs text-gray-500 mt-1">Resp: {planning.responsible}</div>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 border text-center">
                                    {progress < 100 && (
                                      <button
                                        onClick={() => handleGenerateQR(item, stage)}
                                        className="p-1 text-blue-600 hover:text-blue-800"
                                        title="Gerar QR Code"
                                      >
                                        <QrCode className="h-4 w-4" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        
                        <div className="mt-2">
                          <div className="text-sm font-medium">
                            Etapas Concluídas: {Object.entries(item.progress).filter(([_, progress]) => progress === 100).length} de {Object.entries(item.progress).length}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-4 text-gray-500 bg-gray-50 rounded-lg">
                        Nenhuma etapa de produção registrada para este item.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* QR Code Modal */}
      {showQRModal && selectedItem && selectedStage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">QR Code para Atualização</h3>
              <button 
                onClick={() => setShowQRModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
            </div>
            
            <div className="mb-4 text-center">
              <div className="font-medium">Item {selectedItem.itemNumber}: {selectedItem.code}</div>
              <div className="text-sm text-gray-600">Etapa: {selectedStage}</div>
            </div>
            
            <div className="flex justify-center mb-4">
              <QRCodeDisplay
                value={generateQRCode(selectedItem.id, selectedStage)}
                size={250}
                title="Escaneie para atualizar progresso"
                subtitle="Utilize o app Orbit Scanner"
                downloadFileName={`qr_${order.orderNumber}_item${selectedItem.itemNumber}_${selectedStage.replace(/\s+/g, '_')}`}
                color="#1d4ed8"
              />
            </div>
            
            <div className="text-center text-sm text-gray-600">
              <p>Este QR Code permite atualizar o progresso desta etapa diretamente no app Orbit.</p>
              <p className="mt-1">Escaneie o código, informe o percentual de conclusão, e as informações serão atualizadas automaticamente.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemProductionReport;