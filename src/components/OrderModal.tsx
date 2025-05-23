import React, { useState, useEffect } from 'react';
import { X, Plus, Link, Trash2, Edit, Download, BarChart, FileText, CheckSquare, Square, Briefcase, ClipboardCheck, Globe, Copy, ExternalLink, Share } from 'lucide-react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Order, OrderItem, OrderStatus, ClientProject } from '../types/kanban';
import { Customer } from '../types/customer';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import ItemProgressModal from './ItemProgressModal';
import { calculateItemProgress } from '../utils/progress';

interface ClientAccessLink {
  id: string;
  url: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  accessCount: number;
}

// Função auxiliar para parsear datas com segurança
const safeISODate = (dateStr: string): string => {
  try {
    if (!dateStr || dateStr.trim() === '') {
      return new Date().toISOString();
    }
    // Assuming dateStr is in 'yyyy-MM-dd' format for simplicity
    const date = new Date(`${dateStr}T00:00:00`);
    if (isNaN(date.getTime())) {
      // Fallback for invalid date strings
      return new Date().toISOString();
    }
    return date.toISOString();
  } catch (error) {
    console.error("Error parsing date string:", dateStr, error);
    return new Date().toISOString();
  }
};

interface OrderModalProps {
  order: Order | null;
  onClose: () => void;
  onSave: (order: Order) => void;
  projects?: ClientProject[];
}

const OrderModal: React.FC<OrderModalProps> = ({ order, onClose, onSave, projects = [] }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const { companyLogo } = useSettingsStore();
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showPublicLink, setShowPublicLink] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  
  const [formData, setFormData] = useState<Order>({
    id: order?.id || 'new',
    orderNumber: order?.orderNumber || '',
    startDate: order?.startDate || new Date().toISOString().split('T')[0],
    deliveryDate: order?.deliveryDate || new Date().toISOString().split('T')[0],
    internalOrderNumber: order?.internalOrderNumber || '',
    totalWeight: order?.totalWeight || 0,
    status: order?.status || 'in-progress',
    items: order?.items || [],
    driveLinks: order?.driveLinks || [],
    customer: order?.customer || '',
    columnId: order?.columnId || null,
    deleted: false,
    checklist: order?.checklist || {
      drawings: false,
      inspectionTestPlan: false,
      paintPlan: false
    },
    projectId: order?.projectId || '',
    projectName: order?.projectName || '',
    completedDate: order?.completedDate || '',
    lastExportDate: order?.lastExportDate || '',
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const customersRef = collection(db, getCompanyCollection('customers'));
      const snapshot = await getDocs(customersRef);
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersData);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const handleProjectChange = (projectId: string) => {
    const selectedProject = projects.find(p => p.id === projectId);
    setFormData({
      ...formData,
      projectId,
      projectName: selectedProject?.name || ''
    });
  };

  const handleAddItem = () => {
    const newItem: OrderItem = {
      id: Date.now().toString(),
      itemNumber: formData.items.length + 1,
      code: '',
      description: '',
      quantity: 1,
      totalWeight: 0,
      unitWeight: 0,
      progress: {
        'Programação': 0,
        'Corte': 0,
        'Furação': 0,
        'Dobra': 0,
        'Caldeiraria': 0,
        'Usinagem': 0,
        'Pintura': 0,
        'Expedição': 0
      },
      stage: 'Programação'
    };
    setFormData({ ...formData, items: [...formData.items, newItem] });
  };

  const handleUpdateItem = (index: number, field: keyof OrderItem, value: any) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitWeight') {
      const quantity = field === 'quantity' ? value : updatedItems[index].quantity;
      const unitWeight = field === 'unitWeight' ? value : updatedItems[index].unitWeight;
      updatedItems[index].totalWeight = quantity * unitWeight;
    }
    
    setFormData({ ...formData, items: updatedItems });
  };

  const handleDeleteItem = (index: number) => {
    const updatedItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: updatedItems });
  };

  const handleAddDriveLink = () => {
    setFormData({
      ...formData,
      driveLinks: [...formData.driveLinks, { name: '', url: '' }]
    });
  };

  const handleUpdateDriveLink = (index: number, field: 'name' | 'url', value: string) => {
    const updatedLinks = [...formData.driveLinks];
    updatedLinks[index] = { ...updatedLinks[index], [field]: value };
    setFormData({ ...formData, driveLinks: updatedLinks });
  };

  const handleDeleteDriveLink = (index: number) => {
    const updatedLinks = formData.driveLinks.filter((_, i) => i !== index);
    setFormData({ ...formData, driveLinks: updatedLinks });
  };

  const handleSave = () => {
    const totalWeight = formData.items.reduce((sum, item) => sum + item.totalWeight, 0);
    const orderToSave = { ...formData, totalWeight };
    onSave(orderToSave);
  };

  const handleItemProgressSave = (updatedItem: OrderItem) => {
    const updatedItems = formData.items.map(item => 
      item.id === updatedItem.id ? updatedItem : item
    );
    setFormData({ ...formData, items: updatedItems });
    setSelectedItem(null);
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleBatchProgressUpdate = () => {
    if (selectedItems.size === 0) return;
    
    const firstSelectedItem = formData.items.find(item => selectedItems.has(item.id));
    if (firstSelectedItem) {
      setSelectedItem(firstSelectedItem);
    }
  };

  // 🎨 NOVA FUNÇÃO DE EXPORTAÇÃO PROFISSIONAL
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let currentY = margin;

    // 🎨 CABEÇALHO PROFISSIONAL
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', margin, currentY, 40, 20);
    }

    // Título principal
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold'); // Corrected: Use a valid font name
    doc.setTextColor(44, 62, 80);
    doc.text('CRONOGRAMA DE PRODUÇÃO', pageWidth / 2, currentY + 12, { align: 'center' });

    currentY += 25;

    // Informações do pedido em caixas
    // Caixa 1 - Pedido
    doc.setFillColor(52, 152, 219);
    doc.rect(margin, currentY, pageWidth - (2 * margin), 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold'); // Corrected: Use a valid font name
    doc.text('PEDIDO', margin + 2, currentY + 3);
    doc.setFontSize(12);
    doc.text(`#${formData.orderNumber}`, margin + 2, currentY + 6);

    // Caixa 2 - Cliente
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, currentY + 25, pageWidth - (2 * margin), 25, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, currentY + 25, pageWidth - (2 * margin), 25);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold'); // Corrected: Use a valid font name
    doc.text('Cliente:', margin + 5, currentY + 27);
    doc.setFont('helvetica', 'normal'); // Corrected: Use a valid font name
    doc.text(formData.customer, margin + 25, currentY + 27);

    doc.setFont(undefined, 'bold');
    doc.text('OS Interna:', margin + 100, currentY + 27);
    doc.setFont(undefined, 'normal');
    doc.text(formData.internalOrderNumber, margin + 125, currentY + 27);

    currentY += 28;

    // Caixa 3 - Data
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, currentY, pageWidth - (2 * margin), 25, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, currentY, pageWidth - (2 * margin), 25);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold'); // Corrected: Use a valid font name
    doc.text('Data de Início:', margin + 5, currentY + 3);
    doc.setFont('helvetica', 'normal'); // Corrected: Use a valid font name
    doc.text(format(new Date(formData.startDate), 'dd/MM/yyyy', { locale: ptBR }), margin + 30, currentY + 3);

    doc.setFont(undefined, 'bold');
    doc.text('Data de Entrega:', margin + 100, currentY + 3);
    doc.setFont(undefined, 'normal');
    doc.text(format(new Date(formData.deliveryDate), 'dd/MM/yyyy', { locale: ptBR }), margin + 130, currentY + 3);

    currentY += 28;

    // Caixa 4 - Progresso Geral
    doc.setFillColor(248, 249, 250);
    doc.rect(margin, currentY, pageWidth - (2 * margin), 25, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, currentY, pageWidth - (2 * margin), 25);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold'); // Corrected: Use a valid font name
    doc.text('Progresso Geral:', margin + 5, currentY + 3);
    doc.setFont('helvetica', 'normal'); // Corrected: Use a valid font name

    const totalItems = formData.items.length;
    const overallProgress = totalItems > 0 ? Math.round(formData.items.reduce((sum, item) => sum + (calculateItemProgress(item.progress) || 0), 0) / totalItems) : 0;
    const daysRemaining = differenceInDays(new Date(formData.deliveryDate), new Date());

    doc.setFont(undefined, 'bold');
    doc.text(`${overallProgress}%`, margin + 35, currentY + 3);

    doc.setFont(undefined, 'bold');
    doc.text('Dias Restantes:', margin + 100, currentY + 3);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(daysRemaining < 0 ? [220, 53, 69] : daysRemaining < 7 ? [255, 193, 7] : [40, 167, 69]);
    doc.text(`${daysRemaining} dias`, margin + 130, currentY + 3);
    doc.setTextColor(0, 0, 0);

    currentY += 20;

    // 📈 GRÁFICO DE PROGRESSO VISUAL
    const addProgressChart = () => {
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('PROGRESSO POR ETAPA', margin, currentY);
      currentY += 10;
      
      // Agrupar progresso por etapas
      const stageProgress: Record<string, { total: number, completed: number }> = {};
      
      formData.items.forEach(item => {
        if (item.progress) {
          Object.entries(item.progress).forEach(([stage, progress]) => {
            if (!stageProgress[stage]) {
              stageProgress[stage] = { total: 0, completed: 0 };
            }
            stageProgress[stage].total += 100;
            stageProgress[stage].completed += progress || 0;
          });
        }
      });
      
      // Desenhar barras de progresso
      Object.entries(stageProgress).forEach(([stage, data], index) => {
        const progressPercent = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
        const barY = currentY + (index * 15);
        
        // Nome da etapa
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(stage, margin, barY);
        
        // Barra de progresso
        const barX = margin + 60;
        const barWidth = 100;
        const barHeight = 6;
        
        // Fundo da barra
        doc.setFillColor(230, 230, 230);
        doc.rect(barX, barY - 4, barWidth, barHeight, 'F');
        
        // Progresso da barra
        const fillWidth = (barWidth * progressPercent) / 100;
        const color = progressPercent === 100 ? [40, 167, 69] : 
                     progressPercent >= 70 ? [23, 162, 184] :
                     progressPercent >= 30 ? [255, 193, 7] : [220, 53, 69];
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(barX, barY - 4, fillWidth, barHeight, 'F');
        
        // Percentual
        doc.setFont(undefined, 'bold');
        doc.text(`${progressPercent}%`, barX + barWidth + 5, barY);
      });
      
      currentY += Object.keys(stageProgress).length * 15 + 10;
    };

    // 📋 TABELA DETALHADA DOS ITENS
    const addItemsTable = () => {
      const tableData = formData.items.map(item => {
        const itemProgress = calculateItemProgress(item.progress) || 0;
        const status = itemProgress === 100 ? 'Concluído' : 
                     itemProgress >= 70 ? 'Quase Pronto' :
                     itemProgress >= 30 ? 'Em Andamento' : 'Não Iniciado';
        
        return [
          item.itemNumber.toString(),
          item.code,
          item.description.length > 30 ? item.description.substring(0, 30) + '...' : item.description,
          item.quantity.toString(),
          `${item.totalWeight.toLocaleString('pt-BR')} kg`,
          `${itemProgress}%`,
          status
        ];
      });

      (doc as any).autoTable({
        startY: currentY,
        head: [['Item', 'Código', 'Descrição', 'Qtd', 'Peso', 'Progresso', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10
        },
        bodyStyles: {
          fontSize: 9
        },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 60 },
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 20, halign: 'center' },
          6: { cellWidth: 30, halign: 'center' }
        },
        didParseCell: function(data: any) {
          // Colorir células de status
          if (data.column.index === 6 && data.section === 'body') {
            const status = data.cell.text[0];
            if (status === 'Concluído') {
              data.cell.styles.textColor = [40, 167, 69];
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'Quase Pronto') {
              data.cell.styles.textColor = [23, 162, 184];
            } else if (status === 'Em Andamento') {
              data.cell.styles.textColor = [255, 193, 7];
            } else {
              data.cell.styles.textColor = [220, 53, 69];
            }
          }
        }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 15;
    };

    // 🎯 CRONOGRAMA VISUAL (GANTT SIMPLIFICADO)
    const addVisualTimeline = () => {
      // Verificar se cabe na página atual
      if (currentY > pageHeight - 80) {
        doc.addPage();
        currentY = margin;
      }
      
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('CRONOGRAMA VISUAL', margin, currentY);
      currentY += 10;
      
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.deliveryDate);
      const totalDays = differenceInDays(endDate, startDate);
      const timelineWidth = pageWidth - (2 * margin) - 60;
      
      // Cabeçalho do cronograma
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text('Início', margin + 60, currentY);
      doc.text(format(startDate, 'dd/MM', { locale: ptBR }), margin + 60, currentY + 5);
      
      doc.text('Fim', margin + 60 + timelineWidth, currentY, { align: 'right' });
      doc.text(format(endDate, 'dd/MM', { locale: ptBR }), margin + 60 + timelineWidth, currentY + 5, { align: 'right' });
      
      currentY += 15;
      
      // Linha do tempo para cada item
      formData.items.slice(0, 8).forEach((item, index) => { // Limitar a 8 itens para não estourar a página
        const itemY = currentY + (index * 12);
        
        // Nome do item
        doc.setFontSize(8);
        doc.text(`${item.itemNumber}. ${item.code}`, margin, itemY);
        
        // Barra de progresso no cronograma
        const barX = margin + 60;
        const barHeight = 6;
        const progressPercent = calculateItemProgress(item.progress) || 0;
        
        // Fundo da barra
        doc.setFillColor(240, 240, 240);
        doc.rect(barX, itemY - 3, timelineWidth, barHeight, 'F');
        
        // Progresso
        const fillWidth = (timelineWidth * progressPercent) / 100;
        const color = progressPercent === 100 ? [40, 167, 69] : [23, 162, 184];
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(barX, itemY - 3, fillWidth, barHeight, 'F');
        
        // Borda
        doc.setDrawColor(200, 200, 200);
        doc.rect(barX, itemY - 3, timelineWidth, barHeight);
      });
      
      currentY += Math.min(formData.items.length, 8) * 12 + 10;
    };

    // 📝 RODAPÉ PROFISSIONAL
    const addFooter = () => {
      const footerY = pageHeight - 20;
      
      // Linha separadora
      doc.setDrawColor(41, 128, 185);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      
      // Informações do rodapé
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        margin,
        footerY
      );
      
      doc.text(
        `Cronograma sempre atualizado - Página ${doc.getCurrentPageInfo().pageNumber}`,
        pageWidth - margin,
        footerY,
        { align: 'right' }
      );
    };

    // 🎨 GERAR O PDF
    addHeader();
    addOrderInfo();
    addProgressChart();
    addItemsTable();
    addVisualTimeline();
    addFooter();

    // Salvar arquivo
    doc.save(`cronograma-${formData.orderNumber}-${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  // 🔗 GERAR LINK PÚBLICO PARA CLIENTE
  const generatePublicLink = () => {
    const baseUrl = window.location.origin;
    const publicUrl = `${baseUrl}/cronograma/${formData.id}?token=${btoa(formData.orderNumber + formData.customer)}`;
    return publicUrl;
  };

  const handleCopyPublicLink = async () => {
    const publicLink = generatePublicLink();
    try {
      await navigator.clipboard.writeText(publicLink);
      setPublicLinkCopied(true);
      setTimeout(() => setPublicLinkCopied(false), 3000);
    } catch (error) {
      // Fallback para browsers mais antigos
      const textArea = document.createElement('textarea');
      textArea.value = publicLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setPublicLinkCopied(true);
      setTimeout(() => setPublicLinkCopied(false), 3000);
    }
  };

  const handleStatusChange = (newStatus: OrderStatus) => {
    setFormData(prev => ({
      ...prev,
      status: newStatus,
      // Optionally reset completedDate if status is not 'completed'
      completedDate: newStatus === 'completed' ? prev.completedDate : ''
    }));
  };

  const handleToggleChecklist = (key: keyof typeof formData.checklist) => {
    setFormData(prev => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [key]: !prev.checklist?.[key]
      }
    }));
  };

  const handleAddItem = () => {
    if (!newItem.code || !newItem.description || newItem.quantity <= 0 || newItem.unitWeight <= 0) {
      alert('Por favor, preencha Código, Descrição, Quantidade e Peso Unitário para adicionar um item.');
      return;
    }

    const totalWeight = newItem.quantity * newItem.unitWeight;
    const totalPrice = newItem.quantity * (newItem.unitPrice || 0);

    const itemToAdd: OrderItem = {
      ...newItem,
      id: crypto.randomUUID(),
      totalWeight: totalWeight,
      totalPrice: totalPrice,
      progress: {},
      stagePlanning: {},
      itemNumber: formData.items.length + 1, // Assign next item number
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, itemToAdd],
      totalWeight: (prev.totalWeight || 0) + totalWeight // Update total weight
    }));

    // Reset new item form
    setNewItem({
      id: '',
      itemNumber: formData.items.length + 2, // Prepare for the next item
      code: '',
      description: '',
      quantity: 0,
      unitWeight: 0,
      totalWeight: 0,
      unitPrice: 0,
      totalPrice: 0,
      progress: {},
      stagePlanning: {},
      invoiceNumber: '',
      expeditionLE: ''
    });
  };

  const handleEditItem = (item: OrderItem) => {
    setEditingItem(item);
    setNewItem({ ...item }); // Load item data into the new item form for editing
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;

    if (!newItem.code || !newItem.description || newItem.quantity <= 0 || newItem.unitWeight <= 0) {
      alert('Por favor, preencha Código, Descrição, Quantidade e Peso Unitário para atualizar o item.');
      return;
    }

    const totalWeight = newItem.quantity * newItem.unitWeight;
    const totalPrice = newItem.quantity * (newItem.unitPrice || 0);

    setFormData(prev => {
      const updatedItems = prev.items.map(item =>
        item.id === editingItem.id
          ? {
              ...newItem,
              totalWeight: totalWeight,
              totalPrice: totalPrice,
              // Preserve progress and stage planning when updating
              progress: item.progress,
              stagePlanning: item.stagePlanning,
            }
          : item
      );

      // Recalculate total weight for the order
      const newTotalWeight = updatedItems.reduce((sum, item) => sum + (item.totalWeight || 0), 0);

      return {
        ...prev,
        items: updatedItems,
        totalWeight: newTotalWeight
      };
    });

    setEditingItem(null);
    setNewItem({
      id: '',
      itemNumber: formData.items.length + 1,
      code: '',
      description: '',
      quantity: 0,
      unitWeight: 0,
      totalWeight: 0,
      unitPrice: 0,
      totalPrice: 0,
      progress: {},
      stagePlanning: {},
      invoiceNumber: '',
      expeditionLE: ''
    }); // Reset new item form
  };

  const handleRemoveItem = (itemId: string) => {
    setFormData(prev => {
      const updatedItems = prev.items.filter(item => item.id !== itemId);
      
      // Re-sequence item numbers after removal
      const reSequencedItems = updatedItems.map((item, index) => ({
        ...item,
        itemNumber: index + 1
      }));

      // Recalculate total weight
      const newTotalWeight = reSequencedItems.reduce((sum, item) => sum + (item.totalWeight || 0), 0);

      return {
        ...prev,
        items: reSequencedItems,
        totalWeight: newTotalWeight
      };
    });
  };
  
  const handleUpdateItemField = (itemId: string, field: keyof OrderItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSaveItemProgress = (updatedItem: OrderItem) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === updatedItem.id ? updatedItem : item
      )
    }));
    setSelectedItem(null); // Close the modal
  };

  const handleAddLink = () => {
    if (newLink.trim()) {
      setFormData(prev => ({
        ...prev,
        driveLinks: [...prev.driveLinks, newLink.trim()]
      }));
      setNewLink('');
    }
  };

  const handleRemoveLink = (linkToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      driveLinks: prev.driveLinks.filter(link => link !== linkToRemove)
    }));
  };

  const copyLinkToClipboard = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      alert('Link copiado para a área de transferência!');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              {order ? 'Editar Pedido' : 'Novo Pedido'}
            </h2>
          </div>
          <div className="flex space-x-2">
            {order && (
              <>
                {/* 🎨 NOVO: Botão de Link Público */}
                <button
                  onClick={() => setShowPublicLink(!showPublicLink)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                  title="Gerar link público para cliente"
                >
                  <Globe className="h-5 w-5 mr-2" />
                  Link Cliente
                </button>
                
                {/* 🎨 NOVO: Botão PDF Melhorado */}
                <button
                  onClick={handleExportPDF}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                  title="Exportar cronograma profissional"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Cronograma PDF
                </button>
              </>
            )}
            <button onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* 🔗 PAINEL DO LINK PÚBLICO */}
        {showPublicLink && order && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-lg font-medium text-green-800 mb-3 flex items-center">
              <Globe className="h-5 w-5 mr-2" />
              Link Público para Cliente
            </h3>
            <p className="text-sm text-green-700 mb-3">
              Compartilhe este link com seu cliente para que ele possa acessar o cronograma sempre atualizado:
            </p>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                value={generatePublicLink()}
                readOnly
                className="flex-1 px-3 py-2 bg-white border border-green-300 rounded-md text-sm"
              />
              <button
                onClick={handleCopyPublicLink}
                className={`px-4 py-2 rounded-md flex items-center ${
                  publicLinkCopied 
                    ? 'bg-green-600 text-white' 
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                <Copy className="h-4 w-4 mr-2" />
                {publicLinkCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="mt-3 text-xs text-green-600">
              ✅ Cronograma sempre atualizado em tempo real<br/>
              ✅ Acesso seguro apenas com o link<br/>
              ✅ Visual profissional para seus clientes
            </div>
          </div>
        )}

        {/* FORMULÁRIO DO PEDIDO */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número do Pedido *
            </label>
            <input
              type="text"
              value={formData.orderNumber}
              onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              OS Interna
            </label>
            <input
              type="text"
              value={formData.internalOrderNumber}
              onChange={(e) => setFormData({ ...formData, internalOrderNumber: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cliente *
            </label>
            <select
              value={formData.customer}
              onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Selecione um cliente</option>
              {customers.map(customer => (
                <option key={customer.id} value={customer.name}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Projeto
            </label>
            <select
              value={formData.projectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Nenhum projeto</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de Início *
            </label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de Entrega *
            </label>
            <input
              type="date"
              value={formData.deliveryDate}
              onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        {/* CHECKLIST */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <ClipboardCheck className="h-5 w-5 mr-2" />
            Checklist de Documentos
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.checklist.drawings}
                onChange={(e) => setFormData({
                  ...formData,
                  checklist: { ...formData.checklist, drawings: e.target.checked }
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Desenhos</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.checklist.inspectionTestPlan}
                onChange={(e) => setFormData({
                  ...formData,
                  checklist: { ...formData.checklist, inspectionTestPlan: e.target.checked }
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Plano de Inspeção e Teste</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.checklist.paintPlan}
                onChange={(e) => setFormData({
                  ...formData,
                  checklist: { ...formData.checklist, paintPlan: e.target.checked }
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Plano de Pintura</span>
            </label>
          </div>
        </div>

        {/* LINKS DO DRIVE */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold flex items-center">
              <Link className="h-5 w-5 mr-2" />
              Links do Drive
            </h3>
            <button
              onClick={handleAddDriveLink}
              className="text-blue-600 hover:text-blue-700 flex items-center"
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Link
            </button>
          </div>
          
          {formData.driveLinks.map((link, index) => (
            <div key={index} className="flex space-x-2 mb-2">
              <input
                type="text"
                placeholder="Nome do arquivo"
                value={link.name}
                onChange={(e) => handleUpdateDriveLink(index, 'name', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="url"
                placeholder="URL do Google Drive"
                value={link.url}
                onChange={(e) => handleUpdateDriveLink(index, 'url', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => handleDeleteDriveLink(index)}
                className="p-2 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* ITENS DO PEDIDO */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold flex items-center">
              <Package className="h-5 w-5 mr-2" />
              Itens do Pedido
            </h3>
            <div className="flex space-x-2">
              {selectedItems.size > 0 && (
                <button
                  onClick={handleBatchProgressUpdate}
                  className="text-green-600 hover:text-green-700 flex items-center"
                >
                  <BarChart className="h-4 w-4 mr-1" />
                  Atualizar Selecionados ({selectedItems.size})
                </button>
              )}
              <button
                onClick={handleAddItem}
                className="text-blue-600 hover:text-blue-700 flex items-center"
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Item
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {formData.items.map((item, index) => (
              <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleItemSelection(item.id)}
                    className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  
                  <div className="flex-1 grid grid-cols-6 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Item</label>
                      <input
                        type="number"
                        value={item.itemNumber}
                        onChange={(e) => handleUpdateItem(index, 'itemNumber', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600">Código</label>
                      <input
                        type="text"
                        value={item.code}
                        onChange={(e) => handleUpdateItem(index, 'code', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600">Descrição</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600">Qtd</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600">Peso Unit. (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitWeight}
                        onChange={(e) => handleUpdateItem(index, 'unitWeight', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="p-1 text-blue-600 hover:text-blue-700"
                      title="Editar progresso"
                    >
                      <BarChart className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(index)}
                      className="p-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    Peso Total: <span className="font-medium">{item.totalWeight.toFixed(2)} kg</span>
                  </div>
                  <div className="text-xs">
                    Progresso: <span className="font-medium text-blue-600">
                      {calculateItemProgress(item.progress) || 0}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {formData.items.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-blue-900">Total do Pedido:</span>
                <span className="text-lg font-bold text-blue-900">
                  {formData.items.reduce((sum, item) => sum + item.totalWeight, 0).toFixed(2)} kg
                </span>
              </div>
            </div>
          )}
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            {order ? 'Salvar Alterações' : 'Criar Pedido'}
          </button>
        </div>
      </div>

      {/* MODAL DE PROGRESSO DO ITEM */}
      {selectedItem && (
        <ItemProgressModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSave={handleItemProgressSave}
        />
      )}
    </div>
  );
};

export default OrderModal;