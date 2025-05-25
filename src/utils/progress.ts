import { Order } from '../types/kanban';

/**
 * Calcula o progresso geral de um pedido com base nos itens
 * @param order Pedido a ser calculado
 * @returns Progresso em porcentagem (0-100)
 */
export const calculateOrderProgress = (order: Order): number => {
  if (!order.items || order.items.length === 0) return 0;

  const totalProgress = order.items.reduce((sum, item) => {
    return sum + (item.progress || 0);
  }, 0);

  return Math.round(totalProgress / order.items.length);
};

/**
 * Calcula o progresso de um item com base nas etapas
 * @param item Item a ser calculado
 * @returns Progresso em porcentagem (0-100)
 */
export const calculateItemProgress = (item: Order['items'][0]): number => {
  if (!item.stagePlanning || !item.stagePlanning.stages) return 0;

  const stages = item.stagePlanning.stages;
  const totalStages = stages.length;
  if (totalStages === 0) return 0;

  const completedStages = stages.filter(stage => stage.completed).length;
  return Math.round((completedStages / totalStages) * 100);
};

/**
 * Verifica se um pedido está atrasado
 * @param order Pedido a ser verificado
 * @returns true se o pedido estiver atrasado
 */
export const isOrderOverdue = (order: Order): boolean => {
  const deliveryDate = new Date(order.deliveryDate);
  const today = new Date();
  return deliveryDate < today && calculateOrderProgress(order) < 100;
};

/**
 * Calcula quantos dias um pedido está atrasado
 * @param order Pedido a ser verificado
 * @returns Número de dias de atraso (negativo se estiver adiantado)
 */
export const calculateOrderDelay = (order: Order): number => {
  const deliveryDate = new Date(order.deliveryDate);
  const today = new Date();
  const diffTime = today.getTime() - deliveryDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Calcula o status de entrega de um pedido
 * @param order Pedido a ser verificado
 * @returns Status de entrega:
 * -2: Muito atrasado (> 7 dias)
 * -1: Atrasado (1-7 dias)
 * 0: No prazo
 * 1: Adiantado (1-7 dias)
 * 2: Muito adiantado (> 7 dias)
 */
export const calculateDeliveryStatus = (order: Order): number => {
  const delay = calculateOrderDelay(order);
  
  if (delay > 7) return -2;
  if (delay > 0) return -1;
  if (delay === 0) return 0;
  if (delay > -7) return 1;
  return 2;
};

/**
 * Calcula o tempo estimado para conclusão de um pedido
 * @param order Pedido a ser verificado
 * @returns Tempo estimado em dias
 */
export const calculateEstimatedCompletion = (order: Order): number => {
  const progress = calculateOrderProgress(order);
  if (progress === 0) return 0;

  const delay = calculateOrderDelay(order);
  const remainingProgress = 100 - progress;
  
  // Estima o tempo restante baseado no progresso atual
  const estimatedDays = Math.round((remainingProgress / progress) * Math.abs(delay));
  return estimatedDays;
};

/**
 * Verifica se um pedido está em risco de atraso
 * @param order Pedido a ser verificado
 * @returns true se o pedido estiver em risco
 */
export const isOrderAtRisk = (order: Order): boolean => {
  const progress = calculateOrderProgress(order);
  const delay = calculateOrderDelay(order);
  const estimatedCompletion = calculateEstimatedCompletion(order);

  // Considera em risco se:
  // 1. Estiver atrasado
  // 2. O progresso for baixo e o prazo estiver próximo
  // 3. O tempo estimado para conclusão for maior que o prazo restante
  return (
    delay > 0 ||
    (progress < 50 && delay > -7) ||
    (estimatedCompletion > Math.abs(delay))
  );
};

export const getProgressColor = (value: number) => {
  if (value === 100) return 'bg-green-500';
  if (value >= 70) return 'bg-blue-500';
  if (value >= 30) return 'bg-yellow-500';
  return 'bg-red-500';
};