export interface CuttingPlan {
  id: string;
  orderId: string; // Reference to main order
  orderNumber: string; // Order number for reference
  materialName: string;
  materialDescription?: string; // Detailed material description
  barLength: number; // in millimeters
  weightPerMeter: number; // weight per meter in kg
  cuttingThickness: number; // in millimeters
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  totalBarsNeeded: number;
  totalMaterialWeight: number;
  totalScrapWeight: number;
  utilizationPercentage: number;
  traceabilityCode: string; // For tracking and referencing plans
  bars: Bar[];
  deleted?: boolean; // Track if the plan has been deleted
}

export interface Bar {
  barNumber: number;
  totalLength: number;
  cuts: BarCut[];
  remainingLength: number;
}

export interface BarCut {
  itemId: string;
  drawingCode: string;
  itemNumber: string;
  length: number;
  startPosition: number;
  endPosition: number;
  isScrap: boolean;
}

export interface CutItem {
  id: string;
  drawingCode: string;
  itemNumber: string;
  length: number;
  quantity: number;
}