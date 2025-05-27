import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Link, Trash2, Edit, Download, BarChart, FileText, CheckSquare, Square, Briefcase, ClipboardCheck, Globe, Copy } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Order, OrderItem, OrderStatus, ClientProject } from '../types/kanban';
import { Customer } from '../types/customer';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';
import { format, addDays, differenceInDays } from 'date-fns';
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
  const [showPublicLink, setShowPublicLink] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [isItemProgressModalOpen, setIsItemProgressModalOpen] = useState(false);
  
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

  // Calcular o peso total quando os itens mudam
  const totalWeight = useMemo(() => {
    return formData.items.reduce((total, item) => total + (item.totalWeight || (item.unitWeight * item.quantity)), 0);
  }, [formData.items]);

  // Calcular o peso total dos itens selecionados
  const selectedItemsWeight = useMemo(() => {
    return formData.items
      .filter(item => selectedItems.has(item.id))
      .reduce((total, item) => total + (item.totalWeight || (item.unitWeight * item.quantity)), 0);
  }, [formData.items, selectedItems]);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const customersCollection = collection(db, getCompanyCollection('customers'));
        const customersSnapshot = await getDocs(customersCollection);
        const customersList = customersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Customer[];
        setCustomers(customersList);
      } catch (error) {
        console.error("Erro ao buscar clientes:", error);
      }
    };

    fetchCustomers();
  }, []);

  // useEffect para sincronizar formData com order, customers e projects
  useEffect(() => {
    if (order) {
      setFormData({
        id: order.id,
        orderNumber: order.orderNumber,
        startDate: order.startDate,
        deliveryDate: order.deliveryDate,
        internalOrderNumber: order.internalOrderNumber,
        totalWeight: order.totalWeight,
        status: order.status,
        items: order.items,
        driveLinks: order.driveLinks,
        customer: order.customer,
        columnId: order.columnId,
        deleted: order.deleted || false,
        checklist: {
          drawings: typeof order?.checklist?.drawings === 'boolean' ? order.checklist.drawings : false,
          inspectionTestPlan: typeof order?.checklist?.inspectionTestPlan === 'boolean' ? order.checklist.inspectionTestPlan : false,
          paintPlan: typeof order?.checklist?.paintPlan === 'boolean' ? order.checklist.paintPlan : false,
        },
        projectId: order.projectId || '',
        projectName: order.projectName || '',
        completedDate: order.completedDate || '',
        lastExportDate: order.lastExportDate || '',
      });
    }
  }, [order, customers, projects]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (name === "checklist" && type === "checkbox") {
      const checkbox = e.target as HTMLInputElement;
      const checklistItem = checkbox.dataset.checklistItem as string;
      setFormData({
        ...formData,
        checklist: {
          drawings: checklistItem === 'drawings' ? checkbox.checked : !!formData.checklist?.drawings,
          inspectionTestPlan: checklistItem === 'inspectionTestPlan' ? checkbox.checked : !!formData.checklist?.inspectionTestPlan,
          paintPlan: checklistItem === 'paintPlan' ? checkbox.checked : !!formData.checklist?.paintPlan,
        }
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleAddItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      itemNumber: formData.items.length + 1,
      code: '',
      description: '',
      quantity: 1,
      unitWeight: 0,
      totalWeight: 0,
      unitPrice: 0,
      totalPrice: 0,
      progress: {},
    };

    setFormData({
      ...formData,
      items: [...formData.items, newItem]
    });
  };

  const handleRemoveItem = (itemId: string) => {
    setFormData({
      ...formData,
      items: formData.items.filter(item => item.id !== itemId)
    });
    
    // Também remover o item da seleção, se estiver selecionado
    if (selectedItems.has(itemId)) {
      const newSelectedItems = new Set(selectedItems);
      newSelectedItems.delete(itemId);
      setSelectedItems(newSelectedItems);
    }
  };

  const handleItemChange = (itemId: string, field: keyof OrderItem, value: any) => {
    setFormData({
      ...formData,
      items: formData.items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            [field]: value
          };
        }
        return item;
      })
    });
  };

  const handleAddLink = () => {
    setFormData({
      ...formData,
      driveLinks: [...formData.driveLinks, '']
    });
  };

  const handleLinkChange = (index: number, value: string) => {
    const updatedLinks = [...formData.driveLinks];
    updatedLinks[index] = value;
    setFormData({
      ...formData,
      driveLinks: updatedLinks
    });
  };

  const handleRemoveLink = (index: number) => {
    const updatedLinks = formData.driveLinks.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      driveLinks: updatedLinks
    });
  };

  // Função utilitária para garantir formato yyyy-MM-dd
  const toDateInput = (dateStr: string) => {
    if (!dateStr) return '';
    return dateStr.split('T')[0];
  };

  const handleSave = () => {
    // Validação obrigatória das datas
    if (!formData.startDate) {
      alert('Por favor, preencha a data de início.');
      return;
    }
    if (!formData.deliveryDate) {
      alert('Por favor, preencha a data de entrega.');
      return;
    }
    // Calcular menor data de início e maior data de término dos itens/etapas
    let minStart = formData.startDate;
    let maxEnd = formData.deliveryDate;

    formData.items.forEach(item => {
      if (item.stagePlanning) {
        Object.values(item.stagePlanning).forEach((etapa: any) => {
          if (etapa.startDate && (!minStart || etapa.startDate < minStart)) minStart = etapa.startDate;
          if (etapa.endDate && (!maxEnd || etapa.endDate > maxEnd)) maxEnd = etapa.endDate;
        });
      }
    });

    const updatedOrder = {
      ...formData,
      totalWeight,
      overallProgress: formData.overallProgress,
      startDate: toDateInput(minStart),
      deliveryDate: toDateInput(maxEnd)
    } as any;
    onSave(updatedOrder);
    onClose();
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelectedItems = new Set(selectedItems);
    if (selectedItems.has(itemId)) {
      newSelectedItems.delete(itemId);
    } else {
      newSelectedItems.add(itemId);
    }
    setSelectedItems(newSelectedItems);
  };

  const areAllItemsSelected = formData.items.length > 0 && selectedItems.size === formData.items.length;

  const toggleAllItems = () => {
    if (areAllItemsSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(formData.items.map(item => item.id)));
    }
  };

  const openItemProgressModal = (item: OrderItem) => {
    setSelectedItem(item);
    setIsItemProgressModalOpen(true);
  };

  const handleUpdateItemProgress = (updatedItem: OrderItem) => {
    setFormData((prev) => {
      const updatedItems = prev.items.map(item => item.id === updatedItem.id ? { ...item, ...updatedItem } : item);
      // Calcule o progresso geral do pedido (média dos overallProgress dos itens)
      const overallProgress =
        updatedItems.length > 0
          ? Math.round(updatedItems.reduce((sum, item) => sum + (item.overallProgress || 0), 0) / updatedItems.length)
          : 0;
      return {
        ...prev,
        items: updatedItems,
        overallProgress
      };
    });
    setIsItemProgressModalOpen(false);
  };

  // Gerar PDF com romaneio dos itens selecionados
  const generateSelectedItemsPdf = () => {
    if (selectedItems.size === 0) {
      alert('Selecione pelo menos um item para exportar o romaneio.');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;
    
    // Adicionar logo se disponível
    if (companyLogo) {
      try {
        doc.addImage(companyLogo, 'JPEG', 10, 10, 50, 20);
      } catch (error) {
        console.error("Erro ao adicionar logo:", error);
      }
    }
    
    // Cabeçalho do documento
    doc.setFontSize(20);
    doc.text("Romaneio de Entrega", centerX, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Ordem: ${formData.orderNumber}`, 10, 40);
    doc.text(`Cliente: ${customers.find(c => c.id === formData.customer)?.name || formData.customer}`, 10, 50);
    doc.text(`Data de emissão: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 10, 60);
    doc.text(`Data de entrega: ${formData.deliveryDate ? new Date(formData.deliveryDate).toLocaleDateString('pt-BR') : '-'}`, 10, 70);
    
    // Filtrar apenas os itens selecionados
    const selectedItemsList = formData.items.filter(item => selectedItems.has(item.id));
    
    // Tabela de itens selecionados
    const tableColumn = [
      "Item", 
      "Código",
      "Descrição", 
      "Quantidade", 
      "Peso unitário (kg)", 
      "Peso total (kg)"
    ];
    
    const tableRows = selectedItemsList.map(item => [
      item.itemNumber,
      item.code || '-',
      item.description,
      item.quantity.toString(),
      item.unitWeight.toFixed(2),
      (item.totalWeight || (item.unitWeight * item.quantity)).toFixed(2)
    ]);
    
    let finalY = 0;
    
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 70,
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: {
        0: { cellWidth: 30 }, // Número do item
        1: { cellWidth: 40 }, // Código
        2: { cellWidth: 60 }, // Descrição
      },
      styles: { 
        overflow: 'linebreak',
        cellPadding: 3,
        fontSize: 10
      },
      didDrawPage: (data) => {
        finalY = data.cursor ? data.cursor.y : 0;
      }
    });
    
    // Adicionar peso total dos itens selecionados
    doc.text(`Peso total dos itens: ${selectedItemsWeight.toFixed(2)} kg`, 10, finalY + 10);
    
    // Adicionar rodapé com campos para assinaturas
    doc.text('____________________', 40, finalY + 30);
    doc.text('____________________', pageWidth - 40, finalY + 30);
    doc.text('Entregue por', 40, finalY + 35);
    doc.text('Recebido por', pageWidth - 40, finalY + 35);
    
    // Salvar o PDF
    doc.save(`Romaneio_${formData.orderNumber}.pdf`);
  };

  // Gerar PDF com os detalhes da ordem e cronograma
  const generatePdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    // Adicionar logo da empresa se disponível e válida (base64)
    if (companyLogo && typeof companyLogo === 'string' && companyLogo.startsWith('data:image')) {
      try {
        doc.addImage(companyLogo, 'JPEG', 10, 10, 50, 20);
      } catch (error) {
        console.error('Erro ao adicionar logo no PDF:', error);
      }
    } else {
      console.warn('Logo da empresa não disponível ou não está em formato base64.');
    }

    // Título
    doc.setFontSize(24);
    doc.text("Cronograma", centerX, 20, { align: 'center' });

    // Cabeçalho
    doc.setFontSize(12);
    doc.text(`Número: ${formData.orderNumber}`, 10, 40);
    doc.text(`Cliente: ${customers.find(c => c.id === formData.customer)?.name || formData.customer}`, 10, 50);
    doc.text(`Projeto: ${formData.projectName || (projects.find(p => p.id === formData.projectId)?.name || '-')}`, 10, 60);
    doc.text(`Data de início: ${format(new Date(formData.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, 10, 70);
    doc.text(`Data de entrega: ${format(new Date(formData.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, 10, 80);
    doc.text(`Última atualização: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 10, 90);

    // Tabela de itens e etapas
    const tableColumn = [
      "Item",
      "Descrição",
      "Progresso Geral",
      "Entrega Prevista",
      "Etapa",
      "Início",
      "Término",
      "Progresso da Etapa"
    ];

    // Montar linhas: cada linha = uma etapa de um item
    const tableRows: any[] = [];
    formData.items.forEach(item => {
      // Buscar maior data de término das etapas
      let entregaPrevista = '-';
      const etapas = item.stagePlanning ? Object.values(item.stagePlanning) : [];
      if (etapas.length > 0) {
        const datasFim = etapas.map((etapa: any) => etapa.endDate).filter(Boolean);
        if (datasFim.length > 0) {
          const maxDate = datasFim.reduce((max, curr) => (curr > max ? curr : max), datasFim[0]);
          entregaPrevista = format(new Date(maxDate), 'dd/MM/yyyy', { locale: ptBR });
        }
      }
      // Linha de cabeçalho do item com todas as células em negrito
      tableRows.push({
        row: [
          item.itemNumber,
          item.description,
          `${item.overallProgress ? Math.round(item.overallProgress) : 0}%`,
          entregaPrevista,
          '', '', '', ''
        ],
        isItemHeader: true,
        styles: {
          fontStyle: 'bold',
          fillColor: [220, 230, 241],
          textColor: [40, 40, 40]
        }
      });
      
      // Linhas das etapas
      let etapasEntries = item.stagePlanning ? Object.entries(item.stagePlanning) : [];
      // Ordenar por data de início
      etapasEntries = etapasEntries.sort((a, b) => {
        const aDate = a[1].startDate ? new Date(a[1].startDate).getTime() : 0;
        const bDate = b[1].startDate ? new Date(b[1].startDate).getTime() : 0;
        return aDate - bDate;
      });
      etapasEntries.forEach(([etapaNome, etapaDados]) => {
        let etapaProgress = '-';
        if (item.progress && typeof item.progress === 'object' && item.progress[etapaNome] !== undefined) {
          etapaProgress = `${item.progress[etapaNome]}%`;
        }
        tableRows.push({
          row: [
            '', '', '', '',
            etapaNome,
            etapaDados.startDate ? format(new Date(etapaDados.startDate), 'dd/MM/yyyy', { locale: ptBR }) : '-',
            etapaDados.endDate ? format(new Date(etapaDados.endDate), 'dd/MM/yyyy', { locale: ptBR }) : '-',
            etapaProgress
          ],
          isItemHeader: false
        });
      });
    });

    // Variável para armazenar a posição Y final
    let finalY = 0;

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows.map(r => r.row),
      startY: 100,
      headStyles: { fillColor: [41, 128, 185] },
      styles: {
        overflow: 'linebreak',
        cellPadding: 2,
        fontSize: 9
      },
      showHead: 'firstPage',
      didDrawCell: (data) => {
        // Destacar datas que contenham 'HP'
        if ((data.column.index === 5 || data.column.index === 6) && typeof data.cell.raw === 'string' && data.cell.raw.includes('HP')) {
          data.cell.styles.fillColor = [255, 230, 0]; // Amarelo
          data.cell.styles.textColor = [0, 0, 0];
        }
        // Destacar linha de etapa concluída (progresso da etapa = 100%)
        if (data.row && data.row.raw && Array.isArray(data.row.raw)) {
          const progressoEtapa = data.row.raw[7];
          if (typeof progressoEtapa === 'string' && progressoEtapa.replace('%','').trim() === '100') {
            const cells = Object.values(data.row.cells || {}) as any[];
            cells.forEach((cell) => {
              cell.styles.fillColor = [200, 255, 200]; // Verde suave
            });
          }
        }
        // Negrito apenas nas células da linha do item (isItemHeader)
        if (data.row && tableRows[data.row.index] && tableRows[data.row.index].isItemHeader) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [220, 230, 241]; // Azul claro
          data.cell.styles.textColor = [40, 40, 40]; // Texto mais escuro
        }
      },
      didDrawPage: (data) => {
        finalY = data.cursor ? data.cursor.y : 0;
      }
    });

    // Adicionar peso total e data de exportação
    doc.text(`Peso total: ${totalWeight.toFixed(2)} kg`, 10, finalY + 10);
    doc.text(`Data de exportação: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 10, finalY + 20);

    // Salvar o PDF
    doc.save(`Cronograma_${formData.orderNumber}.pdf`);

    // Atualizar a data da última exportação
    setFormData({
      ...formData,
      lastExportDate: new Date().toISOString()
    });
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

  const getCustomerName = (customerId: string): string => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'Cliente não encontrado';
  };

  const calculateProgress = (item: OrderItem): number => {
    return calculateItemProgress(item);
  };

  // Renderização do modal
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold">
            {formData.id === 'new' ? 'Nova Ordem' : `Ordem ${formData.orderNumber}`}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4">
          {/* Informações principais do pedido - destaque no topo */}
          <div className="mb-4 p-3 rounded-lg bg-gray-100 border border-gray-200 flex flex-wrap gap-4 items-center justify-between text-sm">
            <div><span className="font-semibold">Nº Ordem:</span> {formData.orderNumber}</div>
            <div><span className="font-semibold">Nº Interno:</span> {formData.internalOrderNumber}</div>
            <div><span className="font-semibold">Cliente:</span> {(() => {
              const found = customers.find(c => c.id === formData.customer);
              return found ? found.name : formData.customer || '-';
            })()}</div>
            <div><span className="font-semibold">Projeto:</span> {(() => {
              if (formData.projectName) return formData.projectName;
              const found = projects.find(p => p.id === formData.projectId);
              return found ? found.name : 'Sem projeto';
            })()}</div>
            <div><span className="font-semibold">Início:</span> {formData.startDate ? new Date(formData.startDate).toLocaleDateString('pt-BR') : '-'}</div>
            <div><span className="font-semibold">Entrega:</span> {formData.deliveryDate ? new Date(formData.deliveryDate).toLocaleDateString('pt-BR') : '-'}</div>
            <div><span className="font-semibold">Peso Total:</span> {(() => {
              const sum = formData.items.reduce((total, item) => {
                if (typeof item.totalWeight === 'number' && !isNaN(item.totalWeight)) return total + item.totalWeight;
                if (typeof item.unitWeight === 'number' && typeof item.quantity === 'number') return total + (item.unitWeight * item.quantity);
                return total;
              }, 0);
              return sum > 0 ? sum.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' kg' : '-';
            })()}</div>
          </div>
          {/* Bloco: Dados do Pedido */}
          <div className="mb-4 p-4 rounded-lg bg-gray-50 border border-gray-200 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block mb-1 text-xs font-medium">Número da Ordem</label>
                <input type="text" name="orderNumber" value={formData.orderNumber} onChange={handleChange} className="w-full px-2 py-1 border rounded-md text-sm" />
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium">Número Interno</label>
                <input type="text" name="internalOrderNumber" value={formData.internalOrderNumber} onChange={handleChange} className="w-full px-2 py-1 border rounded-md text-sm" />
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium">Status</label>
                <select name="status" value={formData.status} onChange={handleChange} className="w-full px-2 py-1 border rounded-md text-sm">
                  <option value="pending">Pendente</option>
                  <option value="in-progress">Em Andamento</option>
                  <option value="completed">Concluído</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium">Data de Início</label>
                <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} className="w-full px-2 py-1 border rounded-md text-sm" />
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium">Data de Entrega</label>
                <input type="date" name="deliveryDate" value={formData.deliveryDate} onChange={handleChange} className="w-full px-2 py-1 border rounded-md text-sm" />
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium">Cliente</label>
                <select name="customer" value={formData.customer} onChange={handleChange} className="w-full px-2 py-1 border rounded-md text-sm">
                  <option value="">Selecione um cliente</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 text-xs font-medium">Projeto</label>
                <select name="projectId" value={formData.projectId} onChange={handleChange} className="w-full px-2 py-1 border rounded-md text-sm">
                  <option value="">Sem projeto</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Checklist em linha */}
            <div className="flex flex-wrap gap-4 items-center mt-4">
              <div className="flex items-center">
                <input type="checkbox" data-checklist-item="drawings" name="checklist" checked={formData.checklist?.drawings || false} onChange={handleChange} className="mr-1" />
                <label className="text-xs">Desenhos</label>
              </div>
              <div className="flex items-center">
                <input type="checkbox" data-checklist-item="inspectionTestPlan" name="checklist" checked={formData.checklist?.inspectionTestPlan || false} onChange={handleChange} className="mr-1" />
                <label className="text-xs">Plano de Inspeção</label>
              </div>
              <div className="flex items-center">
                <input type="checkbox" data-checklist-item="paintPlan" name="checklist" checked={formData.checklist?.paintPlan || false} onChange={handleChange} className="mr-1" />
                <label className="text-xs">Plano de Pintura</label>
              </div>
            </div>
          </div>
          <hr className="my-4" />
          {/* Bloco: Links Google Drive */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-base font-medium">Links Google Drive</h3>
              <button onClick={handleAddLink} className="px-2 py-1 bg-blue-500 text-white rounded-md flex items-center text-xs"><Plus size={14} className="mr-1" /> Adicionar Link</button>
            </div>
            {formData.driveLinks.map((link, index) => (
              <div key={index} className="flex items-center mb-2 gap-2">
                <input
                  type="text"
                  value={link}
                  onChange={(e) => handleLinkChange(index, e.target.value)}
                  className="flex-1 px-2 py-1 border rounded-md mr-2 text-xs"
                  placeholder="https://drive.google.com/..."
                />
                {link && link.startsWith('http') && (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-xs mr-2">Abrir</a>
                )}
                <button onClick={() => handleRemoveLink(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-md">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <hr className="my-4" />
          {/* Bloco: Itens */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-base font-medium">Itens</h3>
              <div className="flex gap-2">
                <button
                  onClick={toggleAllItems}
                  className="px-2 py-1 bg-gray-200 text-gray-800 rounded-md text-xs border border-gray-300 hover:bg-gray-300"
                >
                  {areAllItemsSelected ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
                <button onClick={handleAddItem} className="px-2 py-1 bg-blue-500 text-white rounded-md flex items-center text-xs"><Plus size={14} className="mr-1" /> Adicionar Item</button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px] border rounded-lg shadow-inner bg-white text-xs sm:text-sm">
              <table className="min-w-full border">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-1 py-2 border whitespace-nowrap min-w-[40px] w-[40px] text-center">Nº Item</th>
                    <th className="px-2 py-2 border whitespace-nowrap min-w-[110px] w-[130px]">Código</th>
                    <th className="px-2 py-2 border min-w-[180px] w-[300px] whitespace-normal break-words">Descrição</th>
                    <th className="px-2 py-2 border min-w-[35px] w-[45px] text-center">Qtd</th>
                    <th className="px-2 py-2 border min-w-[80px] w-[100px] text-center">Peso Unit. (kg)</th>
                    <th className="px-2 py-2 border min-w-[90px] w-[110px] text-center">Peso Total (kg)</th>
                    <th className="px-2 py-2 border min-w-[110px] w-[130px] text-center">Progresso</th>
                    <th className="px-2 py-2 border min-w-[70px] w-[80px] text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-2 py-2 border min-w-[90px]">
                          <div className="flex items-center">
                            <div onClick={() => toggleItemSelection(item.id)} className="cursor-pointer mr-2">
                              {selectedItems.has(item.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                            </div>
                            <input
                              type="text"
                              value={item.itemNumber || ''}
                              onChange={(e) => handleItemChange(item.id, 'itemNumber', e.target.value)}
                              className="w-full border-none focus:ring-0 text-xs sm:text-sm"
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2 border min-w-[110px] w-[130px] whitespace-nowrap">
                          <input
                            type="text"
                            value={item.code || ''}
                            onChange={(e) => handleItemChange(item.id, 'code', e.target.value)}
                            className="w-full border-none focus:ring-0 text-xs sm:text-sm"
                          />
                        </td>
                        <td className="px-2 py-2 border min-w-[180px] w-[300px] whitespace-normal break-words">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            className="w-full border-none focus:ring-0 text-xs sm:text-sm"
                          />
                        </td>
                        <td className="px-2 py-2 border min-w-[35px] w-[45px] text-center">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                            className="w-14 border-none focus:ring-0 text-xs sm:text-sm"
                            min="1"
                          />
                        </td>
                        <td className="px-2 py-2 border min-w-[80px] w-[100px] text-center">
                          <input
                            type="number"
                            value={item.unitWeight || ''}
                            onChange={(e) => handleItemChange(item.id, 'unitWeight', Number(e.target.value))}
                            className="w-16 border-none focus:ring-0 text-xs sm:text-sm"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-2 py-2 border min-w-[90px] w-[110px] text-center">
                          {item.totalWeight ? item.totalWeight.toFixed(2) : (item.unitWeight * item.quantity).toFixed(2)}
                        </td>
                        <td className="px-2 py-2 border min-w-[110px] w-[130px] text-center">
                          <div className="flex items-center">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                              <div 
                                className="bg-blue-600 h-2.5 rounded-full" 
                                style={{ width: `${item.overallProgress || 0}%` }}
                              ></div>
                            </div>
                            <span className="text-xs">{item.overallProgress ? Math.round(item.overallProgress) : 0}%</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 border min-w-[70px] w-[80px] text-center">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openItemProgressModal(item)}
                              className="p-1 text-blue-500 hover:bg-blue-100 rounded"
                              title="Atualizar Progresso"
                            >
                              <BarChart size={16} />
                            </button>
                            <button
                              onClick={() => alert('Editar item: ' + item.id)}
                              className="p-1 text-yellow-600 hover:bg-yellow-100 rounded"
                              title="Editar Item"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 text-red-500 hover:bg-red-100 rounded"
                              title="Remover Item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {item.progress && item.progress['Expedição'] === 100 && (
                        <tr className="bg-green-50">
                          <td colSpan={8} className="p-2">
                            <div className="flex flex-wrap gap-4 items-center">
                              <div>
                                <label className="block text-xs font-medium mb-1">LE (Lista de Embarque)</label>
                                <input
                                  type="text"
                                  value={item.expeditionLE || ''}
                                  onChange={e => handleItemChange(item.id, 'expeditionLE', e.target.value)}
                                  className="px-2 py-1 border rounded-md text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">NF (Nota Fiscal)</label>
                                <input
                                  type="text"
                                  value={item.invoiceNumber || ''}
                                  onChange={e => handleItemChange(item.id, 'invoiceNumber', e.target.value)}
                                  className="px-2 py-1 border rounded-md text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium mb-1">Data de Entrega</label>
                                <input
                                  type="date"
                                  value={item.expeditionDate || ''}
                                  onChange={e => handleItemChange(item.id, 'expeditionDate', e.target.value)}
                                  className="px-2 py-1 border rounded-md text-xs"
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 sticky bottom-0">
                    <td colSpan={4} className="px-2 sm:px-4 py-2 text-right font-semibold">
                      Peso Total:
                    </td>
                    <td className="px-2 sm:px-4 py-2 font-semibold">
                      {(() => {
                        const sum = formData.items.reduce((total, item) => {
                          if (typeof item.totalWeight === 'number' && !isNaN(item.totalWeight)) return total + item.totalWeight;
                          if (typeof item.unitWeight === 'number' && typeof item.quantity === 'number') return total + (item.unitWeight * item.quantity);
                          return total;
                        }, 0);
                        return sum > 0 ? sum.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' kg' : '-';
                      })()}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {selectedItems.size > 0 && (
              <div className="mt-2 text-right text-sm text-gray-600">
                {selectedItems.size} {selectedItems.size === 1 ? 'item selecionado' : 'itens selecionados'} 
                ({selectedItemsWeight.toFixed(2)} kg)
              </div>
            )}
          </div>
          
          {/* Barra de ferramentas e botões de link público */}
          <div className="mt-6 flex flex-wrap justify-between items-center">
            <div className="flex space-x-2 mb-2 md:mb-0">
              <button
                onClick={generatePdf}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md flex items-center text-sm"
                title="Exportar Cronograma (PDF)"
              >
                <Download size={18} className="mr-1" /> Exportar Cronograma
              </button>
              <button
                onClick={generateSelectedItemsPdf}
                disabled={selectedItems.size === 0}
                className={`px-3 py-2 ${selectedItems.size === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-md flex items-center text-sm`}
                title="Exportar Romaneio dos Itens Selecionados"
              >
                <FileText size={18} className="mr-1" /> Exportar Selecionados {selectedItems.size > 0 && `(${selectedItems.size})`}
              </button>
              <button
                onClick={() => setShowPublicLink(!showPublicLink)}
                className="px-3 py-2 bg-green-600 text-white rounded-md flex items-center text-sm"
                title="Compartilhar"
              >
                <Globe size={18} className="mr-1" /> Compartilhar
              </button>
            </div>
            
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md"
            >
              Salvar
            </button>
          </div>
          
          {/* Modal de link público */}
          {showPublicLink && (
            <div className="mt-4 p-4 border rounded-md bg-gray-50">
              <h4 className="font-medium mb-2 flex items-center">
                <Link size={18} className="mr-2" /> Link Público para Cliente
              </h4>
              <div className="flex">
                <input
                  type="text"
                  value={generatePublicLink()}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded-l-md bg-white"
                />
                <button
                  onClick={handleCopyPublicLink}
                  className="px-3 py-2 bg-blue-600 text-white rounded-r-md"
                >
                  <Copy size={18} />
                </button>
              </div>
              {publicLinkCopied && (
                <p className="mt-2 text-sm text-green-600">Link copiado para a área de transferência!</p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Este link permite que seu cliente acompanhe o progresso da ordem sem precisar de login.
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal de progresso do item */}
      {isItemProgressModalOpen && selectedItem && (
        <ItemProgressModal
          item={selectedItem}
          allItems={formData.items}
          onClose={() => setIsItemProgressModalOpen(false)}
          onSave={handleUpdateItemProgress}
        />
      )}
    </div>
  );
};

export default OrderModal;