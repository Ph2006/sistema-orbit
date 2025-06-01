import React, { useState, useEffect } from 'react';
import { X, Edit, Trash2, Plus, Download, BarChart3, Settings, CheckCircle, Calendar, Building, FolderOpen, ExternalLink, Link } from 'lucide-react';
import { Order, OrderItem } from '../types/kanban';
import ItemProgressModal from './ItemProgressModal';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Declaração para o TypeScript reconhecer o autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface OrderItemsListProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder: (order: Order) => void;
}

const OrderItemsList: React.FC<OrderItemsListProps> = ({
  order,
  onClose,
  onUpdateOrder
}) => {
  const [items, setItems] = useState<OrderItem[]>(order.items || []);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [newItem, setNewItem] = useState<Partial<OrderItem>>({
    itemNumber: items.length + 1,
    code: '',
    description: '',
    quantity: 1,
    unitWeight: 0,
    specifications: '',
    progress: {}
  });

  // Estados para documentação
  const [hasDrawings, setHasDrawings] = useState(order.hasDrawings || false);
  const [hasInspectionPlan, setHasInspectionPlan] = useState(order.hasInspectionPlan || false);
  const [hasPaintPlan, setHasPaintPlan] = useState(order.hasPaintPlan || false);

  // Estados para Google Drive
  const [googleDriveLink, setGoogleDriveLink] = useState(order.googleDriveLink || '');
  const [isEditingGoogleDrive, setIsEditingGoogleDrive] = useState(false);

  // Função para validar link do Google Drive
  const isValidGoogleDriveLink = (url: string) => {
    const drivePatterns = [
      /^https:\/\/drive\.google\.com\//,
      /^https:\/\/docs\.google\.com\//,
      /^https:\/\/.*\.googleusercontent\.com\//
    ];
    return drivePatterns.some(pattern => pattern.test(url));
  };

  // Função para abrir Google Drive
  const handleOpenGoogleDrive = () => {
    if (googleDriveLink) {
      window.open(googleDriveLink, '_blank');
    } else {
      alert('Link do Google Drive não configurado para este pedido.');
    }
  };

  // Função para configurar Google Drive rapidamente
  const handleQuickConfigureGoogleDrive = () => {
    const newLink = prompt(
      'Digite o link do Google Drive:',
      googleDriveLink || 'https://drive.google.com/drive/folders/'
    );
    
    if (newLink !== null) {
      const trimmedLink = newLink.trim();
      if (trimmedLink === '') {
        setGoogleDriveLink('');
      } else if (isValidGoogleDriveLink(trimmedLink)) {
        setGoogleDriveLink(trimmedLink);
      } else {
        alert('Por favor, insira um link válido do Google Drive.');
      }
    }
  };

  // Função para exportar PDF
  const exportOrderToPDF = (orderToExport: Order, selectedItemIds?: Set<string>) => {
    const doc = new jsPDF();
    
    doc.setFont('helvetica');
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('ROMANEIO DE EMBARQUE', 105, 30, { align: 'center' });
    
    doc.setLineWidth(0.5);
    doc.line(20, 40, 190, 40);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`Pedido: #${orderToExport.orderNumber}`, 20, 55);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 120, 55);
    
    doc.text(`Cliente: ${orderToExport.customer}`, 20, 70);
    
    doc.text(`OS Interna: ${orderToExport.internalOrderNumber}`, 20, 85);
    
    if (orderToExport.startDate) {
      doc.text(`Data de Início: ${format(new Date(orderToExport.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, 20, 100);
    }
    doc.text(`Data de Entrega: ${format(new Date(orderToExport.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, 20, 115);
    
    const itemsToExport = selectedItemIds && selectedItemIds.size > 0 
      ? orderToExport.items?.filter(item => selectedItemIds.has(item.id)) || []
      : orderToExport.items || [];
    
    const tableData = itemsToExport.map((item, index) => [
      (index + 1).toString(),
      item.code || '',
      item.description || item.name || '',
      (item.quantity || 0).toString(),
      `${(item.unitWeight || 0).toFixed(3)} kg`,
      `${((item.quantity || 0) * (item.unitWeight || 0)).toFixed(3)} kg`
    ]);
    
    doc.autoTable({
      head: [['Item', 'Código', 'Descrição', 'Qtd', 'Peso Unit.', 'Peso Total']],
      body: tableData,
      startY: 130,
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 3,
        halign: 'center',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [52, 152, 219],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'center', cellWidth: 30 },
        2: { halign: 'left', cellWidth: 60 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 30 }
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      }
    });
    
    const totalItems = itemsToExport.length;
    const totalQuantity = itemsToExport.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalWeight = itemsToExport.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitWeight || 0)), 0);
    
    const finalY = doc.lastAutoTable.finalY + 20;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    
    doc.text(`Total de Itens:`, 20, finalY);
    doc.setFont('helvetica', 'normal');
    doc.text(totalItems.toString(), 80, finalY);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Quantidade Total:`, 20, finalY + 15);
    doc.setFont('helvetica', 'normal');
    doc.text(totalQuantity.toString(), 80, finalY + 15);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Peso Total:`, 20, finalY + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalWeight.toFixed(3)} kg`, 80, finalY + 30);
    
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(
      `Documento gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
      105,
      pageHeight - 10,
      { align: 'center' }
    );
    
    const fileName = selectedItemIds && selectedItemIds.size > 0 
      ? `romaneio_selecionados_${orderToExport.orderNumber}_${format(new Date(), 'ddMMyyyy_HHmm')}.pdf`
      : `romaneio_pedido_${orderToExport.orderNumber}_${format(new Date(), 'ddMMyyyy_HHmm')}.pdf`;
    doc.save(fileName);
    
    return fileName;
  };

  const calculateItemWeight = (item: OrderItem) => {
    return (item.quantity || 0) * (item.unitWeight || 0);
  };

  const calculateTotalWeight = () => {
    return items.reduce((total, item) => total + calculateItemWeight(item), 0);
  };

  const calculateOverallProgress = (item: OrderItem) => {
    if (!item.progress || Object.keys(item.progress).length === 0) return 0;
    const values = Object.values(item.progress);
    return Math.round(values.reduce((sum, val) => sum + val, 0) / values.length);
  };

  const handleSelectItem = (itemId: string) => {
    const newSelectedItems = new Set(selectedItems);
    if (newSelectedItems.has(itemId)) {
      newSelectedItems.delete(itemId);
    } else {
      newSelectedItems.add(itemId);
    }
    setSelectedItems(newSelectedItems);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.id)));
    }
  };

  const handleAddItem = () => {
    if (!newItem.code || !newItem.description) {
      alert('Código e descrição são obrigatórios');
      return;
    }

    const itemToAdd: OrderItem = {
      id: `item_${Date.now()}`,
      itemNumber: items.length + 1,
      code: newItem.code || '',
      description: newItem.description || '',
      quantity: newItem.quantity || 1,
      unitWeight: newItem.unitWeight || 0,
      specifications: newItem.specifications || '',
      progress: {},
      overallProgress: 0
    };

    const updatedItems = [...items, itemToAdd];
    setItems(updatedItems);
    
    setNewItem({
      itemNumber: updatedItems.length + 1,
      code: '',
      description: '',
      quantity: 1,
      unitWeight: 0,
      specifications: '',
      progress: {}
    });
  };

  const handleDeleteItem = (itemId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este item?')) {
      const updatedItems = items.filter(item => item.id !== itemId);
      setItems(updatedItems);
      const newSelectedItems = new Set(selectedItems);
      newSelectedItems.delete(itemId);
      setSelectedItems(newSelectedItems);
    }
  };

  const handleEditItem = (item: OrderItem) => {
    setSelectedItem(item);
    setIsProgressModalOpen(true);
  };

  const handleSaveItemProgress = (updatedItem: OrderItem) => {
    const updatedItems = items.map(item =>
      item.id === updatedItem.id ? updatedItem : item
    );
    setItems(updatedItems);
    setIsProgressModalOpen(false);
    setSelectedItem(null);
  };

  const handleSaveOrder = () => {
    const updatedOrder = {
      ...order,
      items,
      totalWeight: calculateTotalWeight(),
      hasDrawings,
      hasInspectionPlan,
      hasPaintPlan,
      googleDriveLink: googleDriveLink.trim() || undefined
    };
    onUpdateOrder(updatedOrder);
    onClose();
  };

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500';
    if (progress >= 70) return 'bg-blue-500';
    if (progress >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Detalhes do Pedido #{order.orderNumber}
            </h2>
            <div className="text-gray-600 mt-1 space-y-1">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                <span>{order.customer}</span>
                <span>•</span>
                <span>OS Interna: {order.internalOrderNumber}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                {order.startDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Início: {format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Entrega: {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {googleDriveLink && (
              <button
                onClick={handleOpenGoogleDrive}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                title="Abrir Google Drive"
              >
                <FolderOpen className="h-5 w-5" />
                <span className="hidden sm:inline">Google Drive</span>
              </button>
            )}
            
            {selectedItems.size > 0 && (
              <button
                onClick={() => exportOrderToPDF(order, selectedItems)}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center gap-2"
              >
                <Download className="h-5 w-5" />
                Exportar Selecionados ({selectedItems.size})
              </button>
            )}
            <button
              onClick={() => exportOrderToPDF(order)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <Download className="h-5 w-5" />
              Exportar Romaneio
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Documentation Section */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-medium text-blue-800 mb-3">Documentação:</h3>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDrawings}
                  onChange={(e) => setHasDrawings(e.target.checked)}
                  className="mr-2 text-blue-600"
                />
                📄 Desenhos
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasInspectionPlan}
                  onChange={(e) => setHasInspectionPlan(e.target.checked)}
                  className="mr-2 text-blue-600"
                />
                ✅ Plano de Inspeção e Testes
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasPaintPlan}
                  onChange={(e) => setHasPaintPlan(e.target.checked)}
                  className="mr-2 text-blue-600"
                />
                🎨 Plano de Pintura
              </label>
            </div>
          </div>

          {/* Google Drive Section */}
          <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-green-800 flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Google Drive
              </h3>
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                googleDriveLink 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-400 text-white'
              }`}>
                {googleDriveLink ? '✅ Configurado' : '⚠️ Não configurado'}
              </div>
            </div>

            {isEditingGoogleDrive ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link do Google Drive
                  </label>
                  <input
                    type="url"
                    value={googleDriveLink}
                    onChange={(e) => setGoogleDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Cole aqui o link da pasta do Google Drive para este pedido
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const trimmedLink = googleDriveLink.trim();
                      if (trimmedLink && !isValidGoogleDriveLink(trimmedLink)) {
                        alert('Por favor, insira um link válido do Google Drive.');
                        return;
                      }
                      setIsEditingGoogleDrive(false);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => {
                      setGoogleDriveLink(order.googleDriveLink || '');
                      setIsEditingGoogleDrive(false);
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm min-h-[2.5rem] flex items-center">
                    {googleDriveLink ? (
                      <span className="text-green-700 truncate" title={googleDriveLink}>
                        {googleDriveLink}
                      </span>
                    ) : (
                      <span className="text-gray-400">
                        Nenhum link configurado
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setIsEditingGoogleDrive(true)}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    title="Editar link"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex gap-2">
                  {googleDriveLink ? (
                    <button
                      onClick={handleOpenGoogleDrive}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir Google Drive
                    </button>
                  ) : (
                    <button
                      onClick={handleQuickConfigureGoogleDrive}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Link className="h-4 w-4" />
                      Configurar Google Drive
                    </button>
                  )}
                  
                  {googleDriveLink && (
                    <button
                      onClick={handleQuickConfigureGoogleDrive}
                      className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
                      title="Edição rápida"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {googleDriveLink && (
              <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded-md">
                <p className="text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Google Drive configurado para este pedido
                </p>
                <p className="text-xs text-green-600 mt-1">
                  A equipe pode acessar os documentos relacionados a este pedido
                </p>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Itens ({items.length})
              </h3>
              <div className="flex gap-4 items-center">
                <span className="text-sm text-gray-600">
                  Peso total: {calculateTotalWeight().toFixed(2)} kg
                </span>
                {selectedItems.size > 0 && (
                  <span className="text-sm text-blue-600 font-medium">
                    {selectedItems.size} selecionado(s)
                  </span>
                )}
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1"
                >
                  <Settings className="h-4 w-4" />
                  {isEditing ? 'Finalizar' : 'Editar'}
                </button>
              </div>
            </div>

            {/* Table Header */}
            <div className="bg-gray-100 grid grid-cols-12 gap-4 px-6 py-3 text-sm font-medium text-gray-700">
              <div className="col-span-1 flex items-center">
                <input
                  type="checkbox"
                  checked={selectedItems.size === items.length && items.length > 0}
                  onChange={handleSelectAll}
                  className="mr-2"
                />
                Nº Item
              </div>
              <div className="col-span-2">Código</div>
              <div className="col-span-3">Descrição</div>
              <div className="col-span-1">Qtd</div>
              <div className="col-span-2">Peso Unit. (kg)</div>
              <div className="col-span-2">Progresso</div>
              <div className="col-span-1">Ações</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-gray-200">
              {items.map((item, index) => (
                <div key={item.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50">
                  <div className="col-span-1 flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => handleSelectItem(item.id)}
                      className="mr-2"
                    />
                    <span className="font-medium">{item.itemNumber}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-sm">{item.code}</span>
                  </div>
                  <div className="col-span-3 flex items-center">
                    <div>
                      <div className="font-medium">{item.description}</div>
                      {item.specifications && (
                        <div className="text-xs text-gray-500 mt-1">
                          {item.specifications}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center">
                    <span className="text-sm">{item.quantity}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-sm">{(item.unitWeight || 0).toFixed(3)}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <div className="w-full">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Progresso</span>
                        <span>{calculateOverallProgress(item)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getProgressColor(calculateOverallProgress(item))}`}
                          style={{ width: `${calculateOverallProgress(item)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center gap-2">
                    <button
                      onClick={() => handleEditItem(item)}
                      className="p-1 text-blue-600 hover:text-blue-800"
                      title="Atualizar Progresso Detalhado"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                    {isEditing && (
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 text-red-600 hover:text-red-800"
                        title="Excluir Item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Item Form */}
            {isEditing && (
              <div className="border-t border-gray-200 bg-gray-50">
                <div className="grid grid-cols-12 gap-4 px-6 py-4">
                  <div className="col-span-1 flex items-center">
                    <span className="text-sm text-gray-500">{items.length + 1}</span>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="Código"
                  <div className="col-span-1">
                    <input
                      type="number"
                      placeholder="Qtd"
                      min="1"
                      value={newItem.quantity || 1}
                      onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Peso unitário"
                      step="0.001"
                      value={newItem.unitWeight || 0}
                      onChange={(e) => setNewItem({ ...newItem, unitWeight: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-sm text-gray-500">0%</span>
                  </div>
                  <div className="col-span-1 flex items-center">
                    <button
                      onClick={handleAddItem}
                      className="p-2 bg-green-600 text-white rounded hover:bg-green-700"
                      title="Adicionar Item"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Total:</span> {items.length} itens • {calculateTotalWeight().toFixed(2)} kg
            {selectedItems.size > 0 && (
              <span className="ml-4 text-blue-600">
                • {selectedItems.size} selecionado(s)
              </span>
            )}
            {googleDriveLink && (
              <span className="ml-4 text-green-600 flex items-center gap-1">
                • <FolderOpen className="h-3 w-3" /> Google Drive configurado
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveOrder}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>

      {/* Progress Modal */}
      {isProgressModalOpen && selectedItem && (
        <ItemProgressModal
          item={selectedItem}
          allItems={items}
          onClose={() => {
            setIsProgressModalOpen(false);
            setSelectedItem(null);
          }}
          onSave={handleSaveItemProgress}
        />
      )}
    </div>
  );
};

export default OrderItemsList;={newItem.code || ''}
                      onChange={(e) => setNewItem({ ...newItem, code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Descrição"
                      value={newItem.description || ''}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="number"
                      placeholder="Qtd"
                      min="1"
                      value
