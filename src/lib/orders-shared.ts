"use client";

import { Timestamp } from "firebase/firestore";

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
    const completedStages = item.productionPlan.filter(p => p.status === 'Concluído').length;
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

// Converte um Order (com objetos Date) para um formato gravável no Firestore,
// pronto para ser lido depois pela página pública sem precisar de autenticação.
export function serializeOrderForPublicShare(order: Order) {
  return {
    orderId: order.id,
    quotationNumber: order.quotationNumber,
    internalOS: order.internalOS || '',
    projectName: order.projectName || '',
    customer: order.customer,
    status: order.status,
    deliveryDate: order.deliveryDate ? Timestamp.fromDate(order.deliveryDate) : null,
    totalWeight: order.totalWeight,
    items: order.items.map(item => ({
      code: item.code || '',
      description: item.description,
      quantity: item.quantity,
      unitWeight: item.unitWeight || 0,
      productionPlan: (item.productionPlan || []).map(stage => ({
        stageName: stage.stageName,
        status: stage.status,
        durationDays: stage.durationDays || 0,
        startDate: stage.startDate ? Timestamp.fromDate(stage.startDate) : null,
        completedDate: stage.completedDate ? Timestamp.fromDate(stage.completedDate) : null,
      })),
    })),
    updatedAt: Timestamp.now(),
  };
}

// Caminho inverso: reconstrói um Order utilizável pelo gerador de PDF
// a partir do documento público salvo no Firestore.
export function deserializeOrderFromPublicShare(data: any, fallbackId: string): Order {
  const items: OrderItem[] = Array.isArray(data.items)
    ? data.items.map((item: any) => ({
        code: item.code || '',
        description: item.description || '',
        quantity: item.quantity || 0,
        unitWeight: item.unitWeight || 0,
        productionPlan: (item.productionPlan || []).map((stage: any) => ({
          stageName: stage.stageName || '',
          status: stage.status || 'Pendente',
          durationDays: stage.durationDays || 0,
          startDate: safeToDate(stage.startDate),
          completedDate: safeToDate(stage.completedDate),
        })),
      }))
    : [];

  return {
    id: data.orderId || fallbackId,
    quotationId: '',
    quotationNumber: data.quotationNumber || 'N/A',
    internalOS: data.internalOS || '',
    projectName: data.projectName || '',
    customer: data.customer || { id: '', name: 'Cliente não informado' },
    items,
    totalValue: 0,
    totalWeight: data.totalWeight || calculateTotalWeight(items),
    status: data.status || '',
    createdAt: new Date(),
    deliveryDate: safeToDate(data.deliveryDate) || undefined,
    completedAt: undefined,
    dataBookSent: false,
    dataBookSentAt: undefined,
    driveLink: '',
    documents: { drawings: false, inspectionTestPlan: false, paintPlan: false },
  };
}
