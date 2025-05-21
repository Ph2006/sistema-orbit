import React, { useState, useEffect } from 'react';
import { Search, Printer, ThumbsUp, Calendar, Download, ImageIcon } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order } from '../types/kanban';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSettingsStore } from '../store/settingsStore';
import LogoUploadModal from './LogoUploadModal';

interface OrdersListProps {
  orders: Order[];
  onSelectOrders: (orderIds: string[]) => void;
}

const OrdersList: React.FC<OrdersListProps> = ({ orders, onSelectOrders }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const { companyLogo } = useSettingsStore();
  
  useEffect(() => {
    // Filter orders based on search term
    const filtered = orders.filter(order => {
      const lowerSearchTerm = searchTerm.toLowerCase();
      return (
        order.orderNumber.toLowerCase().includes(lowerSearchTerm) ||
        order.customer.toLowerCase().includes(lowerSearchTerm) ||
        order.internalOrderNumber.toLowerCase().includes(lowerSearchTerm)
      );
    });
    
    // Sort by most recently exported (showing newest first)
    const sorted = [...filtered].sort((a, b) => {
      const aExportDate = a.lastExportDate ? new Date(a.lastExportDate).getTime() : 0;
      const bExportDate = b.lastExportDate ? new Date(b.lastExportDate).getTime() : 0;
      return bExportDate - aExportDate; // Sort in descending order (newest first)
    });
    
    setFilteredOrders(sorted);
  }, [orders, searchTerm]);
  
  const handleToggleSelect = (orderId: string) => {
    setSelectedOrders(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(orderId)) {
        newSelected.delete(orderId);
      } else {
        newSelected.add(orderId);
      }
      return newSelected;
    });
  };
  
  const handleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      // Unselect all
      setSelectedOrders(new Set());
    } else {
      // Select all
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
    }
  };
  
  const handleSubmitSelection = () => {
    onSelectOrders([...selectedOrders]);
  };

  // This function generates a simple list of selected items PDF
  const handleExportSelectedItems = () => {
    if (selectedOrders.size === 0) {
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
    
    // Get selected orders - use orders instead of filteredOrders to get the latest data
    const selectedOrderObjects = orders.filter(order => selectedOrders.has(order.id));
    
    // Add a summary line
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    if (selectedOrderObjects.length === 1) {
      const order = selectedOrderObjects[0];
      doc.text(`Pedido #${order.orderNumber} - ${order.customer}`, 20, y);
      y += 8;
      doc.text(`OS Interna: ${order.internalOrderNumber}`, 20, y);
      y += 8;
      if (order.projectName) {
        doc.text(`Projeto: ${order.projectName}`, 20, y);
        y += 8;
      }
    } else {
      doc.text(`${selectedOrderObjects.length} pedidos selecionados`, 20, y);
      y += 8;
    }

    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy', { locale: ptBR })}`, 20, y);
    y += 15;
    
    // Create a simple table with all items from selected orders
    const allItems = selectedOrderObjects.flatMap(order => 
      order.items.map(item => ({
        orderNumber: order.orderNumber,
        customer: order.customer,
        ...item
      }))
    );
    
    // Calculate total weight
    const totalWeight = allItems.reduce((sum, item) => sum + item.totalWeight, 0);
    
    // Create the table
    autoTable(doc, {
      startY: y,
      head: [['Pedido', 'Cliente', 'Projeto', 'Item', 'Código', 'Descrição', 'Qtd', 'Peso (kg)']],
      body: allItems.map(item => [
        `#${item.orderNumber}`,
        item.customer,
        selectedOrderObjects.find(order => order.orderNumber === item.orderNumber)?.projectName || '',
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
      foot: [['', '', '', '', '', '', 'Peso Total:', totalWeight.toLocaleString('pt-BR') + ' kg']],
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
    
    doc.save(`lista-itens-selecionados.pdf`);
  };
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Selecione os Pedidos</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsLogoModalOpen(true)}
            className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            <ImageIcon className="h-4 w-4 mr-1" />
            Logo
          </button>
          <button
            onClick={handleExportSelectedItems}
            className="flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            disabled={selectedOrders.size === 0}
          >
            <Download className="h-4 w-4 mr-1" />
            Exportar Selecionados
          </button>
        </div>
      </div>
      
      <div className="flex mb-4 space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por número, cliente ou OS..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleSubmitSelection}
          disabled={selectedOrders.size === 0}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ThumbsUp className="h-5 w-5 inline-block mr-1" />
          Confirmar Seleção ({selectedOrders.size})
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500 mr-2"
                  />
                  Selecionar
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pedido
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                OS
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data Início
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data Entrega
              </th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Nenhum pedido encontrado com os termos de busca atuais.
                </td>
              </tr>
            ) : (
              filteredOrders.map(order => (
                <tr key={order.id} className={selectedOrders.has(order.id) ? 'bg-blue-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedOrders.has(order.id)}
                      onChange={() => handleToggleSelect(order.id)}
                      className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{order.orderNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.customer}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.internalOrderNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(order.id);
                      }}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 ml-1"
                      title="Selecionar"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportSelectedItems();
                      }}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 ml-1"
                      title="Imprimir lista"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Footer with selection count */}
      <div className="mt-4 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {selectedOrders.size} de {filteredOrders.length} pedidos selecionados
        </div>
        <button
          onClick={handleSubmitSelection}
          disabled={selectedOrders.size === 0}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Confirmar Seleção
        </button>
      </div>
      
      {isLogoModalOpen && (
        <LogoUploadModal onClose={() => setIsLogoModalOpen(false)} />
      )}
    </div>
  );
};

export default OrdersList;