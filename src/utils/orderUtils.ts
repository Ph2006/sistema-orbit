import { Order, OrderItem } from '../types/kanban';
import { differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Calcula a data de entrega real do pedido baseada no último item concluído
 */
export const calculateActualDeliveryDate = (order: Order): string | null => {
  if (!order.items || order.items.length === 0) return null;
  
  const completedItems = order.items.filter(item => 
    item.overallProgress === 100 && item.actualDeliveryDate
  );
  
  if (completedItems.length === 0) return null;
  
  // Retorna a data de entrega mais recente
  const latestDeliveryDate = completedItems
    .map(item => new Date(item.actualDeliveryDate!))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  
  return latestDeliveryDate.toISOString().split('T')[0];
};

/**
 * Calcula os dias de atraso do pedido
 */
export const calculateDelayDays = (order: Order): number => {
  const actualDeliveryDate = order.actualDeliveryDate || calculateActualDeliveryDate(order);
  
  if (!actualDeliveryDate) return 0;
  
  const plannedDate = new Date(order.deliveryDate);
  const actualDate = new Date(actualDeliveryDate);
  
  const delayDays = differenceInDays(actualDate, plannedDate);
  
  return Math.max(0, delayDays); // Retorna 0 se foi entregue antes do prazo
};

/**
 * Calcula a duração real do pedido em dias
 */
export const calculateActualDuration = (order: Order): number | null => {
  if (!order.startDate) return null;
  
  const actualDeliveryDate = order.actualDeliveryDate || calculateActualDeliveryDate(order);
  
  if (!actualDeliveryDate) return null;
  
  const startDate = new Date(order.startDate);
  const endDate = new Date(actualDeliveryDate);
  
  return Math.ceil(differenceInDays(endDate, startDate));
};

/**
 * Calcula a duração planejada do pedido em dias
 */
export const calculatePlannedDuration = (order: Order): number | null => {
  if (!order.startDate) return null;
  
  const startDate = new Date(order.startDate);
  const plannedEndDate = new Date(order.deliveryDate);
  
  return Math.ceil(differenceInDays(plannedEndDate, startDate));
};

/**
 * Verifica se o pedido está atrasado
 */
export const isOrderDelayed = (order: Order): boolean => {
  return calculateDelayDays(order) > 0;
};

/**
 * Calcula o progresso geral do pedido baseado nos itens
 */
export const calculateOrderProgress = (order: Order): number => {
  if (!order.items || order.items.length === 0) return 0;
  
  const totalProgress = order.items.reduce((sum, item) => {
    return sum + (item.overallProgress || 0);
  }, 0);
  
  return Math.round(totalProgress / order.items.length);
};

/**
 * Verifica se o pedido está 100% concluído
 */
export const isOrderCompleted = (order: Order): boolean => {
  return calculateOrderProgress(order) === 100;
};

/**
 * Calcula estatísticas de performance do pedido
 */
export const calculateOrderPerformance = (order: Order) => {
  const plannedDuration = calculatePlannedDuration(order);
  const actualDuration = calculateActualDuration(order);
  const delayDays = calculateDelayDays(order);
  const progress = calculateOrderProgress(order);
  const isCompleted = isOrderCompleted(order);
  const isDelayed = isOrderDelayed(order);
  
  let performanceStatus: 'on-time' | 'delayed' | 'early' | 'in-progress' = 'in-progress';
  
  if (isCompleted) {
    if (delayDays > 0) {
      performanceStatus = 'delayed';
    } else if (actualDuration && plannedDuration && actualDuration < plannedDuration) {
      performanceStatus = 'early';
    } else {
      performanceStatus = 'on-time';
    }
  } else if (isDelayed) {
    performanceStatus = 'delayed';
  }
  
  return {
    plannedDuration,
    actualDuration,
    delayDays,
    progress,
    isCompleted,
    isDelayed,
    performanceStatus,
    actualDeliveryDate: order.actualDeliveryDate || calculateActualDeliveryDate(order)
  };
};

/**
 * Formata as informações de performance para exibição
 */
export const formatOrderPerformance = (order: Order): string => {
  const performance = calculateOrderPerformance(order);
  
  if (!performance.isCompleted) {
    return `Em andamento (${performance.progress}%)`;
  }
  
  if (performance.delayDays > 0) {
    return `Concluído com ${performance.delayDays} dia(s) de atraso`;
  }
  
  if (performance.performanceStatus === 'early' && performance.plannedDuration && performance.actualDuration) {
    const earlyDays = performance.plannedDuration - performance.actualDuration;
    return `Concluído ${earlyDays} dia(s) antes do prazo`;
  }
  
  return 'Concluído no prazo';
};

/**
 * Calcula estatísticas gerais de um conjunto de pedidos
 */
export const calculateOrdersStatistics = (orders: Order[]) => {
  const completedOrders = orders.filter(order => isOrderCompleted(order));
  const delayedOrders = orders.filter(order => isOrderDelayed(order));
  
  const totalDelayDays = delayedOrders.reduce((sum, order) => sum + calculateDelayDays(order), 0);
  const averageDelayDays = delayedOrders.length > 0 ? totalDelayDays / delayedOrders.length : 0;
  
  const onTimeDeliveryRate = completedOrders.length > 0 
    ? ((completedOrders.length - delayedOrders.filter(o => isOrderCompleted(o)).length) / completedOrders.length) * 100
    : 0;
  
  const totalDurations = completedOrders
    .map(order => calculateActualDuration(order))
    .filter(duration => duration !== null) as number[];
  
  const averageCompletionTime = totalDurations.length > 0
    ? totalDurations.reduce((sum, duration) => sum + duration, 0) / totalDurations.length
    : 0;
  
  return {
    totalOrders: orders.length,
    completedOrders: completedOrders.length,
    delayedOrders: delayedOrders.length,
    onTimeDeliveryRate: Math.round(onTimeDeliveryRate * 100) / 100,
    averageDelayDays: Math.round(averageDelayDays * 100) / 100,
    averageCompletionTime: Math.round(averageCompletionTime * 100) / 100,
    inProgressOrders: orders.filter(order => !isOrderCompleted(order)).length
  };
};

/**
 * Atualiza automaticamente as propriedades calculadas do pedido
 */
export const updateOrderCalculatedFields = (order: Order): Order => {
  const actualDeliveryDate = calculateActualDeliveryDate(order);
  const actualDuration = calculateActualDuration(order);
  const estimatedDuration = calculatePlannedDuration(order);
  const progress = calculateOrderProgress(order);
  
  return {
    ...order,
    actualDeliveryDate: actualDeliveryDate || order.actualDeliveryDate,
    actualDuration: actualDuration || order.actualDuration,
    estimatedDuration: estimatedDuration || order.estimatedDuration,
    progress
  };
};
