// IMPORTANTE: este arquivo deve permanecer salvo em UTF-8.
// Carrega do Firestore os dados usados no cálculo de capacidade por setor.

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  parseLocalDate,
  type CapacityOrder,
  type CapacityOvertime,
  type CapacityResource,
  type CapacitySnapshot,
  type CapacityStageLink,
} from "@/lib/production-capacity";

const COMPANY = ["companies", "mecald"] as const;

const toDateOrNull = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    const converted = (value as { toDate: () => Date }).toDate();
    return isNaN(converted.getTime()) ? null : converted;
  }
  return parseLocalDate(value);
};

export const loadResources = async (): Promise<CapacityResource[]> => {
  const snap = await getDoc(doc(db, ...COMPANY, "settings", "resources"));
  return snap.exists() ? ((snap.data().resources || []) as CapacityResource[]) : [];
};

export const loadOvertime = async (): Promise<CapacityOvertime[]> => {
  const snap = await getDoc(doc(db, ...COMPANY, "settings", "overtime"));
  return snap.exists() ? ((snap.data().releases || []) as CapacityOvertime[]) : [];
};

export const loadStageLinks = async (): Promise<CapacityStageLink[]> => {
  const snap = await getDoc(doc(db, ...COMPANY, "settings", "manufacturingStages"));
  if (!snap.exists() || !Array.isArray(snap.data().stages)) return [];
  return (snap.data().stages as unknown[])
    .map(stage => typeof stage === "string"
      ? { name: stage, costCenterName: "" }
      : {
          name: String((stage as { name?: string })?.name || "").trim(),
          costCenterName: String((stage as { costCenterName?: string })?.costCenterName || "").trim(),
        })
    .filter(stage => Boolean(stage.name));
};

export const loadSectorNames = async (): Promise<string[]> => {
  const snap = await getDocs(collection(db, ...COMPANY, "productionCostCenters"));
  return snap.docs
    .map(centerDoc => String(centerDoc.data().sectorName || centerDoc.id).trim())
    .filter(Boolean);
};

export const loadOpenOrders = async (): Promise<CapacityOrder[]> => {
  const snap = await getDocs(collection(db, ...COMPANY, "orders"));
  return snap.docs.map(orderDoc => {
    const data = orderDoc.data();
    return {
      id: orderDoc.id,
      status: data.status,
      internalOS: data.internalOS,
      quotationNumber: data.quotationNumber,
      customer: data.customer,
      deliveryDate: toDateOrNull(data.deliveryDate),
      items: (Array.isArray(data.items) ? data.items : []).map((item: Record<string, unknown>) => ({
        id: item.id as string | undefined,
        description: item.description as string | undefined,
        quantity: Number(item.quantity) || 0,
        unitWeight: Number(item.unitWeight) || 0,
        shippingDate: toDateOrNull(item.shippingDate),
        productionPlan: (Array.isArray(item.productionPlan) ? item.productionPlan : []).map((stage: Record<string, unknown>) => ({
          stageName: stage.stageName as string | undefined,
          status: (stage.status as string | undefined) || "Pendente",
          startDate: toDateOrNull(stage.startDate),
          completedDate: toDateOrNull(stage.completedDate),
          durationDays: Number(stage.durationDays) || 0,
        })),
      })),
    };
  });
};

/**
 * Carrega tudo o que o cálculo precisa. Passe `orders` quando a página já tiver
 * os pedidos carregados (evita uma segunda leitura da coleção).
 */
export const loadCapacitySnapshot = async (orders?: CapacityOrder[]): Promise<CapacitySnapshot> => {
  const [resources, overtime, stageLinks, sectorNames, loadedOrders] = await Promise.all([
    loadResources(),
    loadOvertime(),
    loadStageLinks(),
    loadSectorNames(),
    orders ? Promise.resolve(orders) : loadOpenOrders(),
  ]);
  return { resources, overtime, stageLinks, sectorNames, orders: loadedOrders, loadedAt: new Date() };
};
