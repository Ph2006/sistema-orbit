import React, { useState, useEffect } from 'react';
import { X, Download, Edit, Tag, ShoppingBag, DollarSign, Check, AlertTriangle, Clock } from 'lucide-react';
import { MaterialRequisition, MaterialRequisitionItem } from '../types/materials';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';

interface MaterialRequisitionDetailModalProps {
  requisition: MaterialRequisition;
  onClose: () => void;
  onEdit: () => void;
}

const MaterialRequisitionDetailModal: React.FC<MaterialRequisitionDetailModalProps> = ({
  requisition,
  onClose,
  onEdit
}) => {
  const { companyLogo, companyName } = useSettingsStore();
  
  // Format currency
  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return 'N/A';
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock className="h-3 w-3 mr-1" />
            Parcial
          </span>
        );
      case 'complete':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <Check className="h-3 w-3 mr-1" />
            Completa
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <X className="h-3 w-3 mr-1" />
            Cancelada
          </span>
        );
      default:
        return null;
    }
  };

  const getItemStatusBadge = (status: string) => {
    switch(status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Pendente
          </span>
        );
      case 'ordered':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Encomendado
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Recebido
          </span>
        );
      case 'stock':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            Estoque
          </span>
        );
      default:
        return null;
    }
  };

  // Export requisition to PDF
  const handleExportPDF = () => {
    // Create PDF in landscape orientation for better page usage
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm'
    });
    
    // Get page dimensions (now landscape)
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15; // default margin in mm
    
    let y = margin;
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', margin, y, 40, 20);
      y = 40;
    }
    
    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('REQUISIÇÃO DE MATERIAIS', pageWidth / 2, 20, {align: 'center'});
    y += 10;
    
    // Company name if available
    if (companyName) {
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, pageWidth / 2, y, {align: 'center'});
      y += 8;
    }
    
    // Order details in a box
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y, pageWidth - (margin * 2), 30, 'F');
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`PEDIDO #${requisition.orderNumber}`, margin + 5, y + 8);
    doc.text(`Cliente: ${requisition.customer}`, margin + 5, y + 16);
    
    doc.text(`Data da Solicitação: ${format(new Date(requisition.requestDate), 'dd/MM/yyyy', { locale: ptBR })}`, pageWidth - margin - 70, y + 8);
    doc.text(`Status: ${
      requisition.status === 'pending' ? 'Pendente' :
      requisition.status === 'partial' ? 'Parcial' :
      requisition.status === 'complete' ? 'Completa' :
      'Cancelada'
    }`, pageWidth - margin - 70, y + 16);
    
    // Budget and cost info
    doc.text(`Limite de Orçamento: ${formatCurrency(requisition.budgetLimit)}`, margin + 5, y + 24);
    doc.text(`Custo Total: ${formatCurrency(requisition.totalCost)}`, pageWidth - margin - 70, y + 24);
    
    y += 35;
    
    // Notes if available
    if (requisition.notes) {
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('OBSERVAÇÕES:', margin, y);
      doc.setFont(undefined, 'normal');
      
      // Split notes into multiple lines if needed
      const notes = doc.splitTextToSize(requisition.notes, pageWidth - (margin * 2));
      doc.text(notes, margin, y + 6);
      y += notes.length * 5 + 10;
    } else {
      y += 5;
    }
    
    // Items table with autotable for better formatting
    (doc as any).autoTable({
      startY: y,
      head: [
        [
          'Código', 
          'Descrição', 
          'Material',
          'Qtd',
          'Dimensões',
          'Peso Total',
          'Status',
          'Fornecedor',
          'Custo'
        ]
      ],
      body: requisition.items.map(item => [
        item.traceabilityCode,
        item.description,
        item.material,
        item.quantity.toString(),
        item.dimensions,
        `${(item.totalWeight).toFixed(2)} kg`,
        item.status === 'pending' ? 'Pendente' :
        item.status === 'ordered' ? 'Encomendado' :
        item.status === 'received' ? 'Recebido' :
        'Estoque',
        item.supplierName || 'N/A',
        item.invoiceValue ? formatCurrency(item.invoiceValue) : 'N/A'
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      foot: [
        [
          '', '', '', '', '', '', '', 'Total:', formatCurrency(requisition.totalCost)
        ]
      ],
      footStyles: {
        fillColor: [240, 240, 240],
        fontStyle: 'bold'
      },
      styles: {
        cellPadding: 3,
        fontSize: 9
      },
      columnStyles: {
        0: { cellWidth: 30 }, // Código
        1: { cellWidth: 'auto' }, // Descrição - allow to expand
        2: { cellWidth: 30 }, // Material
        3: { cellWidth: 15, halign: 'center' }, // Qtd
        4: { cellWidth: 30 }, // Dimensões  
        5: { cellWidth: 25, halign: 'right' }, // Peso Total
        6: { cellWidth: 25, halign: 'center' }, // Status
        7: { cellWidth: 40 }, // Fornecedor
        8: { cellWidth: 25, halign: 'right' } // Custo
      }
    });
    
    // Add budget alert if exceeded
    if (requisition.budgetExceeded) {
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFillColor(255, 240, 240);
      doc.rect(margin, finalY, pageWidth - (margin * 2), 10, 'F');
      
      doc.setTextColor(220, 38, 38); // red color
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(
        `ALERTA: Orçamento excedido em ${formatCurrency(requisition.totalCost - requisition.budgetLimit)}`,
        pageWidth / 2, 
        finalY + 7, 
        { align: 'center' }
      );
      doc.setTextColor(0, 0, 0); // reset text color
    }
    
    // Add pagination footer
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
    }
    
    doc.save(`requisicao-material-${requisition.orderNumber}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold">Requisição de Material</h2>
            <p className="text-gray-600">
              Pedido #{requisition.orderNumber} - {requisition.customer}
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleExportPDF}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              title="Exportar como PDF"
            >
              <Download className="h-5 w-5 mr-2" />
              Exportar PDF
            </button>
            <button
              onClick={onEdit}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              title="Editar Requisição"
            >
              <Edit className="h-5 w-5 mr-2" />
              Editar
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Header Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center">
                <ShoppingBag className="h-6 w-6 text-blue-500 mr-2" />
                <h3 className="font-medium text-blue-800">Detalhes da Requisição</h3>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Data da Solicitação:</span>{' '}
                  <span className="font-medium">{format(new Date(requisition.requestDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                <div>
                  <span className="text-gray-600">Criado em:</span>{' '}
                  <span className="font-medium">{format(new Date(requisition.createdAt), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                <div>
                  <span className="text-gray-600">Última Atualização:</span>{' '}
                  <span className="font-medium">{format(new Date(requisition.lastUpdated), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                {requisition.notes && (
                  <div>
                    <span className="text-gray-600">Observações:</span>{' '}
                    <p className="mt-1">{requisition.notes}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center">
                <DollarSign className="h-6 w-6 text-green-500 mr-2" />
                <h3 className="font-medium text-green-800">Informações Financeiras</h3>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Limite de Orçamento (30%):</span>{' '}
                  <span className="font-medium">{formatCurrency(requisition.budgetLimit)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Custo Total dos Itens:</span>{' '}
                  <span className={`font-medium ${requisition.budgetExceeded ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(requisition.totalCost)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Status do Orçamento:</span>{' '}
                  {requisition.budgetExceeded ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Excedido em {formatCurrency(requisition.totalCost - requisition.budgetLimit)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <Check className="h-3 w-3 mr-1" />
                      Dentro do limite
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center">
                <Tag className="h-6 w-6 text-purple-500 mr-2" />
                <h3 className="font-medium text-purple-800">Status dos Itens</h3>
              </div>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total de Itens:</span>
                  <span className="font-medium">{requisition.items.length}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Pendentes:</span>
                  <span className="font-medium">{requisition.items.filter(item => item.status === 'pending').length}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Encomendados:</span>
                  <span className="font-medium">{requisition.items.filter(item => item.status === 'ordered').length}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Recebidos:</span>
                  <span className="font-medium">{requisition.items.filter(item => item.status === 'received').length}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">De Estoque:</span>
                  <span className="font-medium">{requisition.items.filter(item => item.status === 'stock').length}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Items Table */}
          <div>
            <h3 className="text-lg font-medium mb-4">Itens da Requisição</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Código de Rastreabilidade
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Material / Dimensões
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Qtd / Peso
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Detalhes de Aquisição
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Detalhes de Recebimento
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {requisition.items.map((item, index) => (
                    <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-3 text-sm">
                        <div className="flex items-center">
                          <Tag className="h-4 w-4 text-blue-500 mr-1 flex-shrink-0" />
                          <div>
                            <div className="font-mono text-xs">{item.traceabilityCode}</div>
                            <div className="text-xs text-gray-500 mt-1">{item.itemCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-medium">{item.description}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div>{item.material}</div>
                        <div className="text-xs text-gray-500 mt-1">{item.dimensions}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div>{item.quantity} un.</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {item.weight.toLocaleString('pt-BR')} kg 
                          {item.surplusWeight > 0 && ` + ${item.surplusWeight.toLocaleString('pt-BR')} kg (sobra)`}
                        </div>
                        <div className="text-xs font-medium mt-1">
                          Total: {item.totalWeight.toLocaleString('pt-BR')} kg
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        {getItemStatusBadge(item.status)}
                        {item.sentForQuotation && (
                          <div className="text-xs text-blue-600 mt-1">
                            Enviado para cotação
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {item.status !== 'stock' ? (
                          <div className="space-y-1">
                            {item.supplierName && (
                              <div className="text-sm">
                                <span className="text-gray-500">Fornecedor:</span> {item.supplierName}
                              </div>
                            )}
                            {item.purchaseOrderNumber && (
                              <div className="text-sm">
                                <span className="text-gray-500">PO:</span> {item.purchaseOrderNumber}
                              </div>
                            )}
                            {item.invoiceValue !== undefined && item.invoiceValue > 0 && (
                              <div className="text-sm">
                                <span className="text-gray-500">Valor:</span> {formatCurrency(item.invoiceValue)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm font-medium text-purple-600">Material de Estoque</div>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(item.status === 'received' || item.status === 'stock') && (
                          <div className="space-y-1">
                            {item.receiptDate && (
                              <div className="text-sm">
                                <span className="text-gray-500">Data de Recebimento:</span>{' '}
                                {format(new Date(item.receiptDate), 'dd/MM/yyyy', { locale: ptBR })}
                              </div>
                            )}
                            {item.invoiceNumber && (
                              <div className="text-sm">
                                <span className="text-gray-500">Nota Fiscal:</span> {item.invoiceNumber}
                              </div>
                            )}
                            {item.qualityCertificateNumber && (
                              <div className="text-sm">
                                <span className="text-gray-500">Certificado de Qualidade:</span> {item.qualityCertificateNumber}
                              </div>
                            )}
                          </div>
                        )}
                        {(item.status === 'pending' || item.status === 'ordered') && (
                          <div className="text-sm text-gray-500 italic">
                            Aguardando recebimento
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaterialRequisitionDetailModal;