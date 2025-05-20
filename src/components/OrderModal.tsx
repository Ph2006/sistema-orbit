import React, { useState, useEffect } from 'react';
import { X, Plus, Link, Trash2, Edit, Download, BarChart, FileText, CheckSquare, Square, Briefcase, ClipboardCheck } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, OrderItem, OrderStatus, ClientProject } from '../types/kanban';
import { Customer } from '../types/customer';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import ItemProgressModal from './ItemProgressModal';
import { calculateItemProgress } from '../utils/progress';

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

  const [newItem, setNewItem] = useState<OrderItem>({
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
  });

  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [newLink, setNewLink] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (order) {
      // Ensure the checklist exists and has all properties
      const checklist = order.checklist || {
        drawings: false,
        inspectionTestPlan: false,
        paintPlan: false
      };
      
      setFormData({
        ...order,
        startDate: order.startDate.split('T')[0],
        deliveryDate: order.deliveryDate.split('T')[0],
        completedDate: order.completedDate ? order.completedDate.split('T')[0] : '',
        items: JSON.parse(JSON.stringify(order.items)),
        driveLinks: [...order.driveLinks],
        checklist: {
          drawings: !!checklist.drawings,
          inspectionTestPlan: !!checklist.inspectionTestPlan,
          paintPlan: !!checklist.paintPlan
        },
        projectId: order.projectId || '',
        projectName: order.projectName || ''
      });
    }
  }, [order]);

  const loadCustomers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'customers'));
      const customersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customersData);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const calculateTotals = (item: OrderItem) => {
    const totalWeight = Number((item.quantity * item.unitWeight).toFixed(2));
    const totalPrice = Number((item.quantity * item.unitPrice).toFixed(2));
    return { totalWeight, totalPrice };
  };

  const handleAddItem = () => {
    if (!newItem.code || !newItem.description || newItem.quantity <= 0 || newItem.unitWeight <= 0) {
      alert('Por favor, preencha todos os campos obrigatórios do item.');
      return;
    }
    
    const { totalWeight, totalPrice } = calculateTotals(newItem);

    const item = {
      ...newItem,
      id: crypto.randomUUID(),
      totalWeight,
      totalPrice,
    };

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, item],
      totalWeight: Number((prev.totalWeight + totalWeight).toFixed(2)),
    }));

    setNewItem({
      id: '',
      itemNumber: formData.items.length + 2,
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
    setNewItem({...item});
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;
    
    if (!newItem.code || !newItem.description || newItem.quantity <= 0 || newItem.unitWeight <= 0) {
      alert('Por favor, preencha todos os campos obrigatórios do item.');
      return;
    }

    const { totalWeight: newTotalWeight, totalPrice } = calculateTotals(newItem);
    const oldTotalWeight = editingItem.totalWeight;

    setFormData(prev => {
      const updatedItems = prev.items.map(item =>
        item.id === editingItem.id ? { 
          ...newItem,
          totalWeight: newTotalWeight, 
          totalPrice 
        } : item
      );

      return {
        ...prev,
        items: updatedItems,
        totalWeight: Number((prev.totalWeight - oldTotalWeight + newTotalWeight).toFixed(2)),
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
    });
  };

  const handleRemoveItem = (itemId: string) => {
    const item = formData.items.find(i => i.id === itemId);
    if (!item) return;

    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== itemId),
      totalWeight: Number((prev.totalWeight - item.totalWeight).toFixed(2)),
    }));

    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, index) => ({
        ...item,
        itemNumber: index + 1
      }))
    }));

    // Remove from selected items if it was selected
    if (selectedItems.has(itemId)) {
      const newSelectedItems = new Set(selectedItems);
      newSelectedItems.delete(itemId);
      setSelectedItems(newSelectedItems);
    }
  };

  const handleAddLink = () => {
    if (newLink) {
      setFormData(prev => ({
        ...prev,
        driveLinks: [...prev.driveLinks, newLink],
      }));
      setNewLink('');
    }
  };

  const handleRemoveLink = (link: string) => {
    setFormData(prev => ({
      ...prev,
      driveLinks: prev.driveLinks.filter(l => l !== link),
    }));
  };

  const handleToggleChecklist = (item: 'drawings' | 'inspectionTestPlan' | 'paintPlan') => {
    console.log('Toggling checklist item:', item);
    
    setFormData(prev => {
      const checklist = prev.checklist || {
        drawings: false,
        inspectionTestPlan: false,
        paintPlan: false
      };

      const newChecklist = {
        drawings: !!checklist.drawings,
        inspectionTestPlan: !!checklist.inspectionTestPlan,
        paintPlan: !!checklist.paintPlan
      };

      newChecklist[item] = !newChecklist[item];
      
      console.log('Updated checklist:', newChecklist);

      return {
        ...prev,
        checklist: newChecklist
      };
    });
  };

  const handleStatusChange = (newStatus: OrderStatus) => {
    setFormData(prev => {
      // If changing to "completed", set the completedDate to today
      // unless it's already set
      let completedDate = prev.completedDate;
      
      if (newStatus === 'completed' && !completedDate) {
        completedDate = new Date().toISOString().split('T')[0];
      } else if (newStatus !== 'completed') {
        // If changing from completed to something else, clear the completed date
        completedDate = '';
      }
      
      return {
        ...prev,
        status: newStatus,
        completedDate
      };
    });
  };

  const safeISODate = (dateStr: string): string => {
    try {
      if (!dateStr || dateStr.trim() === '') {
        return new Date().toISOString();
      }
      
      const date = new Date(`${dateStr}T00:00:00`);
      
      if (isNaN(date.getTime())) {
        console.error("Invalid date:", dateStr);
        return new Date().toISOString();
      }
      
      return date.toISOString();
    } catch (error) {
      console.error("Error parsing date:", dateStr, error);
      return new Date().toISOString();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.orderNumber || !formData.customer || !formData.internalOrderNumber || 
        !formData.startDate || !formData.deliveryDate) {
      alert('Por favor, preencha todos os campos obrigatórios do pedido.');
      return;
    }
    
    if (formData.items.length === 0) {
      alert('Por favor, adicione pelo menos um item ao pedido.');
      return;
    }
    
    try {
      // Ensure all dates are proper ISO strings
      const formattedData = {
        ...formData,
        startDate: safeISODate(formData.startDate),
        deliveryDate: safeISODate(formData.deliveryDate),
        completedDate: formData.completedDate ? safeISODate(formData.completedDate) : '',
        deleted: false,
        // Make sure checklist is always fully defined
        checklist: {
          drawings: !!formData.checklist?.drawings,
          inspectionTestPlan: !!formData.checklist?.inspectionTestPlan,
          paintPlan: !!formData.checklist?.paintPlan
        }
      };
      
      console.log("Submitting order:", formattedData);
      onSave(formattedData);
    } catch (error) {
      console.error("Error formatting date:", error);
      alert("Erro ao processar as datas do pedido. Por favor, verifique os valores informados.");
    }
  };

  const handleSaveItemProgress = (updatedItem: OrderItem) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      )
    }));
    setSelectedItem(null);
  };

  // Update item field
  const handleUpdateItemField = (itemId: string, field: keyof OrderItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Set document properties for A4 page
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
    doc.text(`Pedido #${formData.orderNumber}`, margin + 5, y + 8);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Cliente: ${formData.customer}`, margin + 5, y + 16);
    doc.text(`OS: ${formData.internalOrderNumber}`, margin + 5, y + 24);
    doc.text(`Início: ${format(new Date(formData.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 5, y + 32);
    doc.text(`Entrega: ${format(new Date(formData.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 80, y + 32);
    
    y += 40;

    // Process items
    formData.items.forEach(item => {
      // Add a new page if we're running out of space
      if (y > pageHeight - 60) {
        doc.addPage();
        y = margin;
      }

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

      // Add some space before the next item
      y += 20;
    });

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
    
    doc.save(`relatorio-${formData.orderNumber}-item${formData.items.length}.pdf`);
  };

  // New function for exporting selected items as a simple list
  const handleExportItemsListPDF = () => {
    if (selectedItems.size === 0) {
      alert('Por favor, selecione pelo menos um item para exportar.');
      return;
    }

    const doc = new jsPDF();
    
    // Add logo if available
    let y = 20;
    if (companyLogo) {
      // Logo in the top-left corner
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      y = 40;
    }
    
    // Title below the logo
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(`Lista de Itens Selecionados`, 105, y, { align: 'center' });
    y += 15;
    
    // Get selected items
    const selectedOrderObjects = formData.items.filter(item => selectedItems.has(item.id));
    
    // Add a summary line
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    if (selectedOrderObjects.length === 1) {
      const item = selectedOrderObjects[0];
      doc.text(`Pedido #${formData.orderNumber} - ${formData.customer}`, 20, y);
      y += 8;
      doc.text(`OS Interna: ${formData.internalOrderNumber}`, 20, y);
      y += 8;
      if (formData.projectName) {
        doc.text(`Projeto: ${formData.projectName}`, 20, y);
        y += 8;
      }
    } else {
      doc.text(`${selectedOrderObjects.length} itens selecionados`, 20, y);
      y += 8;
    }

    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 20, y);
    y += 15;
    
    // Create a simple table with all items from selected orders
    const allItems = selectedOrderObjects;
    
    // Calculate total weight
    const totalWeight = allItems.reduce((sum, item) => sum + item.totalWeight, 0);
    
    // Create the table
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Código', 'Descrição', 'Qtd', 'Peso (kg)']],
      body: allItems.map(item => [
        item.itemNumber.toString(),
        item.code,
        item.description,
        item.quantity.toString(),
        item.totalWeight.toLocaleString('pt-BR')
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      foot: [['', '', '', 'Peso Total:', totalWeight.toLocaleString('pt-BR') + ' kg']],
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      }
    });
    
    // Add pagination
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${totalPages}`,
        105, 
        287, 
        { align: 'center' }
      );
    }
    
    // Record last export date for sorting
    setFormData(prev => ({
      ...prev,
      lastExportDate: new Date().toISOString()
    }));
    
    doc.save(`lista-itens-selecionados.pdf`);
  };

  // Check if an item is fully completed
  const isItemCompleted = (item: OrderItem): boolean => {
    if (!item.progress || Object.keys(item.progress).length === 0) return false;
    return Object.values(item.progress).every(progress => progress === 100);
  };

  // Sort stages by execution order (planning dates)
  const sortStagesByExecutionOrder = (stages: Record<string, any> = {}, stagePlanning: Record<string, any> = {}) => {
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

  const handleToggleSelectItem = (itemId: string) => {
    const newSelectedItems = new Set(selectedItems);
    if (newSelectedItems.has(itemId)) {
      newSelectedItems.delete(itemId);
    } else {
      newSelectedItems.add(itemId);
    }
    setSelectedItems(newSelectedItems);
  };

  const handleSelectAllItems = () => {
    if (selectedItems.size === formData.items.length) {
      // Deselect all
      setSelectedItems(new Set());
    } else {
      // Select all
      setSelectedItems(new Set(formData.items.map(item => item.id)));
    }
  };

  const handleExportSelectedItems = () => {
    if (selectedItems.size === 0) {
      alert('Por favor, selecione pelo menos um item para exportar.');
      return;
    }
    handleExportItemsListPDF();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              {order ? 'Editar Pedido' : 'Novo Pedido'}
            </h2>
          </div>
          <div className="flex space-x-4">
            {order && (
              <button
                onClick={handleExportPDF}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <Download className="h-5 w-5 mr-2 inline-block" />
                Exportar PDF
              </button>
            )}
            <button onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Número do Pedido</label>
              <input type="text" value={formData.orderNumber} onChange={e => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Cliente</label>
              <select value={formData.customer} onChange={e => setFormData(prev => ({ ...prev, customer: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" required>
                <option value="">Selecione um cliente</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.name}>{customer.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">OS Interna</label>
              <input type="text" value={formData.internalOrderNumber} onChange={e => setFormData(prev => ({ ...prev, internalOrderNumber: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Projeto do Cliente</label>
            <input 
              type="text"
              value={formData.projectName || ''}
              onChange={e => setFormData(prev => ({ 
                ...prev, 
                projectName: e.target.value,
                projectId: e.target.value ? (prev.projectId || crypto.randomUUID()) : ''
              }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              placeholder="Nome do projeto"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Data de Início</label>
              <input type="date" value={formData.startDate.split('T')[0]} onChange={e => setFormData(prev => ({ ...prev, startDate: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Data de Entrega</label>
              <input type="date" value={formData.deliveryDate.split('T')[0]} onChange={e => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Data de Conclusão</label>
              <input 
                type="date"
                value={formData.completedDate ? formData.completedDate.split('T')[0] : ''}
                onChange={e => setFormData(prev => ({ ...prev, completedDate: e.target.value }))}
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 ${formData.status === 'completed' ? 'border-green-500' : ''}`}
              />
              {formData.status === 'completed' && !formData.completedDate && (
                <p className="mt-1 text-sm text-orange-600">Recomendado definir a data de conclusão para pedidos marcados como concluídos.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select 
                value={formData.status} 
                onChange={e => handleStatusChange(e.target.value as OrderStatus)} 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                required
              >
                <option value="in-progress">Em Processo</option>
                <option value="delayed">Atrasado</option>
                <option value="waiting-docs">Aguardando Validação de Documentação</option>
                <option value="completed">Documentação Validada</option>
                <option value="ready">Aguardando Embarque</option>
                <option value="urgent">Pedido Urgente</option>
              </select>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <ClipboardCheck className="h-5 w-5 mr-2 text-blue-600" />
              Checklist do Pedido
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div 
                className="flex items-center p-3 bg-white rounded-lg border cursor-pointer hover:bg-blue-50"
                onClick={() => handleToggleChecklist('drawings')}
              >
                {formData.checklist?.drawings ? (
                  <CheckSquare className="h-6 w-6 mr-3 text-blue-600" />
                ) : (
                  <Square className="h-6 w-6 mr-3 text-gray-400" />
                )}
                <div>
                  <div className="font-medium">Desenhos</div>
                  <div className="text-sm text-gray-500">Desenhos técnicos do pedido</div>
                </div>
              </div>
              
              <div 
                className="flex items-center p-3 bg-white rounded-lg border cursor-pointer hover:bg-blue-50"
                onClick={() => handleToggleChecklist('inspectionTestPlan')}
              >
                {formData.checklist?.inspectionTestPlan ? (
                  <CheckSquare className="h-6 w-6 mr-3 text-blue-600" />
                ) : (
                  <Square className="h-6 w-6 mr-3 text-gray-400" />
                )}
                <div>
                  <div className="font-medium">PIT</div>
                  <div className="text-sm text-gray-500">Plano de inspeção e testes</div>
                </div>
              </div>
              
              <div 
                className="flex items-center p-3 bg-white rounded-lg border cursor-pointer hover:bg-blue-50"
                onClick={() => handleToggleChecklist('paintPlan')}
              >
                {formData.checklist?.paintPlan ? (
                  <CheckSquare className="h-6 w-6 mr-3 text-blue-600" />
                ) : (
                  <Square className="h-6 w-6 mr-3 text-gray-400" />
                )}
                <div>
                  <div className="font-medium">Plano de Pintura</div>
                  <div className="text-sm text-gray-500">Especificações de pintura</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Itens do Pedido</h3>
              <div className="flex space-x-3">
                <button 
                  type="button" 
                  onClick={handleSelectAllItems} 
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  {selectedItems.size === formData.items.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </button>
                <button 
                  type="button" 
                  onClick={handleExportSelectedItems} 
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  disabled={selectedItems.size === 0}
                >
                  <Download className="h-4 w-4 mr-1 inline-block" />
                  Exportar Selecionados
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              {formData.items.map(item => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center space-x-2 bg-gray-50 p-4 rounded-lg">
                    <input 
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => handleToggleSelectItem(item.id)}
                      className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="w-8 text-center">{item.itemNumber}</div>
                    <div className="w-40 truncate">{item.code}</div>
                    <div className="flex-1 truncate">{item.description}</div>
                    <div className="w-20 text-right">{item.quantity}</div>
                    <div className="w-32 text-right">{item.totalWeight.toLocaleString('pt-BR')} kg</div>
                    <div className="flex space-x-2">
                      <button type="button" onClick={() => setSelectedItem(item)} className="text-blue-600 hover:text-blue-800" title="Atualizar Progresso">
                        <BarChart className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => handleEditItem(item)} className="text-blue-600 hover:text-blue-800">
                        <Edit className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => handleRemoveItem(item.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Only show invoice/LE fields for 100% completed items - with green styling */}
                  {isItemCompleted(item) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-3 bg-green-50 rounded-lg border border-green-200">
                      <div>
                        <label className="block text-sm font-medium text-green-800 mb-1">Nota Fiscal do Item</label>
                        <input 
                          type="text"
                          value={item.invoiceNumber || ''}
                          onChange={e => handleUpdateItemField(item.id, 'invoiceNumber', e.target.value)}
                          className="mt-1 block w-full rounded-md border-green-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200"
                          placeholder="Número da NF específica do item"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-green-800 mb-1">LE do Item</label>
                        <input 
                          type="text"
                          value={item.expeditionLE || ''}
                          onChange={e => handleUpdateItemField(item.id, 'expeditionLE', e.target.value)}
                          className="mt-1 block w-full rounded-md border-green-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200"
                          placeholder="Número da LE específica do item"
                        />
                      </div>
                    </div>
                  )}

                  <div className="px-4">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700">Progresso</span>
                      <span className="text-gray-700">{calculateItemProgress(item.progress)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
                      <div className={`h-full transition-all ${
                        item.progress && calculateItemProgress(item.progress) === 100
                          ? 'bg-green-500'
                          : item.progress && calculateItemProgress(item.progress) >= 70
                          ? 'bg-blue-500'
                          : item.progress && calculateItemProgress(item.progress) >= 30
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`} style={{ width: `${calculateItemProgress(item.progress)}%` }} />
                    </div>
                  </div>
                  
                  {item.stagePlanning && Object.keys(item.stagePlanning).length > 0 && (
                    <div className="px-4 mt-2">
                      <div 
                        className="text-xs text-blue-600 cursor-pointer hover:underline" 
                        onClick={() => setSelectedItem(item)}
                      >
                        Ver planejamento de etapas ({Object.keys(item.stagePlanning).length} etapas)
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Make the item creation form separate and don't include it in the main form validation */}
              <div className="border-t pt-4 mt-4">
                <div className="text-sm text-gray-600 mb-3">Adicionar novo item (opcional):</div>
                <div className="grid grid-cols-9 gap-2">
                  <input 
                    type="number" 
                    placeholder="Nº" 
                    value={newItem.itemNumber || ''} 
                    onChange={e => setNewItem(prev => ({ 
                      ...prev, 
                      itemNumber: e.target.value ? parseInt(e.target.value) : 0 
                    }))} 
                    className="w-16 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                    min="1" 
                    step="1" 
                  />
                  <input 
                    type="text" 
                    placeholder="Código" 
                    value={newItem.code} 
                    onChange={e => setNewItem(prev => ({ ...prev, code: e.target.value }))} 
                    className="col-span-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  />
                  <input 
                    type="text" 
                    placeholder="Descrição" 
                    value={newItem.description} 
                    onChange={e => setNewItem(prev => ({ ...prev, description: e.target.value }))} 
                    className="col-span-2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                  />
                  <input 
                    type="number" 
                    placeholder="Qtd" 
                    value={newItem.quantity || ''} 
                    onChange={e => setNewItem(prev => ({ 
                      ...prev, 
                      quantity: e.target.value ? Number(e.target.value) : 0 
                    }))} 
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                  />
                  <input 
                    type="number" 
                    placeholder="Peso Unit" 
                    value={newItem.unitWeight || ''} 
                    onChange={e => setNewItem(prev => ({ 
                      ...prev, 
                      unitWeight: e.target.value ? Number(e.target.value) : 0 
                    }))} 
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                  />
                  <input 
                    type="number" 
                    placeholder="R$ Unit" 
                    value={newItem.unitPrice || ''} 
                    onChange={e => setNewItem(prev => ({ 
                      ...prev, 
                      unitPrice: e.target.value ? Number(e.target.value) : 0 
                    }))} 
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                  />
                  <div className="flex space-x-1">
                    <button 
                      type="button" 
                      onClick={editingItem ? handleUpdateItem : handleAddItem} 
                      className="flex-shrink-0 flex items-center justify-center bg-blue-600 text-white rounded-md hover:bg-blue-700 px-2 w-full"
                    >
                      {editingItem ? 'Atualizar' : <Plus className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                {editingItem && (
                  <div className="mt-2 text-sm text-blue-600">
                    Editando o item {editingItem.itemNumber}: {editingItem.code}
                  </div>
                )}

                {editingItem && isItemCompleted(editingItem) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div>
                      <label className="block text-sm font-medium text-green-800 mb-1">Nota Fiscal do Item</label>
                      <input 
                        type="text"
                        value={newItem.invoiceNumber || ''}
                        onChange={e => setNewItem(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                        className="mt-1 block w-full rounded-md border-green-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200"
                        placeholder="Número da NF específica do item"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-green-800 mb-1">LE do Item</label>
                      <input 
                        type="text"
                        value={newItem.expeditionLE || ''}
                        onChange={e => setNewItem(prev => ({ ...prev, expeditionLE: e.target.value }))}
                        className="mt-1 block w-full rounded-md border-green-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200"
                        placeholder="Número da LE específica do item"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-4">Links do Google Drive</h3>
            <div className="space-y-4">
              {formData.driveLinks.map((link, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <Link className="h-5 w-5 text-blue-600" />
                  <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                    {link}
                  </a>
                  <button type="button" onClick={() => handleRemoveLink(link)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}
              <div className="flex space-x-2">
                <input type="text" value={newLink} onChange={e => setNewLink(e.target.value)} placeholder="Cole o link do Google Drive aqui" className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" />
                <button type="button" onClick={handleAddLink} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">
              Cancelar
            </button>
            <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Salvar
            </button>
          </div>
        </form>
      </div>

      {selectedItem && (
        <ItemProgressModal
          item={selectedItem}
          allItems={formData.items}
          onClose={() => setSelectedItem(null)}
          onSave={handleSaveItemProgress}
        />
      )}
    </div>
  );
};

export default OrderModal;