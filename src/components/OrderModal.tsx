import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Trash2, Calendar, User, FileText, Package, Edit3, BarChart3, ExternalLink, Folder, Upload, Download, Eye, Search, Filter, SortAsc, SortDesc, Copy, RefreshCw, AlertCircle, CheckCircle, Printer } from 'lucide-react';
import { useOrderStore } from '../store/orderStore';
import { useCustomerStore } from '../store/customerStore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Definição de tipo interna para OrderItem
interface OrderItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  weight: number;
  progress: number;
  overallProgress?: number;
  stagePlanning?: Record<string, any>;
  itemNumber?: number;
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDays?: number;
  startDate?: string;
  endDate?: string;
  responsible?: string;
}

// Definição de tipo interna para OrderStatus
type OrderStatus = 'in-progress' | 'completed' | 'on-hold' | 'cancelled' | string;

// Definição de tipo interna para Order
interface Order {
  id?: string;
  customerId?: string;
  customerName?: string;
  project?: string;
  orderNumber?: string;
  internalOS?: string;
  startDate?: string;
  deliveryDate?: string;
  completionDate?: string;
  status?: OrderStatus;
  observations?: string;
  items?: OrderItem[];
  googleDriveLink?: string;
  value?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  [key: string]: any;
}

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order | null;
  mode: 'create' | 'edit' | 'view';
}

// Ícone Camera customizado
const Camera = (props: any) => {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
};

// Componente ItemModal
interface ItemModalProps {
  item?: OrderItem | null;
  onSave: (item: OrderItem) => void;
  onClose: () => void;
}

const ItemModal: React.FC<ItemModalProps> = ({ item, onSave, onClose }) => {
  const [formData, setFormData] = useState<OrderItem>({
    id: item?.id || Date.now().toString(),
    code: item?.code || '',
    description: item?.description || '',
    quantity: item?.quantity || 1,
    unit: item?.unit || 'un',
    weight: item?.weight || 0,
    progress: item?.progress || 0,
    overallProgress: item?.overallProgress || 0,
    itemNumber: item?.itemNumber || 1,
    notes: item?.notes || '',
    priority: item?.priority || 'medium',
    estimatedDays: item?.estimatedDays || 1,
    startDate: item?.startDate || '',
    endDate: item?.endDate || '',
    responsible: item?.responsible || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-blue-600 text-white">
          <h3 className="text-lg font-semibold">
            {item ? 'Editar Item' : 'Novo Item'}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({...prev, code: e.target.value}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: 70133F173001-02"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantidade *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({...prev, quantity: parseFloat(e.target.value) || 1}))}
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0.01"
                  step="0.01"
                  required
                />
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData(prev => ({...prev, unit: e.target.value}))}
                  className="p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="un">un</option>
                  <option value="kg">kg</option>
                  <option value="m">m</option>
                  <option value="m2">m²</option>
                  <option value="m3">m³</option>
                  <option value="L">L</option>
                  <option value="pc">pç</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição *
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: Longarina de alimentação"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Peso (kg) *
              </label>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData(prev => ({...prev, weight: parseFloat(e.target.value) || 0}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                step="0.01"
                min="0"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prioridade
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({...prev, priority: e.target.value as any}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dias Estimados
              </label>
              <input
                type="number"
                value={formData.estimatedDays}
                onChange={(e) => setFormData(prev => ({...prev, estimatedDays: parseFloat(e.target.value) || 1}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                step="0.5"
                min="0.1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsável
              </label>
              <input
                type="text"
                value={formData.responsible}
                onChange={(e) => setFormData(prev => ({...prev, responsible: e.target.value}))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nome do responsável"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
              placeholder="Observações sobre o item..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {item ? 'Atualizar' : 'Adicionar'} Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Componente ItemProgressModal e RomaneioModal: não precisam de alteração, copie do seu código original

// ... (copiar ItemProgressModal e RomaneioModal do seu arquivo original aqui) ...

export default function OrderModal({ isOpen, onClose, order, mode }: OrderModalProps) {
  const { addOrder, updateOrder, loading } = useOrderStore();
  const { customers, loadCustomers } = useCustomerStore();
  
  const [formData, setFormData] = useState<Order>({
    customerId: '',
    customerName: '',
    project: '',
    orderNumber: '',
    internalOS: '',
    startDate: '',
    deliveryDate: '',
    completionDate: '',
    status: 'in-progress',
    observations: '',
    items: [] as OrderItem[],
    googleDriveLink: '',
    value: 0,
    priority: 'medium'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'documents'>('details');
  const [itemsFilter, setItemsFilter] = useState('');
  const [itemsSortField, setItemsSortField] = useState<'itemNumber' | 'code' | 'description' | 'progress'>('itemNumber');
  const [itemsSortOrder, setItemsSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressItem, setProgressItem] = useState<OrderItem | null>(null);
  const [showRomaneioModal, setShowRomaneioModal] = useState(false);

  // Log para monitorar mudanças no formData
  useEffect(() => {
    console.log("FormData changed - items with weights:", formData.items?.map(item => ({
      code: item.code,
      weight: item.weight,
      type: typeof item.weight
    })));
  }, [formData.items]);

  useEffect(() => {
    if (isOpen) {
      try {
        loadCustomers();
      } catch (error) {
        console.error("Error loading customers:", error);
      }
    }
  }, [isOpen, loadCustomers]);

  useEffect(() => {
    if (mode === 'edit' && order) {
      const formatDateField = (dateString: string | undefined | null) => {
        if (!dateString) return '';
        try {
          return format(new Date(dateString), 'yyyy-MM-dd');
        } catch (error) {
          console.error("Error formatting date:", dateString, error);
          return '';
        }
      };

      const processedItems = Array.isArray(order.items)
        ? order.items.map((item, index) => {
            let itemWeight = 0;
            if (typeof item.weight === 'number') {
              itemWeight = item.weight;
            } else if (typeof item.weight === 'string') {
              const parsedWeight = parseFloat(item.weight.replace(',', '.').trim());
              itemWeight = isNaN(parsedWeight) ? 0 : parsedWeight;
            } else if (item.weight == null) {
              itemWeight = 0;
            }

            let itemQuantity = 1;
            if (typeof item.quantity === 'number') {
              itemQuantity = item.quantity;
            } else if (typeof item.quantity === 'string') {
              const parsedQuantity = parseFloat(item.quantity.replace(',', '.').trim());
              itemQuantity = isNaN(parsedQuantity) ? 1 : parsedQuantity;
            } else if (item.quantity == null) {
              itemQuantity = 1;
            }

            let itemProgress = 0;
            if (typeof item.progress === 'number') {
              itemProgress = item.progress;
            } else if (typeof item.overallProgress === 'number') {
              itemProgress = item.overallProgress;
            }

            return {
              id: item.id || `item-${index}`,
              code: item.code || '',
              description: item.description || '',
              quantity: itemQuantity,
              unit: item.unit || 'un',
              weight: itemWeight,
              progress: itemProgress,
              overallProgress: typeof item.overallProgress === 'number' ? item.overallProgress : itemProgress,
              itemNumber: item.itemNumber || (index + 1),
              notes: item.notes || '',
              priority: item.priority || 'medium',
              estimatedDays: typeof item.estimatedDays === 'number'
                ? item.estimatedDays
                : 1,
              startDate: item.startDate || '',
              endDate: item.endDate || '',
              responsible: item.responsible || '',
              stagePlanning: item.stagePlanning || {}
            };
          })
        : [];

      setFormData({
        customerId: order.customerId || '',
        customerName: order.customerName || order.customer || '',
        project: order.project || order.projectName || '',
        orderNumber: order.orderNumber || '',
        internalOS: order.internalOS || order.internalOrderNumber || order.serviceOrder || '',
        startDate: formatDateField(order.startDate),
        deliveryDate: formatDateField(order.deliveryDate),
        completionDate: formatDateField(order.completionDate),
        status: order.status || 'in-progress',
        observations: order.observations || order.notes || '',
        items: processedItems,
        googleDriveLink: order.googleDriveLink || '',
        value: order.value || 0,
        priority: order.priority || 'medium'
      });
    } else if (mode === 'create') {
      setFormData({
        customerId: '',
        customerName: '',
        project: '',
        orderNumber: '',
        internalOS: '',
        startDate: '',
        deliveryDate: '',
        completionDate: '',
        status: 'in-progress',
        observations: '',
        items: [],
        googleDriveLink: '',
        value: 0,
        priority: 'medium'
      });
    }
  }, [mode, order, isOpen, customers]);

  // ...restante do componente permanece igual ao seu código original (funções, JSX, etc)
  // Por motivos de espaço, mantenha todo o restante do seu componente igual ao original.
}
// Componente ItemProgressModal
const ItemProgressModal: React.FC<{
  item: OrderItem;
  allItems: OrderItem[];
  onSave: (item: OrderItem) => void;
  onClose: () => void;
}> = ({ item, allItems, onSave, onClose }) => {
  const [progress, setProgress] = useState(item.overallProgress || 0);

  const handleSave = () => {
    const updatedItem = {
      ...item,
      overallProgress: progress,
      progress: progress // Para compatibilidade
    };
    onSave(updatedItem);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Atualizar Progresso</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h4 className="font-medium text-gray-900">Item: {item.code}</h4>
            <p className="text-sm text-gray-600">{item.description}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Progresso Geral: {progress}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                progress >= 100 ? 'bg-green-500' :
                progress >= 75 ? 'bg-blue-500' :
                progress >= 50 ? 'bg-yellow-500' :
                progress >= 25 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700">
              💡 <strong>Dica:</strong> Use o sistema completo de gestão de progresso 
              para controlar etapas detalhadas de fabricação. Este é apenas um controle básico.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Atualizar Progresso
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente RomaneioModal
const RomaneioModal: React.FC<{
  items: OrderItem[];
  customerName: string;
  project: string;
  orderNumber: string;
  onClose: () => void;
}> = ({ items, customerName, project, orderNumber, onClose }) => {
  
  const [romaneioData, setRomaneioData] = useState({
    romaneioNumber: generateRomaneioNumber(),
    date: format(new Date(), 'yyyy-MM-dd'),
    deliveryLocation: '',
    transportCompany: '',
    contactName: '',
    contactPhone: '',
    notes: ''
  });

  // Função para gerar número de romaneio (ex: ROM-20250608-001)
  function generateRomaneioNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    return `ROM-${year}${month}${day}-${random}`;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRomaneioData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  // Calcular peso total
  const totalWeight = items.reduce((sum, item) => {
    return sum + (item.weight * item.quantity);
  }, 0);

  // Calcular quantidade total
  const totalQuantity = items.reduce((sum, item) => {
    return sum + item.quantity;
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Gerar Romaneio de Entrega</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg print:hidden">
            <p className="text-sm text-blue-700">
              <AlertCircle className="inline-block w-4 h-4 mr-1" />
              Preencha as informações abaixo e clique em "Imprimir Romaneio" para gerar o documento.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Número do Romaneio
              </label>
              <input
                name="romaneioNumber"
                type="text"
                value={romaneioData.romaneioNumber}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data de Entrega
              </label>
              <input
                name="date"
                type="date"
                value={romaneioData.date}
                onChange={handleChange}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Local de Entrega
              </label>
              <input
                name="deliveryLocation"
                type="text"
                value={romaneioData.deliveryLocation}
                onChange={handleChange}
                placeholder="Endereço completo de entrega"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transportadora
              </label>
              <input
                name="transportCompany"
                type="text"
                value={romaneioData.transportCompany}
                onChange={handleChange}
                placeholder="Nome da transportadora"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome do Contato
              </label>
              <input
                name="contactName"
                type="text"
                value={romaneioData.contactName}
                onChange={handleChange}
                placeholder="Nome de quem receberá a entrega"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Telefone de Contato
              </label>
              <input
                name="contactPhone"
                type="text"
                value={romaneioData.contactPhone}
                onChange={handleChange}
                placeholder="(00) 00000-0000"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="print:hidden">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações
            </label>
            <textarea
              name="notes"
              value={romaneioData.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Informações adicionais para o romaneio..."
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Parte visível na impressão */}
          <div className="print:block hidden">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold mb-1">ROMANEIO DE ENTREGA</h1>
              <p className="text-lg">{romaneioData.romaneioNumber}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <p><strong>Cliente:</strong> {customerName}</p>
                <p><strong>Projeto:</strong> {project}</p>
                <p><strong>Número do Pedido:</strong> {orderNumber}</p>
              </div>
              <div>
                <p><strong>Data:</strong> {format(new Date(romaneioData.date), 'dd/MM/yyyy')}</p>
                <p><strong>Local de Entrega:</strong> {romaneioData.deliveryLocation}</p>
                <p><strong>Transportadora:</strong> {romaneioData.transportCompany}</p>
              </div>
            </div>
          </div>

          {/* Tabela de itens (visível tanto na tela quanto na impressão) */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 print:bg-gray-200">
                  <th className="border p-2 text-left">Item</th>
                  <th className="border p-2 text-left">Código</th>
                  <th className="border p-2 text-left">Descrição</th>
                  <th className="border p-2 text-right">Qtde</th>
                  <th className="border p-2 text-left">Un</th>
                  <th className="border p-2 text-right">Peso Unit. (kg)</th>
                  <th className="border p-2 text-right">Peso Total (kg)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border p-2">{item.itemNumber || index + 1}</td>
                    <td className="border p-2">{item.code}</td>
                    <td className="border p-2">{item.description}</td>
                    <td className="border p-2 text-right">{item.quantity.toLocaleString('pt-BR')}</td>
                    <td className="border p-2">{item.unit}</td>
                    <td className="border p-2 text-right">{item.weight.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td className="border p-2 text-right">{(item.weight * item.quantity).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-medium print:bg-gray-200">
                  <td colSpan={3} className="border p-2 text-right">Total</td>
                  <td className="border p-2 text-right">{totalQuantity.toLocaleString('pt-BR')}</td>
                  <td className="border p-2"></td>
                  <td className="border p-2"></td>
                  <td className="border p-2 text-right">{totalWeight.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Observações na impressão */}
          <div className="print:block hidden mt-8">
            {romaneioData.notes && (
              <div>
                <h3 className="font-bold mb-2">Observações</h3>
                <p className="whitespace-pre-wrap">{romaneioData.notes}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-8 mt-12">
              <div className="text-center">
                <div className="border-t border-black pt-1">
                  <p>Expedição</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-black pt-1">
                  <p>Recebimento</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimir Romaneio
          </button>
        </div>
      </div>
    </div>
  );
};

export default function OrderModal({ isOpen, onClose, order, mode }: OrderModalProps) {
  // ... trecho existente (definição de estados e efeitos) ...

  // Calculando estatísticas para exibição
  const orderStats = useMemo(() => {
    if (!formData.items?.length) return {
      totalItems: 0,
      totalWeight: 0,
      avgProgress: 0,
      pendingItems: 0,
      completedItems: 0
    };

    const totalItems = formData.items.length;
    const totalWeight = formData.items.reduce((sum, item) => 
      sum + (item.weight * item.quantity), 0);
    
    const progressSum = formData.items.reduce((sum, item) => sum + (item.overallProgress || item.progress || 0), 0);
    const avgProgress = totalItems > 0 ? Math.round(progressSum / totalItems) : 0;
    
    const completedItems = formData.items.filter(item => (item.overallProgress || item.progress || 0) >= 100).length;
    const pendingItems = totalItems - completedItems;

    return {
      totalItems,
      totalWeight,
      avgProgress,
      pendingItems,
      completedItems
    };
  }, [formData.items]);

  // Função para validar o formulário
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.customerName && !formData.customerId) {
      newErrors.customer = 'Selecione um cliente';
    }
    
    if (!formData.project) {
      newErrors.project = 'Informe o nome do projeto';
    }
    
    if (!formData.orderNumber) {
      newErrors.orderNumber = 'Informe o número do pedido';
    }
    
    if (!formData.items?.length) {
      newErrors.items = 'Adicione pelo menos um item ao pedido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Gerenciar itens
  const handleAddItem = (item: OrderItem) => {
    setFormData(prev => ({
      ...prev,
      items: [...(prev.items || []), {
        ...item,
        itemNumber: (prev.items?.length || 0) + 1
      }]
    }));
    setShowItemModal(false);
    setEditingItem(null);
  };

  const handleEditItem = (item: OrderItem) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(i => i.id === item.id ? item : i) || []
    }));
    setShowItemModal(false);
    setEditingItem(null);
  };

  const handleUpdateItemProgress = (updatedItem: OrderItem) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items?.map(i => i.id === updatedItem.id ? updatedItem : i) || []
    }));
    setShowProgressModal(false);
    setProgressItem(null);
  };

  const handleRemoveSelectedItems = () => {
    if (!selectedItems.length) return;
    
    setFormData(prev => ({
      ...prev,
      items: prev.items?.filter(item => !selectedItems.includes(item.id)) || []
    }));
    setSelectedItems([]);
  };

  // Filtro e ordenação de itens
  const filteredAndSortedItems = useMemo(() => {
    if (!formData.items?.length) return [];
    
    let items = [...formData.items];
    
    // Filtrar por termo de pesquisa
    if (itemsFilter) {
      const searchTerm = itemsFilter.toLowerCase();
      items = items.filter(item => 
        item.code.toLowerCase().includes(searchTerm) || 
        item.description.toLowerCase().includes(searchTerm)
      );
    }
    
    // Ordenar
    items.sort((a, b) => {
      const aValue = a[itemsSortField] || '';
      const bValue = b[itemsSortField] || '';
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return itemsSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return itemsSortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return 0;
    });
    
    return items;
  }, [formData.items, itemsFilter, itemsSortField, itemsSortOrder]);

  // Salvar pedido
  const handleSave = async () => {
    if (!validateForm()) return;
    
    try {
      // Limpar o ID no modo create para garantir que seja um novo registro
      const orderData = mode === 'create' 
        ? { ...formData, id: undefined } 
        : { ...formData, id: order?.id };
      
      if (mode === 'create') {
        await addOrder(orderData);
      } else if (mode === 'edit') {
        await updateOrder(orderData);
      }
      
      onClose();
    } catch (error) {
      console.error("Error saving order:", error);
      alert('Erro ao salvar o pedido. Por favor, tente novamente.');
    }
  };

  // Verificar se o modal deve ser exibido
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity" onClick={mode !== 'view' ? undefined : onClose} />

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle w-full max-w-7xl">
          <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-200 bg-blue-600 text-white">
            <h3 className="text-lg sm:text-xl font-semibold">
              {mode === 'create' ? 'Novo Pedido' : 
               mode === 'edit' ? 'Editar Pedido' : 
               'Visualizar Pedido'}
            </h3>
            <div className="flex space-x-2">
              {mode === 'view' && (
                <button
                  className="bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-800 transition-colors flex items-center gap-1"
                  onClick={() => {/* Adicione aqui lógica para editar, se necessário */}}
                >
                  <Edit3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Editar</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="bg-blue-700 text-white p-2 rounded-lg hover:bg-blue-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-white">
            {/* Tabs de navegação */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-6 px-4 sm:px-6">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'details'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Detalhes do Pedido
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('items')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'items'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Itens {formData.items?.length ? `(${formData.items.length})` : ''}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'documents'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Documentos
                  </span>
                </button>
              </nav>
            </div>

            {/* Conteúdo da aba ativa */}
            <div className="p-4 sm:p-6 max-h-[70vh] overflow-y-auto">
              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cliente *
                      </label>
                      <select
                        value={formData.customerId || ''}
                        onChange={(e) => {
                          const selectedCustomer = customers.find(c => c.id === e.target.value);
                          setFormData(prev => ({
                            ...prev, 
                            customerId: e.target.value,
                            customerName: selectedCustomer?.name || ''
                          }));
                        }}
                        disabled={mode === 'view'}
                        className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        } ${errors.customer ? 'border-red-500' : ''}`}
                      >
                        <option value="">Selecione um cliente</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                      {errors.customer && (
                        <p className="mt-1 text-sm text-red-500">{errors.customer}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Nome do Projeto *
                      </label>
                      <input
                        type="text"
                        value={formData.project || ''}
                        onChange={(e) => setFormData(prev => ({...prev, project: e.target.value}))}
                        disabled={mode === 'view'}
                        className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        } ${errors.project ? 'border-red-500' : ''}`}
                        placeholder="Nome do projeto ou obra"
                      />
                      {errors.project && (
                        <p className="mt-1 text-sm text-red-500">{errors.project}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Número do Pedido *
                      </label>
                      <input
                        type="text"
                        value={formData.orderNumber || ''}
                        onChange={(e) => setFormData(prev => ({...prev, orderNumber: e.target.value}))}
                        disabled={mode === 'view'}
                        className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        } ${errors.orderNumber ? 'border-red-500' : ''}`}
                        placeholder="Número do pedido ou proposta"
                      />
                      {errors.orderNumber && (
                        <p className="mt-1 text-sm text-red-500">{errors.orderNumber}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        OS Interna
                      </label>
                      <input
                        type="text"
                        value={formData.internalOS || ''}
                        onChange={(e) => setFormData(prev => ({...prev, internalOS: e.target.value}))}
                        disabled={mode === 'view'}
                        className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        }`}
                        placeholder="Número da OS interna"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data de Início
                      </label>
                      <input
                        type="date"
                        value={formData.startDate || ''}
                        onChange={(e) => setFormData(prev => ({...prev, startDate: e.target.value}))}
                        disabled={mode === 'view'}
                        className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data de Entrega
                      </label>
                      <input
                        type="date"
                        value={formData.deliveryDate || ''}
                        onChange={(e) => setFormData(prev => ({...prev, deliveryDate: e.target.value}))}
                        disabled={mode === 'view'}
                        className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Status do Pedido
                      </label>
                      <select
                        value={formData.status || 'in-progress'}
                        onChange={(e) => setFormData(prev => ({...prev, status: e.target.value}))}
                        disabled={mode === 'view'}
                        className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        }`}
                      >
                        <option value="in-progress">Em Andamento</option>
                        <option value="completed">Concluído</option>
                        <option value="on-hold">Em Espera</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observações
                    </label>
                    <textarea
                      value={formData.observations || ''}
                      onChange={(e) => setFormData(prev => ({...prev, observations: e.target.value}))}
                      disabled={mode === 'view'}
                      rows={4}
                      className={`w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-colors ${
                        mode === 'view' ? 'bg-gray-100' : ''
                      }`}
                      placeholder="Informações adicionais sobre o pedido..."
                    />
                  </div>

                  {/* Estatísticas do pedido */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">Resumo do Pedido</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Total de Itens</p>
                        <p className="text-lg font-semibold">{orderStats.totalItems}</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Peso Total</p>
                        <p className="text-lg font-semibold">{orderStats.totalWeight.toLocaleString('pt-BR', {minimumFractionDigits: 2})} kg</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Progresso Médio</p>
                        <p className="text-lg font-semibold">{orderStats.avgProgress}%</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Itens Pendentes</p>
                        <p className="text-lg font-semibold">{orderStats.pendingItems}</p>
                      </div>
                      <div className="bg-white p-3 rounded border border-gray-200">
                        <p className="text-xs text-gray-500">Itens Concluídos</p>
                        <p className="text-lg font-semibold">{orderStats.completedItems}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'items' && (
                <div className="space-y-4">
                  {errors.items && (
                    <p className="text-sm text-red-500">{errors.items}</p>
                  )}
                  
                  <div className="flex flex-wrap gap-3 mb-4">
                    {mode !== 'view' && (
                      <>
                        <button
                          onClick={() => {
                            setEditingItem(null);
                            setShowItemModal(true);
                          }}
                          className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Adicionar Item
                        </button>

                        {selectedItems.length > 0 && (
                          <button
                            onClick={handleRemoveSelectedItems}
                            className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remover Selecionados
                          </button>
                        )}
                      </>
                    )}

                    <button
                      onClick={() => setShowRomaneioModal(true)}
                      disabled={!formData.items?.length}
                      className={`flex items-center gap-1 px-4 py-2 rounded-lg 
                        ${formData.items?.length 
                          ? 'bg-green-600 text-white hover:bg-green-700' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'} 
                        transition-colors`}
                    >
                      <Printer className="w-4 h-4" />
                      Gerar Romaneio
                    </button>
                  </div>

                  {/* Filtro e ordenação */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-grow max-w-md">
                      <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Filtrar itens..."
                        value={itemsFilter}
                        onChange={(e) => setItemsFilter(e.target.value)}
                        className="pl-9 p-2 border border-gray-300 rounded-lg w-full"
                      />
                    </div>

                    <div className="flex items-center">
                      <label className="text-sm mr-2">Ordenar por:</label>
                      <select
                        value={itemsSortField}
                        onChange={(e) => setItemsSortField(e.target.value as any)}
                        className="p-2 border border-gray-300 rounded-lg"
                      >
                        <option value="itemNumber">N° Item</option>
                        <option value="code">Código</option>
                        <option value="description">Descrição</option>
                        <option value="progress">Progresso</option>
                      </select>
                    </div>
                    
                    <button
                      onClick={() => setItemsSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="p-2 border border-gray-300 rounded-lg"
                    >
                      {itemsSortOrder === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Tabela de itens */}
                  {formData.items && formData.items.length > 0 ? (
                    <div className="overflow-x-auto mt-4">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                          <tr>
                            {mode !== 'view' && (
                              <th scope="col" className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                <input
                                  type="checkbox"
                                  checked={selectedItems.length === filteredAndSortedItems.length && filteredAndSortedItems.length > 0}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedItems(filteredAndSortedItems.map(item => item.id));
                                    } else {
                                      setSelectedItems([]);
                                    }
                                  }}
                                  className="h-4 w-4 text-blue-600 rounded"
                                />
                              </th>
                            )}
                            <th scope="col" className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Item
                            </th>
                            <th scope="col" className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Código
                            </th>
                            <th scope="col" className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Descrição
                            </th>
                            <th scope="col" className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Qtde
                            </th>
                            <th scope="col" className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Peso
                            </th>
                            <th scope="col" className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Progresso
                            </th>
                            <th scope="col" className="p-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredAndSortedItems.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50">
                              {mode !== 'view' && (
                                <td className="p-4 whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={selectedItems.includes(item.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedItems(prev => [...prev, item.id]);
                                      } else {
                                        setSelectedItems(prev => prev.filter(id => id !== item.id));
                                      }
                                    }}
                                    className="h-4 w-4 text-blue-600 rounded"
                                  />
                                </td>
                              )}
                              <td className="p-4 whitespace-nowrap">
                                {item.itemNumber}
                              </td>
                              <td className="p-4">
                                <span className="font-mono text-sm">{item.code}</span>
                              </td>
                              <td className="p-4">
                                <div className="text-sm font-medium text-gray-900">{item.description}</div>
                                {item.notes && (
                                  <div className="text-xs text-gray-500 mt-1">{item.notes}</div>
                                )}
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <div className="text-sm">{item.quantity} {item.unit}</div>
                              </td>
                              <td className="p-4 whitespace-nowrap">
                                <div className="text-sm">{item.weight.toLocaleString('pt-BR', {minimumFractionDigits: 2})} kg</div>
                                <div className="text-xs text-gray-500">Total: {(item.weight * item.quantity).toLocaleString('pt-BR', {minimumFractionDigits: 2})} kg</div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center">
                                  <div className="mr-2 text-sm font-medium">
                                    {item.overallProgress || item.progress || 0}%
                                  </div>
                                  <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full ${
                                        (item.overallProgress || item.progress || 0) >= 100 
                                          ? 'bg-green-500' 
                                          : (item.overallProgress || item.progress || 0) >= 50 
                                            ? 'bg-blue-500' 
                                            : 'bg-yellow-500'
                                      }`}
                                      style={{ width: `${item.overallProgress || item.progress || 0}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="p-4 whitespace-nowrap text-right">
                                <div className="flex justify-end space-x-2">
                                  <button
                                    onClick={() => {
                                      setProgressItem(item);
                                      setShowProgressModal(true);
                                    }}
                                    className="text-blue-600 hover:text-blue-800"
                                    title="Atualizar Progresso"
                                  >
                                    <BarChart3 className="w-5 h-5" />
                                  </button>
                                  
                                  {mode !== 'view' && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setEditingItem(item);
                                          setShowItemModal(true);
                                        }}
                                        className="text-blue-600 hover:text-blue-800"
                                        title="Editar Item"
                                      >
                                        <Edit3 className="w-5 h-5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setFormData(prev => ({
                                            ...prev,
                                            items: prev.items?.filter(i => i.id !== item.id) || []
                                          }));
                                        }}
                                        className="text-red-600 hover:text-red-800"
                                        title="Remover Item"
                                      >
                                        <Trash2 className="w-5 h-5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-lg">
                      <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-500">Nenhum item adicionado ao pedido</p>
                      {mode !== 'view' && (
                        <button
                          onClick={() => {
                            setEditingItem(null);
                            setShowItemModal(true);
                          }}
                          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Adicionar primeiro item
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Link para pasta do Google Drive
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.googleDriveLink || ''}
                        onChange={(e) => setFormData(prev => ({...prev, googleDriveLink: e.target.value}))}
                        disabled={mode === 'view'}
                        className={`flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          mode === 'view' ? 'bg-gray-100' : ''
                        }`}
                        placeholder="https://drive.google.com/drive/folders/..."
                      />
                      {formData.googleDriveLink && (
                        <a 
                          href={formData.googleDriveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Abrir
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-6 rounded-lg text-center">
                    <Folder className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h4 className="text-lg font-medium text-gray-900">Gestão de Arquivos</h4>
                    <p className="text-gray-500 mb-4">
                      Os arquivos são gerenciados através do Google Drive para melhor integração e compartilhamento.
                    </p>
                    {formData.googleDriveLink ? (
                      <a 
                        href={formData.googleDriveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                      >
                        <Folder className="w-4 h-4" />
                        Abrir pasta do projeto
                      </a>
                    ) : (
                      <button
                        onClick={() => setFormData(prev => ({...prev, googleDriveLink: `https://drive.google.com/drive/folders/new?name=${encodeURIComponent(formData.project || 'Novo Projeto')}`}))}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
                        disabled={mode === 'view'}
                      >
                        <Folder className="w-4 h-4" />
                        Criar pasta no Drive
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal footer */}
          <div className="flex justify-end gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {mode === 'view' ? 'Fechar' : 'Cancelar'}
            </button>
            {mode !== 'view' && (
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {mode === 'create' ? 'Criar Pedido' : 'Atualizar Pedido'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Item */}
      {showItemModal && (
        <ItemModal 
          item={editingItem} 
          onSave={editingItem ? handleEditItem : handleAddItem} 
          onClose={() => {
            setShowItemModal(false);
            setEditingItem(null);
          }} 
        />
      )}

      {/* Modal de Progresso */}
      {showProgressModal && progressItem && (
        <ItemProgressModal 
          item={progressItem} 
          allItems={formData.items || []}
          onSave={handleUpdateItemProgress} 
          onClose={() => {
            setShowProgressModal(false);
            setProgressItem(null);
          }} 
        />
      )}

      {/* Modal de Romaneio */}
      {showRomaneioModal && (
        <RomaneioModal
          items={formData.items || []} 
          customerName={formData.customerName || ''}
          project={formData.project || ''}
          orderNumber={formData.orderNumber || ''}
          onClose={() => setShowRomaneioModal(false)}
        />
      )}
    </div>
  );
}
