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
  // Validação de segurança para o objeto order
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
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-900', 
          borderColor: 'border-l-orange-500', 
          statusBg: 'bg-orange-500/20 border border-orange-500/30', 
          statusText: 'text-orange-300',
          statusLabel: 'Em Processo',
          glowColor: 'shadow-orange-500/10'
        };
      case 'delayed':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-900', 
          borderColor: 'border-l-red-500', 
          statusBg: 'bg-red-500/20 border border-red-500/30', 
          statusText: 'text-red-300',
          statusLabel: 'Atrasado',
          glowColor: 'shadow-red-500/10'
        };
      case 'waiting-docs':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-900', 
          borderColor: 'border-l-yellow-500', 
          statusBg: 'bg-yellow-500/20 border border-yellow-500/30', 
          statusText: 'text-yellow-300',
          statusLabel: 'Aguardando Docs',
          glowColor: 'shadow-yellow-500/10'
        };
      case 'completed':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-900', 
          borderColor: 'border-l-green-500', 
          statusBg: 'bg-green-500/20 border border-green-500/30', 
          statusText: 'text-green-300',
          statusLabel: 'Concluído',
          glowColor: 'shadow-green-500/10'
        };
      case 'ready':
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-900', 
          borderColor: 'border-l-blue-500', 
          statusBg: 'bg-blue-500/20 border border-blue-500/30', 
          statusText: 'text-blue-300',
          statusLabel: 'Pronto',
          glowColor: 'shadow-blue-500/10'
        };
      case 'urgent':
        return { 
          bgColor: 'bg-gradient-to-br from-purple-900 to-gray-900', 
          borderColor: 'border-l-purple-500', 
          statusBg: 'bg-purple-500/20 border border-purple-500/30', 
          statusText: 'text-purple-300',
          statusLabel: 'Urgente',
          glowColor: 'shadow-purple-500/20'
        };
      default:
        return { 
          bgColor: 'bg-gradient-to-br from-gray-800 to-gray-900', 
          borderColor: 'border-l-gray-500', 
          statusBg: 'bg-gray-500/20 border border-gray-500/30', 
          statusText: 'text-gray-300',
          statusLabel: 'Padrão',
          glowColor: 'shadow-gray-500/10'
        };
    }
  };

  // Formatação segura de data
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

  // Verificação segura de atraso
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
  
  // Cálculo seguro do progresso
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

  // Handlers seguros
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

  // Valores seguros para exibição
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
        ${statusInfo.bgColor} ${statusInfo.borderColor} ${statusInfo.glowColor}
        backdrop-blur-sm rounded-xl border-l-4 border-r border-t border-b
        border-gray-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer
        ${isDragging ? 'opacity-60 rotate-2 scale-105 shadow-2xl' : ''}
        ${highlight ? 'ring-2 ring-blue-400/60 ring-opacity-80' : ''}
        ${isSelected ? 'ring-2 ring-purple-400/60' : ''}
        hover:transform hover:scale-[1.02] hover:-translate-y-1
        ${compactView ? 'p-3' : 'p-4'}
        relative overflow-hidden
      `}
      onClick={handleCardClick}
    >
      {/* Efeito de brilho sutil */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 transform translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-1000"></div>
      
      {/* Header com número do pedido e badges */}
      <div className="flex justify-between items-start mb-3 relative z-10">
        <span className={`${statusInfo.statusBg} ${statusInfo.statusText} px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide`}>
          #{orderNumber}
        </span>
        <div className="flex gap-1">
          {isOverdue && (
            <span className="bg-red-500/20 border border-red-500/30 text-red-300 px-2 py-1 rounded-full text-xs font-medium animate-pulse">
              ⚠️ Atrasado
            </span>
          )}
          {order.status === 'completed' && (
            <span className="bg-green-500/20 border border-green-500/30 text-green-300 px-2 py-1 rounded-full text-xs font-medium">
              ✅ Concluído
            </span>
          )}
          {order.status === 'urgent' && (
            <span className="bg-purple-500/20 border border-purple-500/30 text-purple-300 px-2 py-1 rounded-full text-xs font-medium animate-pulse">
              🚨 Urgente
            </span>
          )}
        </div>
      </div>

      {/* Informações do pedido */}
      <div className={`space-y-3 ${compactView ? 'text-xs' : 'text-sm'} relative z-10`}>
        <div className="flex items-center space-x-3 group">
          <span className="text-blue-400 text-lg">👤</span>
          <span className="text-gray-200 truncate font-medium group-hover:text-blue-300 transition-colors" title={customer}>
            {customer}
          </span>
        </div>
        
        <div className="flex items-center space-x-3 group">
          <span className="text-purple-400 text-lg">📋</span>
          <span className="text-gray-200 group-hover:text-purple-300 transition-colors">
            OS: <span className="font-mono font-bold">{internalOrderNumber}</span>
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3 group">
            <span className="text-green-400 text-lg">📅</span>
            <span className="text-gray-200 group-hover:text-green-300 transition-colors font-medium">
              {formatDeliveryDate()}
            </span>
          </div>
          
          {order.totalWeight && 
           typeof order.totalWeight === 'number' && 
           !isNaN(order.totalWeight) && 
           order.totalWeight > 0 && (
            <div className="flex items-center space-x-2 group">
              <span className="text-orange-400 text-lg">⚖️</span>
              <span className="text-gray-200 group-hover:text-orange-300 transition-colors font-bold">
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
        <div className="mt-4 relative z-10">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span className="font-medium">Progresso</span>
            <span className="text-gray-300">
              {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="w-full bg-gray-700/50 rounded-full h-3 border border-gray-600/50 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 shadow-lg ${
                progress >= 100 ? 'bg-gradient-to-r from-green-500 to-green-400 shadow-green-500/30' : 
                progress >= 75 ? 'bg-gradient-to-r from-blue-500 to-blue-400 shadow-blue-500/30' : 
                progress >= 50 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400 shadow-yellow-500/30' : 
                'bg-gradient-to-r from-orange-500 to-orange-400 shadow-orange-500/30'
              }`}
              style={{ width: `${Math.max(progress, 3)}%` }}
            >
              <div className="h-full w-full bg-gradient-to-r from-white/20 to-transparent"></div>
            </div>
          </div>
          <div className="text-xs text-gray-300 mt-1 text-right font-bold">
            {progress}% completo
          </div>
        </div>
      )}

      {/* Botão de controle de qualidade */}
      {!compactView && onQualityControlClick && (
        <button
          onClick={handleQualityControlClick}
          className="w-full mt-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white py-2.5 rounded-lg transition-all duration-300 text-sm font-bold flex items-center justify-center space-x-2 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 border border-purple-500/30 relative z-10 group"
        >
          <span className="group-hover:animate-pulse">🔍</span>
          <span>Controle de Qualidade</span>
        </button>
      )}

      {/* Indicador de status na lateral direita */}
      <div className={`absolute right-0 top-0 bottom-0 w-1 ${statusInfo.borderColor.replace('border-l-', 'bg-')} opacity-60`}></div>
    </div>
  );
};

export default KanbanCard;
