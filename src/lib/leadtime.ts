// src/lib/leadtime.ts

// Horas úteis de trabalho por dia — ajuste conforme a jornada da empresa
export const USEFUL_HOURS_PER_DAY = 8;

export interface ProductionStage {
  stageName: string;
  hours?: number;             // horas para processar 1 lote (até batchSize peças)
  setupHours?: number;        // horas fixas de setup, pagas uma vez por pedido
  batchSize?: number;         // peças processadas juntas em um ciclo (padrão 1)
  parallelResources?: number; // recursos disponíveis em paralelo nessa etapa (padrão 1)
}

export interface ProductWithPlan {
  productionPlanTemplate?: ProductionStage[];
}

export const calculateStageHoursForQuantity = (
  stage: ProductionStage,
  quantity: number
): number => {
  const qty = Math.max(1, quantity || 1);
  const setupHours = stage.setupHours || 0;
  const hoursPerBatch = stage.hours || 0;

  if (hoursPerBatch <= 0) return setupHours;

  const batchSize = stage.batchSize && stage.batchSize > 0 ? stage.batchSize : 1;
  const parallelResources = stage.parallelResources && stage.parallelResources > 0 ? stage.parallelResources : 1;

  const totalBatches = Math.ceil(qty / batchSize);
  const productionRounds = Math.ceil(totalBatches / parallelResources);

  return setupHours + productionRounds * hoursPerBatch;
};

export const calculateTotalHoursForQuantity = (
  product: ProductWithPlan,
  quantity: number = 1
): number => {
  if (!product.productionPlanTemplate || product.productionPlanTemplate.length === 0) return 0;
  return product.productionPlanTemplate.reduce(
    (total, stage) => total + calculateStageHoursForQuantity(stage, quantity),
    0
  );
};

export const calculateLeadTime = (
  product: ProductWithPlan,
  quantity: number = 1
): number => {
  const totalHours = calculateTotalHoursForQuantity(product, quantity);
  if (totalHours <= 0) return 0;
  return Math.ceil(totalHours / USEFUL_HOURS_PER_DAY);
};
