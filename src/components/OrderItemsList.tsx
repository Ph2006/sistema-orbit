import React, { useState } from 'react';
import { X, Package, Calendar, User, Building, FileText, CheckCircle, Square, CheckSquare, BarChart, Edit, Trash2, Plus, Download, FileSpreadsheet, Save, Weight } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Tipos baseados no seu código
interface OrderItem {
  id: string;
  itemNumber: string | number;
  code?: string;
  description: string;
  quantity: number;
  unitWeight: number;
  totalWeight?: number;
  unitPrice?: number;
  totalPrice?: number;
  progress?: { [key: string]: number };
  overallProgress?: number;
  expeditionLE?: string;
  invoiceNumber?: string;
  expeditionDate?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  internalOrderNumber?: string;
  customer: string;
  customerName?: string;
  projectId?: string;
  projectName?: string;
  startDate: string;
  deliveryDate: string;
  completedDate?: string | null;
  status: string;
  totalWeight: number;
  description?: string;
  notes?: string;
  checklist?: {
    drawings: boolean;
    inspectionTestPlan: boolean;
    paintPlan: boolean;
  };
  items: OrderItem[];
  overallProgress?: number;
  columnId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  statusHistory?: any[];
  lastExportDate?: string | null;
}

interface OrderItemsListProps {
  order: Order;
  onClose: () => void;
  onUpdateOrder?: (order: Order) => void;
}

const OrderItemsList: React.FC<OrderItemsListProps> = ({ order, onClose, onUpdateOrder }) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [localOrder, setLocalOrder] = useState<Order>(order);

  // Logo da empresa em base64 (exemplo)
  const companyLogo = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjQwIiB2aWV3Qm94PSIwIDAgMTAwIDQwIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPgo8cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjMjU2M2ViIi8+Cjx0ZXh0IHg9IjUwIiB5PSIyNSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+TUlOSEEgRU1QUkVTQTwvdGV4dD4KPHN2Zz4K";

  // Calcular o peso total dos itens
  const totalWeight = localOrder.items.reduce((total, item) => {
    return total + (item.totalWeight || (item.unitWeight * item.quantity));
  }, 0);

  // Calcular o peso total dos itens selecionados
  const selectedItemsWeight = localOrder.items
    .filter(item => selectedItems.has(item.id))
    .reduce((total, item) => total + (item.totalWeight || (item.unitWeight * item.quantity)), 0);

  const toggleItemSelection = (itemId: string) => {
    const newSelectedItems = new Set(selectedItems);
    if (selectedItems.has(itemId)) {
      newSelectedItems.delete(itemId);
    } else {
      newSelectedItems.add(itemId);
    }
    setSelectedItems(newSelectedItems);
  };

  const areAllItemsSelected = localOrder.items.length > 0 && selectedItems.size === localOrder.items.length;

  const toggleAllItems = () => {
    if (areAllItemsSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(localOrder.items.map(item => item.id)));
    }
  };

  const handleAddItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      itemNumber: localOrder.items.length + 1,
      code: '',
      description: '',
      quantity: 1,
      unitWeight: 0,
      totalWeight: 0,
      unitPrice: 0,
      totalPrice: 0,
      overallProgress: 0,
    };

    const updatedOrder = {
      ...localOrder,
      items: [...localOrder.items, newItem]
    };
    setLocalOrder(updatedOrder);
  };

  const handleRemoveItem = (itemId: string) => {
    const updatedOrder = {
      ...localOrder,
      items: localOrder.items.filter(item => item.id !== itemId)
    };
    setLocalOrder(updatedOrder);
    
    // Também remover o item da seleção, se estiver selecionado
    if (selectedItems.has(itemId)) {
      const newSelectedItems = new Set(selectedItems);
      newSelectedItems.delete(itemId);
      setSelectedItems(newSelectedItems);
    }
  };

  const handleItemChange = (itemId: string, field: keyof OrderItem, value: any) => {
    const updatedOrder = {
      ...localOrder,
      items: localOrder.items.map(item => {
        if (item.id === itemId) {
          const updatedItem = {
            ...item,
            [field]: value
          };
          
          return updatedItem;
        }
        return item;
      })
    };

    // Recalcular progresso geral do pedido se o progresso de um item mudou
    if (field === 'overallProgress') {
      const totalProgress = updatedOrder.items.reduce((sum, item) => sum + (item.overallProgress || 0), 0);
      updatedOrder.overallProgress = updatedOrder.items.length > 0 ? Math.round(totalProgress / updatedOrder.items.length) : 0;
    }

    setLocalOrder(updatedOrder);
  };

  // Função para atualizar progresso de um item
  const updateItemProgress = (itemId: string, newProgress: number) => {
    handleItemChange(itemId, 'overallProgress', newProgress);
  };

  // Gerar PDF com romaneio dos itens selecionados - IMPLEMENTAÇÃO FUNCIONAL
  const generateSelectedItemsPdf = () => {
    if (selectedItems.size === 0) {
      alert('Selecione pelo menos um item para exportar o romaneio.');
      return;
    }

    try {
      const doc = new jsPDF();
      
      // Cabeçalho do documento
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('ROMANEIO DE EMBARQUE', 105, 20, { align: 'center' });
      
      // Linha divisória
      doc.setLineWidth(0.5);
      doc.line(20, 25, 190, 25);
      
      // Informações do pedido
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      
      let yPosition = 35;
      
      // Dados do pedido em duas colunas
      doc.text(`Pedido: #${localOrder.orderNumber}`, 20, yPosition);
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 120, yPosition);
      yPosition += 7;
      
      doc.text(`Cliente: ${localOrder.customer}`, 20, yPosition);
      doc.text(`OS Interna: ${localOrder.internalOrderNumber}`, 120, yPosition);
      yPosition += 7;
      
      if (localOrder.projectName) {
        doc.text(`Projeto: ${localOrder.projectName}`, 20, yPosition);
        yPosition += 7;
      }
      
      doc.text(`Data de Entrega: ${new Date(localOrder.deliveryDate).toLocaleDateString('pt-BR')}`, 20, yPosition);
      yPosition += 15;
      
      // Filtrar itens selecionados
      const selectedItemsData = localOrder.items.filter(item => 
        selectedItems.has(item.id)
      );

      // Calcular totais
      const totalQuantity = selectedItemsData.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const totalWeightSelected = selectedItemsData.reduce((sum, item) => sum + (item.totalWeight || (item.unitWeight * item.quantity)), 0);

      // Preparar dados para a tabela
      const tableData = selectedItemsData.map((item, index) => [
        (index + 1).toString(),
        item.code || '-',
        item.description || 'Sem descrição',
        (item.quantity || 0).toString(),
        `${(item.unitWeight || 0).toFixed(3)} kg`,
        `${(item.totalWeight || (item.unitWeight * item.quantity)).toFixed(3)} kg`,
        `${item.overallProgress || 0}%`
      ]);

      // Adicionar tabela principal
      (doc as any).autoTable({
        startY: yPosition,
        head: [['Item', 'Código', 'Descrição', 'Qtd', 'Peso Unit.', 'Peso Total', 'Progresso']],
        body: tableData,
        styles: { 
          fontSize: 9,
          cellPadding: 3
        },
        headStyles: { 
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: { 
          fillColor: [245, 245, 245] 
        },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.1,
        columnStyles: {
          0: { halign: 'center', cellWidth: 15 }, // Item
          1: { halign: 'center', cellWidth: 25 }, // Código
          2: { halign: 'left', cellWidth: 60 },   // Descrição
          3: { halign: 'center', cellWidth: 15 }, // Qtd
          4: { halign: 'right', cellWidth: 25 },  // Peso Unit.
          5: { halign: 'right', cellWidth: 25 },  // Peso Total
          6: { halign: 'center', cellWidth: 20 }  // Progresso
        }
      });

      // Posição após a tabela
      const finalY = (doc as any).lastAutoTable.finalY || 100;
      
      // Tabela de resumo
      const summaryData = [
        ['Total de Itens:', selectedItemsData.length.toString()],
        ['Quantidade Total:', totalQuantity.toString()],
        ['Peso Total:', `${totalWeightSelected.toFixed(3)} kg`]
      ];

      (doc as any).autoTable({
        startY: finalY + 10,
        body: summaryData,
        styles: { 
          fontSize: 11,
          cellPadding: 3
        },
        columnStyles: {
          0: { fontStyle: 'bold', halign: 'left', cellWidth: 40 },
          1: { fontStyle: 'bold', halign: 'right', cellWidth: 40 }
        },
        theme: 'plain'
      });

      // Rodapé com informações adicionais
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      
      // Status da documentação
      let docStatus = '';
      if (localOrder.checklist?.drawings) docStatus += 'Desenhos ✓ ';
      if (localOrder.checklist?.inspectionTestPlan) docStatus += 'PIT ✓ ';
      if (localOrder.checklist?.paintPlan) docStatus += 'Pintura ✓ ';
      
      if (docStatus) {
        doc.text(`Documentação: ${docStatus}`, 20, pageHeight - 20);
      }
      
      // Data e hora de geração
      doc.text(
        `Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,
        105, 
        pageHeight - 10, 
        { align: 'center' }
      );

      // Numeração de páginas
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.text(
          `Página ${i} de ${totalPages}`,
          190, 
          pageHeight - 10, 
          { align: 'right' }
        );
      }

      // Salvar o PDF
      const filename = `Romaneio_Pedido_${localOrder.orderNumber}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      doc.save(filename);
      
      // Feedback visual
      alert(`PDF "${filename}" gerado com sucesso!\n\nItens incluídos: ${selectedItemsData.length}\nPeso total: ${totalWeightSelected.toFixed(3)} kg`);
      
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Verifique se as dependências jsPDF estão instaladas corretamente.');
    }
  };

  // Gerar PDF com cronograma/progresso
  const generateProgressPdf = () => {
    alert('Funcionalidade de cronograma em desenvolvimento. Para implementação completa, instale a biblioteca jsPDF.');
  };

  const handleSave = () => {
    if (onUpdateOrder) {
      onUpdateOrder(localOrder);
    }
    onClose();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'in-progress': return 'text-blue-600 bg-blue-100';
      case 'delayed': return 'text-red-600 bg-red-100';
      case 'waiting-docs': return 'text-yellow-600 bg-yellow-100';
      case 'ready': return 'text-purple-600 bg-purple-100';
      case 'urgent': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completo';
      case 'in-progress': return 'Em Andamento';
      case 'delayed': return 'Atrasado';
      case 'waiting-docs': return 'Aguardando Documentação';
      case 'ready': return 'Pronto para Embarque';
      case 'urgent': return 'Urgente';
      default: return status;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <Package className="h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Detalhes do Pedido #{localOrder.orderNumber}
              </h2>
              <p className="text-sm text-gray-600">
                {localOrder.customer} • {localOrder.projectName || 'Sem projeto'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors p-2 hover:bg-gray-100 rounded-full"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Informações do Pedido */}
        <div className="p-6 bg-gray-50 border-b">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">OS Interna</p>
                <p className="font-semibold">{localOrder.internalOrderNumber}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Data de Início</p>
                <p className="font-semibold">
                  {new Date(localOrder.startDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Data de Entrega</p>
                <p className="font-semibold">
                  {new Date(localOrder.deliveryDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Building className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(localOrder.status)}`}>
                  {getStatusLabel(localOrder.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Peso Total</p>
                <p className="font-semibold">{totalWeight.toFixed(2)} kg</p>
              </div>
            </div>
          </div>

          {/* Progresso Geral */}
          <div className="mt-6 p-4 bg-white rounded-lg border">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Progresso Geral do Pedido</h3>
              <span className="text-lg font-bold text-blue-600">{localOrder.overallProgress || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div 
                className={`h-4 rounded-full transition-all duration-300 ${
                  (localOrder.overallProgress || 0) === 100 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${localOrder.overallProgress || 0}%` }}
              />
            </div>
          </div>

          {/* Checklist Editável */}
          <div className="mt-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Documentação:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={localOrder.checklist?.drawings || false}
                  onChange={(e) => {
                    const updatedOrder = {
                      ...localOrder,
                      checklist: {
                        ...localOrder.checklist,
                        drawings: e.target.checked
                      }
                    };
                    setLocalOrder(updatedOrder);
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Desenhos</span>
              </label>
              
              <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={localOrder.checklist?.inspectionTestPlan || false}
                  onChange={(e) => {
                    const updatedOrder = {
                      ...localOrder,
                      checklist: {
                        ...localOrder.checklist,
                        inspectionTestPlan: e.target.checked
                      }
                    };
                    setLocalOrder(updatedOrder);
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Plano de Inspeção e Testes</span>
              </label>
              
              <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-100">
                <input
                  type="checkbox"
                  checked={localOrder.checklist?.paintPlan || false}
                  onChange={(e) => {
                    const updatedOrder = {
                      ...localOrder,
                      checklist: {
                        ...localOrder.checklist,
                        paintPlan: e.target.checked
                      }
                    };
                    setLocalOrder(updatedOrder);
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <Package className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium">Plano de Pintura</span>
              </label>
            </div>
          </div>
        </div>

        {/* Lista de Itens */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-900">
              Itens ({localOrder.items.length})
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={toggleAllItems}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {areAllItemsSelected ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
              <button
                onClick={generateSelectedItemsPdf}
                disabled={selectedItems.size === 0}
                className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center space-x-2 ${
                  selectedItems.size === 0 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
                title="Exportar Romaneio dos Itens Selecionados"
              >
                <Download className="h-4 w-4" />
                <span>Exportar Romaneio ({selectedItems.size})</span>
              </button>
              <button
                onClick={generateProgressPdf}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center space-x-2"
                title="Exportar Cronograma de Progresso"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Exportar Cronograma</span>
              </button>
              <button
                onClick={handleAddItem}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Adicionar Item</span>
              </button>
            </div>
          </div>

          {selectedItems.size > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                {selectedItems.size} {selectedItems.size === 1 ? 'item selecionado' : 'itens selecionados'} 
                • Peso total: {selectedItemsWeight.toFixed(2)} kg
              </p>
            </div>
          )}

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    Seleção
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    Nº Item
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                    Código
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[350px]">
                    Descrição
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    Qtd
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    Peso Unit. (kg)
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                    Peso Total (kg)
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Progresso
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {localOrder.items.map((item) => (
                  <React.Fragment key={item.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleItemSelection(item.id)}
                          className="text-gray-600 hover:text-blue-600 transition-colors"
                        >
                          {selectedItems.has(item.id) ? 
                            <CheckSquare className="h-5 w-5" /> : 
                            <Square className="h-5 w-5" />
                          }
                        </button>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <input
                          type="text"
                          value={item.itemNumber || ''}
                          onChange={(e) => handleItemChange(item.id, 'itemNumber', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <input
                          type="text"
                          value={item.code || ''}
                          onChange={(e) => handleItemChange(item.id, 'code', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="Código completo"
                        />
                      </td>
                      <td className="px-3 py-4">
                        <textarea
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                          className="w-full min-w-[320px] px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                          placeholder="Descrição completa do item"
                          rows={2}
                        />
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {/* QUANTIDADE - SOMENTE LEITURA */}
                        <div className="w-full px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-600 cursor-not-allowed">
                          {item.quantity}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {/* PESO UNITÁRIO - SOMENTE LEITURA */}
                        <div className="w-full px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm text-gray-600 cursor-not-allowed">
                          {(item.unitWeight || 0).toFixed(3)}
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {(item.totalWeight || (item.unitWeight * item.quantity)).toFixed(2)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        {/* CONTROLE DE PROGRESSO INTERATIVO */}
                        <div className="flex items-center space-x-2">
                          <div className="flex-1">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={item.overallProgress || 0}
                              onChange={(e) => updateItemProgress(item.id, parseInt(e.target.value))}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                              style={{
                                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${item.overallProgress || 0}%, #e5e7eb ${item.overallProgress || 0}%, #e5e7eb 100%)`
                              }}
                            />
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.overallProgress || 0}
                            onChange={(e) => updateItemProgress(item.id, parseInt(e.target.value) || 0)}
                            className="w-16 px-1 py-1 border border-gray-300 rounded text-sm text-center"
                          />
                          <span className="text-xs text-gray-600">%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                          <div 
                            className={`h-1 rounded-full transition-all duration-300 ${
                              (item.overallProgress || 0) === 100 ? 'bg-green-500' :
                              (item.overallProgress || 0) >= 70 ? 'bg-blue-500' :
                              (item.overallProgress || 0) >= 30 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${item.overallProgress || 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-1">
                          <button
                            onClick={() => alert('Funcionalidade de progresso detalhado em desenvolvimento')}
                            className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-100 rounded transition-colors"
                            title="Atualizar Progresso Detalhado"
                          >
                            <BarChart className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => alert('Funcionalidade de edição detalhada em desenvolvimento')}
                            className="text-yellow-600 hover:text-yellow-900 p-1 hover:bg-yellow-100 rounded transition-colors"
                            title="Editar Item"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-600 hover:text-red-900 p-1 hover:bg-red-100 rounded transition-colors"
                            title="Remover Item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Linha expandida para expedição quando progresso = 100% */}
                    {item.progress && item.progress['Expedição'] === 100 && (
                      <tr className="bg-green-50">
                        <td colSpan={9} className="px-3 py-3">
                          <div className="flex flex-wrap gap-4 items-center">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                LE (Lista de Embarque)
                              </label>
                              <input
                                type="text"
                                value={item.expeditionLE || ''}
                                onChange={e => handleItemChange(item.id, 'expeditionLE', e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="Número da LE"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                NF (Nota Fiscal)
                              </label>
                              <input
                                type="text"
                                value={item.invoiceNumber || ''}
                                onChange={e => handleItemChange(item.id, 'invoiceNumber', e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="Número da NF"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Data de Entrega
                              </label>
                              <input
                                type="date"
                                value={item.expeditionDate || ''}
                                onChange={e => handleItemChange(item.id, 'expeditionDate', e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {localOrder.items.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Nenhum item encontrado</p>
              <p className="text-sm">Adicione itens a este pedido para começar.</p>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <strong>Total:</strong> {localOrder.items.length} {localOrder.items.length === 1 ? 'item' : 'itens'} • 
            <strong> Peso:</strong> {totalWeight.toFixed(2)} kg •
            <strong> Progresso Geral:</strong> {localOrder.overallProgress || 0}%
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Salvar Alterações
            </button>
          </div>
        </div>

        {/* Estilos CSS para o slider */}
        <style jsx>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }

          input[type="range"]::-moz-range-thumb {
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
        `}</style>
      </div>
    </div>
  );
};

export default OrderItemsList;
