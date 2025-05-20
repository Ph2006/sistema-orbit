// Types for Cost Center functionality
export interface CostEntry {
  id: string;
  orderId: string;
  orderNumber: string;
  purchaseOrderNumber: string;
  supplierName: string;
  description: string;
  category: 'material' | 'service' | 'labor' | 'logistics' | 'other';
  amount: number;
  date: string;
  notes?: string;
  attachmentUrl?: string;
  createdAt: string;
  createdBy: string;
}

export interface OrderCostSummary {
  orderId: string;
  orderNumber: string;
  customerName: string;
  totalBudget: number;
  totalSpent: number;
  materialsCost: number;
  servicesCost: number;
  laborCost: number;
  logisticsCost: number;
  otherCosts: number;
  margin: number;
  marginPercentage: number;
}

export interface CostCenterFilter {
  dateFrom?: string;
  dateTo?: string;
  supplier?: string;
  category?: string;
  orderNumber?: string;
}