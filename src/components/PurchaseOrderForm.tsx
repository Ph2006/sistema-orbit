import React, { useState, useEffect } from 'react';
import { X, Save, Download, FileText, Calendar } from 'lucide-react';
import { QuotationRequest } from '../types/materials';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useSettingsStore } from '../store/settingsStore';

// Purchase Order interface
interface PurchaseOrder {
  id: string;
  quotationId: string;
  orderId: string;
  orderNumber: string;
  supplierName: string;
  supplierId: string;
  items: PurchaseOrderItem[];
  purchaseOrderNumber: string;
  issueDate: string;
  expectedDeliveryDate: string;
  status: 'pending' | 'partial' | 'delivered' | 'cancelled';
  notes: string;
  paymentTerms: string;
  deliveryTerms: string;
  totalValue: number;
  createdAt: string;
  updatedAt: string;
}

interface PurchaseOrderItem {
  id: string;
  requisitionItemId: string;
  quotationItemId: string;
  description: string;
  material: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  totalPrice: number;
  deliveryDate: string;
  status: 'pending' | 'delivered' | 'cancelled';
  receivedQuantity?: number;
  receivedDate?: string;
  invoiceNumber?: string;
  notes?: string;
}

interface PurchaseOrderFormProps {
  quotation: QuotationRequest;
  onClose: () => void;
  onSave: (purchaseOrder: PurchaseOrder) => Promise<void>;
}

const PurchaseOrderForm: React.FC<PurchaseOrderFormProps> = ({
  quotation,
  onClose,
  onSave
}) => {
  const { companyLogo, companyName, companyCNPJ } = useSettingsStore();

  const [formData, setFormData] = useState<PurchaseOrder>({
    id: 'new',
    quotationId: quotation.id,
    orderId: '',
    orderNumber: '',
    supplierName: quotation.supplierName,
    supplierId: quotation.supplierId,
    items: quotation.items.map(item => ({
      id: crypto.randomUUID(),
      requisitionItemId: item.requisitionItemId,
      quotationItemId: item.id,
      description: item.description,
      material: item.material,
      quantity: item.quantity,
      unitOfMeasure: 'unid',
      unitPrice: (item.finalPrice || 0) / item.quantity,
      totalPrice: item.finalPrice || 0,
      deliveryDate: addDays(new Date(), item.deliveryTime || 30).toISOString().split('T')[0],
      status: 'pending'
    })),
    purchaseOrderNumber: generatePONumber(),
    issueDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: addDays(new Date(), 30).toISOString().split('T')[0],
    status: 'pending',
    notes: '',
    paymentTerms: '30 dias',
    deliveryTerms: 'FOB',
    totalValue: quotation.items.reduce((sum, item) => sum + (item.finalPrice || 0), 0),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Generate a unique PO number
  function generatePONumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    return `PO-${year}${month}${day}-${random}`;
  }

  // Format currency
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.purchaseOrderNumber || !formData.issueDate || !formData.expectedDeliveryDate) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving purchase order:', error);
      alert('Erro ao salvar pedido de compra.');
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    let y = 20;
    
    // Add logo if available
    if (companyLogo) {
      doc.addImage(companyLogo, 'JPEG', 15, 10, 40, 20);
      y = 40;
    }
    
    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('PEDIDO DE COMPRA', 105, y, {align: 'center'});
    y += 10;
    
    // PO Number
    doc.setFontSize(14);
    doc.text(`Nº: ${formData.purchaseOrderNumber}`, 105, y, {align: 'center'});
    y += 15;
    
    // Company and Supplier information
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('FORNECEDOR:', 15, y);
    doc.text('COMPRADOR:', 115, y);
    y += 7;
    
    doc.setFont(undefined, 'normal');
    doc.text(formData.supplierName, 15, y);
    doc.text(companyName || 'Empresa', 115, y);
    y += 7;
    
    if (companyCNPJ) {
      doc.text(`CNPJ: ${companyCNPJ}`, 115, y);
      y += 7;
    }
    
    // Date information
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('INFORMAÇÕES:', 15, y);
    y += 7;
    
    doc.setFont(undefined, 'normal');
    doc.text(`Data de Emissão: ${format(new Date(formData.issueDate), 'dd/MM/yyyy', { locale: ptBR })}`, 15, y);
    y += 7;
    
    doc.text(`Data Prevista de Entrega: ${format(new Date(formData.expectedDeliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, 15, y);
    y += 7;
    
    doc.text(`Condições de Pagamento: ${formData.paymentTerms}`, 15, y);
    y += 7;
    
    doc.text(`Condições de Entrega: ${formData.deliveryTerms}`, 15, y);
    y += 15;
    
    // Items table
    (doc as any).autoTable({
      startY: y,
      head: [['Item', 'Descrição', 'Material', 'Qtd', 'Unid', 'Preço Unit.', 'Total', 'Data Entrega']],
      body: formData.items.map((item, index) => [
        (index + 1).toString(),
        item.description,
        item.material,
        item.quantity.toString(),
        item.unitOfMeasure,
        formatCurrency(item.unitPrice),
        formatCurrency(item.totalPrice),
        format(new Date(item.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })
      ]),
      foot: [['', '', '', '', '', 'Total:', formatCurrency(formData.totalValue), '']],
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      }
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    // Notes
    if (formData.notes) {
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('OBSERVAÇÕES:', 15, finalY);
      
      doc.setFont(undefined, 'normal');
      const notesText = doc.splitTextToSize(formData.notes, 180);
      doc.text(notesText, 15, finalY + 7);
    }
    
    // Add page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })} - Página ${i} de ${pageCount}`,
        105, 
        285, 
        {align: 'center'}
      );
    }
    
    doc.save(`pedido-compra-${formData.purchaseOrderNumber}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Pedido de Compra</h2>
            <p className="text-gray-600">
              Fornecedor: {formData.supplierName}
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Download className="h-5 w-5 mr-2" />
              Exportar PDF
            </button>
            <button onClick={onClose}>
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número do Pedido de Compra
              </label>
              <input
                type="text"
                value={formData.purchaseOrderNumber}
                onChange={(e) => setFormData({...formData, purchaseOrderNumber: e.target.value})}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Emissão
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => setFormData({...formData, issueDate: e.target.value})}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  required
                />
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Prevista de Entrega
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={formData.expectedDeliveryDate}
                  onChange={(e) => setFormData({...formData, expectedDeliveryDate: e.target.value})}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                  required
                />
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condições de Pagamento
              </label>
              <input
                type="text"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({...formData, paymentTerms: e.target.value})}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                placeholder="Ex: 30 dias"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condições de Entrega
              </label>
              <select
                value={formData.deliveryTerms}
                onChange={(e) => setFormData({...formData, deliveryTerms: e.target.value})}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="FOB">FOB - Frete por conta do cliente</option>
                <option value="CIF">CIF - Frete incluso no preço</option>
                <option value="EXW">EXW - Na fábrica (cliente retira)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              >
                <option value="pending">Pendente</option>
                <option value="partial">Entrega Parcial</option>
                <option value="delivered">Entregue</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
                rows={3}
              />
            </div>
          </div>

          {/* Items section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-blue-600" />
              Itens do Pedido de Compra
            </h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Qtd
                    </th>
                    <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unid.
                    </th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preço Unit.
                    </th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Preço Total
                    </th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data Entrega
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formData.items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {item.description}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {item.material}
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {item.quantity}
                      </td>
                      <td className="px-3 py-2 text-sm text-center">
                        <select
                          value={item.unitOfMeasure}
                          onChange={(e) => {
                            const newItems = [...formData.items];
                            newItems[index] = {
                              ...item,
                              unitOfMeasure: e.target.value
                            };
                            setFormData({...formData, items: newItems});
                          }}
                          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                        >
                          <option value="unid">unid</option>
                          <option value="kg">kg</option>
                          <option value="m">m</option>
                          <option value="m²">m²</option>
                          <option value="m³">m³</option>
                          <option value="pç">pç</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-sm text-right">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-right">
                        {formatCurrency(item.totalPrice)}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <input
                          type="date"
                          value={item.deliveryDate}
                          onChange={(e) => {
                            const newItems = [...formData.items];
                            newItems[index] = {
                              ...item,
                              deliveryDate: e.target.value
                            };
                            setFormData({...formData, items: newItems});
                          }}
                          className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-right">
                      Total:
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatCurrency(formData.totalValue)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <Save className="h-5 w-5 mr-2" />
              Salvar Pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PurchaseOrderForm;