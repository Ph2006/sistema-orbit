import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Order, OrderItem } from '../types/kanban';
import { 
  CheckSquare, 
  Square, 
  BarChart3, 
  FileText, 
  Download,
  MoreVertical,
  Edit,
  QrCode,
  Calendar,
  Target
} from 'lucide-react';

interface KanbanCardProps {
  order: Order;
  isManaging: boolean;
  isSelected: boolean;
  highlight: boolean;
  compactView: boolean;
  onOrderClick: (order: Order) => void;
  onQualityControlClick?: (order: Order) => void;
  onItemProgressClick?: (item: OrderItem) => void;
  onEditClick?: (order: Order) => void;
  onSelectForShipping?: (order: Order) => void;
  onExportItemReport?: (order: Order) => void;
  projects: any[];
  selectedForShipping?: boolean;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  order,
  isManaging,
  isSelected,
  highlight,
  compactView,
  onOrderClick,
  onQualityControlClick,
  onItemProgressClick,
  onEditClick,
  onSelectForShipping,
  onExportItemReport,
  projects,
  selectedForShipping = false
}) => {
  const [showItemActions, setShowItemActions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  if (!order || typeof order !== 'object' || !order.id) {
    console.warn('KanbanCard: Order inválido recebido:', order);
    return null;
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(order.id),
    disabled: isManaging || showDropdown,
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
    if (typeof onOrderClick === 'function' && !showDropdown) {
      onOrderClick(order);
    }
  };

  const handleSelectForShipping = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectForShipping) {
      onSelectForShipping(order);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(false);
    if (onEditClick) {
      onEditClick(order);
    }
  };

  const handleItemProgressClick = (e: React.MouseEvent, item: OrderItem) => {
    e.stopPropagation();
    setShowDropdown(false);
    if (onItemProgressClick) {
      onItemProgressClick(item);
    }
  };

  const handleExportItemReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(false);
    if (onExportItemReport) {
      onExportItemReport(order);
    }
  };

  const handleQualityControlClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(false);
    if (onQualityControlClick) {
      onQualityControlClick(order);
    }
  };

  const orderNumber = order.orderNumber || 'N/A';
  const customer = order.customer || 'Cliente não informado';
  const internalOrderNumber = order.internalOrderNumber || 'OS não informada';
  const itemsCount = Array.isArray(order.items) ? order.items.length : 0;

  return (
    <div className="relative group">
      <div
        ref={setNodeRef}
        style={style}
        {...(showDropdown ? {} : listeners)}
        {...attributes}
        className={`
          ${statusInfo.bgColor} ${statusInfo.borderColor}
          rounded-lg border-l-4 border border-gray-600 shadow-sm hover:shadow-md 
          transition-all duration-200 cursor-pointer backdrop-blur-sm bg-white/5
          ${isDragging ? 'opacity-60 scale-105 shadow-lg' : ''}
          ${highlight ? 'ring-2 ring-blue-500/50' : ''}
          ${isSelected ? 'ring-2 ring-gray-500/50' : ''}
          ${selectedForShipping ? 'ring-2 ring-green-500/50 bg-green-900/20' : ''}
          hover:transform hover:scale-[1.01]
          ${compactView ? 'p-3' : 'p-4'}
          relative
        `}
        onClick={handleCardClick}
      >
        {/* Checkbox para seleção de embarque */}
        <div className="absolute top-2 left-2 z-10">
          <button
            onClick={handleSelectForShipping}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title={selectedForShipping ? 'Remover da seleção de embarque' : 'Selecionar para embarque'}
          >
            {selectedForShipping ? (
              <CheckSquare className="h-4 w-4 text-green-400" />
            ) : (
              <Square className="h-4 w-4 text-gray-400 hover:text-white" />
            )}
          </button>
        </div>

        {/* Menu dropdown */}
        <div className="absolute top-2 right-2 z-10">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDropdown(!showDropdown);
              }}
              className="p-1 rounded hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4 text-gray-400 hover:text-white" />
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 top-6 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 min-w-[200px]">
                <div className="py-1">
                  <button
                    onClick={handleEditClick}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar Pedido
                  </button>
                  
                  {itemsCount > 0 && (
                    <>
                      <div className="border-t border-gray-600 my-1"></div>
                      <div className="px-3 py-1 text-xs text-gray-500 font-medium">
                        ITENS ({itemsCount})
                      </div>
                      {order.items?.map((item, index) => (
                        <button
                          key={item.id || index}
                          onClick={(e) => handleItemProgressClick(e, item)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                        >
                          <BarChart3 className="h-4 w-4 mr-2" />
                          <div className="flex-1 truncate">
                            <div className="truncate">Item {item.itemNumber}: {item.code}</div>
                            <div className="text-xs text-gray-500">{item.overallProgress || 0}% completo</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  
                  <div className="border-t border-gray-600 my-1"></div>
                  
                  <button
                    onClick={handleExportItemReport}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Relatório Técnico
                  </button>
                  
                  {onQualityControlClick && (
                    <button
                      onClick={handleQualityControlClick}
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 flex items-center"
                    >
                      <Target className="h-4 w-4 mr-2" />
                      Controle de Qualidade
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Header com número do pedido e status */}
        <div className="flex justify-between items-start mb-3 mt-6">
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

          {/* Indicação de itens */}
          {!compactView && itemsCount > 0 && (
            <div className="flex items-center mt-1 space-x-2">
              <span className={`${statusInfo.iconColor} text-sm`}>📦</span>
              <span className={`${statusInfo.textColor} text-xs`}>
                {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
              </span>
              {selectedForShipping && (
                <span className="bg-green-900/50 border border-green-700/50 text-green-300 px-2 py-0.5 rounded text-xs font-medium">
                  SELECIONADO
                </span>
              )}
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

        {/* Botões de ação rápida */}
        {!compactView && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (order.items && order.items.length > 0) {
                  handleItemProgressClick(e, order.items[0]);
                }
              }}
              className="w-full bg-blue-600/80 hover:bg-blue-700/80 text-white py-1.5 rounded-md transition-all duration-200 text-xs font-medium flex items-center justify-center space-x-1 backdrop-blur-sm"
              title="Atualizar progresso dos itens"
            >
              <BarChart3 className="h-3 w-3" />
              <span>Progresso</span>
            </button>
            
            <button
              onClick={handleExportItemReport}
              className="w-full bg-gray-600/80 hover:bg-gray-700/80 text-white py-1.5 rounded-md transition-all duration-200 text-xs font-medium flex items-center justify-center space-x-1 backdrop-blur-sm"
              title="Exportar relatório técnico"
            >
              <Download className="h-3 w-3" />
              <span>Relatório</span>
            </button>
          </div>
        )}

        {/* Google Drive button se disponível */}
        {order.googleDriveLink && !compactView && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(order.googleDriveLink, '_blank');
            }}
            className="w-full mt-2 bg-green-600/80 hover:bg-green-700/80 text-white py-1.5 rounded-md transition-all duration-200 text-xs font-medium flex items-center justify-center space-x-1 backdrop-blur-sm"
          >
            <span>📁</span>
            <span>Google Drive</span>
          </button>
        )}
      </div>
      
      {/* Overlay para fechar dropdown quando clicar fora */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

export default KanbanCard;
