import React, { useState } from 'react';
import { X, Calendar, Download, FileText, ChevronRight } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCostCenterStore } from '../store/costCenterStore';
import { useOrderStore } from '../store/orderStore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';

interface CostReportModalProps {
  onClose: () => void;
}

type ReportType = 'summary' | 'detailed' | 'order-comparison' | 'category-breakdown' | 'supplier-breakdown';

const CostReportModal: React.FC<CostReportModalProps> = ({ onClose }) => {
  const [reportType, setReportType] = useState<ReportType>('summary');
  const [dateFrom, setDateFrom] = useState(format(subMonths(new Date(), 3), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [includeNegativeMargin, setIncludeNegativeMargin] = useState(true);
  
  const { costs, orderSummaries } = useCostCenterStore();
  const { orders } = useOrderStore();
  const { companyLogo, companyName } = useSettingsStore();
  
  const handleGenerateReport = () => {
    // Filter costs by date range
    const filteredCosts = costs.filter(cost => 
      cost.date >= dateFrom && cost.date <= dateTo
    );
    
    // Filter order summaries by selected orders or negative margin
    let filteredSummaries = orderSummaries;
    if (selectedOrderIds.length > 0) {
      filteredSummaries = orderSummaries.filter(summary => 
        selectedOrderIds.includes(summary.orderId)
      );
    } else if (includeNegativeMargin && reportType === 'order-comparison') {
      filteredSummaries = orderSummaries.filter(summary => 
        summary.marginPercentage < 0
      );
    }
    
    // Create PDF
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
    
    let title = '';
    switch (reportType) {
      case 'summary':
        title = 'RELATÓRIO RESUMIDO DE CUSTOS';
        break;
      case 'detailed':
        title = 'RELATÓRIO DETALHADO DE CUSTOS';
        break;
      case 'order-comparison':
        title = 'COMPARATIVO DE CUSTOS POR PEDIDO';
        break;
      case 'category-breakdown':
        title = 'ANÁLISE DE CUSTOS POR CATEGORIA';
        break;
      case 'supplier-breakdown':
        title = 'ANÁLISE DE CUSTOS POR FORNECEDOR';
        break;
    }
    
    doc.text(title, 105, y, { align: 'center' });
    y += 10;
    
    // Add company name if available
    if (companyName) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text(companyName, 105, y, { align: 'center' });
      y += 10;
    }
    
    // Add date range
    doc.setFontSize(10);
    doc.text(
      `Período: ${format(new Date(dateFrom), 'dd/MM/yyyy', { locale: ptBR })} a ${format(new Date(dateTo), 'dd/MM/yyyy', { locale: ptBR })}`,
      105, 
      y, 
      { align: 'center' }
    );
    y += 15;
    
    // Generate report based on type
    switch (reportType) {
      case 'summary':
        generateSummaryReport(doc, filteredCosts, filteredSummaries, y);
        break;
      case 'detailed':
        generateDetailedReport(doc, filteredCosts, y);
        break;
      case 'order-comparison':
        generateOrderComparisonReport(doc, filteredSummaries, y);
        break;
      case 'category-breakdown':
        generateCategoryBreakdownReport(doc, filteredCosts, y);
        break;
      case 'supplier-breakdown':
        generateSupplierBreakdownReport(doc, filteredCosts, y);
        break;
    }
    
    // Add page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Página ${i} de ${pageCount}`,
        195,
        285,
        { align: 'right' }
      );
      
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        15,
        285
      );
      
      // Reset text color
      doc.setTextColor(0, 0, 0);
    }
    
    // Save the PDF
    const fileName = `relatorio-${reportType}-${format(new Date(), 'dd-MM-yyyy')}.pdf`;
    doc.save(fileName);
  };
  
  const generateSummaryReport = (doc: jsPDF, filteredCosts: CostEntry[], summaries: OrderCostSummary[], startY: number) => {
    let y = startY;
    
    // Summary section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo Financeiro', 15, y);
    y += 10;
    
    // Calculate totals
    const totalCost = filteredCosts.reduce((sum, cost) => sum + cost.amount, 0);
    const totalBudget = summaries.reduce((sum, summary) => sum + summary.totalBudget, 0);
    const totalMargin = totalBudget - totalCost;
    const marginPercentage = totalBudget > 0 ? (totalMargin / totalBudget) * 100 : 0;
    
    // Format currency
    const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    };
    
    // Summary table
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    (doc as any).autoTable({
      startY: y,
      head: [['Métrica', 'Valor']],
      body: [
        ['Valor Total dos Pedidos', formatCurrency(totalBudget)],
        ['Custo Total', formatCurrency(totalCost)],
        ['Margem Bruta', formatCurrency(totalMargin)],
        ['Percentual de Margem', `${marginPercentage.toFixed(2)}%`],
        ['Total de Lançamentos', filteredCosts.length.toString()],
        ['Pedidos com Custos', summaries.length.toString()]
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold' } }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;
    
    // Cost breakdown by category
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Custos por Categoria', 15, y);
    y += 10;
    
    // Calculate costs by category
    const materialCosts = filteredCosts.filter(cost => cost.category === 'material').reduce((sum, cost) => sum + cost.amount, 0);
    const serviceCosts = filteredCosts.filter(cost => cost.category === 'service').reduce((sum, cost) => sum + cost.amount, 0);
    const laborCosts = filteredCosts.filter(cost => cost.category === 'labor').reduce((sum, cost) => sum + cost.amount, 0);
    const logisticsCosts = filteredCosts.filter(cost => cost.category === 'logistics').reduce((sum, cost) => sum + cost.amount, 0);
    const otherCosts = filteredCosts.filter(cost => cost.category === 'other').reduce((sum, cost) => sum + cost.amount, 0);
    
    // Category table
    (doc as any).autoTable({
      startY: y,
      head: [['Categoria', 'Valor', 'Percentual']],
      body: [
        ['Materiais', formatCurrency(materialCosts), `${totalCost > 0 ? ((materialCosts / totalCost) * 100).toFixed(2) : 0}%`],
        ['Serviços', formatCurrency(serviceCosts), `${totalCost > 0 ? ((serviceCosts / totalCost) * 100).toFixed(2) : 0}%`],
        ['Mão de Obra', formatCurrency(laborCosts), `${totalCost > 0 ? ((laborCosts / totalCost) * 100).toFixed(2) : 0}%`],
        ['Logística', formatCurrency(logisticsCosts), `${totalCost > 0 ? ((logisticsCosts / totalCost) * 100).toFixed(2) : 0}%`],
        ['Outros', formatCurrency(otherCosts), `${totalCost > 0 ? ((otherCosts / totalCost) * 100).toFixed(2) : 0}%`],
        ['Total', formatCurrency(totalCost), '100%']
      ],
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10 },
      columnStyles: { 
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' }
      },
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;
    
    // Top 5 most expensive orders
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Top 5 Pedidos com Maiores Custos', 15, y);
    y += 10;
    
    const top5Orders = [...summaries]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
    
    if (top5Orders.length > 0) {
      (doc as any).autoTable({
        startY: y,
        head: [['Pedido', 'Cliente', 'Valor Total', 'Custos', 'Margem', '% Margem']],
        body: top5Orders.map(summary => [
          `#${summary.orderNumber}`,
          summary.customerName,
          formatCurrency(summary.totalBudget),
          formatCurrency(summary.totalSpent),
          formatCurrency(summary.margin),
          `${summary.marginPercentage.toFixed(2)}%`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10 },
        columnStyles: { 
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' }
        }
      });
    } else {
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('Nenhum pedido com custos no período selecionado.', 15, y);
    }
  };
  
  const generateDetailedReport = (doc: jsPDF, filteredCosts: CostEntry[], startY: number) => {
    // Format currency
    const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    };
    
    // Get category name
    const getCategoryName = (category: string): string => {
      switch (category) {
        case 'material': return 'Materiais';
        case 'service': return 'Serviços';
        case 'labor': return 'Mão de Obra';
        case 'logistics': return 'Logística';
        case 'other': return 'Outros';
        default: return category;
      }
    };
    
    // Calculate total
    const totalAmount = filteredCosts.reduce((sum, cost) => sum + cost.amount, 0);
    
    // Generate table with all cost entries
    (doc as any).autoTable({
      startY: startY,
      head: [
        ['Data', 'Pedido', 'Fornecedor', 'OC', 'Descrição', 'Categoria', 'Valor']
      ],
      body: filteredCosts.map(cost => [
        format(new Date(cost.date), 'dd/MM/yyyy', { locale: ptBR }),
        `#${cost.orderNumber}`,
        cost.supplierName,
        cost.purchaseOrderNumber,
        cost.description,
        getCategoryName(cost.category),
        formatCurrency(cost.amount)
      ]),
      foot: [['Total', '', '', '', '', '', formatCurrency(totalAmount)]],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 
        0: { cellWidth: 25 }, // Date
        1: { cellWidth: 20 }, // Order
        2: { cellWidth: 'auto' }, // Supplier
        3: { cellWidth: 20 }, // PO
        4: { cellWidth: 'auto' }, // Description
        5: { cellWidth: 25 }, // Category
        6: { cellWidth: 30, halign: 'right' } // Amount
      }
    });
  };
  
  const generateOrderComparisonReport = (doc: jsPDF, summaries: OrderCostSummary[], startY: number) => {
    let y = startY;
    
    // Format currency
    const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    };
    
    // Instruction text
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    if (selectedOrderIds.length > 0) {
      doc.text('Relatório baseado nos pedidos selecionados.', 15, y);
    } else if (includeNegativeMargin) {
      doc.text('Relatório mostrando apenas pedidos com margem negativa.', 15, y);
    } else {
      doc.text('Relatório comparando todos os pedidos com custos lançados.', 15, y);
    }
    y += 10;
    
    // If we have no summaries, show message
    if (summaries.length === 0) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Nenhum pedido encontrado com os critérios selecionados.', 15, y);
      return;
    }
    
    // Order comparison table
    (doc as any).autoTable({
      startY: y,
      head: [
        ['Pedido', 'Cliente', 'Valor', 'Material', 'Serviços', 'Mão de Obra', 'Logística', 'Outros', 'Total Custos', 'Margem', '% Margem']
      ],
      body: summaries.map(summary => [
        `#${summary.orderNumber}`,
        summary.customerName,
        formatCurrency(summary.totalBudget),
        formatCurrency(summary.materialsCost),
        formatCurrency(summary.servicesCost),
        formatCurrency(summary.laborCost),
        formatCurrency(summary.logisticsCost),
        formatCurrency(summary.otherCosts),
        formatCurrency(summary.totalSpent),
        formatCurrency(summary.margin),
        `${summary.marginPercentage.toFixed(2)}%`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 
        0: { cellWidth: 20 }, // Order number
        1: { cellWidth: 'auto' }, // Customer
        2: { cellWidth: 25, halign: 'right' }, // Value
        3: { cellWidth: 22, halign: 'right' }, // Material
        4: { cellWidth: 22, halign: 'right' }, // Services
        5: { cellWidth: 22, halign: 'right' }, // Labor
        6: { cellWidth: 22, halign: 'right' }, // Logistics
        7: { cellWidth: 22, halign: 'right' }, // Other
        8: { cellWidth: 25, halign: 'right' }, // Total costs
        9: { cellWidth: 25, halign: 'right' }, // Margin
        10: { cellWidth: 20, halign: 'right' } // Margin %
      },
      didParseCell: (data: any) => {
        // Highlight negative margins in red
        if (data.column.index === 9 || data.column.index === 10) {
          if (data.section === 'body') {
            const value = typeof data.cell.raw === 'string'
              ? parseFloat(data.cell.raw.replace(/[^\d,.-]/g, '').replace(',', '.'))
              : data.cell.raw;
                
            if (value < 0 || (data.column.index === 10 && data.cell.raw.includes('-'))) {
              data.cell.styles.textColor = [220, 38, 38]; // Red text for negative values
            }
          }
        }
      }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;
    
    // Summary statistics
    const averageMarginPercentage = summaries.reduce((sum, s) => sum + s.marginPercentage, 0) / summaries.length;
    const lowestMarginOrder = [...summaries].sort((a, b) => a.marginPercentage - b.marginPercentage)[0];
    const highestMarginOrder = [...summaries].sort((a, b) => b.marginPercentage - a.marginPercentage)[0];
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Estatísticas de Margem', 15, y);
    y += 8;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Margem Média: ${averageMarginPercentage.toFixed(2)}%`, 15, y);
    y += 6;
    
    doc.text(`Pedido com Menor Margem: #${lowestMarginOrder.orderNumber} (${lowestMarginOrder.marginPercentage.toFixed(2)}%)`, 15, y);
    y += 6;
    
    doc.text(`Pedido com Maior Margem: #${highestMarginOrder.orderNumber} (${highestMarginOrder.marginPercentage.toFixed(2)}%)`, 15, y);
  };
  
  const generateCategoryBreakdownReport = (doc: jsPDF, filteredCosts: CostEntry[], startY: number) => {
    let y = startY;
    
    // Format currency
    const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    };
    
    // Get category name
    const getCategoryName = (category: string): string => {
      switch (category) {
        case 'material': return 'Materiais';
        case 'service': return 'Serviços';
        case 'labor': return 'Mão de Obra';
        case 'logistics': return 'Logística';
        case 'other': return 'Outros';
        default: return category;
      }
    };
    
    // Calculate costs by category
    const categories = ['material', 'service', 'labor', 'logistics', 'other'];
    const totalByCategory: Record<string, number> = {};
    
    categories.forEach(category => {
      totalByCategory[category] = filteredCosts
        .filter(cost => cost.category === category)
        .reduce((sum, cost) => sum + cost.amount, 0);
    });
    
    const totalCost = Object.values(totalByCategory).reduce((sum, cost) => sum + cost, 0);
    
    // Category summary
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo por Categoria', 15, y);
    y += 10;
    
    (doc as any).autoTable({
      startY: y,
      head: [['Categoria', 'Valor', 'Percentual', 'Qtd. Lançamentos']],
      body: categories.map(category => [
        getCategoryName(category),
        formatCurrency(totalByCategory[category]),
        `${totalCost > 0 ? ((totalByCategory[category] / totalCost) * 100).toFixed(2) : 0}%`,
        filteredCosts.filter(cost => cost.category === category).length.toString()
      ]),
      foot: [['Total', formatCurrency(totalCost), '100%', filteredCosts.length.toString()]],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
      styles: { fontSize: 10 },
      columnStyles: { 
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;
    
    // Detailed breakdown by category
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Detalhamento por Categoria', 15, y);
    y += 10;
    
    // For each category, list top costs
    for (const category of categories) {
      // Skip if no costs in this category
      if (totalByCategory[category] === 0) continue;
      
      // If we're running out of space, add a new page
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      // Category header
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(getCategoryName(category), 15, y);
      y += 8;
      
      // Get top 5 costs in this category
      const categoryCosts = filteredCosts
        .filter(cost => cost.category === category)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      
      if (categoryCosts.length > 0) {
        (doc as any).autoTable({
          startY: y,
          head: [['Pedido', 'Fornecedor', 'Descrição', 'Data', 'Valor']],
          body: categoryCosts.map(cost => [
            `#${cost.orderNumber}`,
            cost.supplierName,
            cost.description,
            format(new Date(cost.date), 'dd/MM/yyyy', { locale: ptBR }),
            formatCurrency(cost.amount)
          ]),
          theme: 'plain',
          headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold' },
          styles: { fontSize: 9 },
          columnStyles: { 
            4: { halign: 'right' }
          }
        });
        
        y = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('Nenhum lançamento nesta categoria.', 15, y);
        y += 10;
      }
    }
  };
  
  const generateSupplierBreakdownReport = (doc: jsPDF, filteredCosts: CostEntry[], startY: number) => {
    let y = startY;
    
    // Format currency
    const formatCurrency = (value: number) => {
      return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    };
    
    // Calculate costs by supplier
    const supplierTotals: Record<string, number> = {};
    filteredCosts.forEach(cost => {
      if (!supplierTotals[cost.supplierName]) {
        supplierTotals[cost.supplierName] = 0;
      }
      supplierTotals[cost.supplierName] += cost.amount;
    });
    
    const totalCost = Object.values(supplierTotals).reduce((sum, cost) => sum + cost, 0);
    
    // Sort suppliers by total cost (highest first)
    const sortedSuppliers = Object.entries(supplierTotals)
      .sort(([, costA], [, costB]) => costB - costA);
    
    // Supplier summary
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Resumo por Fornecedor', 15, y);
    y += 10;
    
    (doc as any).autoTable({
      startY: y,
      head: [['Fornecedor', 'Valor Total', 'Percentual', 'Qtd. Lançamentos']],
      body: sortedSuppliers.map(([supplier, total]) => [
        supplier,
        formatCurrency(total),
        `${totalCost > 0 ? ((total / totalCost) * 100).toFixed(2) : 0}%`,
        filteredCosts.filter(cost => cost.supplierName === supplier).length.toString()
      ]),
      foot: [['Total', formatCurrency(totalCost), '100%', filteredCosts.length.toString()]],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
      styles: { fontSize: 10 },
      columnStyles: { 
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      }
    });
    
    y = (doc as any).lastAutoTable.finalY + 15;
    
    // Top 5 suppliers
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Top 5 Fornecedores - Detalhe de Lançamentos', 15, y);
    y += 10;
    
    // Get top 5 suppliers
    const top5Suppliers = sortedSuppliers.slice(0, 5);
    
    for (const [supplier, _] of top5Suppliers) {
      // If we're running out of space, add a new page
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      
      // Supplier header
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(supplier, 15, y);
      y += 8;
      
      // Get costs for this supplier
      const supplierCosts = filteredCosts
        .filter(cost => cost.supplierName === supplier)
        .sort((a, b) => b.amount - a.amount);
      
      (doc as any).autoTable({
        startY: y,
        head: [['Data', 'Pedido', 'Descrição', 'Categoria', 'Valor']],
        body: supplierCosts.map(cost => [
          format(new Date(cost.date), 'dd/MM/yyyy', { locale: ptBR }),
          `#${cost.orderNumber}`,
          cost.description,
          getCategoryName(cost.category),
          formatCurrency(cost.amount)
        ]),
        foot: [['Total', '', '', '', formatCurrency(supplierTotals[supplier])]],
        theme: 'plain',
        headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold' },
        footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
        styles: { fontSize: 9 },
        columnStyles: { 
          4: { halign: 'right' }
        }
      });
      
      y = (doc as any).lastAutoTable.finalY + 10;
    }
  };
  
  // Helper to get category name
  const getCategoryName = (category: string): string => {
    switch (category) {
      case 'material': return 'Materiais';
      case 'service': return 'Serviços';
      case 'labor': return 'Mão de Obra';
      case 'logistics': return 'Logística';
      case 'other': return 'Outros';
      default: return category;
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Gerar Relatório</h2>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="space-y-6">
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Relatório
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReportType('summary')}
                className={`flex items-center p-3 border rounded-md ${
                  reportType === 'summary' 
                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Resumo Geral</div>
                  <div className="text-sm text-gray-600">Visão consolidada dos custos e margens</div>
                </div>
                {reportType === 'summary' && <ChevronRight className="h-5 w-5 ml-auto" />}
              </button>
              
              <button
                type="button"
                onClick={() => setReportType('detailed')}
                className={`flex items-center p-3 border rounded-md ${
                  reportType === 'detailed' 
                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Relatório Detalhado</div>
                  <div className="text-sm text-gray-600">Lista completa de todos os lançamentos</div>
                </div>
                {reportType === 'detailed' && <ChevronRight className="h-5 w-5 ml-auto" />}
              </button>
              
              <button
                type="button"
                onClick={() => setReportType('order-comparison')}
                className={`flex items-center p-3 border rounded-md ${
                  reportType === 'order-comparison' 
                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <BarChart className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Comparativo por Pedido</div>
                  <div className="text-sm text-gray-600">Análise de custos e margens por pedido</div>
                </div>
                {reportType === 'order-comparison' && <ChevronRight className="h-5 w-5 ml-auto" />}
              </button>
              
              <button
                type="button"
                onClick={() => setReportType('category-breakdown')}
                className={`flex items-center p-3 border rounded-md ${
                  reportType === 'category-breakdown' 
                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Análise por Categoria</div>
                  <div className="text-sm text-gray-600">Custos divididos por categoria</div>
                </div>
                {reportType === 'category-breakdown' && <ChevronRight className="h-5 w-5 ml-auto" />}
              </button>
              
              <button
                type="button"
                onClick={() => setReportType('supplier-breakdown')}
                className={`flex items-center p-3 border rounded-md ${
                  reportType === 'supplier-breakdown' 
                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Análise por Fornecedor</div>
                  <div className="text-sm text-gray-600">Custos divididos por fornecedor</div>
                </div>
                {reportType === 'supplier-breakdown' && <ChevronRight className="h-5 w-5 ml-auto" />}
              </button>
            </div>
          </div>
          
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              <Calendar className="h-5 w-5 mr-1" />
              Período do Relatório
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Data Inicial</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Data Final</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                />
              </div>
            </div>
          </div>
          
          {/* Order selection for order comparison */}
          {reportType === 'order-comparison' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 flex items-center">
                  <Package className="h-5 w-5 mr-1" />
                  Pedidos para Comparação
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="includeNegative"
                    checked={includeNegativeMargin}
                    onChange={(e) => setIncludeNegativeMargin(e.target.checked)}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    disabled={selectedOrderIds.length > 0}
                  />
                  <label htmlFor="includeNegative" className="ml-2 text-sm text-gray-700">
                    Mostrar apenas pedidos com margem negativa
                  </label>
                </div>
              </div>
              <div className="mt-2">
                <select
                  multiple
                  size={5}
                  value={selectedOrderIds}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setSelectedOrderIds(selected);
                    if (selected.length > 0) {
                      setIncludeNegativeMargin(false);
                    }
                  }}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  {orders
                    .filter(o => !o.deleted && orderSummaries.some(s => s.orderId === o.id))
                    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber))
                    .map(order => (
                      <option key={order.id} value={order.id}>
                        #{order.orderNumber} - {order.customer}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Ctrl+clique para selecionar múltiplos pedidos. Se nenhum for selecionado, todos serão incluídos no relatório.
                </p>
              </div>
            </div>
          )}
          
          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGenerateReport}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <Download className="h-5 w-5 mr-2" />
              Gerar Relatório
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostReportModal;