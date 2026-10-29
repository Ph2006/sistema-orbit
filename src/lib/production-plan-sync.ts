// src/lib/production-plan-sync.ts
// Mantém o plano de produção dos itens de pedidos abertos alinhado com o
// template de etapas cadastrado no produto (aba Produtos).
import { collection, getDocs, writeBatch, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { USEFUL_HOURS_PER_DAY } from "@/lib/orders-shared";

export type TemplateStage = {
  stageName: string;
  hours?: number;
  durationDays?: number;
  workSchedule?: "normal" | "especial";
};

export const normalizeStageName = (name?: string) =>
  String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const normalizeProductCode = (code?: string) =>
  String(code || "").trim().toUpperCase();

// Template em horas (novo) ou em dias (formato antigo) -> dias.
export const templateStageToDays = (stage: any): number => {
  const hours = Number(stage?.hours);
  if (Number.isFinite(hours) && hours > 0) return hours / USEFUL_HOURS_PER_DAY;
  const days = Number(stage?.durationDays);
  return Number.isFinite(days) && days > 0 ? days : 0;
};

const isClosedOrderStatus = (status?: string) => {
  const s = normalizeStageName(status);
  return s.includes("conclu") || s.includes("complet") || s.includes("finish") || s.includes("cancel");
};

const toItemsArray = (rawItems: any): any[] => {
  if (Array.isArray(rawItems)) return rawItems;
  if (rawItems && typeof rawItems === "object") {
    return Object.keys(rawItems)
      .sort((a, b) => Number(a) - Number(b))
      .map(key => rawItems[key])
      .filter(item => item && typeof item === "object");
  }
  return [];
};

const planSignature = (plan: any[]) =>
  JSON.stringify((plan || []).map(s => [s?.stageName, s?.status, Number(s?.durationDays) || 0]));

/**
 * Mescla o plano atual do item com o template do produto:
 * - segue a ordem e os nomes do template;
 * - preserva status e datas das etapas que já existiam (comparação sem acento/caixa);
 * - etapas novas entram como "Pendente";
 * - atualiza a duração das etapas não concluídas com as horas do produto;
 * - etapas removidas do produto saem do item, exceto as que já foram iniciadas
 *   ou concluídas (mantidas para não perder histórico).
 */
export function mergePlanWithTemplate(
  existingPlan: any[] | undefined,
  template: TemplateStage[] | undefined,
  renames: Record<string, string> = {}
): { plan: any[]; changed: boolean } {
  const renameMap = new Map(
    Object.entries(renames).map(([oldName, newName]) => [normalizeStageName(oldName), newName])
  );

  const existing = (existingPlan || [])
    .filter(stage => stage && stage.stageName)
    .map(stage => {
      const renamed = renameMap.get(normalizeStageName(stage.stageName));
      return renamed ? { ...stage, stageName: renamed } : stage;
    });

  const validTemplate = (template || []).filter(stage => stage && stage.stageName);
  const existingByName = new Map(existing.map(stage => [normalizeStageName(stage.stageName), stage]));
  const templateNames = new Set(validTemplate.map(stage => normalizeStageName(stage.stageName)));

  const merged: any[] = validTemplate.map(templateStage => {
    const current = existingByName.get(normalizeStageName(templateStage.stageName));
    const templateDays = templateStageToDays(templateStage);

    if (!current) {
      const workSchedule = templateStage.workSchedule || "normal";
      return {
        stageName: templateStage.stageName,
        status: "Pendente",
        durationDays: templateDays,
        workSchedule,
        useBusinessDays: workSchedule === "normal",
        startDate: null,
        completedDate: null,
      };
    }

    const isDone = current.status === "Concluído";
    return {
      ...current,
      stageName: templateStage.stageName,
      durationDays: isDone || templateDays <= 0
        ? Number(current.durationDays) || 0
        : templateDays,
    };
  });

  // Etapas que saíram do produto, mas já foram iniciadas/concluídas no item.
  existing.forEach((stage, index) => {
    if (templateNames.has(normalizeStageName(stage.stageName))) return;
    if (!stage.status || stage.status === "Pendente") return;
    merged.splice(Math.min(index, merged.length), 0, stage);
  });

  return { plan: merged, changed: planSignature(existingPlan || []) !== planSignature(merged) };
}

/**
 * Aplica o template do produto a todos os itens com o mesmo código
 * em pedidos abertos. Ignora pedidos concluídos/cancelados, itens já
 * embarcados e itens com todas as etapas concluídas.
 */
export async function syncProductPlanToOrders(
  productCode: string,
  template: TemplateStage[],
  renames: Record<string, string> = {}
): Promise<{ ordersUpdated: number; itemsUpdated: number }> {
  const code = normalizeProductCode(productCode);
  if (!code) return { ordersUpdated: 0, itemsUpdated: 0 };

  const snapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
  const commits: Promise<void>[] = [];
  let batch = writeBatch(db);
  let pendingOps = 0;
  let ordersUpdated = 0;
  let itemsUpdated = 0;

  for (const orderDoc of snapshot.docs) {
    const data = orderDoc.data();
    if (isClosedOrderStatus(data.status)) continue;

    const items = toItemsArray(data.items);
    if (items.length === 0) continue;

    let orderChanged = false;
    const newItems = items.map((item, index) => {
      if (normalizeProductCode(item?.code || item?.product_code) !== code) return item;
      if (item.shippingDate) return item;

      const currentPlan = Array.isArray(item.productionPlan) ? item.productionPlan : [];
      if (currentPlan.length > 0 && currentPlan.every((s: any) => s?.status === "Concluído")) return item;

      const { plan, changed } = mergePlanWithTemplate(currentPlan, template, renames);
      if (!changed) return item;

      orderChanged = true;
      itemsUpdated++;
      return {
        ...item,
        // Mesmo padrão de ID usado na leitura da página de Pedidos.
        id: item.id || `${orderDoc.id}-${index}`,
        productionPlan: plan,
        lastTemplateSync: Timestamp.now(),
      };
    });

    if (!orderChanged) continue;

    batch.update(orderDoc.ref, { items: newItems, lastUpdate: Timestamp.now() });
    ordersUpdated++;
    pendingOps++;
    if (pendingOps >= 400) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      pendingOps = 0;
    }
  }

  if (pendingOps > 0) commits.push(batch.commit());
  await Promise.all(commits);

  return { ordersUpdated, itemsUpdated };
}
