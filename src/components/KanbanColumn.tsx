import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import KanbanCard from './KanbanCard';
import { Column, Order } from '../types/kanban';
import { Settings, Trash2, Plus } from 'lucide-react';
import { formatNumber } from '../utils/format';

// Função local para formatar datas com segurança
const formatDateSafe = (date: any, formatStr: string = 'dd/MM/yyyy'): string => {
  try {
    if (!date) return 'Data não informada';
    
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date.toDate && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else {
      return 'Data inválida';
    }
    
    if (isNaN(dateObj.getTime())) {
      return 'Data inválida';
    }
    
    return dateObj.toLocaleDateString('pt-BR');
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Data inválida';
  }
};

// Função local para normalizar datas
const normalizeDate = (date: any): Date | null => {
  try {
    if (!date) return null;
    
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date.toDate && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else {
      return null;
    }
    
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    return dateObj;
  } catch (error) {
    console.error('Erro ao normalizar data:', error);
    return null;
  }
};

// Função local para comparar datas
const compareDates = (dateA: any, dateB: any): number => {
  const normalizedA = normalizeDate(dateA);
  const normalizedB = normalizeDate(dateB);
  
  // Se ambas são nulas/inválidas, são iguais
  if (!normalizedA && !normalizedB) return 0;
  
  // Se uma é nula/inválida, vai para o final
  if (!normalizedA) return 1;
  if (!normalizedB) return -1;
  
  // Comparar timestamps
  return normalizedA.getTime() - normalizedB.getTime();
};

interface KanbanColumnProps {
  column: Column;
  onEdit: () => void;
  onDelete: () => void;
  onOrderClick: (order: Order) => void;
  highlightTerm?: string;
  compactView?: boolean;
  isManagingOrders?: boolean;
  selectedOrders?: string[];
  customers: any[];
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  onEdit,
  onDelete,
  onOrderClick,
  highlightTerm = '',
  compactView = false,
  isManagingOrders = false,
  selectedOrders = [],
  customers,
}) => {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  const totalWeight = column.orders.reduce((sum, order) => {
    return sum + (order.totalWeight || 0);
  }, 0);

  const shouldHighlight = (order: Order) => {
    if (!highlightTerm) return false;
    const searchTerm = highlightTerm.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(searchTerm) ||
      order.customer.toLowerCase().includes(searchTerm) ||
      order.project?.toLowerCase().includes(searchTerm) ||
      order.description?.toLowerCase().includes(searchTerm)
    );
  };

  // Função melhorada para detectar se é a coluna "Pedidos em progresso"
  const isInProgressColumn = (title: string): boolean => {
    const normalizedTitle = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    
    // Verificar várias variações possíveis do título
    const progressVariations = [
      'pedidos em progresso',
      'pedidos em processo', 
      'em progresso',
      'em processo',
      'progresso',
      'processo'
    ];
    
    return progressVariations.some(variation => 
      normalizedTitle.includes(variation) || 
      normalizedTitle === variation
    );
  };

  // Função para ordenar pedidos por data de entrega usando a função segura
  const sortOrdersByDeliveryDate = (orders: Order[]): Order[] => {
    return [...orders].sort((a, b) => {
      // Usar a função de comparação segura
      const comparison = compareDates(a.deliveryDate, b.deliveryDate);
      
      // Debug logging para verificar as ordenações
      console.log(`🔍 Ordenando: #${a.orderNumber} (${formatDateSafe(a.deliveryDate)}) vs #${b.orderNumber} (${formatDateSafe(b.deliveryDate)}) = ${comparison}`);
      
      return comparison;
    });
  };

  // Aplicar ordenação apenas se for a coluna de progresso
  const isProgressColumn = isInProgressColumn(column.title);
  const sortedOrders = isProgressColumn 
    ? sortOrdersByDeliveryDate(column.orders)
    : column.orders;

  console.log(`🏗️ Coluna "${column.title}" - É coluna de progresso: ${isProgressColumn}`);
  if (isProgressColumn) {
    console.log('📋 Pedidos ordenados por data de entrega:');
    sortedOrders.forEach((order, index) => {
      console.log(`  ${index + 1}. #${order.orderNumber} - ${formatDateSafe(order.deliveryDate)} (Data original: ${order.deliveryDate})`);
    });
  }

  return (
    <div className="flex flex-col w-full sm:w-80 min-w-[280px] max-w-full shrink-0">
      {/* Cabeçalho da Coluna */}
      <div className="bg-gray-800/50 backdrop-blur-lg rounded-t-xl p-4 border border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">{column.title}</h3>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
              title="Editar coluna"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded-lg transition-colors"
              title="Excluir coluna"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Informações da Coluna */}
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>{column.orders.length} pedido(s)</span>
          <span>{formatNumber(totalWeight)} kg</span>
        </div>

        {/* Indicador de ordenação para colunas de progresso */}
        {isProgressColumn && (
          <div className="mt-2 text-xs text-blue-400 flex items-center">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            Ordenado por data de entrega
          </div>
        )}
      </div>

      {/* Lista de Pedidos */}
      <div
        ref={setNodeRef}
        className="flex-1 bg-gray-800/30 backdrop-blur-sm rounded-b-xl p-2 border-x border-b border-gray-700/50 overflow-y-auto custom-scrollbar min-h-[200px] max-h-[70vh]"
      >
        <div className="space-y-2">
          {sortedOrders.map((order, index) => (
            <div key={order.id} className="relative">
              {/* Debug: mostrar posição e data na coluna de progresso */}
              {isProgressColumn && (
                <div className="absolute -left-1 top-0 bg-blue-500 text-white text-xs px-1 rounded-r text-[10px] z-10">
                  {index + 1}
                </div>
              )}
              <KanbanCard
                order={order}
                onClick={() => onOrderClick(order)}
                highlight={shouldHighlight(order)}
                compactView={compactView}
                isManaging={isManagingOrders}
                isSelected={selectedOrders.includes(order.id)}
                customers={customers}
                columnTitle={column.title}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
