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
          bgColor: 'bg-gradient-to-br from-slate-50 to-slate-100', 
          borderColor: 'border-l-blue-600', 
          statusBg: 'bg-blue-50 border border-blue-200', 
          statusText: 'text-blue-700',
          statusLabel: 'Em Processo',
          textColor: 'text-slate-700',
          iconColor: 'text-slate-500'
        };
      case 'delayed':
        return { 
          bgColor: 'bg-gradient-to-br from-red-50 to-slate-100', 
          borderColor: 'border-l-red-600', 
          statusBg: 'bg-red-50 border border-red-200', 
          statusText: 'text-red-700',
          statusLabel: 'Atrasado',
          textColor: 'text-slate-700',
          iconColor: 'text-slate-500'
        };
      case 'waiting-docs':
        return { 
          bgColor: 'bg-gradient-to-br from-amber-50 to-slate-100', 
          borderColor: 'border-l-amber-600', 
          statusBg: 'bg-amber-50 border border-amber-200', 
          statusText: 'text-amber-700',
          statusLabel: 'Aguardando Docs',
          textColor: 'text-slate-700',
          iconColor: 'text-slate-500'
        };
      case 'completed':
        return { 
          bgColor: 'bg-gradient-to-br from-emerald-50 to-slate-100', 
          borderColor: 'border-l-emerald-600', 
          statusBg: 'bg-emerald-50 border border-emerald-200', 
          statusText: 'text-emerald-700',
          statusLabel: 'Concluído',
          textColor: 'text-slate-700',
          iconColor: 'text-slate-500'
        };
      case 'ready':
        return { 
          bgColor: 'bg-gradient-to-br from-indigo-50 to-slate-100', 
          borderColor: 'border-l-indigo-600', 
          statusBg: 'bg-indigo-50 border border-indigo-200', 
          statusText: 'text-indigo-700',
          statusLabel: 'Pronto',
          textColor: 'text-slate-700',
          iconColor: 'text-slate-500'
        };
      case 'urgent':
        return { 
          bgColor: 'bg-gradient-to-br from-orange-50 to-slate-100', 
          borderColor: 'border-l-orange-600', 
          statusBg: 'bg-orange-50 border border-orange-200', 
          statusText: 'text-orange-700',
          statusLabel: 'Urgente',
          textColor: 'text-slate-700',
          iconColor: 'text-slate-500'
        };
      default:
        return { 
          bgColor: 'bg-gradient-to-br from-slate-50 to-slate-100', 
          borderColor: 'border-l-slate-400', 
          statusBg: 'bg-slate-50 border border-slate-200', 
          statusText: 'text-slate-600',
          statusLabel: 'Padrão',
          textColor: 'text-slate-700',
          iconColor: 'text-slate-500'
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
        rounded-lg border-l-4 border border-slate-200 shadow-sm hover:shadow-md 
        transition-all duration-200 cursor-pointer
        ${isDragging ? 'opacity-60 scale-105 shadow-lg' : ''}
        ${highlight ? 'ring-2 ring-blue-400/50' : ''}
        ${isSelected ? 'ring-2 ring-slate-400/50' : ''}
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
            <span className="bg-red-100 border border-red-300 text-red-700 px-2 py-0.5 rounded text-xs font-medium">
              ATRASADO
            </span>
          )}
          {order.status === 'completed' && (
            <span className="bg-emerald-100 border border-emerald-300 text-emerald-700 px-2 py-0.5 rounded text-xs font-medium">
              CONCLUÍDO
            </span>
          )}
          {order.status === 'urgent' && (
            <span className="bg-orange-100 border border-orange-300 text-orange-700 px-2 py-0.5 rounded text-xs font-medium">
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
      </div>

      {/* Seção de progresso */}
      {!compactView && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Progresso</span>
            <span className={statusInfo.textColor}>
              {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                progress >= 100 ? 'bg-emerald-500' : 
                progress >= 75 ? 'bg-blue-500' : 
                progress >= 50 ? 'bg-amber-500' : 
                'bg-slate-400'
              }`}
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
          <div className="text-xs text-slate-600 mt-1 text-right font-semibold">
            {progress}% concluído
          </div>
        </div>
      )}

      {/* Botão de controle de qualidade */}
      {!compactView && onQualityControlClick && (
        <button
          onClick={handleQualityControlClick}
          className="w-full mt-3 bg-slate-600 hover:bg-slate-700 text-white py-2 rounded-md transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 shadow-sm"
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
          className="w-full mt-2 bg-slate-500 hover:bg-slate-600 text-white py-2 rounded-md transition-all duration-200 text-sm font-medium flex items-center justify-center space-x-2 shadow-sm"
        >
          <span>📁</span>
          <span>Abrir Google Drive</span>
        </button>
      )}
    </div>
  );
};

export default KanbanCard;
