import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Order } from '../types/kanban';
import { format, isPast, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calculateOrderProgress } from '../utils/progress';
import { FileText, FileCheck, Brush, Briefcase, CheckCircle, Clock, ClipboardCheck, Calendar, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatNumber } from '../utils/format';

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

  // Sincronizar status baseado na coluna e situação
  const syncStatus = () => {
    // Se está na coluna de expedidos, deve ser waiting-docs
    if (isExpedited && order.status !== 'waiting-docs' && order.status !== 'completed') {
      return 'waiting-docs';
    }
    
    // Se tem data de conclusão, deve ser completed
    if (order.completedDate && order.status !== 'completed') {
      return 'completed';
    }
    
    // Se está atrasado e não está marcado como atrasado
    if (isOverdue && order.status !== 'delayed') {
      return 'delayed';
    }
    
    return order.status;
  };

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

  // Calculate days until delivery for in-progress orders
  // or days relative to deadline for completed orders
  const calculateDeliveryStatus = () => {
    if (isCompleted && completionDate) {
      // Return days relative to deadline for completed orders
      return differenceInDays(completionDate, deliveryDate);
    } else {
      // For in-progress orders, return days until deadline
      const diffTime = deliveryDate.getTime() - now.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  };

  const deliveryStatus = calculateDeliveryStatus();
  const isDueToday = !isCompleted && deliveryStatus === 0;

  const getStatusColor = () => {
    if (isCompleted) return 'bg-green-500/20 border-green-500/30';
    if (isLate) return 'bg-red-500/20 border-red-500/30';
    if (isOverdue) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-blue-500/20 border-blue-500/30';
  };

  const getStatusIcon = () => {
    if (isCompleted) return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    if (isLate) return <AlertTriangle className="h-4 w-4 text-red-400" />;
    if (isOverdue) return <Clock className="h-4 w-4 text-yellow-400" />;
    return <Package className="h-4 w-4 text-blue-400" />;
  };

  if (compactView) {
    return (
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
          
          {/* Quality control link in compact view - repositioned as a button */}
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
              <span>Concluído: {formatDate(order.completedDate || '')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
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
          <div>Início: {formatDate(order.startDate)}</div>
          <div>Entrega: {formatDate(order.deliveryDate)}</div>
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
  );
};

export default KanbanCard;