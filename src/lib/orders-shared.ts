"use client";

export type ProductionStage = {
  stageName: string;
  status: string;
  startDate?: Date | null;
  completedDate?: Date | null;
  durationDays?: number;
  useBusinessDays?: boolean;
  workSchedule?: 'normal' | 'especial';
};

export type OrderItem = {
  id?: string;
  code?: string;
  description: string;
  quantity: number;
  unitWeight?: number;
  itemNumber?: string;
  productionPlan?: ProductionStage[];
  itemDeliveryDate?: Date | null;
  shippingList?: string;
  invoiceNumber?: string;
  shippingDate?: Date | null;
};

export type CustomerInfo = { id: string; name: string };

export type CompanyData = {
  nomeFantasia?: string;
  logo?: { preview?: string };
  endereco?: string;
  cnpj?: string;
  email?: string;
  celular?: string;
  website?: string;
};

export type Order = {
  id: string;
  quotationId: string;
  quotationNumber: string;
  internalOS?: string;
  projectName?: string;
  customer: CustomerInfo;
  items: OrderItem[];
  totalValue: number;
  totalWeight: number;
  status: string;
  createdAt: Date;
  deliveryDate?: Date;
  completedAt?: Date;
  dataBookSent: boolean;
  dataBookSentAt?: Date;
  driveLink?: string;
  documents: {
    drawings: boolean;
    inspectionTestPlan: boolean;
    paintPlan: boolean;
  };
};

export const safeToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return isNaN(timestamp.getTime()) ? null : timestamp;
  if (timestamp && typeof timestamp.toDate === 'function') {
    try {
      const date = timestamp.toDate();
      return date instanceof Date && !isNaN(date.getTime()) ? date : null;
    } catch { return null; }
  }
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    try {
      const date = new Date(timestamp.seconds * 1000);
      return isNaN(date.getTime()) ? null : date;
    } catch { return null; }
  }
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    } catch { return null; }
  }
  return null;
};

export const calculateTotalWeight = (items: OrderItem[]): number => {
  if (!items || !Array.isArray(items)) return 0;
  return items.reduce((acc, item) => {
    const quantity = Number(item.quantity) || 0;
    const unitWeight = Number(item.unitWeight) || 0;
    return acc + quantity * unitWeight;
  }, 0);
};

export const calculateItemProgress = (item: OrderItem): number => {
  if (item.productionPlan && item.productionPlan.length > 0) {
    const completedStages = item.productionPlan.filter(p => p.status === 'ConcluÃ­do').length;
    return (completedStages / item.productionPlan.length) * 100;
  }
  if (item.code && item.code.trim() !== "") return 0;
  return 100;
};

export const calculateOrderProgress = (order: Order): number => {
  if (!order.items || order.items.length === 0) return 0;
  const totalProgress = order.items.reduce((acc, item) => acc + calculateItemProgress(item), 0);
  return totalProgress / order.items.length;
};
