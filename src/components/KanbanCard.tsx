import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { format, isValid } from 'date-fns';
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
  if (!order || typeof order !== 'object' || !order.id) {
    console.warn('KanbanCard: Order inválido recebido:', order);
    return null;
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(order.id),
    disabled: isManaging,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'in-progress':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-blue-500', 
          statusBg: 'bg-blue-900/50 border border-blue-700/50', 
          statusText: 'text-blue-300',
          statusLabel: 'Em Processo',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'delayed':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-red-500', 
          statusBg: 'bg-red-900/50 border border-red-700/50', 
          statusText: 'text-red-300',
          statusLabel: 'Atrasado',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'waiting-docs':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-amber-500', 
          statusBg: 'bg-amber-900/50 border border-amber-700/50', 
          statusText: 'text-amber-300',
          statusLabel: 'Aguardando Docs',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'completed':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-emerald-500', 
          statusBg: 'bg-emerald-900/50 border border-emerald-700/50', 
          statusText: 'text-emerald-300',
          statusLabel: 'Concluído',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'ready':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-indigo-500', 
          statusBg: 'bg-indigo-900/50 border border-indigo-700/50', 
          statusText: 'text-indigo-300',
          statusLabel: 'Pronto',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      case 'urgent':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-orange-500', 
          statusBg: 'bg-orange-900/50 border border-orange-700/50', 
          statusText: 'text-orange-300',
          statusLabel: 'Urgente',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
      default:
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-700', 
          borderColor: 'border-l-gray-500', 
          statusBg: 'bg-gray-700/50 border border-gray-600/50', 
          statusText: 'text-gray-300',
          statusLabel: 'Padrão',
          textColor: 'text-gray-300',
          iconColor: 'text-gray-400'
        };
    }
  };

  const formatDeliveryDate = () => {
    try {
      if (!order.deliveryDate) return 'Data não definida';
      const date = new Date(order.deliveryDate);
      if (!isValid(date)) return 'Data inválida';
      return format(date, 'dd/MM/yyyy', { locale: ptBR });
    } catch (error) {
      console.warn('Erro ao formatar data:', error);
      return 'Data inválida';
    }
  };

  const isOverdue = React.useMemo(() => {
    try {
      if (!order.deliveryDate) return false;
      const deliveryDate = new Date(order.deliveryDate);
      if (!isValid(deliveryDate)) return false;
      const today = new Date();
      return deliveryDate < today && order.status !== 'completed';
    } catch (error) {
      console.warn('Erro ao verificar atraso:', error);
      return false;
    }
  }, [order.deliveryDate, order.status]);

  // IMPORTANTE: Definir statusInfo antes de usar
  const statusInfo = getStatusInfo(order.status || 'default');
  
  const progress = React.useMemo(() => {
    try {
      if (order.progress !== undefined && typeof order.progress === 'number') {
        return Math.max(0, Math.min(100, order.progress));
      }
      
      if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
        return 0;
      }
      
      let totalProgress = 0;
      let validItems = 0;
      
      for (const item of order.items) {
        if (item && typeof item === 'object' && typeof item.overallProgress === 'number') {
          totalProgress += Math.max(0, Math.min(100, item.overallProgress));
          validItems++;
        }
      }
      
      return validItems > 0 ? Math.round(totalProgress / validItems) : 0;
    } catch (error) {
      console.warn('Erro ao calcular progresso:', error);
      return 0;
    }
  }, [order.progress, order.items]);

  const handleCardClick = () => {
    if (typeof onOrderClick === 'function') {
      onOrderClick(order);
    }
  };

  const handleQualityControlClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof onQualityControlClick === 'function') {
      onQualityControlClick(order);
    }
  };

  const orderNumber = order.orderNumber || 'N/A';
  const customer = order.customer || 'Cliente não informado';
  const internalOrderNumber = order.internalOrderNumber || 'OS não informada';
  const itemsCount = Array.isArray(order.items) ? order.items.length : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        ${statusInfo.bgColor} ${statusInfo.borderColor}
        rounded-lg border-l-4 border border-gray-600 shadow-sm hover:shadow-md 
        transition-all duration-200 cursor-pointer
        ${isDragging ? 'opacity-60 scale-105 shadow-lg' : ''}
        ${highlight ? 'ring-2 ring-blue-500/50' : ''}
        ${isSelected ? 'ring-2 ring-gray-500/50' : ''}
        hover:transform hover:scale-[1.01]
        ${compactView ? 'p-3' : 'p-4'}
        relative
      `}
      onClick={handleCardClick}
    >
      {/* Header com número do pedido e status */}
      <div className="flex justify-between items-start mb-3">
        <div className={`${statusInfo.statusBg} ${statusInfo.statusText} px-3 py-1 rounded-md text-xs font-semibold`}>
          #{orderNumber}
        </div>
        <div className="flex gap-1 flex-col items-end">
          {isOverdue && (
            <span className="bg-red-900/50 border border-red-700/50 text-red-300 px-2 py-0.5 rounded text-xs font-medium">
              ATRASADO
            </span>
          )}
          {order.status === 'completed' && (
            <span className="bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 px-2 py-0.5 rounded text-xs font-medium">
              CONCLUÍDO
            </span>
          )}
          {order.status === 'urgent' && (
            <span className="bg-orange-900/50 border border-orange-700/50 text-orange-300 px-2 py-0.5 rounded text-xs font-medium">
              URGENTE
            </span>
          )}
        </div>
      </div>

      {/* Informações do pedido */}
      <div className={`space-y-2.5 ${compactView ? 'text-xs' : 'text-sm'}`}>
        <div className="flex items-center space-x-3">
          <span className={`${statusInfo.iconColor} text-sm`}>👤</span>
          <span className={`${statusInfo.textColor} truncate font-medium`} title={customer}>
            {customer}
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
          <span className={`${statusInfo.iconColor} text-sm`}>📋</span>
          <span className={statusInfo.textColor}>
            OS: <span className="font-mono font-semibold">{internalOrderNumber}</span>
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <span className={`${statusInfo.iconColor} text-sm`}>📅</span>
            <span className={`${statusInfo.textColor} font-medium`}>
              {formatDeliveryDate()}
            </span>
          </div>
          
          {order.totalWeight && 
           typeof order.totalWeight === 'number' && 
           !isNaN(order.totalWeight) && 
           order.totalWeight > 0 && (
            <div className="flex items-center space-x-2">
              <span className={`${statusInfo.iconColor} text-sm`}>⚖️</span>
              <span className={`${statusInfo.textColor} font-semibold text-xs`}>
                {order.totalWeight.toLocaleString('pt-BR', { 
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1 
                })} kg
              </span>
            </div>
          )}
        </div>

        {/* Indicação de itens (apenas número, sem mostrar os itens) */}
        {!compactView && itemsCount > 0 && (
          <div className="flex items-center mt-1 space-x-2">
            <span className={`${statusInfo.iconColor} text-sm`}>📦</span>
            <span className={`${statusInfo.textColor} text-xs`}>
              {itemsCount} {itemsCount === 1 ? 'item' : 'itens'} - Clique para ver detalhes
            </span>
          </div>
        )}
      </div>

      {/* Seção de progresso */}
      {!compactView && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2 font-medium">
            <span>Progresso</span>
            <span className={statusInfo.textColor}>
              {progress}%
            </span>
          </div>
          <div className="w-full bg-gray-600 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                progress >= 100 ? 'bg-emerald-500' : 
                progress >= 75 ? 'bg-blue-500' : 
                progress >= 50 ? 'bg-amber-500' : 
                'bg-gray-500'
              }`}
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
        </div>
      )}

      {/* Botão de controle de qualidade */}
      {!compactView && onQualityControlClick && (
        <button
          onClick={handleQualityControlClick}
          className="w-full mt-3 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-md transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 shadow-sm"
        >
          <span>🔍</span>
          <span>Controle de Qualidade</span>
        </button>
      )}

      {/* Google Drive button se disponível */}
      {order.googleDriveLink && !compactView && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(order.googleDriveLink, '_blank');
          }}
          className="w-full mt-2 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-md transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 shadow-sm"
        >
          <span>📁</span>
          <span>Abrir Google Drive</span>
        </button>
      )}
    </div>
  );
};

export default KanbanCard;
