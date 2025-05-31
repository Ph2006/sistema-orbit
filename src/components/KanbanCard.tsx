import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Order } from '../types/kanban';
import { format, isPast, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calculateOrderProgress } from '../utils/progress';
import { FileText, FileCheck, Brush, Briefcase, CheckCircle, Clock, ClipboardCheck, Calendar, Package, AlertTriangle, CheckCircle2, Plus, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatNumber } from '../utils/format';
import OrderItemsList from './OrderItemsList';

interface KanbanCardProps {
  order: Order;
  overlay?: boolean;
  isManaging?: boolean;
  isSelected?: boolean;
  highlight?: boolean;
  compactView?: boolean;
  columnTitle?: string;
  onClick?: () => void;
  customers?: any[];
}

// Função para formatar datas com segurança
const formatDateSafe = (date: any): string => {
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
      } else {
        return 'Data inválida';
      }
    } else {
      return 'Data inválida';
    }
    
    if (isNaN(dateObj.getTime())) {
      return 'Data inválida';
    }
    
    return dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Data inválida';
  }
};

const KanbanCard: React.FC<KanbanCardProps> = ({ 
  order, 
  overlay, 
  isManaging = false,
  isSelected = false,
  highlight = false,
  compactView = false,
  columnTitle,
  onClick,
  customers
}) => {
  const [showItems, setShowItems] = React.useState(false);
  const [showItemsList, setShowItemsList] = React.useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: order.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Check if order is completed
  const isCompleted = order.status === 'completed' || order.completedDate;

  // Calculate delivery date metrics
  const now = new Date();
  const deliveryDate = new Date(order.deliveryDate);
  const completionDate = order.completedDate ? new Date(order.completedDate) : null;
  
  // Only consider it overdue if not completed and delivery date is in the past
  const isOverdue = !isCompleted && isPast(deliveryDate);
  
  // For completed orders, calculate days difference between completed and delivery date
  const completionDiff = completionDate && deliveryDate 
    ? differenceInDays(completionDate, deliveryDate) 
    : null;
  
  const isEarly = completionDiff !== null && completionDiff < 0;
  const isLate = completionDiff !== null && completionDiff > 0;
  const isOnTime = completionDiff !== null && completionDiff === 0;

  // Check if the order is in the expedited column
  const isExpedited = columnTitle?.toLowerCase().includes('expedi');

  // Map status to background and border colors
  const getStatusColors = (status: string) => {
    // For completed orders, use green
    if (isCompleted) {
      return 'bg-green-100/80 border-green-400';
    }
    
    // Override with yellow if in expedited column regardless of status
    if (isExpedited) {
      return 'bg-yellow-100/80 border-yellow-400';
    }
    
    // Override with red if delivery date is past and not completed
    if (isOverdue) {
      return 'bg-red-100/80 border-red-400';
    }
    
    switch (status) {
      case 'in-progress':
        return 'bg-orange-100/80 border-orange-400';
      case 'delayed':
        return 'bg-red-100/80 border-red-400';
      case 'waiting-docs':
        return 'bg-yellow-100/80 border-yellow-400';
      case 'completed':
        return 'bg-green-100/80 border-green-400';
      case 'ready':
        return 'bg-blue-100/80 border-blue-400';
      case 'urgent':
        return 'bg-purple-100/80 border-purple-400';
      default:
        return 'bg-gray-100/80 border-gray-400';
    }
  };

  // Calculate days until delivery for in-progress orders
  const calculateDeliveryStatus = () => {
    if (isCompleted && completionDate) {
      return differenceInDays(completionDate, deliveryDate);
    } else {
      const diffTime = deliveryDate.getTime() - now.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  };

  const deliveryStatus = calculateDeliveryStatus();
  const isDueToday = !isCompleted && deliveryStatus === 0;

  const getStatusIcon = () => {
    if (isCompleted) return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    if (isLate) return <AlertTriangle className="h-4 w-4 text-red-400" />;
    if (isOverdue) return <Clock className="h-4 w-4 text-yellow-400" />;
    return <Package className="h-4 w-4 text-blue-400" />;
  };

  // Função para obter os itens do pedido de forma mais robusta
  const getOrderItems = () => {
    // Verificar múltiplas possibilidades de estrutura
    if (order.items && Array.isArray(order.items)) {
      return order.items;
    }
    if (order.orderItems && Array.isArray(order.orderItems)) {
      return order.orderItems;
    }
    if (order.products && Array.isArray(order.products)) {
      return order.products;
    }
    if (order.components && Array.isArray(order.components)) {
      return order.components;
    }
    return [];
  };

  const orderItems = getOrderItems();

  const cardClasses = `
    border-2 backdrop-blur-sm ${getStatusColors(order.status)}
    ${overlay ? 'shadow-lg' : 'shadow-sm'}
    ${isSelected ? 'ring-2 ring-blue-500' : ''}
    ${isManaging ? 'ml-1' : ''}
    ${highlight ? 'animate-pulse bg-opacity-90' : ''}
    cursor-grab hover:shadow-md transition-all hover:scale-[1.005]
    p-1.5 sm:p-2 rounded sm:rounded-md
    text-[11px] sm:text-xs
    leading-tight
  `;

  if (compactView) {
    return (
      <>
        <div
          ref={setNodeRef}
          style={style}
          className={cardClasses}
          onClick={!isManaging && onClick ? onClick : undefined}
          {...(!isManaging ? { ...attributes, ...listeners } : {})}
        >
          <div className="space-y-1">
            <div className="flex justify-between items-start">
              <span className="font-medium text-sm">#{order.orderNumber}</span>
              {isCompleted ? (
                <span className={`px-1 py-0.5 text-xs rounded flex items-center ${
                  isEarly ? 'bg-green-200 text-green-800' : 
                  isLate ? 'bg-orange-200 text-orange-800' : 
                  'bg-blue-200 text-blue-800'
                }`}>
                  {getStatusIcon()}
                  {isEarly ? `${Math.abs(completionDiff!)}d antes` : 
                   isLate ? `${completionDiff}d após` : 
                   'No prazo'}
                </span>
              ) : (isDueToday || isOverdue) && (
                <span className={`px-1 py-0.5 text-xs rounded ${
                  isOverdue ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
                }`}>
                  {isOverdue ? `${Math.abs(deliveryStatus)}d atrasado` : 'Hoje!'}
                </span>
              )}
            </div>
            
            <div className="text-xs text-gray-600">
              <div className="truncate">{(() => {
                if (customers && customers.length > 0) {
                  const found = customers.find(c => c.id === order.customer);
                  return found ? found.name : order.customer;
                }
                return order.customerName || order.customer;
              })()}</div>
            </div>
            
            {/* Project display in compact view */}
            {order.projectName && (
              <div className="flex items-center text-xs text-gray-600">
                <Briefcase className="h-3 w-3 mr-1" />
                <span className="truncate">{order.projectName}</span>
              </div>
            )}

            {/* Itens do Pedido - Vista Compacta */}
            {orderItems.length > 0 && (
              <div className="mt-2 p-2 bg-white/50 rounded border">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium">Itens ({orderItems.length})</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowItemsList(true);
                    }}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    Mostrar
                  </button>
                </div>
                
                {showItems && (
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {orderItems.slice(0, 3).map((item, index) => (
                      <div key={item.id || index} className="text-xs text-gray-700 p-1 bg-white/70 rounded">
                        <div className="font-medium truncate">
                          {item.description || item.name || `Item ${index + 1}`}
                        </div>
                        <div className="text-gray-500">
                          {item.quantity || item.qty || 0} {item.unit || 'un'} • 
                          {item.material || item.type || 'N/A'}
                        </div>
                      </div>
                    ))}
                    {orderItems.length > 3 && (
                      <div className="text-xs text-gray-500 text-center py-1">
                        +{orderItems.length - 3} mais itens
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Barra de progresso compacta */}
            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  (order.overallProgress ?? 0) === 100 ? 'bg-green-500' :
                  (order.overallProgress ?? 0) >= 70 ? 'bg-blue-500' :
                  (order.overallProgress ?? 0) >= 30 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${order.overallProgress ?? 0}%` }}
              />
            </div>
            
            {/* Quality control link in compact view */}
            <Link 
              to={`/quality?orderId=${order.id}`} 
              onClick={(e) => e.stopPropagation()} 
              className="block mt-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 text-center px-2 py-1 rounded text-xs font-medium"
            >
              <ClipboardCheck className="h-3 w-3 inline-block mr-1" />
              Controle de Qualidade
            </Link>

            {/* Checklist icons in compact view */}
            <div className="flex justify-between items-center mt-1">
              <div className="flex items-center space-x-1">
                {order.checklist && (
                  <>
                    <span className={`${order.checklist.drawings ? 'text-blue-600' : 'text-gray-400'}`}>
                      <FileText className="h-3 w-3" />
                    </span>
                    <span className={`${order.checklist.inspectionTestPlan ? 'text-blue-600' : 'text-gray-400'}`}>
                      <FileCheck className="h-3 w-3" />
                    </span>
                    <span className={`${order.checklist.paintPlan ? 'text-blue-600' : 'text-gray-400'}`}>
                      <Brush className="h-3 w-3" />
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Completed date indicator for compact view */}
            {isCompleted && (
              <div className="flex items-center text-xs text-green-600">
                <CheckCircle className="h-3 w-3 mr-0.5" />
                <span>Concluído: {formatDateSafe(order.completedDate || '')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal da lista de itens */}
        {showItemsList && (
          <OrderItemsList
            order={order}
            onClose={() => setShowItemsList(false)}
            onUpdateOrder={(updatedOrder) => {
              console.log('Pedido atualizado:', updatedOrder);
              setShowItemsList(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cardClasses}
        onClick={!isManaging && onClick ? onClick : undefined}
        {...(!isManaging ? { ...attributes, ...listeners } : {})}
      >
        <div className="space-y-2">
          <div className="flex justify-between items-start">
            <span className="font-semibold">#{order.orderNumber}</span>
            {isCompleted ? (
              <span className={`px-2 py-1 text-xs rounded flex items-center ${
                isEarly ? 'bg-green-200 text-green-800' : 
                isLate ? 'bg-orange-200 text-orange-800' : 
                'bg-blue-200 text-blue-800'
              }`}>
                {getStatusIcon()}
                {isEarly ? `${Math.abs(completionDiff!)}d antes` : 
                 isLate ? `${completionDiff}d após` : 
                 'No prazo'}
              </span>
            ) : (isDueToday || isOverdue) && (
              <span className={`px-2 py-1 text-xs rounded ${
                isOverdue ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
              }`}>
                {isOverdue ? `${Math.abs(deliveryStatus)}d atrasado` : 'Hoje!'}
              </span>
            )}
          </div>
          
          <div className="text-sm text-gray-600">
            <div>Cliente: {(() => {
              if (customers && customers.length > 0) {
                const found = customers.find(c => c.id === order.customer);
                return found ? found.name : order.customer;
              }
              return order.customerName || order.customer;
            })()}</div>
            <div>OS: {order.internalOrderNumber}</div>
            <div>Início: {formatDateSafe(order.startDate)}</div>
            <div>Entrega: {formatDateSafe(order.deliveryDate)}</div>
            
            {/* Project display */}
            {order.projectName && (
              <div className="text-sm flex items-center text-gray-700">
                <Briefcase className="h-4 w-4 mr-1 text-gray-500" />
                <span className="font-medium">{order.projectName}</span>
              </div>
            )}
            
            <div className="font-medium">
              Peso Total: {formatNumber(order.totalWeight)} kg
            </div>

            {/* Itens do Pedido - Vista Expandida */}
            {orderItems.length > 0 && (
              <div className="mt-3 p-3 bg-white/50 rounded border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Itens do Pedido ({orderItems.length})</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowItemsList(true);
                    }}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    Ver Detalhes
                  </button>
                </div>
                
                {showItems && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {orderItems.map((item, index) => (
                      <div key={item.id || index} className="text-xs bg-white/70 p-2 rounded border">
                        <div className="font-medium text-gray-900">
                          {item.description || item.name || `Item ${index + 1}`}
                        </div>
                        <div className="text-gray-600 mt-1">
                          <span>Material: {item.material || item.type || 'N/A'}</span> • 
                          <span>Qtd: {item.quantity || item.qty || 0} {item.unit || 'un'}</span>
                        </div>
                        {(item.dimensions || item.weight) && (
                          <div className="text-gray-500 mt-1">
                            {item.dimensions && <span>Dim: {item.dimensions}</span>}
                            {item.dimensions && item.weight && ' • '}
                            {item.weight && <span>Peso: {item.weight} kg</span>}
                          </div>
                        )}
                        {item.progress !== undefined && (
                          <div className="mt-1">
                            <div className="flex justify-between text-xs">
                              <span>Progresso:</span>
                              <span>{item.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                              <div
                                className={`h-1 rounded-full ${
                                  item.progress === 100 ? 'bg-green-500' :
                                  item.progress >= 70 ? 'bg-blue-500' :
                                  item.progress >= 30 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quality Control Link - More prominent and repositioned */}
            <Link 
              to={`/quality?orderId=${order.id}`} 
              onClick={(e) => e.stopPropagation()} 
              className="flex items-center bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-1.5 rounded-lg text-sm mt-2 w-full justify-center font-medium"
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Controle de Qualidade
            </Link>

            {/* Checklist status indicators */}
            {order.checklist && (
              <div className="flex space-x-4 mt-1 text-sm">
                <div className={`flex items-center ${order.checklist.drawings ? 'text-blue-600' : 'text-gray-400'}`}>
                  <FileText className="h-4 w-4 mr-1" />
                  <span>Desenhos</span>
                </div>
                <div className={`flex items-center ${order.checklist.inspectionTestPlan ? 'text-blue-600' : 'text-gray-400'}`}>
                  <FileCheck className="h-4 w-4 mr-1" />
                  <span>PIT</span>
                </div>
                <div className={`flex items-center ${order.checklist.paintPlan ? 'text-blue-600' : 'text-gray-400'}`}>
                  <Brush className="h-4 w-4 mr-1" />
                  <span>Pintura</span>
                </div>
              </div>
            )}

            {/* Progress bar */}
            <div className="mt-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-700">Progresso</span>
                <span className="text-gray-600">{order.overallProgress ?? 0}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    (order.overallProgress ?? 0) === 100 ? 'bg-green-500' :
                    (order.overallProgress ?? 0) >= 70 ? 'bg-blue-500' :
                    (order.overallProgress ?? 0) >= 30 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${order.overallProgress ?? 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal da lista de itens */}
      {showItemsList && (
        <OrderItemsList
          order={order}
          onClose={() => setShowItemsList(false)}
          onUpdateOrder={(updatedOrder) => {
            console.log('Pedido atualizado:', updatedOrder);
            setShowItemsList(false);
          }}
        />
      )}
    </>
  );
};

export default KanbanCard;
