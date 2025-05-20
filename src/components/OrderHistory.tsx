import React, { useState, useEffect } from 'react';
import { X, Clock, Edit, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Order } from '../types/kanban';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuthStore } from '../store/authStore';

interface OrderHistoryEntry {
  id: string;
  orderId: string;
  timestamp: string;
  user: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  action: string;
}

interface StatusHistoryEntry {
  status: string;
  date: string;
  user: string;
}

// Mapeamento de nomes de campo para exibição
const fieldDisplayNames: Record<string, string> = {
  orderNumber: 'Número do Pedido',
  customer: 'Cliente',
  internalOrderNumber: 'OS Interna',
  startDate: 'Data de Início',
  deliveryDate: 'Data de Entrega',
  status: 'Status',
  totalWeight: 'Peso Total',
};

// Mapeamento de valores de status para exibição
const statusDisplayNames: Record<string, string> = {
  'in-progress': 'Em Processo',
  'delayed': 'Atrasado',
  'waiting-docs': 'Aguardando Documentação',
  'completed': 'Concluído',
  'ready': 'Pronto para Embarque',
  'urgent': 'Urgente',
};

interface OrderHistoryProps {
  order: Order;
  onClose: () => void;
}

const OrderHistory: React.FC<OrderHistoryProps> = ({ order, onClose }) => {
  const [historyEntries, setHistoryEntries] = useState<OrderHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    loadOrderHistory();
  }, [order.id]);

  const loadOrderHistory = async () => {
    try {
      setLoading(true);
      
      // Buscar histórico de alterações
      const historyQuery = query(
        collection(db, 'orderHistory'),
        where('orderId', '==', order.id),
        orderBy('timestamp', 'desc')
      );
      
      const snapshot = await getDocs(historyQuery);
      const historyData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as OrderHistoryEntry[];

      setHistoryEntries(historyData);
    } catch (error) {
      console.error('Error loading order history:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpandEntry = (entryId: string) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  const formatValue = (field: string, value: any): string => {
    if (value === null || value === undefined) return 'N/A';
    
    if (field === 'startDate' || field === 'deliveryDate' || field.toLowerCase().includes('date')) {
      try {
        return format(new Date(value), 'dd/MM/yyyy', { locale: ptBR });
      } catch (e) {
        return String(value);
      }
    }
    
    if (field === 'status') {
      return statusDisplayNames[value] || value;
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  };

  // Extrair histórico de status do pedido
  const statusHistory: StatusHistoryEntry[] = order.statusHistory || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">
              Histórico do Pedido #{order.orderNumber}
            </h2>
            <p className="text-gray-600">
              Cliente: {order.customer}
            </p>
          </div>
          <button onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Resumo do pedido */}
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="font-semibold text-lg mb-2 flex items-center">
            <Package className="h-5 w-5 mr-2 text-blue-600" />
            Informações do Pedido
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Data de Início</p>
              <p className="font-medium">{format(new Date(order.startDate), 'dd/MM/yyyy', { locale: ptBR })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Data de Entrega</p>
              <p className="font-medium">{format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">OS Interna</p>
              <p className="font-medium">{order.internalOrderNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status Atual</p>
              <p className={`font-medium ${
                order.status === 'delayed' ? 'text-red-600' :
                order.status === 'completed' ? 'text-green-600' :
                order.status === 'urgent' ? 'text-purple-600' :
                order.status === 'waiting-docs' ? 'text-yellow-600' :
                order.status === 'ready' ? 'text-blue-600' :
                'text-orange-600'
              }`}>
                {statusDisplayNames[order.status] || order.status}
              </p>
            </div>
          </div>
        </div>

        {/* Histórico de status */}
        {statusHistory.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-purple-600" />
              Histórico de Status
            </h3>
            
            <div className="relative pl-8 before:absolute before:left-4 before:top-2 before:border-l-2 before:border-gray-300 before:h-[calc(100%-16px)]">
              {statusHistory.map((entry, index) => (
                <div key={index} className="mb-4 pb-4 relative">
                  {/* Dot */}
                  <div className={`absolute left-[-18px] top-2 h-3 w-3 rounded-full ${
                    entry.status === 'delayed' ? 'bg-red-500' :
                    entry.status === 'completed' ? 'bg-green-500' :
                    entry.status === 'urgent' ? 'bg-purple-500' :
                    entry.status === 'waiting-docs' ? 'bg-yellow-500' :
                    entry.status === 'ready' ? 'bg-blue-500' :
                    'bg-orange-500'
                  }`}></div>
                  
                  <p className="text-sm text-gray-500">
                    {format(new Date(entry.date), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    <span className="ml-2 text-gray-700">{entry.user}</span>
                  </p>
                  
                  <p className={`font-medium ${
                    entry.status === 'delayed' ? 'text-red-600' :
                    entry.status === 'completed' ? 'text-green-600' :
                    entry.status === 'urgent' ? 'text-purple-600' :
                    entry.status === 'waiting-docs' ? 'text-yellow-600' :
                    entry.status === 'ready' ? 'text-blue-600' :
                    'text-orange-600'
                  }`}>
                    {statusDisplayNames[entry.status] || entry.status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Histórico de alterações */}
        <h3 className="font-semibold text-lg mb-4 flex items-center">
          <Edit className="h-5 w-5 mr-2 text-blue-600" />
          Histórico de Alterações
        </h3>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-gray-500">Carregando histórico...</div>
          </div>
        ) : historyEntries.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-6 text-center">
            <p className="text-gray-500">Nenhum registro de alteração encontrado para este pedido.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {historyEntries.map(entry => (
              <div key={entry.id} className="border rounded-lg overflow-hidden">
                <div 
                  className="bg-gray-50 p-4 cursor-pointer flex justify-between items-center"
                  onClick={() => toggleExpandEntry(entry.id)}
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {entry.action === 'create' ? 'Pedido criado' : 
                       entry.action === 'update' ? 'Pedido atualizado' : 
                       entry.action === 'delete' ? 'Pedido excluído' :
                       'Ação desconhecida'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {format(new Date(entry.timestamp), 'dd/MM/yyyy HH:mm', { locale: ptBR })} por {entry.user}
                    </div>
                  </div>
                  {expandedEntries.has(entry.id) ? 
                    <ChevronUp className="h-5 w-5 text-gray-500" /> : 
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  }
                </div>
                
                {expandedEntries.has(entry.id) && entry.changes?.length > 0 && (
                  <div className="p-4 space-y-3">
                    {entry.changes.map((change, idx) => (
                      <div key={idx} className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-gray-600 font-medium">
                          {fieldDisplayNames[change.field] || change.field}
                        </div>
                        <div className="text-red-600 line-through">
                          {formatValue(change.field, change.oldValue)}
                        </div>
                        <div className="text-green-600">
                          {formatValue(change.field, change.newValue)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;