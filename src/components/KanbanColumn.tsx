import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import KanbanCard from './KanbanCard';
import { Column, Order } from '../types/kanban';
import { Settings, Trash2 } from 'lucide-react';
import { formatNumber } from '../utils/format';

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

// Função única para formatar datas com segurança
const formatDateSafely = (date: any): string => {
  try {
    if (!date) return 'Sem data';
    
    let dateObj: Date;
    
    if (typeof date === 'string') {
      if (date.trim() === '') return 'Sem data';
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date && typeof date === 'object') {
      if (date.toDate && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (date.seconds && typeof date.seconds === 'number') {
        dateObj = new Date(date.seconds * 1000);
      } else if (date._seconds || date.nanoseconds) {
        const seconds = date._seconds || date.seconds || 0;
        dateObj = new Date(seconds * 1000);
      } else {
        console.warn('Formato de data não reconhecido:', date);
        return 'Formato inválido';
      }
    } else {
      console.warn('Tipo de data não suportado:', typeof date, date);
      return 'Tipo inválido';
    }
    
    if (isNaN(dateObj.getTime())) {
      console.warn('Data inválida após conversão:', date);
      return 'Data inválida';
    }
    
    return dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Erro na data';
  }
};

// Função única para normalizar datas
const normalizeDateForComparison = (date: any): Date | null => {
  try {
    if (!date) return null;
    
    let dateObj: Date;
    
    if (typeof date === 'string') {
      if (date.trim() === '') return null;
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else if (date && typeof date === 'object') {
      if (date.toDate && typeof date.toDate === 'function') {
        dateObj = date.toDate();
      } else if (date.seconds && typeof date.seconds === 'number') {
        dateObj = new Date(date.seconds * 1000);
      } else if (date._seconds || date.nanoseconds) {
        const seconds = date._seconds || date.seconds || 0;
        dateObj = new Date(seconds * 1000);
      } else {
        return null;
      }
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

// Função única para comparar datas
const compareDateValues = (dateA: any, dateB: any): number => {
  const normalizedA = normalizeDateForComparison(dateA);
  const normalizedB = normalizeDateForComparison(dateB);
  
  // Ambas nulas = iguais
  if (!normalizedA && !normalizedB) return 0;
  
  // Uma nula = vai para o final
  if (!normalizedA) return 1;
  if (!normalizedB) return -1;
  
  // Comparação de timestamps
  return normalizedA.getTime() - normalizedB.getTime();
};

const KanbanColumn: React.FC<KanbanColumnProps> = ({
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

  // Calcular peso total da coluna
  const totalWeight = column.orders.reduce((sum, order) => {
    return sum + (order.totalWeight || 0);
  }, 0);

  // Função para destacar pedidos
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

  // Detectar se é coluna de progresso
  const isProgressColumn = (title: string): boolean => {
    const normalizedTitle = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    
    const progressVariations = [
      'pedidos em progresso',
      'pedidos em processo', 
      'em progresso',
      'em processo',
      'progresso',
      'processo',
      'andamento'
    ];
    
    return progressVariations.some(variation => 
      normalizedTitle.includes(variation)
    );
  };

  // Ordenar pedidos por data de entrega
  const sortOrdersByDelivery = (orders: Order[]): Order[] => {
    console.log(`🔄 Ordenando ${orders.length} pedidos na coluna "${column.title}"`);
    
    const sorted = [...orders].sort((a, b) => {
      const comparison = compareDateValues(a.deliveryDate, b.deliveryDate);
      console.log(`📅 #${a.orderNumber} vs #${b.orderNumber} = ${comparison}`);
      return comparison;
    });
    
    console.log('✅ Ordenação concluída');
    return sorted;
  };

  // Aplicar ordenação se for coluna de progresso
  const isProgColumn = isProgressColumn(column.title);
  const sortedOrders = isProgColumn ? sortOrdersByDelivery(column.orders) : column.orders;

  // Log do resultado final
  if (isProgColumn && sortedOrders.length > 0) {
    console.log('📋 Resultado da ordenação:');
    sortedOrders.forEach((order, index) => {
      console.log(`  ${index + 1}. #${order.orderNumber} - ${formatDateSafely(order.deliveryDate)}`);
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

        {/* Indicador de ordenação */}
        {isProgColumn && sortedOrders.length > 0 && (
          <div className="mt-2 text-xs text-blue-400 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>Ordenado por data de entrega</span>
          </div>
        )}
      </div>

      {/* Lista de Pedidos */}
      <div
        ref={setNodeRef}
        className="flex-1 bg-gray-800/30 backdrop-blur-sm rounded-b-xl p-2 border-x border-b border-gray-700/50 overflow-y-auto custom-scrollbar min-h-[200px] max-h-[70vh]"
      >
        <div className="space-y-2">
          {sortedOrders.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="text-sm">Nenhum pedido nesta coluna</p>
            </div>
          ) : (
            sortedOrders.map((order, index) => (
              <div key={order.id} className="relative">
                {/* Indicador de posição */}
                {isProgColumn && (
                  <div className="absolute -left-1 top-1 bg-blue-500 text-white text-xs px-1 py-0.5 rounded-r text-[10px] z-10 font-bold shadow-sm">
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export { KanbanColumn };
export default KanbanColumn;
