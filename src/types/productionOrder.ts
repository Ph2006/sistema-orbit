export interface ProductionOrder {
  id: string;
  orderId: string;  // Reference to main order
  itemId: string;   // Item being manufactured
  stageId: string;  // Stage ID (matches stage ID in manufacturing stages)
  stageName: string; // Stage name (for display purposes)
  assignedTo: string; // Responsible person
  status: ProductionOrderStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  workInstructions: string[];
  materialsRequired: Material[];
  qualityChecklist: QualityCheckItem[];
  startCode: string; // QR code for starting the task
  endCode: string;   // QR code for ending the task
  history: ProductionOrderHistory[];
}

export interface ProductionOrderHistory {
  action: 'created' | 'started' | 'completed' | 'updated' | 'reassigned';
  timestamp: string;
  user: string;
  notes?: string;
  previousStatus?: ProductionOrderStatus;
  newStatus?: ProductionOrderStatus;
}

export type ProductionOrderStatus = 
  | 'pending'       // Not yet started
  | 'in-progress'   // Started but not complete
  | 'completed'     // Completed successfully 
  | 'on-hold'       // Paused due to issues
  | 'cancelled'     // Cancelled (will not be completed)
  | 'delayed';      // Will be completed but is behind schedule

export interface Material {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  available: boolean;
}

export interface QualityCheckItem {
  id: string;
  description: string;
  checked: boolean;
  result?: string;
}

export interface POFilterOptions {
  status?: ProductionOrderStatus[];
  stages?: string[];
  priority?: ('low' | 'medium' | 'high' | 'critical')[];
  dateRange?: {
    start: string;
    end: string;
  };
}