// IMPORTANTE: este arquivo deve permanecer salvo em UTF-8.
//
// Capacidade produtiva por setor e simulação de prazos.
//
// Modelo:
// - Capacidade do setor em um dia = soma das pessoas do setor disponíveis no dia
//   × USEFUL_HOURS_PER_DAY, mais as horas extras aprovadas para aquele dia.
//   O setor de cada pessoa é o campo "Localização" do cadastro de funcionários,
//   comparado (sem acento e sem maiúsculas) ao nome do centro de custo.
// - Etapa → setor: o centro de custo vinculado à etapa em "Etapas cadastradas".
// - Fila (carga) do setor: horas das etapas ainda não concluídas dos pedidos
//   abertos. Horas de uma etapa = durationDays × USEFUL_HOURS_PER_DAY.
// - As horas do plano valem para o item/lote inteiro (não multiplicam pela quantidade).
// - Cada etapa de um item é feita por uma equipe: avança no máximo
//   USEFUL_HOURS_PER_DAY por dia, e só se o setor tiver horas livres.
//   Assim, sem fila, o prazo é igual ao lead time do cadastro; com fila, a etapa espera.

import { USEFUL_HOURS_PER_DAY } from "@/lib/orders-shared";

// ─── Datas e feriados ────────────────────────────────────────────────────────

export const startOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addCalendarDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Aceita "yyyy-MM-dd", ISO, Date ou Timestamp do Firestore. Retorna a data local (00:00). */
export const parseLocalDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : startOfLocalDay(value);
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: unknown }).toDate === "function") {
    const converted = (value as { toDate: () => Date }).toDate();
    return isNaN(converted.getTime()) ? null : startOfLocalDay(converted);
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
  }
  return null;
};

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
const easterSunday = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const holidayCache = new Map<number, Set<string>>();

/** Feriados nacionais (e Carnaval / Corpus Christi, que a fábrica não trabalha) de qualquer ano. */
export const getBrazilianHolidays = (year: number): Date[] => {
  const easter = easterSunday(year);
  const holidays = [
    new Date(year, 0, 1),            // Confraternização Universal
    addCalendarDays(easter, -48),    // Carnaval (segunda)
    addCalendarDays(easter, -47),    // Carnaval (terça)
    addCalendarDays(easter, -2),     // Sexta-feira Santa
    new Date(year, 3, 21),           // Tiradentes
    new Date(year, 4, 1),            // Dia do Trabalho
    addCalendarDays(easter, 60),     // Corpus Christi
    new Date(year, 8, 7),            // Independência
    new Date(year, 9, 12),           // Nossa Senhora Aparecida
    new Date(year, 10, 2),           // Finados
    new Date(year, 10, 15),          // Proclamação da República
    new Date(year, 11, 25),          // Natal
  ];
  if (year >= 2024) holidays.push(new Date(year, 10, 20)); // Consciência Negra (Lei 14.759/2023)
  return holidays;
};

export const isHoliday = (date: Date): boolean => {
  const year = date.getFullYear();
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(getBrazilianHolidays(year).map(dayKey));
    holidayCache.set(year, set);
  }
  return set.has(dayKey(date));
};

export const isBusinessDay = (date: Date): boolean => {
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6 && !isHoliday(date);
};

/** Dias úteis em [from, to). */
export const countBusinessDays = (from: Date, to: Date): number => {
  let count = 0;
  let cursor = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  while (cursor < end) {
    if (isBusinessDay(cursor)) count += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return count;
};

// ─── Tipos de entrada ────────────────────────────────────────────────────────

export interface CapacityResource {
  id: string;
  name: string;
  type?: string;
  category?: string;
  status?: string;
  capacity?: number;
  location?: string;
  absenceStartDate?: string;
  absenceEndDate?: string;
}

export interface CapacityStageLink {
  name: string;
  costCenterName?: string;
}

export interface CapacityOvertime {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  resources?: string[];
  status?: string;
}

export interface CapacityOrderStage {
  stageName?: string;
  status?: string;
  startDate?: Date | null;
  completedDate?: Date | null;
  durationDays?: number;
}

export interface CapacityOrderItem {
  id?: string;
  description?: string;
  quantity?: number;
  unitWeight?: number;
  productionPlan?: CapacityOrderStage[];
  shippingDate?: Date | null;
}

export interface CapacityOrder {
  id: string;
  status?: string;
  internalOS?: string;
  quotationNumber?: string;
  customer?: { name?: string };
  deliveryDate?: Date | null;
  items: CapacityOrderItem[];
}

export interface CapacitySnapshot {
  resources: CapacityResource[];
  stageLinks: CapacityStageLink[];
  overtime: CapacityOvertime[];
  orders: CapacityOrder[];
  /** Nomes dos centros de custo (productionCostCenters). */
  sectorNames: string[];
  loadedAt: Date;
}

// ─── Setores ─────────────────────────────────────────────────────────────────

export const normalizeSectorKey = (value?: string | null): string =>
  (value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

export interface SectorResolver {
  /** Setor da etapa, ou null se a etapa não tem centro de custo vinculado. */
  sectorOfStage: (stageName?: string | null) => { key: string; name: string } | null;
  sectorName: (key: string) => string;
}

export const buildSectorResolver = (snapshot: Pick<CapacitySnapshot, "stageLinks" | "sectorNames">): SectorResolver => {
  const names = new Map<string, string>();
  snapshot.sectorNames.forEach(name => {
    const key = normalizeSectorKey(name);
    if (key && !names.has(key)) names.set(key, name.trim());
  });

  const stageToSector = new Map<string, string>();
  snapshot.stageLinks.forEach(link => {
    const stageKey = normalizeSectorKey(link.name);
    const sectorKey = normalizeSectorKey(link.costCenterName);
    if (!stageKey || !sectorKey) return;
    stageToSector.set(stageKey, sectorKey);
    if (!names.has(sectorKey)) names.set(sectorKey, (link.costCenterName || "").trim());
  });

  return {
    sectorOfStage: (stageName) => {
      const stageKey = normalizeSectorKey(stageName);
      if (!stageKey) return null;
      const sectorKey = stageToSector.get(stageKey) || (names.has(stageKey) ? stageKey : "");
      if (!sectorKey) return null;
      return { key: sectorKey, name: names.get(sectorKey) || sectorKey };
    },
    sectorName: (key) => names.get(key) || key,
  };
};

// ─── Capacidade ──────────────────────────────────────────────────────────────

const UNAVAILABLE_STATUSES = new Set(["inativo", "manutencao"]);
const ABSENCE_STATUSES = new Set(["ausente", "ferias"]);

const isResourceAvailableOn = (resource: CapacityResource, date: Date): boolean => {
  const status = (resource.status || "disponivel").toLowerCase();
  if (UNAVAILABLE_STATUSES.has(status)) return false;

  const start = parseLocalDate(resource.absenceStartDate);
  const end = parseLocalDate(resource.absenceEndDate);
  if (start && end) {
    // Período de ausência cadastrado: indisponível só dentro dele.
    if (date >= start && date <= end) return false;
    return true;
  }
  // Ausente/férias sem período: considera indisponível enquanto o status não mudar.
  return !ABSENCE_STATUSES.has(status);
};

const parseTimeToHours = (value?: string): number | null => {
  const match = (value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
};

export const overtimeDurationHours = (release: CapacityOvertime): number => {
  const start = parseTimeToHours(release.startTime);
  const end = parseTimeToHours(release.endTime);
  if (start === null || end === null) return 0;
  const hours = end >= start ? end - start : end + 24 - start;
  return Math.max(0, hours);
};

export interface SectorCapacityInfo {
  key: string;
  name: string;
  /** Pessoas ativas (não inativas) lotadas no setor. */
  people: number;
  peopleNames: string[];
  /** Pessoas disponíveis hoje. */
  availableToday: number;
  /** Horas por dia útil com as pessoas disponíveis hoje. */
  hoursPerDayToday: number;
  /** O nome em Localização bate com um centro de custo cadastrado. */
  matchesCostCenter: boolean;
}

export interface CapacityModel {
  sectors: Map<string, SectorCapacityInfo>;
  /** Horas disponíveis do setor naquele dia (0 em fim de semana/feriado, salvo hora extra). */
  capacityOn: (sectorKey: string, date: Date) => number;
  /** Funcionários cuja Localização não corresponde a nenhum centro de custo. */
  unmatchedResources: CapacityResource[];
  /** Funcionários sem Localização preenchida. */
  resourcesWithoutSector: CapacityResource[];
}

export const buildCapacityModel = (
  snapshot: CapacitySnapshot,
  resolver: SectorResolver,
  today: Date = new Date(),
): CapacityModel => {
  const costCenterKeys = new Set(snapshot.sectorNames.map(normalizeSectorKey).filter(Boolean));
  const hasLaborType = snapshot.resources.some(resource => resource.type === "mao_de_obra");
  const laborResources = snapshot.resources.filter(resource => !hasLaborType || resource.type === "mao_de_obra");

  const bySector = new Map<string, CapacityResource[]>();
  const resourceSector = new Map<string, string>();
  const unmatchedResources: CapacityResource[] = [];
  const resourcesWithoutSector: CapacityResource[] = [];

  laborResources.forEach(resource => {
    const key = normalizeSectorKey(resource.location);
    if (!key) {
      if ((resource.status || "") !== "inativo") resourcesWithoutSector.push(resource);
      return;
    }
    if (!costCenterKeys.has(key) && (resource.status || "") !== "inativo") unmatchedResources.push(resource);
    resourceSector.set(resource.id, key);
    const list = bySector.get(key) || [];
    list.push(resource);
    bySector.set(key, list);
  });

  const todayStart = startOfLocalDay(today);
  const sectors = new Map<string, SectorCapacityInfo>();
  bySector.forEach((list, key) => {
    const active = list.filter(resource => (resource.status || "") !== "inativo");
    const availableToday = list.filter(resource => isResourceAvailableOn(resource, todayStart));
    sectors.set(key, {
      key,
      name: costCenterKeys.has(key) ? resolver.sectorName(key) : (list[0].location || key).trim(),
      people: active.reduce((sum, resource) => sum + Math.max(1, Number(resource.capacity) || 1), 0),
      peopleNames: active.map(resource => resource.name),
      availableToday: availableToday.reduce((sum, resource) => sum + Math.max(1, Number(resource.capacity) || 1), 0),
      hoursPerDayToday: availableToday.reduce((sum, resource) => sum + Math.max(1, Number(resource.capacity) || 1), 0) * USEFUL_HOURS_PER_DAY,
      matchesCostCenter: costCenterKeys.has(key),
    });
  });

  // Horas extras aprovadas, por setor e dia.
  const overtimeBySectorDay = new Map<string, number>();
  snapshot.overtime
    .filter(release => (release.status || "").toLowerCase() === "aprovado")
    .forEach(release => {
      const date = parseLocalDate(release.date);
      const hours = overtimeDurationHours(release);
      if (!date || hours <= 0) return;
      (release.resources || []).forEach(resourceId => {
        const sectorKey = resourceSector.get(resourceId);
        if (!sectorKey) return;
        const mapKey = `${sectorKey}|${dayKey(date)}`;
        overtimeBySectorDay.set(mapKey, (overtimeBySectorDay.get(mapKey) || 0) + hours);
      });
    });

  const cache = new Map<string, number>();
  const capacityOn = (sectorKey: string, date: Date): number => {
    const day = startOfLocalDay(date);
    const cacheKey = `${sectorKey}|${dayKey(day)}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    let hours = 0;
    if (isBusinessDay(day)) {
      (bySector.get(sectorKey) || []).forEach(resource => {
        if (isResourceAvailableOn(resource, day)) {
          hours += Math.max(1, Number(resource.capacity) || 1) * USEFUL_HOURS_PER_DAY;
        }
      });
    }
    hours += overtimeBySectorDay.get(cacheKey) || 0;
    cache.set(cacheKey, hours);
    return hours;
  };

  return { sectors, capacityOn, unmatchedResources, resourcesWithoutSector };
};

// ─── Carga (fila) dos pedidos abertos ────────────────────────────────────────

export type BacklogStageStatus = "em_andamento" | "pendente";

export interface BacklogEntry {
  orderId: string;
  orderLabel: string;
  orderStatus: string;
  itemDescription: string;
  itemWeight: number;
  stageName: string;
  sectorKey: string | null;
  stageStatus: BacklogStageStatus;
  /** Horas que ainda faltam na etapa. */
  hours: number;
}

export interface SectorBacklog {
  inProgressHours: number;
  pendingHours: number;
  totalHours: number;
  entries: BacklogEntry[];
}

export interface BacklogResult {
  entries: BacklogEntry[];
  bySector: Map<string, SectorBacklog>;
  /** Etapas com carga mas sem centro de custo vinculado. */
  unmappedEntries: BacklogEntry[];
}

const CLOSED_ORDER_STATUSES = new Set(["Concluído", "Cancelado", "Pronto para Entrega"]);

export interface BacklogOptions {
  /** Inclui pedidos "Aguardando Produção" (já vendidos, ainda não iniciados). Padrão: true. */
  includeWaitingOrders?: boolean;
}

export const computeBacklog = (
  orders: CapacityOrder[],
  resolver: SectorResolver,
  today: Date = new Date(),
  options: BacklogOptions = {},
): BacklogResult => {
  const includeWaiting = options.includeWaitingOrders !== false;
  const todayStart = startOfLocalDay(today);
  const entries: BacklogEntry[] = [];

  orders.forEach(order => {
    const orderStatus = order.status || "";
    if (CLOSED_ORDER_STATUSES.has(orderStatus)) return;
    if (!includeWaiting && orderStatus === "Aguardando Produção") return;

    const orderLabel = order.internalOS || order.quotationNumber || `Pedido ${order.id}`;

    (order.items || []).forEach(item => {
      if (item.shippingDate) return;
      const itemWeight = (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0);

      (item.productionPlan || []).forEach(stage => {
        if (stage.status === "Concluído") return;
        const durationDays = Number(stage.durationDays) || 0;
        if (durationDays <= 0) return;

        let hours = durationDays * USEFUL_HOURS_PER_DAY;
        const inProgress = stage.status === "Em Andamento";
        const startDate = parseLocalDate(stage.startDate);
        if (inProgress && startDate && startDate < todayStart) {
          // Desconta o que já deveria ter sido feito desde o início, mantendo
          // ao menos 10% (a etapa ainda não foi marcada como concluída).
          const elapsed = countBusinessDays(startDate, todayStart);
          const remainingFraction = Math.min(1, Math.max(0.1, 1 - elapsed / durationDays));
          hours *= remainingFraction;
        }

        const sector = resolver.sectorOfStage(stage.stageName);
        entries.push({
          orderId: order.id,
          orderLabel,
          orderStatus,
          itemDescription: item.description || "",
          itemWeight,
          stageName: (stage.stageName || "").trim() || "Etapa sem nome",
          sectorKey: sector?.key ?? null,
          stageStatus: inProgress ? "em_andamento" : "pendente",
          hours,
        });
      });
    });
  });

  const bySector = new Map<string, SectorBacklog>();
  const unmappedEntries: BacklogEntry[] = [];
  entries.forEach(entry => {
    if (!entry.sectorKey) {
      unmappedEntries.push(entry);
      return;
    }
    const current = bySector.get(entry.sectorKey) || { inProgressHours: 0, pendingHours: 0, totalHours: 0, entries: [] };
    if (entry.stageStatus === "em_andamento") current.inProgressHours += entry.hours;
    else current.pendingHours += entry.hours;
    current.totalHours += entry.hours;
    current.entries.push(entry);
    bySector.set(entry.sectorKey, current);
  });

  return { entries, bySector, unmappedEntries };
};

// ─── Ocupação por setor ──────────────────────────────────────────────────────

export interface SectorOccupancy {
  key: string;
  name: string;
  people: number;
  availableToday: number;
  hoursPerDayToday: number;
  backlogHours: number;
  inProgressHours: number;
  pendingHours: number;
  /** Horas disponíveis nos próximos `windowBusinessDays` dias úteis. */
  windowCapacityHours: number;
  /** Carga ÷ capacidade da janela (pode passar de 1). */
  occupancy: number;
  /** Dias úteis até o setor terminar a fila atual (null se o setor não tem pessoas). */
  queueBusinessDays: number | null;
  hasCapacity: boolean;
  matchesCostCenter: boolean;
  entries: BacklogEntry[];
}

export const summarizeSectorOccupancy = (
  model: CapacityModel,
  backlog: BacklogResult,
  resolver: SectorResolver,
  today: Date = new Date(),
  windowBusinessDays = 20,
  extraSectorKeys: string[] = [],
): SectorOccupancy[] => {
  const todayStart = startOfLocalDay(today);
  const keys = new Set<string>([...model.sectors.keys(), ...backlog.bySector.keys(), ...extraSectorKeys]);

  return Array.from(keys).map(key => {
    const info = model.sectors.get(key);
    const load = backlog.bySector.get(key);
    const backlogHours = load?.totalHours || 0;

    let windowCapacityHours = 0;
    let businessDaysSeen = 0;
    let remaining = backlogHours;
    let queueBusinessDays: number | null = backlogHours > 0 ? null : 0;
    let cursor = todayStart;

    // Percorre os dias até cobrir a janela e esvaziar a fila (limite de ~3 anos).
    for (let index = 0; index < 1100; index++) {
      const capacity = model.capacityOn(key, cursor);
      const business = isBusinessDay(cursor);
      if (business) businessDaysSeen += 1;

      const inWindow = business ? businessDaysSeen <= windowBusinessDays : businessDaysSeen < windowBusinessDays;
      if (inWindow) windowCapacityHours += capacity;

      if (queueBusinessDays === null && capacity > 0) {
        remaining -= capacity;
        if (remaining <= 1e-6) queueBusinessDays = Math.max(1, businessDaysSeen);
      }

      const windowDone = businessDaysSeen >= windowBusinessDays;
      if (windowDone && (queueBusinessDays !== null || windowCapacityHours <= 0)) break;
      cursor = addCalendarDays(cursor, 1);
    }

    const hasCapacity = windowCapacityHours > 0;
    return {
      key,
      name: info?.name || resolver.sectorName(key),
      people: info?.people || 0,
      availableToday: info?.availableToday || 0,
      hoursPerDayToday: info?.hoursPerDayToday || 0,
      backlogHours,
      inProgressHours: load?.inProgressHours || 0,
      pendingHours: load?.pendingHours || 0,
      windowCapacityHours,
      occupancy: hasCapacity ? backlogHours / windowCapacityHours : (backlogHours > 0 ? Infinity : 0),
      queueBusinessDays: hasCapacity ? queueBusinessDays : null,
      hasCapacity,
      matchesCostCenter: info?.matchesCostCenter ?? true,
      entries: load?.entries || [],
    };
  }).sort((a, b) => {
    const aOcc = Number.isFinite(a.occupancy) ? a.occupancy : 1e9;
    const bOcc = Number.isFinite(b.occupancy) ? b.occupancy : 1e9;
    return bOcc - aOcc || a.name.localeCompare(b.name, "pt-BR");
  });
};

// ─── Simulação de prazo de novos itens ───────────────────────────────────────

export interface ScheduleJobStage {
  stageName: string;
  /** Horas da etapa para o item/lote inteiro. */
  hours: number;
}

export interface ScheduleJob {
  id: string;
  label: string;
  stages: ScheduleJobStage[];
}

export interface ScheduledStage {
  jobId: string;
  jobLabel: string;
  stageName: string;
  sectorKey: string | null;
  sectorName: string;
  hours: number;
  /** Dias úteis de execução sem fila (hours ÷ horas úteis do dia). */
  baseBusinessDays: number;
  readyDate: Date;
  startDate: Date;
  endDate: Date;
  /** Dias úteis que a etapa esperou o setor liberar. */
  waitBusinessDays: number;
  /** Dias úteis entre ficar pronta para começar e terminar. */
  elapsedBusinessDays: number;
  /** Ocupação do setor na janela de 20 dias úteis (antes deste pedido). */
  sectorOccupancy: number;
  /** Setor sem pessoas cadastradas: a etapa foi tratada sem fila. */
  uncapacitated: boolean;
  /** Etapa sem centro de custo vinculado: tratada sem fila. */
  unmapped: boolean;
}

export interface ScheduleResult {
  stages: ScheduledStage[];
  jobs: Array<{ id: string; label: string; completionDate: Date; leadTimeBusinessDays: number }>;
  completionDate: Date;
  /** Dias úteis de hoje até a conclusão. */
  leadTimeBusinessDays: number;
  /** A simulação chegou ao limite de dias sem concluir. */
  truncated: boolean;
}

export const simulateSchedule = (
  jobs: ScheduleJob[],
  model: CapacityModel,
  backlog: BacklogResult,
  resolver: SectorResolver,
  occupancyBySector: Map<string, number>,
  today: Date = new Date(),
  maxCalendarDays = 1100,
): ScheduleResult => {
  const start = startOfLocalDay(today);
  const dateAt = (index: number) => addCalendarDays(start, index);

  // Horas livres de cada setor por dia (calculadas sob demanda).
  const free = new Map<string, number[]>();
  const getFree = (sectorKey: string, index: number): number => {
    let list = free.get(sectorKey);
    if (!list) {
      list = [];
      free.set(sectorKey, list);
    }
    if (list[index] === undefined) list[index] = model.capacityOn(sectorKey, dateAt(index));
    return list[index];
  };
  const consume = (sectorKey: string, index: number, hours: number) => {
    getFree(sectorKey, index);
    const list = free.get(sectorKey)!;
    list[index] = Math.max(0, list[index] - hours);
  };

  // A fila atual ocupa primeiro a capacidade dos próximos dias.
  backlog.bySector.forEach((load, sectorKey) => {
    let remaining = load.totalHours;
    for (let index = 0; remaining > 1e-6 && index < maxCalendarDays; index++) {
      const available = getFree(sectorKey, index);
      if (available <= 0) continue;
      const used = Math.min(available, remaining);
      consume(sectorKey, index, used);
      remaining -= used;
    }
  });

  const hasCapacity = (sectorKey: string) => {
    for (let index = 0; index < 60; index++) {
      if (model.capacityOn(sectorKey, dateAt(index)) > 0) return true;
    }
    return false;
  };
  const capacityCache = new Map<string, boolean>();
  const sectorHasCapacity = (sectorKey: string) => {
    if (!capacityCache.has(sectorKey)) capacityCache.set(sectorKey, hasCapacity(sectorKey));
    return capacityCache.get(sectorKey)!;
  };

  const scheduled: ScheduledStage[] = [];
  const jobResults: ScheduleResult["jobs"] = [];
  let truncated = false;
  let latestIndex = 0;

  jobs.forEach(job => {
    // Posição do item: dia e horas já usadas pela equipe nesse dia.
    let dayIndex = 0;
    let usedToday = 0;

    job.stages.forEach(stage => {
      const hours = Math.max(0, Number(stage.hours) || 0);
      if (hours <= 0) return;

      const sector = resolver.sectorOfStage(stage.stageName);
      const sectorKey = sector?.key ?? null;
      const unmapped = !sectorKey;
      const uncapacitated = !unmapped && !sectorHasCapacity(sectorKey!);
      const queued = !unmapped && !uncapacitated;

      // Se a equipe já usou o dia todo, começa no próximo dia.
      if (usedToday >= USEFUL_HOURS_PER_DAY - 1e-6) {
        dayIndex += 1;
        usedToday = 0;
      }
      const readyIndex = dayIndex;
      let startIndex: number | null = null;
      let remaining = hours;

      while (remaining > 1e-6) {
        if (dayIndex >= maxCalendarDays) {
          truncated = true;
          break;
        }
        const date = dateAt(dayIndex);
        const crewLimit = USEFUL_HOURS_PER_DAY - usedToday;
        let possible = 0;
        if (queued) {
          possible = Math.min(crewLimit, getFree(sectorKey!, dayIndex));
        } else if (isBusinessDay(date)) {
          possible = crewLimit;
        }

        if (possible > 1e-6) {
          const used = Math.min(possible, remaining);
          if (startIndex === null) startIndex = dayIndex;
          if (queued) consume(sectorKey!, dayIndex, used);
          remaining -= used;
          usedToday += used;
        }

        if (remaining > 1e-6) {
          dayIndex += 1;
          usedToday = 0;
        }
      }

      const endIndex = dayIndex;
      const readyDate = dateAt(readyIndex);
      const startDate = dateAt(startIndex ?? endIndex);
      const endDate = dateAt(endIndex);
      latestIndex = Math.max(latestIndex, endIndex);

      scheduled.push({
        jobId: job.id,
        jobLabel: job.label,
        stageName: stage.stageName,
        sectorKey,
        sectorName: sector?.name || "Sem centro de custo",
        hours,
        baseBusinessDays: hours / USEFUL_HOURS_PER_DAY,
        readyDate,
        startDate,
        endDate,
        waitBusinessDays: countBusinessDays(readyDate, startDate),
        elapsedBusinessDays: countBusinessDays(readyDate, addCalendarDays(endDate, 1)),
        sectorOccupancy: sectorKey ? (occupancyBySector.get(sectorKey) ?? 0) : 0,
        uncapacitated,
        unmapped,
      });
    });

    const completionDate = dateAt(dayIndex);
    jobResults.push({
      id: job.id,
      label: job.label,
      completionDate,
      leadTimeBusinessDays: countBusinessDays(start, addCalendarDays(completionDate, 1)),
    });
  });

  const completionDate = dateAt(latestIndex);
  return {
    stages: scheduled,
    jobs: jobResults,
    completionDate,
    leadTimeBusinessDays: countBusinessDays(start, addCalendarDays(completionDate, 1)),
    truncated,
  };
};

