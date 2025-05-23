import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const customersCollection = collection(getCompanyCollection(db), 'customers');
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (name === "checklist" && type === "checkbox") {
      const checkbox = e.target as HTMLInputElement;
      const checklistItem = checkbox.dataset.checklistItem as string;
      setFormData({
        ...formData,
        checklist: {
          ...formData.checklist,
          [checklistItem]: checkbox.checked
        }
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleAddItem = () => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}`,
      name: '',
      description: '',
      quantity: 1,
      weight: 0,
      status: 'pending',
      progress: 0,
      checklist: {
        design: false,
        programming: false,
        cutting: false,
        bending: false,
        welding: false,
        painting: false,
        packing: false,
      },
      progressHistory: []
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

  const handleSave = () => {
    // Calcular o peso total somando o peso de todos os itens
    const calculatedTotalWeight = formData.items.reduce((total, item) => {
      return total + (item.weight * item.quantity);
    }, 0);

    const updatedOrder = {
      ...formData,
      totalWeight: calculatedTotalWeight
    };

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
    setFormData({
      ...formData,
      items: formData.items.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      )
    });
    setIsItemProgressModalOpen(false);
  };

  // Gerar PDF com os detalhes da ordem
  const generatePdf = () => {
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
    doc.text("Ordem de Serviço", centerX, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Número: ${formData.orderNumber}`, 10, 40);
    doc.text(`Cliente: ${customers.find(c => c.id === formData.customer)?.name || formData.customer}`, 10, 50);
    doc.text(`Data de início: ${format(new Date(formData.startDate), 'dd/MM/yyyy', { locale: ptBR })}`, 10, 60);
    doc.text(`Data de entrega: ${format(new Date(formData.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}`, 10, 70);
    
    // Tabela de itens
    const tableColumn = ["Item", "Descrição", "Qtd", "Peso (kg)", "Peso Total (kg)", "Status", "Progresso"];
    const tableRows = formData.items.map(item => [
      item.name,
      item.description,
      item.quantity.toString(),
      item.weight.toString(),
      (item.quantity * item.weight).toFixed(2),
      item.status,
      `${item.progress}%`
    ]);
    
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 80,
      headStyles: { fillColor: [41, 128, 185] }
    });
    
    doc.text(`Peso total: ${formData.totalWeight.toFixed(2)} kg`, 10, doc.lastAutoTable.finalY + 10);
    
    // Salvar o PDF
    doc.save(`Ordem_${formData.orderNumber}.pdf`);
    
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
          {/* Seção de informações gerais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block mb-1 text-sm font-medium">Número da Ordem</label>
              <input
                type="text"
                name="orderNumber"
                value={formData.orderNumber}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            
            <div>
              <label className="block mb-1 text-sm font-medium">Número Interno</label>
              <input
                type="text"
                name="internalOrderNumber"
                value={formData.internalOrderNumber}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            
            <div>
              <label className="block mb-1 text-sm font-medium">Data de Início</label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            
            <div>
              <label className="block mb-1 text-sm font-medium">Data de Entrega</label>
              <input
                type="date"
                name="deliveryDate"
                value={formData.deliveryDate}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            
            <div>
              <label className="block mb-1 text-sm font-medium">Cliente</label>
              <select
                name="customer"
                value={formData.customer}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Selecione um cliente</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block mb-1 text-sm font-medium">Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="pending">Pendente</option>
                <option value="in-progress">Em Andamento</option>
                <option value="completed">Concluído</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">Projeto</label>
              <select
                name="projectId"
                value={formData.projectId}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Sem projeto</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  data-checklist-item="drawings"
                  name="checklist"
                  checked={formData.checklist?.drawings || false}
                  onChange={handleChange}
                  className="mr-2"
                />
                <label>Desenhos</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  data-checklist-item="inspectionTestPlan"
                  name="checklist"
                  checked={formData.checklist?.inspectionTestPlan || false}
                  onChange={handleChange}
                  className="mr-2"
                />
                <label>Plano de Inspeção</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  data-checklist-item="paintPlan"
                  name="checklist"
                  checked={formData.checklist?.paintPlan || false}
                  onChange={handleChange}
                  className="mr-2"
                />
                <label>Plano de Pintura</label>
              </div>
            </div>
          </div>
          
          {/* Links do Drive */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium">Links Google Drive</h3>
              <button
                onClick={handleAddLink}
                className="px-2 py-1 bg-blue-500 text-white rounded-md flex items-center text-sm"
              >
                <Plus size={16} className="mr-1" /> Adicionar Link
              </button>
            </div>
            
            {formData.driveLinks.map((link, index) => (
              <div key={index} className="flex items-center mb-2">
                <input
                  type="text"
                  value={link}
                  onChange={(e) => handleLinkChange(index, e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-md mr-2"
                  placeholder="https://drive.google.com/..."
                />
                <button
                  onClick={() => handleRemoveLink(index)}
                  className="p-2 text-red-500 hover:bg-red-100 rounded-md"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          
          {/* Itens da ordem */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium">Itens</h3>
              <div className="flex space-x-2">
                <button
                  onClick={handleAddItem}
                  className="px-2 py-1 bg-blue-500 text-white rounded-md flex items-center text-sm"
                >
                  <Plus size={16} className="mr-1" /> Adicionar Item
                </button>
              </div>
            </div>
            
            {formData.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 border">
                        <div className="flex items-center">
                          <div onClick={toggleAllItems} className="cursor-pointer mr-2">
                            {areAllItemsSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          Item
                        </div>
                      </th>
                      <th className="px-4 py-2 border">Descrição</th>
                      <th className="px-4 py-2 border">Qtd</th>
                      <th className="px-4 py-2 border">Peso (kg)</th>
                      <th className="px-4 py-2 border">Peso Total (kg)</th>
                      <th className="px-4 py-2 border">Status</th>
                      <th className="px-4 py-2 border">Progresso</th>
                      <th className="px-4 py-2 border">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2 border">
                          <div className="flex items-center">
                            <div 
                              onClick={() => toggleItemSelection(item.id)} 
                              className="cursor-pointer mr-2"
                            >
                              {selectedItems.has(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                            </div>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                              className="w-full border-none focus:ring-0"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 border">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            className="w-full border-none focus:ring-0"
                          />
                        </td>
                        <td className="px-4 py-2 border">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                            className="w-20 border-none focus:ring-0"
                            min="1"
                          />
                        </td>
                        <td className="px-4 py-2 border">
                          <input
                            type="number"
                            value={item.weight}
                            onChange={(e) => handleItemChange(item.id, 'weight', Number(e.target.value))}
                            className="w-20 border-none focus:ring-0"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-2 border">
                          {(item.quantity * item.weight).toFixed(2)}
                        </td>
                        <td className="px-4 py-2 border">
                          <select
                            value={item.status}
                            onChange={(e) => handleItemChange(item.id, 'status', e.target.value)}
                            className="w-full border-none focus:ring-0"
                          >
                            <option value="pending">Pendente</option>
                            <option value="in-progress">Em Andamento</option>
                            <option value="completed">Concluído</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 border">
                          <div className="flex items-center">
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                              <div 
                                className="bg-blue-600 h-2.5 rounded-full" 
                                style={{ width: `${calculateProgress(item)}%` }}
                              ></div>
                            </div>
                            <span className="text-xs">{calculateProgress(item)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 border">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openItemProgressModal(item)}
                              className="p-1 text-blue-500 hover:bg-blue-100 rounded"
                              title="Atualizar Progresso"
                            >
                              <BarChart size={18} />
                            </button>
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1 text-red-500 hover:bg-red-100 rounded"
                              title="Remover Item"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="px-4 py-2 text-right font-semibold">
                        Peso Total:
                      </td>
                      <td className="px-4 py-2 font-semibold">
                        {formData.items.reduce((total, item) => total + (item.quantity * item.weight), 0).toFixed(2)} kg
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          
          {/* Barra de ferramentas e botões de link público */}
          <div className="mt-6 flex flex-wrap justify-between items-center">
            <div className="flex space-x-2 mb-2 md:mb-0">
              <button
                onClick={generatePdf}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md flex items-center text-sm"
                title="Exportar PDF"
              >
                <Download size={18} className="mr-1" /> Exportar
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
          onClose={() => setIsItemProgressModalOpen(false)}
          onSave={handleUpdateItemProgress}
        />
      )}
    </div>
  );
};

export default OrderModal;