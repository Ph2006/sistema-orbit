import React, { useState, useEffect } from 'react';
import { X, Plus, Link, Trash2, Edit, Download, BarChart, FileText, CheckSquare, Square, Briefcase, ClipboardCheck, Copy, ExternalLink, Share } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db, getCompanyCollection } from '../lib/firebase';
import { Order, OrderItem, OrderStatus, ClientProject } from '../types/kanban';
import { Customer } from '../types/customer';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
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
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkExpiration, setLinkExpiration] = useState(30); // days
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
    clientAccessLinks: order?.clientAccessLinks || []
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
        items: order.items || [],
        driveLinks: [...order.driveLinks],
        checklist: {
          drawings: !!checklist.drawings,
          inspectionTestPlan: !!checklist.inspectionTestPlan,
          paintPlan: !!checklist.paintPlan
        },
        projectId: order.projectId || '',
        projectName: order.projectName || '',
        clientAccessLinks: order.clientAccessLinks || []
      });
      
      setNewItem(prev => ({
        ...prev,
        itemNumber: (order.items?.length || 0) + 1,
      }));
    }
  }, [order]);

  const loadCustomers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, getCompanyCollection('customers')));
      const customersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customersData);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  // Função melhorada para exportar PDF com cronograma completo e visual profissional
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    
    // Calcular progresso geral
    const totalItems = formData.items.length;
    const overallProgress = totalItems > 0 ? Math.round(
      formData.items.reduce((sum, item) => sum + (calculateItemProgress(item.progress) || 0), 0) / totalItems
    ) : 0;

    // Calcular dias restantes
    const today = new Date();
    const deliveryDate = new Date(formData.deliveryDate);
    const daysRemaining = differenceInDays(deliveryDate, today);
    const isDelayed = daysRemaining < 0;

    let currentY = margin;

    // CABEÇALHO PROFISSIONAL
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', margin, currentY, 40, 20);
    }
    
    // Título principal
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(44, 62, 80);
    doc.text('CRONOGRAMA DE PRODUÇÃO', pageWidth / 2, currentY + 12, { align: 'center' });
    
    currentY += 25;

    // Informações do pedido em caixas
    const boxHeight = 8;
    const boxWidth = (pageWidth - 2 * margin - 30) / 4;
    
    // Caixa 1 - Pedido
    doc.setFillColor(52, 152, 219);
    doc.rect(margin, currentY, boxWidth, boxHeight, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('PEDIDO', margin + 2, currentY + 3);
    doc.setFontSize(12);
    doc.text(`#${formData.orderNumber}`, margin + 2, currentY + 6);

    // Caixa 2 - Cliente
    doc.setFillColor(46, 204, 113);
    doc.rect(margin + boxWidth + 7.5, currentY, boxWidth, boxHeight, 'F');
    doc.setFontSize(10);
    doc.text('CLIENTE', margin + boxWidth + 9.5, currentY + 3);
    doc.setFontSize(12);
    doc.text(formData.customer, margin + boxWidth + 9.5, currentY + 6);

    // Caixa 3 - Progresso
    const progressColor = overallProgress >= 80 ? [46, 204, 113] : 
                         overallProgress >= 50 ? [241, 196, 15] : [231, 76, 60];
    doc.setFillColor(...progressColor);
    doc.rect(margin + 2 * (boxWidth + 7.5), currentY, boxWidth, boxHeight, 'F');
    doc.setFontSize(10);
    doc.text('PROGRESSO', margin + 2 * (boxWidth + 7.5) + 2, currentY + 3);
    doc.setFontSize(12);
    doc.text(`${overallProgress}%`, margin + 2 * (boxWidth + 7.5) + 2, currentY + 6);

    // Caixa 4 - Prazo
    const deadlineColor = isDelayed ? [231, 76, 60] : 
                         daysRemaining <= 7 ? [241, 196, 15] : [46, 204, 113];
    doc.setFillColor(...deadlineColor);
    doc.rect(margin + 3 * (boxWidth + 7.5), currentY, boxWidth, boxHeight, 'F');
    doc.setFontSize(10);
    doc.text('PRAZO', margin + 3 * (boxWidth + 7.5) + 2, currentY + 3);
    doc.setFontSize(12);
    const deadlineText = isDelayed ? `${Math.abs(daysRemaining)}d atraso` : `${daysRemaining}d restantes`;
    doc.text(deadlineText, margin + 3 * (boxWidth + 7.5) + 2, currentY + 6);

    currentY += 15;

    // Informações detalhadas
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    const infoY = currentY;
    doc.text(`OS Interna: ${formData.internalOrderNumber}`, margin, infoY);
    doc.text(`Projeto: ${formData.projectName || 'N/A'}`, margin + 70, infoY);
    doc.text(`Início: ${format(parseISO(formData.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 140, infoY);
    doc.text(`Entrega: ${format(parseISO(formData.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 200, infoY);
    
    if (formData.completedDate) {
      doc.text(`Concluído: ${format(parseISO(formData.completedDate), 'dd/MM/yyyy', { locale: ptBR })}`, margin + 260, infoY);
    }

    currentY += 12;

    // Status do checklist
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Status da Documentação:', margin, currentY);
    
    currentY += 8;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    
    const checklistItems = [
      { key: 'drawings', label: 'Desenhos Técnicos' },
      { key: 'inspectionTestPlan', label: 'Plano de Inspeção e Testes' },
      { key: 'paintPlan', label: 'Plano de Pintura' }
    ];

    checklistItems.forEach((item, index) => {
      const xPos = margin + (index * 90);
      const isCompleted = formData.checklist?.[item.key as keyof typeof formData.checklist];
      
      doc.setFillColor(isCompleted ? 46 : 231, isCompleted ? 204 : 76, isCompleted ? 113 : 60);
      doc.circle(xPos, currentY, 2, 'F');
      doc.setTextColor(44, 62, 80);
      doc.text(item.label, xPos + 5, currentY + 1);
    });

    currentY += 15;

    // TABELA DE ITENS COM CRONOGRAMA
    const tableData = formData.items.map(item => {
      const itemProgress = calculateItemProgress(item.progress);
      const stages = Object.entries(item.progress || {});
      const plannedStages = Object.entries(item.stagePlanning || {});
      
      // Status baseado no progresso
      let status = 'Não Iniciado';
      let statusColor = [149, 165, 166]; // Cinza
      
      if (itemProgress === 100) {
        status = 'Concluído';
        statusColor = [46, 204, 113]; // Verde
      } else if (itemProgress > 0) {
        status = 'Em Andamento';
        statusColor = [52, 152, 219]; // Azul
        
        // Verificar se está atrasado baseado nas datas planejadas
        const currentStage = stages.find(([_, progress]) => progress > 0 && progress < 100);
        if (currentStage && plannedStages.length > 0) {
          const stageName = currentStage[0];
          const stageData = item.stagePlanning?.[stageName];
          if (stageData?.endDate) {
            const stageEndDate = new Date(stageData.endDate);
            if (today > stageEndDate && itemProgress < 100) {
              status = 'Atrasado';
              statusColor = [231, 76, 60]; // Vermelho
            }
          }
        }
      }

      // Etapas em andamento
      const activeStages = stages
        .filter(([_, progress]) => progress > 0 && progress < 100)
        .map(([stageName, _]) => stageName)
        .join(', ') || 'N/A';

      // Próximas etapas
      const nextStages = stages
        .filter(([_, progress]) => progress === 0)
        .slice(0, 2)
        .map(([stageName, _]) => stageName)
        .join(', ') || 'N/A';

      return {
        content: [
          item.itemNumber.toString(),
          item.code,
          item.description.length > 25 ? item.description.substring(0, 25) + '...' : item.description,
          item.quantity.toString(),
          `${itemProgress}%`,
          status,
          activeStages.length > 20 ? activeStages.substring(0, 20) + '...' : activeStages,
          nextStages.length > 20 ? nextStages.substring(0, 20) + '...' : nextStages
        ],
        styles: {
          0: { halign: 'center' },
          1: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center', textColor: statusColor },
          5: { halign: 'center', textColor: statusColor, fontStyle: 'bold' }
        }
      };
    });

    // Cabeçalho da tabela
    const headers = [
      'Item',
      'Código',
      'Descrição',
      'Qtd',
      'Progresso',
      'Status',
      'Etapas Ativas',
      'Próximas Etapas'
    ];

    autoTable(doc, {
      startY: currentY,
      head: [headers],
      body: tableData.map(row => row.content),
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
    
    setFormData(prev => ({
      ...prev,
      lastExportDate: new Date().toISOString()
    }));
    
    doc.save(`lista-itens-selecionados.pdf`);
  };

  const isItemCompleted = (item: OrderItem): boolean => {
    if (!item.progress || Object.keys(item.progress).length === 0) return false;
    return Object.values(item.progress).every(progress => progress === 100);
  };

  const sortStagesByExecutionOrder = (stages: Record<string, any> = {}, stagePlanning: Record<string, any> = {}) => {
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
      setSelectedItems(new Set());
    } else {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              {order ? 'Editar Pedido' : 'Novo Pedido'}
            </h2>
          </div>
          <div className="flex space-x-3">
            {order && (
              <>
                <button
                  onClick={handleExportPDF}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Exportar Cronograma
                </button>
                <button
                  onClick={generateClientAccessLink}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                >
                  <Share className="h-5 w-5 mr-2" />
                  Gerar Link Cliente
                </button>
              </>
            )}
            <button onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Links de acesso existentes */}
        {formData.clientAccessLinks && formData.clientAccessLinks.length > 0 && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <h3 className="text-lg font-medium text-green-800 mb-3 flex items-center">
              <ExternalLink className="h-5 w-5 mr-2" />
              Links de Acesso para Cliente
            </h3>
            <div className="space-y-2">
              {formData.clientAccessLinks.map((link, index) => (
                <div key={link.id} className="flex items-center justify-between bg-white p-3 rounded border">
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      Link #{index + 1} - Criado em {format(new Date(link.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </div>
                    <div className="text-xs text-gray-500">
                      Expira em: {format(new Date(link.expiresAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      {link.accessCount > 0 && ` • Acessado ${link.accessCount} vez(es)`}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/cronograma-publico/${link.id}`;
                        navigator.clipboard.writeText(url);
                        alert('Link copiado!');
                      }}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                    >
                      <Copy className="h-4 w-4 inline mr-1" />
                      Copiar
                    </button>
                    <span className={`px-2 py-1 rounded text-xs ${
                      link.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {link.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Número do Pedido</label>
              <input 
                type="text" 
                value={formData.orderNumber} 
                onChange={e => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))} 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Cliente</label>
              <select 
                value={formData.customer} 
                onChange={e => setFormData(prev => ({ ...prev, customer: e.target.value }))} 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                required
              >
                <option value="">Selecione um cliente</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.name}>{customer.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">OS Interna</label>
              <input 
                type="text" 
                value={formData.internalOrderNumber} 
                onChange={e => setFormData(prev => ({ ...prev, internalOrderNumber: e.target.value }))} 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                required 
              />
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
              <input 
                type="date" 
                value={formData.startDate.split('T')[0]} 
                onChange={e => setFormData(prev => ({ ...prev, startDate: e.target.value }))} 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Data de Entrega</label>
              <input 
                type="date" 
                value={formData.deliveryDate.split('T')[0]} 
                onChange={e => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))} 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                required 
              />
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
                <input 
                  type="text" 
                  value={newLink} 
                  onChange={e => setNewLink(e.target.value)} 
                  placeholder="Cole o link do Google Drive aqui" 
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200" 
                />
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

      {/* Modal para gerar link de acesso */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Link de Acesso Gerado</h3>
              <button onClick={() => setShowLinkModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Validade do Link (dias)
                </label>
                <select 
                  value={linkExpiration} 
                  onChange={e => setLinkExpiration(Number(e.target.value))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                >
                  <option value={7}>7 dias</option>
                  <option value={15}>15 dias</option>
                  <option value={30}>30 dias</option>
                  <option value={60}>60 dias</option>
                  <option value={90}>90 dias</option>
                </select>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">Link Gerado:</label>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={generatedLink} 
                    readOnly 
                    className="flex-1 rounded-md border-gray-300 bg-gray-100 text-sm"
                  />
                  <button 
                    onClick={copyLinkToClipboard}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">Instruções para o Cliente:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• O cliente pode acessar o cronograma atualizado a qualquer momento</li>
                  <li>• O link expira automaticamente após o período definido</li>
                  <li>• Apenas visualização - o cliente não pode editar</li>
                  <li>• O cronograma será sempre a versão mais atual</li>
                </ul>
              </div>

              <div className="flex space-x-3">
                <button 
                  onClick={() => setShowLinkModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
                >
                  Fechar
                </button>
                <button 
                  onClick={() => {
                    copyLinkToClipboard();
                    setShowLinkModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Copiar e Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
        fillColor: [44, 62, 80],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      styles: {
        fontSize: 8,
        cellPadding: 3,
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 50 },
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 22, halign: 'center' },
        6: { cellWidth: 40 },
        7: { cellWidth: 40 }
      },
      didParseCell: function(data) {
        if (data.row.index >= 0) {
          const rowData = tableData[data.row.index];
          if (rowData && rowData.styles && rowData.styles[data.column.index]) {
            Object.assign(data.cell.styles, rowData.styles[data.column.index]);
          }
        }
      },
      didDrawPage: function(data) {
        // Rodapé
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(
          `Relatório gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
          margin,
          pageHeight - 10
        );
        doc.text(
          `Página ${data.pageNumber}`,
          pageWidth - margin,
          pageHeight - 10,
          { align: 'right' }
        );
      }
    });

    // Se houver espaço, adicionar gráfico de progresso simples
    const finalY = (doc as any).lastAutoTable?.finalY || currentY + 100;
    if (finalY < pageHeight - 60) {
      // Adicionar resumo estatístico
      const completedItems = formData.items.filter(item => calculateItemProgress(item.progress) === 100).length;
      const inProgressItems = formData.items.filter(item => {
        const progress = calculateItemProgress(item.progress);
        return progress > 0 && progress < 100;
      }).length;
      const notStartedItems = formData.items.filter(item => calculateItemProgress(item.progress) === 0).length;

      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(44, 62, 80);
      doc.text('Resumo Estatístico:', margin, finalY + 15);

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`• Itens Concluídos: ${completedItems}/${totalItems} (${Math.round((completedItems/totalItems)*100)}%)`, margin, finalY + 25);
      doc.text(`• Itens em Andamento: ${inProgressItems}`, margin, finalY + 32);
      doc.text(`• Itens Não Iniciados: ${notStartedItems}`, margin, finalY + 39);
      doc.text(`• Peso Total: ${formData.totalWeight.toLocaleString('pt-BR')} kg`, margin, finalY + 46);
    }

    // Salvar PDF
    doc.save(`cronograma-${formData.orderNumber}-${format(new Date(), 'ddMMyyyy')}.pdf`);
  };

  // Função para gerar link de acesso ao cliente
  const generateClientAccessLink = async () => {
    const linkId = crypto.randomUUID();
    const expirationDate = addDays(new Date(), linkExpiration);
    
    const accessLink = {
      id: linkId,
      orderId: formData.id,
      customerName: formData.customer,
      createdAt: new Date().toISOString(),
      expiresAt: expirationDate.toISOString(),
      accessCount: 0,
      isActive: true
    };

    // Em produção, você salvaria isso no Firebase
    // await addDoc(collection(db, 'clientAccessLinks'), accessLink);

    const baseUrl = window.location.origin;
    const generatedUrl = `${baseUrl}/cronograma-publico/${linkId}`;
    
    setGeneratedLink(generatedUrl);
    
    // Atualizar o pedido com o novo link
    const updatedLinks = [...(formData.clientAccessLinks || []), accessLink];
    setFormData(prev => ({
      ...prev,
      clientAccessLinks: updatedLinks
    }));

    setShowLinkModal(true);
  };

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    alert('Link copiado para a área de transferência!');
  };

  // Resto do código permanece igual...
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

      return {
        ...prev,
        checklist: newChecklist
      };
    });
  };

  const handleStatusChange = (newStatus: OrderStatus) => {
    setFormData(prev => {
      let completedDate = prev.completedDate;
      
      if (newStatus === 'completed' && !completedDate) {
        completedDate = new Date().toISOString().split('T')[0];
      } else if (newStatus !== 'completed') {
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
      const formattedData = {
        ...formData,
        startDate: safeISODate(formData.startDate),
        deliveryDate: safeISODate(formData.deliveryDate),
        completedDate: formData.completedDate ? safeISODate(formData.completedDate) : '',
        deleted: false,
        checklist: {
          drawings: !!formData.checklist?.drawings,
          inspectionTestPlan: !!formData.checklist?.inspectionTestPlan,
          paintPlan: !!formData.checklist?.paintPlan
        }
      };
      
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

  const handleUpdateItemField = (itemId: string, field: keyof OrderItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === itemId ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleExportItemsListPDF = () => {
    if (selectedItems.size === 0) {
      alert('Por favor, selecione pelo menos um item para exportar.');
      return;
    }

    const doc = new jsPDF();
    
    let y = 20;
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 20, 10, 40, 20);
      y = 40;
    }
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(`Lista de Itens Selecionados`, 105, y, { align: 'center' });
    y += 15;
    
    const selectedOrderObjects = formData.items.filter(item => selectedItems.has(item.id));
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Pedido #${formData.orderNumber} - ${formData.customer}`, 20, y);
    y += 8;
    doc.text(`OS Interna: ${formData.internalOrderNumber}`, 20, y);
    y += 8;
    if (formData.projectName) {
      doc.text(`Projeto: ${formData.projectName}`, 20, y);
      y += 8;
    }
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 20, y);
    y += 15;
    
    const allItems = selectedOrderObjects;
    const totalWeight = allItems.reduce((sum, item) => sum + item.totalWeight, 0);
    
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