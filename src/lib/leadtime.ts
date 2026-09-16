// src/lib/leadtime.ts

export const USEFUL_HOURS_PER_DAY = 8;

export interface ProductionStage {
  stageName: string;
  hours?: number;
  setupHours?: number;
  batchSize?: number;
  parallelResources?: number;
}

export interface ProductWithPlan {
  productionPlanTemplate?: ProductionStage[];
}

// Mantido para uso onde você precisa saber o tempo total OCUPADO
// de uma etapa específica (ex: agenda de máquina/recurso).
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

// NOVO: lead time considerando pipeline entre etapas.
export const calculateLeadTime = (
  product: ProductWithPlan,
  quantity: number = 1
): number => {
  const stages = product.productionPlanTemplate;
  if (!stages || stages.length === 0) return 0;

  const qty = Math.max(1, quantity || 1);

  let fillTimeHours = 0;          // tempo p/ a 1ª peça atravessar todas as etapas
  let bottleneckHoursPerUnit = 0; // etapa mais lenta por peça (gargalo)

  stages.forEach(stage => {
    const setupHours = stage.setupHours || 0;
    const hoursPerBatch = stage.hours || 0;
    const batchSize = stage.batchSize && stage.batchSize > 0 ? stage.batchSize : 1;
    const parallelResources = stage.parallelResources && stage.parallelResources > 0 ? stage.parallelResources : 1;

    // horas para produzir 1 peça nesta etapa, já considerando
    // que o restante do lote roda em paralelo/no mesmo ciclo
    const hoursPerUnitThisStage = hoursPerBatch / (batchSize * parallelResources);

    fillTimeHours += setupHours + hoursPerUnitThisStage;

    if (hoursPerUnitThisStage > bottleneckHoursPerUnit) {
      bottleneckHoursPerUnit = hoursPerUnitThisStage;
    }
  });

  const totalHours = fillTimeHours + (qty - 1) * bottleneckHoursPerUnit;

  if (totalHours <= 0) return 0;
  return Math.ceil(totalHours / USEFUL_HOURS_PER_DAY);
};
