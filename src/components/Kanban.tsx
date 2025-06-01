import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Order } from '../types/kanban';

interface KanbanCardProps {
  order: Order;
  isManaging: boolean;
  isSelected: boolean;
  highlight: boolean;
  compactView: boolean;
  onOrderClick: (order: Order) => void;
  onQualityControlClick?: (order: Order) => void;
  projects: any[];
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  order,
  isManaging,
  isSelected,
  highlight,
  compactView,
  onOrderClick,
  onQualityControlClick,
  projects,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    disabled: isManaging,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'in-progress':
        return { 
          bgColor: 'bg-orange-100/10', 
          borderColor: 'border-l-orange-500', 
          statusBg: 'bg-orange-100 dark:bg-orange-900', 
          statusText: 'text-orange-600 dark:text-orange-300',
          statusLabel: 'Em Processo'
        };
      case 'delayed':
        return { 
          bgColor: 'bg-red-100/10', 
          borderColor: 'border-l-red-500', 
          statusBg: 'bg-red-100 dark:bg-red-900', 
          statusText: 'text-red-600 dark:text-red-300',
          statusLabel: 'Atrasado'
        };
      case 'waiting-docs':
        return { 
          bgColor: 'bg-yellow-100/10', 
          borderColor: 'border-l-yellow-500', 
          statusBg: 'bg-yellow-100 dark:bg-yellow-900', 
          statusText: 'text-yellow-600 dark:text-yellow-300',
          statusLabel: 'Aguardando Docs'
        };
      case 'completed':
        return { 
          bgColor: 'bg-green-100/10', 
          borderColor: 'border-l-green-500', 
          statusBg: 'bg-green-100 dark:bg-green-900', 
          statusText: 'text-green-600 dark:text-green-300',
          statusLabel: 'Concluído'
        };
      default:
        return { 
          bgColor: 'bg-blue-100/10', 
          borderColor: 'border-l-blue-500', 
          statusBg: 'bg-blue-100 dark:bg-blue-900', 
          statusText: 'text-blue-600 dark:text-blue-300',
          statusLabel: 'Em Andamento'
        };
    }
  };

  const statusInfo = getStatusInfo(order.status);
  const isOverdue = new Date(order.deliveryDate) < new Date();
  
  // Correção: Usar a propriedade progress diretamente se disponível, ou calcular baseado nos itens concluídos
  const progress = order.progress !== undefined ? order.progress : 
    (order.items && order.items.length > 0) ? 
      order.items.reduce((acc, item) => acc + (item.overallProgress || 0), 0) / order.items.length : 
      0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        ${statusInfo.bgColor} ${statusInfo.borderColor}
        bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border-l-4 
        shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer
        ${isDragging ? 'opacity-50 rotate-3 scale-105' : ''}
        ${highlight ? 'ring-2 ring-blue-400 ring-opacity-60' : ''}
        ${isSelected ? 'ring-2 ring-purple-400' : ''}
        hover:transform hover:scale-[1.02] hover:-translate-y-1
        border border-gray-700/50
        ${compactView ? 'p-3' : 'p-4'}
      `}
      onClick={() => onOrderClick(order)}
    >
      {/* Header with Order Number and Status */}
      <div className="flex justify-between items-start mb-3">
        <span className={`${statusInfo.statusBg} ${statusInfo.statusText} px-2 py-1 rounded text-xs font-medium`}>
          #{order.orderNumber}
        </span>
        {isOverdue && (
          <span className="bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-2 py-1 rounded-full text-xs font-medium">
            Atrasado
          </span>
        )}
        {order.status === 'completed' && (
          <span className="bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 px-2 py-1 rounded-full text-xs font-medium">
            Concluído
          </span>
        )}
      </div>

      {/* Order Information */}
      <div className={`space-y-2 ${compactView ? 'text-xs' : 'text-sm'}`}>
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">👤</span>
          <span className="text-gray-300 truncate" title={order.customer}>
            {order.customer}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">📋</span>
          <span className="text-gray-300">OS: {order.internalOrderNumber}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">📅</span>
            <span className="text-gray-300">
              {format(new Date(order.deliveryDate), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          </div>
          
          {order.totalWeight && (
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">⚖️</span>
              <span className="text-gray-300">
                {order.totalWeight.toLocaleString('pt-BR', { 
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1 
                })} kg
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Section */}
      {!compactView && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Progresso</span>
            <span>{order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                progress >= 100 ? 'bg-green-500' : 
                progress >= 75 ? 'bg-blue-500' : 
                progress >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
              }`}
              style={{ width: `${Math.max(progress, 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Quality Control Button */}
      {!compactView && onQualityControlClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onQualityControlClick(order);
          }}
          className="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center space-x-2"
        >
          <span>🔍</span>
          <span>Controle de Qualidade</span>
        </button>
      )}
    </div>
  );
};

export default KanbanCard;
