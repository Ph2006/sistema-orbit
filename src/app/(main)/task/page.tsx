// IMPORTANTE: este arquivo deve permanecer salvo em UTF-8.
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { useAuth } from "../layout";
import { format, startOfWeek, endOfWeek, isWithinInterval, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  PlayCircle, 
  ChevronLeft,
  ChevronRight,
  Download,
  Target,
  BarChart3,
  Filter,
  Package,
  Settings,
  User,
  Edit,
  Play,
  Pause,
  Ban,
  Plus,
  ListChecks,
  CheckSquare,
  Trash2,
  Search
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/dashboard/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

// Tipos simplificados
type AssignedResource = {
  resourceId: string;
  resourceName: string;
  resourceType: string;
};

type AssignedSupervisor = {
  memberId: string;
  memberName: string;
  memberPosition: string;
};

type TaskAllocation = {
  taskId: string;
  resourceId?: string;
  supervisorId?: string;
  scheduledDate?: string;
  notes?: string;
  estimatedHours?: number;
};

type SimpleTask = {
  id: string;
  itemIndex: number;
  stageIndex: number;
  orderId: string;
  orderNumber: string;
  customerName: string;
  itemId: string;
  itemDescription: string;
  itemCode?: string;
  itemNumber?: string;
  stageName: string;
  assignedResource?: AssignedResource;
  supervisor?: AssignedSupervisor;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  completedDate: Date | null;
  priority: string;
  estimatedHours: number;
  actualHours?: number;
  notes?: string;
  progress: number;
};

type Resource = {
  id: string;
  name: string;
  type: string;
  status: string;
  location?: string;
};

type TeamMember = {
  id: string;
  name: string;
  position: string;
  email: string;
  permission: string;
};

type CompanyData = {
  nomeFantasia?: string;
  logo?: { preview?: string };
  endereco?: string;
  cnpj?: string;
  email?: string;
  celular?: string;
};

const UNASSIGNED_SELECT_VALUE = '__unassigned__';

const RESPONSIBLE_SECTORS: Resource[] = [
  'PCP',
  'Compras',
  'Almoxarifado',
  'Preparação',
  'Montagem',
  'Solda',
  'Controle da qualidade',
  'Jato',
  'Pintura',
  'Usinagem',
  'Célula Robótica',
  'Furação',
  'Desempeno',
  'Montagem Mecânica',
  'Peritagem',
].map((name) => ({
  id: `setor-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name,
  type: 'Setor',
  status: 'disponivel',
}));

const normalizeStatus = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const isClosedOrderStatus = (value: unknown) => [
  'concluido',
  'concluida',
  'entregue',
  'finalizado',
  'finalizada',
  'expedido',
  'expedida',
  'encerrado',
  'encerrada',
  'cancelado',
  'cancelada',
].includes(normalizeStatus(value));

type TaskStatus =
  | 'Programada'
  | 'Liberada para execução'
  | 'Em execução'
  | 'Bloqueada'
  | 'Parcialmente concluída'
  | 'Não concluída'
  | 'Concluída'
  | 'Cancelada';

type ReleaseChecklist = {
  drawingLatestRevision: boolean;
  materialsReady: boolean;
  equipmentAvailable: boolean;
  inputsAvailable: boolean;
};

type DailyTask = {
  id: string;
  sourceTaskId?: string;
  executionDate: Date;
  orderId: string;
  orderNumber: string;
  customerName: string;
  itemId: string;
  itemDescription: string;
  itemCode: string;
  stageName: string;
  stageOrder: number;
  resourceId: string;
  resourceName: string;
  responsibleId: string;
  responsibleName: string;
  plannedQuantity: number;
  plannedHours: number;
  executedHours: number;
  priority: string;
  checklist: ReleaseChecklist;
  blockReason: string;
  status: TaskStatus;
  progress: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  activeSince: Date | null;
};

const EMPTY_CHECKLIST: ReleaseChecklist = {
  drawingLatestRevision: false,
  materialsReady: false,
  equipmentAvailable: false,
  inputsAvailable: false,
};

const CHECKLIST_FIELDS: { key: keyof ReleaseChecklist; label: string }[] = [
  { key: 'drawingLatestRevision', label: 'Desenho na última revisão disponível?' },
  { key: 'materialsReady', label: 'Materiais preparados disponíveis para o recurso?' },
  { key: 'equipmentAvailable', label: 'Equipamentos disponíveis para o recurso?' },
  { key: 'inputsAvailable', label: 'Insumos disponíveis para o recurso?' },
];

const isChecklistComplete = (c: ReleaseChecklist) =>
  c.drawingLatestRevision && c.materialsReady && c.equipmentAvailable && c.inputsAvailable;

const priorityRank = (p: string) =>
  (({ urgente: 4, alta: 3, media: 2, baixa: 1 } as Record<string, number>)[p] || 0);

const HOURS_PER_DAY = 8; // jornada usada para converter horas em dias
const RESOURCE_DAILY_CAPACITY = HOURS_PER_DAY; // 8h por recurso/dia

const isBusinessDay = (d: Date) => {
  const g = d.getDay();
  return g !== 0 && g !== 6; // se quiser, inclua feriados aqui
};

const nextBusinessDay = (d: Date) => {
  const r = new Date(d);
  do {
    r.setDate(r.getDate() + 1);
  } while (!isBusinessDay(r));
  return r;
};

const addBusinessDays = (start: Date, days: number) => {
  let r = new Date(start);
  let rem = days;
  while (rem > 0) {
    r = nextBusinessDay(r);
    rem--;
  }
  return r;
};

const hoursToDays = (h: number) => Math.max(1, Math.ceil((h || 0) / HOURS_PER_DAY));

// Encadeia etapas: cada uma começa no dia útil seguinte ao término da anterior
const predictChain = (
  startDate: Date,
  stages: { estimatedHours: number }[]
) => {
  let start = isBusinessDay(startDate) ? new Date(startDate) : nextBusinessDay(startDate);
  return stages.map((s, i) => {
    if (i > 0) start = nextBusinessDay(start);
    const durationDays = hoursToDays(s.estimatedHours);
    const finish = durationDays <= 1 ? new Date(start) : addBusinessDays(start, durationDays - 1);
    const predicted = { start: new Date(start), finish };
    start = finish;
    return predicted;
  });
};

type TaskFormState = {
  executionDate: string;
  orderId: string;
  itemId: string;
  stageName: string;
  stageOrder: number;
  resourceId: string;
  responsibleId: string;
  plannedQuantity: number;
  plannedHours: number;
  priority: string;
  checklist: ReleaseChecklist;
  blockReason: string;
  status: TaskStatus;
  scheduleChain: boolean;
};

const newTaskForm = (): TaskFormState => ({
  executionDate: format(new Date(), 'yyyy-MM-dd'),
  orderId: '',
  itemId: '',
  stageName: '',
  stageOrder: 0,
  resourceId: '',
  responsibleId: '',
  plannedQuantity: 0,
  plannedHours: 0,
  priority: 'media',
  checklist: { ...EMPTY_CHECKLIST },
  blockReason: '',
  status: 'Programada',
  scheduleChain: false,
});


export default function TasksPage() {
  // Estados simplificados
  const [tasks, setTasks] = useState<SimpleTask[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [companyData, setCompanyData] = useState<CompanyData>({});
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const { toast } = useToast();

  // Estados de filtro e navegação
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterResource, setFilterResource] = useState<string>('all');
  const [filterSupervisor, setFilterSupervisor] = useState<string>('all');
  const [filterOrderNumber, setFilterOrderNumber] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [taskPage, setTaskPage] = useState(1);
  const TASKS_PER_PAGE = 100;
  
  // Novos estados para alocação
  const [selectedTask, setSelectedTask] = useState<SimpleTask | null>(null);
  const [isAllocationDialogOpen, setIsAllocationDialogOpen] = useState(false);
  const [allocationData, setAllocationData] = useState<TaskAllocation>({
    taskId: '',
    resourceId: undefined,
    supervisorId: undefined,
    notes: '',
    estimatedHours: 0
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const leadershipMembers = useMemo(() => {
    return teamMembers
      .filter(member => Boolean(String(member.id || '').trim()))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [teamMembers]);

  // Estados para tarefas do dia
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(newTaskForm());
  const [dailyFilterDate, setDailyFilterDate] = useState<Date>(new Date());
  const [scheduleViewMode, setScheduleViewMode] = useState<'day' | 'week'>('day');
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [, setTick] = useState(0);

  // Função simplificada para determinar prioridade
  const determinePriority = (orderData: any): string => {
    try {
      if (!orderData.deliveryDate) return "baixa";
      
      let deliveryDate: Date;
      
      // Tratar diferentes formatos de data
      if (orderData.deliveryDate.seconds) {
        // Timestamp do Firestore
        deliveryDate = new Date(orderData.deliveryDate.seconds * 1000);
      } else if (orderData.deliveryDate.toDate && typeof orderData.deliveryDate.toDate === 'function') {
        // Timestamp com método toDate
        deliveryDate = orderData.deliveryDate.toDate();
      } else if (orderData.deliveryDate instanceof Date) {
        // Já é uma Date
        deliveryDate = orderData.deliveryDate;
      } else {
        // String ou número
        deliveryDate = new Date(orderData.deliveryDate);
      }
      
      // Verificar se a data é válida
      if (isNaN(deliveryDate.getTime())) {
        console.warn('Data de entrega inválida:', orderData.deliveryDate);
        return "baixa";
      }
      
      const today = new Date();
      const daysUntilDelivery = Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDelivery < 0) return "urgente";
      if (daysUntilDelivery <= 3) return "alta";
      if (daysUntilDelivery <= 7) return "media";
      return "baixa";
    } catch (error) {
      console.error('Erro ao determinar prioridade:', error);
      return "baixa";
    }
  };

  // Função auxiliar para validar dados de data
  const safeToDate = (dateField: any): Date | null => {
    if (!dateField) return null;
    
    try {
      if (dateField.toDate && typeof dateField.toDate === 'function') {
        return dateField.toDate();
      }
      
      if (dateField instanceof Date) {
        return dateField;
      }
      
      if (typeof dateField === 'string' || typeof dateField === 'number') {
        const date = new Date(dateField);
        return isNaN(date.getTime()) ? null : date;
      }
      
      return null;
    } catch (error) {
      console.warn('Erro ao converter data:', error);
      return null;
    }
  };

  // Função simplificada para buscar tarefas dos pedidos
  const fetchTasksFromOrders = async () => {
    console.log('🔍 Buscando tarefas dos pedidos...');
    try {
      const ordersRef = collection(db, "companies", "mecald", "orders");
      const ordersSnapshot = await getDocs(ordersRef);
      
      if (ordersSnapshot.empty) {
        console.log('Nenhum pedido encontrado');
        setTasks([]);
        return;
      }
      
      const tasksList: SimpleTask[] = [];
      
      // Processar cada documento com tratamento individual de erro
      ordersSnapshot.docs.forEach(orderDoc => {
        try {
          const orderData = orderDoc.data();
          
          // Processar pedidos ativos
          if (!['Em Produção', 'Aguardando Produção', 'Pronto para Entrega'].includes(orderData.status)) {
            return;
          }
          
          // CORREÇÃO: Verificar se items é um array
          const items = orderData.items;
          if (!Array.isArray(items)) {
            console.warn(`Pedido ${orderDoc.id} não possui items válidos:`, items);
            return;
          }
          
          items.forEach((item: any, itemIndex: number) => {
            // CORREÇÃO: Verificar se productionPlan é um array
            const productionPlan = item.productionPlan;
            if (!Array.isArray(productionPlan)) {
              console.warn(`Item ${item.id || itemIndex} não possui productionPlan válido:`, productionPlan);
              return;
            }
            
            productionPlan.forEach((stage: any, stageIndex: number) => {
              try {
                // Validações básicas
                if (!stage || typeof stage !== 'object') {
                  console.warn(`Etapa inválida no item ${itemIndex}:`, stage);
                  return;
                }
                
                if (!stage.stageName || typeof stage.stageName !== 'string') {
                  console.warn(`Nome da etapa inválido:`, stage);
                  return;
                }
                
                // Só incluir etapas que não estão concluídas
                if (stage.status !== 'Concluído') {
                  // Determinar status da tarefa com validação
                  let taskStatus = stage.status || 'Pendente';
                  const endDate = safeToDate(stage.completedDate);
                  
                  if (endDate && endDate < new Date() && stage.status !== 'Concluído') {
                    taskStatus = 'Atrasado';
                  }

                  // Calcular progresso
                  const progress = taskStatus === 'Concluído' ? 100 : 
                                 taskStatus === 'Em Andamento' ? 50 : 0;

                  // Validar dados do recurso atribuído
                  let assignedResource = undefined;
                  if (stage.assignedResource && typeof stage.assignedResource === 'object') {
                    assignedResource = {
                      resourceId: String(stage.assignedResource.resourceId || ''),
                      resourceName: String(stage.assignedResource.resourceName || ''),
                      resourceType: String(stage.assignedResource.resourceType || '')
                    };
                  }

                  // Validar dados do supervisor
                  let supervisor = undefined;
                  if (stage.supervisor && typeof stage.supervisor === 'object') {
                    supervisor = {
                      memberId: String(stage.supervisor.memberId || ''),
                      memberName: String(stage.supervisor.memberName || ''),
                      memberPosition: String(stage.supervisor.memberPosition || '')
                    };
                  }

                  const resolvedItemId = String(item.id || `item-${itemIndex}`);

                  tasksList.push({
                    id: `${orderDoc.id}-${itemIndex}-${resolvedItemId}-${stageIndex}`,
                    itemIndex,
                    stageIndex,
                    orderId: orderDoc.id,
                    orderNumber: String(orderData.quotationNumber || orderData.orderNumber || 'N/A'),
                    customerName: String(orderData.customer?.name || 'Cliente não informado'),
                    itemId: resolvedItemId,
                    itemDescription: String(item.description || 'Sem descrição'),
                    itemCode: String(item.code || item.product_code || ''),
                    itemNumber: item.itemNumber ? String(item.itemNumber) : undefined,
                    stageName: String(stage.stageName),
                    assignedResource,
                    supervisor,
                    status: String(taskStatus),
                    startDate: safeToDate(stage.startDate),
                    endDate: endDate,
                    completedDate: safeToDate(stage.completedDate),
                    priority: determinePriority(orderData),
                    estimatedHours: Number(stage.durationDays || 1) * 8,
                    actualHours: stage.actualHours ? Number(stage.actualHours) : undefined,
                    notes: stage.notes ? String(stage.notes) : undefined,
                    progress,
                  });
                }
              } catch (stageError) {
                console.error(`Erro ao processar etapa ${stageIndex} do item ${itemIndex}:`, stageError);
              }
            });
          });
        } catch (docError) {
          console.error(`Erro ao processar pedido ${orderDoc.id}:`, docError);
          // Continua processando outros documentos
        }
      });
      
      console.log('📊 Total de tarefas encontradas:', tasksList.length);
      setTasks(tasksList);
    } catch (error) {
      console.error("Erro ao buscar tarefas:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar tarefas",
        description: "Não foi possível carregar as tarefas dos pedidos.",
      });
      setTasks([]); // Definir array vazio em caso de erro
    }
  };

  // Adicionar função para buscar recursos e membros da equipe
  const fetchResourcesAndTeam = async () => {
    try {
      // Buscar recursos
      const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
      const resourcesSnap = await getDoc(resourcesRef);
      if (resourcesSnap.exists()) {
        const resourcesData = resourcesSnap.data().resources || [];
        setResources(resourcesData.filter((r: any) => r.status !== 'inativo'));
      }

      // Buscar membros da equipe
      const teamRef = doc(db, "companies", "mecald", "settings", "team");
      const teamSnap = await getDoc(teamRef);
      if (teamSnap.exists()) {
        setTeamMembers(teamSnap.data().members || []);
      }
    } catch (error) {
      console.error("Erro ao buscar recursos e equipe:", error);
    }
  };


  // Buscar tarefas programadas para o dia
  const fetchDailyTasks = async () => {
    try {
      const dailyTasksRef = collection(db, "companies", "mecald", "dailyTasks");
      const ordersRef = collection(db, "companies", "mecald", "orders");
      const [snap, ordersSnap] = await Promise.all([
        getDocs(dailyTasksRef),
        getDocs(ordersRef),
      ]);

      // Uma tarefa diária só permanece visível enquanto o pedido de origem estiver aberto.
      // Isso também limpa visualmente tarefas antigas que ficaram gravadas antes da conclusão.
      const openOrderIds = new Set(
        ordersSnap.docs
          .filter(orderDoc => {
            const orderData = orderDoc.data();
            const status = orderData.status ?? orderData.orderStatus ?? orderData.statusPedido;
            return !isClosedOrderStatus(status);
          })
          .map(orderDoc => orderDoc.id)
      );

      const list: DailyTask[] = snap.docs
        .filter(d => openOrderIds.has(String(d.data().orderId || '')))
        .map(d => {
        const data = d.data();
        return {
          id: d.id,
          sourceTaskId: data.sourceTaskId || undefined,
          executionDate: safeToDate(data.executionDate) || new Date(),
          orderId: data.orderId || '',
          orderNumber: data.orderNumber || '',
          customerName: data.customerName || '',
          itemId: data.itemId || '',
          itemDescription: data.itemDescription || '',
          itemCode: data.itemCode || '',
          stageName: data.stageName || '',
          stageOrder: Number(data.stageOrder) || 0,
          resourceId: data.resourceId || '',
          resourceName: data.resourceName || '',
          responsibleId: data.responsibleId || '',
          responsibleName: data.responsibleName || '',
          plannedQuantity: Number(data.plannedQuantity) || 0,
          plannedHours: Number(data.plannedHours) || 0,
          executedHours: Number(data.executedHours) || 0,
          priority: data.priority || 'media',
          checklist: { ...EMPTY_CHECKLIST, ...(data.checklist || {}) },
          blockReason: data.blockReason || '',
          status: (data.status || 'Programada') as TaskStatus,
          progress: Number(data.progress) || 0,
          createdAt: safeToDate(data.createdAt) || new Date(),
          startedAt: safeToDate(data.startedAt),
          completedAt: safeToDate(data.completedAt),
          activeSince: safeToDate(data.activeSince),
        };
      });
      setDailyTasks(list);
    } catch (e) {
      console.error("Erro ao buscar tarefas do dia:", e);
    }
  };

  // Calcular setores com e sem tarefas pendentes
  const getResourcesAllocation = useMemo(() => {
    const allocatedResources = new Set(
      tasks
        .filter(task => task.status !== 'Concluído')
        .map(task => task.assignedResource?.resourceId)
        .filter(Boolean)
    );
    
    const totalResources = RESPONSIBLE_SECTORS.length;
    const allocated = allocatedResources.size;
    const idle = totalResources - allocated;
    
    return {
      total: totalResources,
      allocated,
      idle,
      allocationRate: totalResources > 0 ? (allocated / totalResources) * 100 : 0
    };
  }, [tasks]);

  // Buscar dados iniciais
  const fetchInitialData = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Buscar recursos
      const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
      const resourcesSnap = await getDoc(resourcesRef);
      if (resourcesSnap.exists()) {
        setResources(resourcesSnap.data().resources || []);
      }

      // Buscar equipe
      const teamRef = doc(db, "companies", "mecald", "settings", "team");
      const teamSnap = await getDoc(teamRef);
      if (teamSnap.exists()) {
        setTeamMembers(teamSnap.data().members || []);
      }

      // Buscar dados da empresa
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const companySnap = await getDoc(companyRef);
      if (companySnap.exists()) {
        setCompanyData(companySnap.data() as CompanyData);
      }

      // Buscar tarefas dos pedidos
      await fetchTasksFromOrders();

    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar os dados do sistema.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // UseEffect principal
  useEffect(() => {
    if (!authLoading && userId) {
      const loadData = async () => {
        await Promise.all([
          fetchTasksFromOrders(),
          fetchResourcesAndTeam(),
          fetchDailyTasks()
        ]);
        setIsLoading(false);
      };
      loadData();
    }
  }, [userId, authLoading]);

  useEffect(() => {
    if (!dailyTasks.some(t => t.status === 'Em execução')) return;
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, [dailyTasks]);

  // Navegação de período
  const navigatePeriod = (direction: 'prev' | 'next') => {
    if (viewMode === 'week') {
      setCurrentDate(prev => direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1));
    } else {
      setCurrentDate(prev => direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1));
    }
  };

  // Filtrar tarefas por período
  const getFilteredTasks = useMemo(() => {
    if (!Array.isArray(tasks)) {
      console.warn('Tasks não é um array:', tasks);
      return [];
    }
    
    let periodStart: Date;
    let periodEnd: Date;

    if (viewMode === 'week') {
      periodStart = startOfWeek(currentDate, { locale: ptBR });
      periodEnd = endOfWeek(currentDate, { locale: ptBR });
    } else {
      periodStart = startOfMonth(currentDate);
      periodEnd = endOfMonth(currentDate);
    }

    return tasks.filter(task => {
      // Verificar se task é válido
      if (!task || typeof task !== 'object') {
        console.warn('Task inválido encontrado:', task);
        return false;
      }
      
      // Filtro por período - verificar se startDate é válido
      const normalizedOrderQuery = filterOrderNumber
        .trim()
        .toLowerCase()
        .replace(/^os\s*/i, '')
        .replace(/\s+/g, '');
      const normalizedTaskOrder = String(task.orderNumber || '')
        .trim()
        .toLowerCase()
        .replace(/^os\s*/i, '')
        .replace(/\s+/g, '');
      const orderMatch = !normalizedOrderQuery || normalizedTaskOrder.includes(normalizedOrderQuery);

      // Ao pesquisar uma OS, apresenta todas as pendências dela, mesmo que estejam
      // fora da semana/mês atualmente selecionado.
      const isInPeriod = normalizedOrderQuery
        ? true
        : Boolean(task.startDate && isWithinInterval(task.startDate, { start: periodStart, end: periodEnd }));
      
      // Filtros adicionais
      const statusMatch = filterStatus === 'all' || task.status === filterStatus;
      const resourceMatch = filterResource === 'all' || 
        (filterResource === 'unassigned' ? !task.assignedResource : task.assignedResource?.resourceId === filterResource);
      const supervisorMatch = filterSupervisor === 'all' || 
        (filterSupervisor === 'unassigned' ? !task.supervisor : task.supervisor?.memberId === filterSupervisor);
      const priorityMatch = filterPriority === 'all' || normalizeStatus(task.priority) === filterPriority;

      return isInPeriod && orderMatch && statusMatch && resourceMatch && supervisorMatch && priorityMatch;
    });
  }, [tasks, currentDate, viewMode, filterStatus, filterResource, filterSupervisor, filterOrderNumber, filterPriority]);

  const totalTaskPages = Math.max(1, Math.ceil(getFilteredTasks.length / TASKS_PER_PAGE));
  const paginatedTasks = useMemo(() => {
    const safePage = Math.min(taskPage, totalTaskPages);
    const start = (safePage - 1) * TASKS_PER_PAGE;
    return getFilteredTasks.slice(start, start + TASKS_PER_PAGE);
  }, [getFilteredTasks, taskPage, totalTaskPages]);

  // Estatísticas simplificadas
  const tasksSummary = useMemo(() => {
    const total = getFilteredTasks.length;
    const completed = getFilteredTasks.filter(t => t.status === 'Concluído').length;
    const pending = getFilteredTasks.filter(t => t.status === 'Pendente').length;
    const inProgress = getFilteredTasks.filter(t => t.status === 'Em Andamento').length;
    const overdue = getFilteredTasks.filter(t => 
      t.status !== 'Concluído' && new Date() > t.endDate
    ).length;
    
    return {
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      overdueTasks: overdue,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }, [getFilteredTasks]);

  // A análise considera somente membros que já foram designados como líderes.
  // Assim a equipe operacional não é misturada com a responsabilidade de liderança.
  const leaderPerformance = useMemo(() => {
    const assignedLeaderIds = new Set(
      tasks
        .map(task => task.supervisor?.memberId)
        .filter((id): id is string => Boolean(id))
    );

    return leadershipMembers
      .filter(member => assignedLeaderIds.has(member.id))
      .map(member => {
        const leaderTasks = tasks.filter(task => task.supervisor?.memberId === member.id);
        const inProgress = leaderTasks.filter(task => task.status === 'Em Andamento').length;
        const overdue = leaderTasks.filter(task =>
          task.status !== 'Concluído' && Boolean(task.endDate) && new Date() > task.endDate!
        ).length;

        return {
          ...member,
          total: leaderTasks.length,
          inProgress,
          overdue,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  }, [tasks, leadershipMembers]);


  // Opções em cascata reaproveitando "tasks" (pedidos -> produto -> etapa)
  const orderOptions = useMemo(() => {
    const map = new Map<string, { orderId: string; orderNumber: string; customerName: string }>();
    tasks.forEach(t => {
      if (!map.has(t.orderId)) {
        map.set(t.orderId, { orderId: t.orderId, orderNumber: t.orderNumber, customerName: t.customerName });
      }
    });
    return Array.from(map.values());
  }, [tasks]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, { itemId: string; itemDescription: string; itemCode: string }>();
    tasks.filter(t => t.orderId === taskForm.orderId).forEach(t => {
      if (!map.has(t.itemId)) {
        map.set(t.itemId, { itemId: t.itemId, itemDescription: t.itemDescription, itemCode: t.itemCode || '' });
      }
    });
    return Array.from(map.values());
  }, [tasks, taskForm.orderId]);

  const stageOptions = useMemo(() => {
    return tasks
      .filter(t => t.orderId === taskForm.orderId && t.itemId === taskForm.itemId)
      .map(t => ({ stageName: t.stageName, estimatedHours: t.estimatedHours }));
  }, [tasks, taskForm.orderId, taskForm.itemId]);

  const dailyTasksForDate = useMemo(() => {
    return dailyTasks
      .filter(t => isSameDay(t.executionDate, dailyFilterDate) && Boolean(t.resourceId) && Boolean(t.responsibleId))
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
  }, [dailyTasks, dailyFilterDate]);

  const taskPredictions = useMemo(() => {
    const groups = new Map<string, DailyTask[]>();
    const result = new Map<string, { start: Date; finish: Date }>();

    dailyTasks
      .filter(t => t.status !== 'Cancelada')
      .forEach(t => {
        const k = `${t.orderId}__${t.itemId}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(t);
      });

    groups.forEach(list => {
      const ordered = [...list].sort((a, b) =>
        (a.stageOrder - b.stageOrder) || (a.executionDate.getTime() - b.executionDate.getTime())
      );

      let prevFinish: Date | null = null;
      ordered.forEach(t => {
        if (t.status === 'Concluída' && t.completedAt) {
          result.set(t.id, { start: t.startedAt || t.completedAt, finish: t.completedAt });
          prevFinish = t.completedAt;
          return;
        }

        let start = t.executionDate;
        if (prevFinish) {
          const afterPrev = nextBusinessDay(prevFinish);
          start = afterPrev > t.executionDate ? afterPrev : t.executionDate;
        }
        if (!isBusinessDay(start)) start = nextBusinessDay(start);

        const dur = hoursToDays(t.plannedHours);
        const finish = dur <= 1 ? new Date(start) : addBusinessDays(start, dur - 1);
        result.set(t.id, { start, finish });
        prevFinish = finish;
      });
    });

    return result;
  }, [dailyTasks]);

  const productForecast = useMemo(() => {
    const m = new Map<string, { orderNumber: string; itemCode: string; itemDescription: string; finish: Date; pending: number; total: number }>();

    dailyTasks.forEach(t => {
      if (t.status === 'Cancelada') return;
      const pred = taskPredictions.get(t.id);
      if (!pred) return;

      const k = `${t.orderId}__${t.itemId}`;
      const cur = m.get(k);
      const pending = t.status !== 'Concluída' ? 1 : 0;

      if (!cur) {
        m.set(k, {
          orderNumber: t.orderNumber,
          itemCode: t.itemCode,
          itemDescription: t.itemDescription,
          finish: pred.finish,
          pending,
          total: 1,
        });
      } else {
        if (pred.finish > cur.finish) cur.finish = pred.finish;
        cur.pending += pending;
        cur.total += 1;
      }
    });

    return Array.from(m.values()).sort((a, b) => a.finish.getTime() - b.finish.getTime());
  }, [dailyTasks, taskPredictions]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(weekAnchor, { locale: ptBR });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekAnchor]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, DailyTask[]>();
    weekDays.forEach(d => m.set(format(d, 'yyyy-MM-dd'), []));

    dailyTasks.forEach(t => {
      if (!t.resourceId || !t.responsibleId) return;
      const key = format(t.executionDate, 'yyyy-MM-dd');
      if (m.has(key)) m.get(key)!.push(t);
    });

    m.forEach(list => list.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority)));
    return m;
  }, [dailyTasks, weekDays]);

  // Mapa: 'yyyy-MM-dd' -> resourceId -> { name, hours, tasks[] }
  const resourceLoadByDay = useMemo(() => {
    const map = new Map<string, Map<string, { name: string; hours: number; tasks: DailyTask[] }>>();

    dailyTasks.forEach(t => {
      if (t.status === 'Cancelada' || t.status === 'Concluída' || !t.resourceId) return;

      const dayKey = format(t.executionDate, 'yyyy-MM-dd');
      if (!map.has(dayKey)) map.set(dayKey, new Map());

      const dayMap = map.get(dayKey)!;
      if (!dayMap.has(t.resourceId)) {
        dayMap.set(t.resourceId, { name: t.resourceName, hours: 0, tasks: [] });
      }

      const resourceLoad = dayMap.get(t.resourceId)!;
      resourceLoad.hours += t.plannedHours || 0;
      resourceLoad.tasks.push(t);
    });

    return map;
  }, [dailyTasks]);

  // Dias com pelo menos um recurso sobrecarregado
  const overloadedDays = useMemo(() => {
    const out = new Map<string, { resourceName: string; hours: number; count: number }[]>();

    resourceLoadByDay.forEach((dayMap, dayKey) => {
      const over: { resourceName: string; hours: number; count: number }[] = [];

      dayMap.forEach(resourceLoad => {
        if (resourceLoad.hours > RESOURCE_DAILY_CAPACITY) {
          over.push({
            resourceName: resourceLoad.name || '—',
            hours: resourceLoad.hours,
            count: resourceLoad.tasks.length,
          });
        }
      });

      if (over.length) out.set(dayKey, over);
    });

    return out;
  }, [resourceLoadByDay]);

  // Dias do mês para o mini-calendário (6 semanas)
  const capacityCalendarDays = useMemo(() => {
    const first = startOfMonth(calendarMonth);
    const start = startOfWeek(first, { locale: ptBR });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [calendarMonth]);

  const liveExecutedHours = (t: DailyTask): number => {
    let h = t.executedHours;
    if (t.status === 'Em execução' && t.activeSince) {
      h += (Date.now() - t.activeSince.getTime()) / 3600000;
    }
    return h;
  };

  const taskIPP = (t: DailyTask): number => {
    if (t.status === 'Concluída') return 100;
    if (t.plannedHours > 0) return Math.min(100, Math.round((liveExecutedHours(t) / t.plannedHours) * 100));
    return t.status === 'Em execução' ? 50 : 0;
  };

  const dailySummary = useMemo(() => {
    const list = dailyTasksForDate;
    const planned = list.reduce((s, t) => s + (t.plannedHours || 0), 0);
    const executed = list.reduce((s, t) => s + liveExecutedHours(t), 0);
    return {
      total: list.length,
      running: list.filter(t => t.status === 'Em execução').length,
      blocked: list.filter(t => t.status === 'Bloqueada').length,
      done: list.filter(t => t.status === 'Concluída').length,
      plannedHours: planned,
      executedHours: executed,
    };
  }, [dailyTasksForDate]);

  // Carrega dados da empresa para o cabeçalho do PDF
  const loadCompanyForPdf = async (): Promise<CompanyData> => {
    try {
      const ref = doc(db, "companies", "mecald", "settings", "company");
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data() as CompanyData) : {};
    } catch {
      return {};
    }
  };

  const pdfHeader = (docPdf: jsPDF, company: CompanyData, title: string, subtitle: string) => {
    const pageWidth = docPdf.internal.pageSize.width;
    let yPos = 15;

    if (company.logo?.preview) {
      try {
        docPdf.addImage(company.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
      } catch {}
    }

    docPdf.setFontSize(16).setFont('helvetica', 'bold');
    docPdf.text(company.nomeFantasia || 'Sua Empresa', 60, yPos + 6);
    docPdf.setFontSize(8).setFont('helvetica', 'normal');
    if (company.cnpj) docPdf.text(`CNPJ: ${company.cnpj}`, 60, yPos + 12);

    yPos = 40;
    docPdf.setFontSize(15).setFont('helvetica', 'bold');
    docPdf.text(title, pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;
    docPdf.setFontSize(11).setFont('helvetica', 'normal');
    docPdf.text(subtitle, pageWidth / 2, yPos, { align: 'center' });

    return yPos + 10;
  };

  const taskRow = (t: DailyTask) => ([
    t.orderNumber,
    t.itemCode || '-',
    t.stageName.length > 22 ? `${t.stageName.substring(0, 22)}…` : t.stageName,
    (t.resourceName || '—').substring(0, 18),
    (t.responsibleName || '—').substring(0, 16),
    `${t.plannedHours}h`,
    `${taskIPP(t)}%`,
    t.status,
  ]);

  const TASK_HEAD = [['Pedido', 'Produto', 'Etapa', 'Setor', 'Líder', 'Horas', 'IPP', 'Status']];

  const exportDailyPDF = async () => {
    const list = dailyTasksForDate;

    if (list.length === 0) {
      toast({ variant: "destructive", title: "Sem tarefas", description: "Não há tarefas para esta data." });
      return;
    }

    toast({ title: "Gerando PDF...", description: "Por favor, aguarde." });

    try {
      const company = await loadCompanyForPdf();
      const docPdf = new jsPDF({ orientation: 'landscape' });
      const yPos = pdfHeader(
        docPdf,
        company,
        'PROGRAMAÇÃO DIÁRIA DE TAREFAS',
        format(dailyFilterDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      );

      autoTable(docPdf, {
        startY: yPos,
        head: TASK_HEAD,
        body: list.map(taskRow),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255 },
      });

      // Resumo de carga por recurso no dia
      const dayKey = format(dailyFilterDate, 'yyyy-MM-dd');
      const dayLoad = resourceLoadByDay.get(dayKey);

      if (dayLoad && dayLoad.size > 0) {
        let y = (docPdf as any).lastAutoTable.finalY + 8;

        docPdf.setFontSize(11).setFont('helvetica', 'bold');
        docPdf.text('CARGA POR RECURSO', 14, y);
        y += 2;

        const loadBody = Array.from(dayLoad.values()).map(resourceLoad => [
          resourceLoad.name || '—',
          `${resourceLoad.hours}h / ${RESOURCE_DAILY_CAPACITY}h`,
          resourceLoad.tasks.length.toString(),
          resourceLoad.hours > RESOURCE_DAILY_CAPACITY ? 'SOBRECARGA' : 'OK',
        ]);

        autoTable(docPdf, {
          startY: y + 2,
          head: [['Recurso', 'Carga', 'Tarefas', 'Situação']],
          body: loadBody,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255 },
          didParseCell: (data) => {
            if (data.column.index === 3 && data.section === 'body' && data.cell.raw === 'SOBRECARGA') {
              data.cell.styles.fillColor = [254, 226, 226];
              data.cell.styles.textColor = [185, 28, 28];
              data.cell.styles.fontStyle = 'bold';
            }
          },
        });
      }

      docPdf.save(`Programacao_Diaria_${format(dailyFilterDate, 'ddMMyy')}.pdf`);
      toast({ title: "PDF gerado!", description: "A programação diária foi baixada." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    }
  };

  const exportWeekPDF = async () => {
    const weekStart = startOfWeek(weekAnchor, { locale: ptBR });
    const weekEnd = endOfWeek(weekAnchor, { locale: ptBR });
    const weekTasks = dailyTasks.filter(t =>
      isWithinInterval(t.executionDate, { start: weekStart, end: weekEnd }) &&
      t.status !== 'Cancelada' && Boolean(t.resourceId) && Boolean(t.responsibleId)
    );

    if (weekTasks.length === 0) {
      toast({ variant: "destructive", title: "Sem tarefas", description: "Não há tarefas nesta semana." });
      return;
    }

    toast({ title: "Gerando PDF...", description: "Por favor, aguarde." });

    try {
      const company = await loadCompanyForPdf();
      const docPdf = new jsPDF({ orientation: 'landscape' });
      let yPos = pdfHeader(
        docPdf,
        company,
        'PROGRAMAÇÃO SEMANAL DE TAREFAS',
        `${format(weekStart, 'dd/MM/yyyy')} a ${format(weekEnd, 'dd/MM/yyyy')}`
      );

      // Uma seção por dia
      weekDays.forEach(day => {
        const key = format(day, 'yyyy-MM-dd');
        const list = (tasksByDay.get(key) || []).filter(t => t.status !== 'Cancelada');

        if (list.length === 0) return;

        autoTable(docPdf, {
          startY: yPos,
          head: [[{
            content: format(day, "EEEE, dd/MM", { locale: ptBR }).toUpperCase(),
            colSpan: 8,
            styles: { halign: 'left', fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
          }]],
          body: [],
          styles: { fontSize: 8 },
          margin: { left: 14, right: 14 },
        });

        autoTable(docPdf, {
          startY: (docPdf as any).lastAutoTable.finalY,
          head: TASK_HEAD,
          body: list.map(taskRow),
          styles: { fontSize: 7.5, cellPadding: 1.5 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 8, textColor: 255 },
          margin: { left: 14, right: 14 },
        });

        yPos = (docPdf as any).lastAutoTable.finalY + 6;
      });

      docPdf.save(`Programacao_Semanal_${format(weekStart, 'ddMMyy')}.pdf`);
      toast({ title: "PDF gerado!", description: "A programação semanal foi baixada." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    }
  };

  const persistTask = async (id: string, patch: any) => {
    try {
      await updateDoc(doc(db, "companies", "mecald", "dailyTasks", id), {
        ...patch,
        updatedAt: Timestamp.now(),
      });
      await fetchDailyTasks();
    } catch (e) {
      console.error("Erro ao atualizar tarefa:", e);
      toast({ variant: "destructive", title: "Erro", description: "Não foi possível atualizar a tarefa." });
    }
  };

  const handleReleaseTask = async (t: DailyTask) => {
    if (!isChecklistComplete(t.checklist)) {
      toast({
        variant: "destructive",
        title: "Checklist incompleto",
        description: "Bloqueada por preparação insuficiente. Conclua o checklist para liberar.",
      });
      return;
    }
    await persistTask(t.id, { status: 'Liberada para execução', blockReason: '' });
  };

  const handleStartTask = async (t: DailyTask) => {
    if (!isChecklistComplete(t.checklist) && t.status !== 'Parcialmente concluída') {
      toast({
        variant: "destructive",
        title: "Não é possível iniciar",
        description: "O checklist de liberação precisa estar 100% completo.",
      });
      return;
    }
    await persistTask(t.id, {
      status: 'Em execução',
      activeSince: Timestamp.now(),
      startedAt: t.startedAt ? Timestamp.fromDate(t.startedAt) : Timestamp.now(),
    });
  };

  const handlePauseTask = async (t: DailyTask) => {
    await persistTask(t.id, {
      status: 'Parcialmente concluída',
      executedHours: Number(liveExecutedHours(t).toFixed(2)),
      activeSince: null,
    });
  };

  const handleCompleteTask = async (t: DailyTask) => {
    await persistTask(t.id, {
      status: 'Concluída',
      executedHours: Number(liveExecutedHours(t).toFixed(2)),
      activeSince: null,
      progress: 100,
      completedAt: Timestamp.now(),
    });

    // Concluir na programação diária também conclui a etapa no pedido de origem.
    try {
      const orderRef = doc(db, "companies", "mecald", "orders", t.orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        if (Array.isArray(orderData.items)) {
          const updatedItems = orderData.items.map((item: any, itemIndex: number) => {
            const resolvedItemId = String(item.id || `item-${itemIndex}`);
            if (resolvedItemId !== t.itemId || !Array.isArray(item.productionPlan)) return item;
            return {
              ...item,
              productionPlan: item.productionPlan.map((stage: any, stageIndex: number) =>
                stageIndex === t.stageOrder
                  ? { ...stage, status: 'Concluído', progress: 100, completedDate: Timestamp.now(), updatedAt: Timestamp.now() }
                  : stage
              ),
            };
          });
          await updateDoc(orderRef, { items: updatedItems, lastUpdate: Timestamp.now() });
          await fetchTasksFromOrders();
        }
      }
    } catch (error) {
      console.error('Erro ao concluir a etapa no pedido:', error);
      toast({
        variant: "destructive",
        title: "Tarefa concluída, mas a etapa não foi sincronizada",
        description: "Atualize a página e tente novamente.",
      });
    }
  };

  const handleNotCompleteTask = async (t: DailyTask) => {
    const reason = window.prompt('Informe o motivo da não conclusão:', t.blockReason || '');
    if (reason === null) return;
    if (!reason.trim()) {
      toast({ variant: "destructive", title: "Informe o motivo da não conclusão" });
      return;
    }
    await persistTask(t.id, {
      status: 'Não concluída',
      blockReason: reason.trim(),
      executedHours: Number(liveExecutedHours(t).toFixed(2)),
      activeSince: null,
      completedAt: null,
    });
  };

  const handleBlockTask = async (t: DailyTask) => {
    const reason = window.prompt("Motivo do bloqueio:", t.blockReason || "");
    if (reason === null) return;
    await persistTask(t.id, {
      status: 'Bloqueada',
      blockReason: reason.trim() || 'Bloqueada por preparação insuficiente',
      executedHours: Number(liveExecutedHours(t).toFixed(2)),
      activeSince: null,
    });
  };

  const handleCancelTask = async (t: DailyTask) => {
    await persistTask(t.id, { status: 'Cancelada', activeSince: null });
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, "companies", "mecald", "dailyTasks", id));
      setIsTaskModalOpen(false);
      await fetchDailyTasks();
      toast({ title: "Tarefa excluída" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    }
  };

  const openNewTaskModal = () => {
    setEditingTask(null);
    setTaskForm({ ...newTaskForm(), executionDate: format(dailyFilterDate, 'yyyy-MM-dd') });
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (t: DailyTask) => {
    setEditingTask(t);
    setTaskForm({
      executionDate: format(t.executionDate, 'yyyy-MM-dd'),
      orderId: t.orderId,
      itemId: t.itemId,
      stageName: t.stageName,
      stageOrder: t.stageOrder || 0,
      resourceId: t.resourceId,
      responsibleId: t.responsibleId,
      plannedQuantity: t.plannedQuantity,
      plannedHours: t.plannedHours,
      priority: t.priority,
      checklist: { ...t.checklist },
      blockReason: t.blockReason,
      status: t.status,
      scheduleChain: false,
    });
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!taskForm.orderId || !taskForm.itemId || !taskForm.stageName) {
      toast({ variant: "destructive", title: "Campos obrigatórios", description: "Selecione pedido, produto e etapa." });
      return;
    }
    if (!taskForm.resourceId) {
      toast({ variant: "destructive", title: "Recurso obrigatório", description: "Selecione o recurso responsável." });
      return;
    }

    const checklistOk = isChecklistComplete(taskForm.checklist);
    if (!checklistOk && !taskForm.blockReason.trim()) {
      toast({ variant: "destructive", title: "Observação obrigatória", description: "Há item do checklist como Não. Informe o motivo do bloqueio." });
      return;
    }

    let status = taskForm.status;
    if ((status === 'Liberada para execução' || status === 'Em execução') && !checklistOk) {
      status = 'Bloqueada';
      toast({ title: "Tarefa bloqueada", description: "Bloqueada por preparação insuficiente — checklist incompleto." });
    }

    const order = orderOptions.find(o => o.orderId === taskForm.orderId);
    const itemInfo = itemOptions.find(i => i.itemId === taskForm.itemId);
    const res = resources.find(r => r.id === taskForm.resourceId);
    const mem = teamMembers.find(m => m.id === taskForm.responsibleId);
    const [y, mo, d] = taskForm.executionDate.split('-').map(Number);
    const baseDate = new Date(y, mo - 1, d);

    const base = {
      orderId: taskForm.orderId,
      orderNumber: order?.orderNumber || '',
      customerName: order?.customerName || '',
      itemId: taskForm.itemId,
      itemDescription: itemInfo?.itemDescription || '',
      itemCode: itemInfo?.itemCode || '',
      resourceId: taskForm.resourceId,
      resourceName: res?.name || '',
      responsibleId: taskForm.responsibleId || '',
      responsibleName: mem?.name || '',
      priority: taskForm.priority,
    };

    try {
      if (editingTask) {
        await updateDoc(doc(db, "companies", "mecald", "dailyTasks", editingTask.id), {
          ...base,
          executionDate: Timestamp.fromDate(baseDate),
          stageName: taskForm.stageName,
          stageOrder: taskForm.stageOrder,
          plannedQuantity: Number(taskForm.plannedQuantity) || 0,
          plannedHours: Number(taskForm.plannedHours) || 0,
          checklist: taskForm.checklist,
          blockReason: checklistOk ? '' : taskForm.blockReason.trim(),
          status,
          updatedAt: Timestamp.now(),
        });
        toast({ title: "Tarefa atualizada!" });

      } else if (taskForm.scheduleChain) {
        const startIdx = taskForm.stageOrder;
        const chainStages = stageOptions.slice(startIdx);
        const durations = chainStages.map((s, i) => ({
          estimatedHours: i === 0 ? (Number(taskForm.plannedHours) || s.estimatedHours || 0) : (s.estimatedHours || 0),
        }));
        const chain = predictChain(baseDate, durations);

        await Promise.all(chainStages.map((s, i) => addDoc(
          collection(db, "companies", "mecald", "dailyTasks"),
          {
            ...base,
            executionDate: Timestamp.fromDate(chain[i].start),
            stageName: s.stageName,
            stageOrder: startIdx + i,
            plannedQuantity: Number(taskForm.plannedQuantity) || 0,
            plannedHours: durations[i].estimatedHours,
            checklist: i === 0 ? taskForm.checklist : { ...EMPTY_CHECKLIST },
            blockReason: i === 0 ? (checklistOk ? '' : taskForm.blockReason.trim()) : '',
            status: i === 0 ? status : 'Programada',
            executedHours: 0,
            progress: 0,
            createdAt: Timestamp.now(),
            startedAt: null,
            completedAt: null,
            activeSince: null,
            updatedAt: Timestamp.now(),
          }
        )));
        toast({ title: "Produção programada!", description: `${chainStages.length} etapa(s) criada(s) em cadeia.` });

      } else {
        await addDoc(collection(db, "companies", "mecald", "dailyTasks"), {
          ...base,
          executionDate: Timestamp.fromDate(baseDate),
          stageName: taskForm.stageName,
          stageOrder: taskForm.stageOrder,
          plannedQuantity: Number(taskForm.plannedQuantity) || 0,
          plannedHours: Number(taskForm.plannedHours) || 0,
          checklist: taskForm.checklist,
          blockReason: checklistOk ? '' : taskForm.blockReason.trim(),
          status,
          executedHours: 0,
          progress: 0,
          createdAt: Timestamp.now(),
          startedAt: null,
          completedAt: null,
          activeSince: null,
          updatedAt: Timestamp.now(),
        });
        toast({ title: "Tarefa criada!" });
      }

      setIsTaskModalOpen(false);
      fetchDailyTasks();
    } catch (e) {
      console.error("Erro ao salvar tarefa:", e);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    }
  };

  const getDailyStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'Programada': return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Programada</Badge>;
      case 'Liberada para execução': return <Badge className="bg-cyan-600"><CheckSquare className="mr-1 h-3 w-3" />Liberada</Badge>;
      case 'Em execução': return <Badge className="bg-blue-600 animate-pulse"><Play className="mr-1 h-3 w-3" />Em execução</Badge>;
      case 'Bloqueada': return <Badge variant="destructive"><Ban className="mr-1 h-3 w-3" />Bloqueada</Badge>;
      case 'Parcialmente concluída': return <Badge className="bg-amber-500"><Pause className="mr-1 h-3 w-3" />Parcial</Badge>;
      case 'Não concluída': return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Não concluída</Badge>;
      case 'Concluída': return <Badge className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Concluída</Badge>;
      case 'Cancelada': return <Badge variant="outline" className="text-muted-foreground">Cancelada</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Funções de manipulação de alocação
  const handleAllocateTask = (task: SimpleTask) => {
    console.log('Alocando tarefa:', task);
    
    try {
      const existingDailyTask = dailyTasks.find(dailyTask =>
        dailyTask.sourceTaskId === task.id ||
        (dailyTask.orderId === task.orderId && dailyTask.itemId === task.itemId && dailyTask.stageName === task.stageName)
      );
      setSelectedTask(task);
      setAllocationData({
        taskId: String(task.id),
        resourceId: task.assignedResource?.resourceId && RESPONSIBLE_SECTORS.some(sector => sector.id === task.assignedResource?.resourceId)
          ? String(task.assignedResource.resourceId)
          : undefined,
        supervisorId: task.supervisor?.memberId && leadershipMembers.some(member => member.id === task.supervisor?.memberId)
          ? String(task.supervisor.memberId)
          : undefined,
        scheduledDate: existingDailyTask
          ? format(existingDailyTask.executionDate, 'yyyy-MM-dd')
          : format(task.startDate || new Date(), 'yyyy-MM-dd'),
        notes: task.notes || '',
        estimatedHours: Number(task.estimatedHours) || 0
      });
      setIsAllocationDialogOpen(true);
    } catch (error) {
      console.error('Erro ao preparar alocação:', error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível preparar a alocação da tarefa.",
      });
    }
  };

  const handleSaveAllocation = async () => {
    if (!selectedTask) return;

    if (!allocationData.scheduledDate) {
      toast({
        variant: "destructive",
        title: "Informe a data programada",
        description: "A tarefa precisa de uma data para aparecer em Tarefas do Dia.",
      });
      return;
    }

    const [scheduledYear, scheduledMonth, scheduledDay] = allocationData.scheduledDate.split('-').map(Number);
    const scheduledExecutionDate = new Date(scheduledYear, scheduledMonth - 1, scheduledDay);
    if (isNaN(scheduledExecutionDate.getTime())) {
      toast({ variant: "destructive", title: "Data programada inválida" });
      return;
    }

    const selectedSector = RESPONSIBLE_SECTORS.find(sector => sector.id === allocationData.resourceId);
    if (!selectedSector) {
      toast({
        variant: "destructive",
        title: "Selecione um setor",
        description: "A tarefa precisa ser vinculada ao setor responsável.",
      });
      return;
    }

    const selectedLeader = leadershipMembers.find(member => member.id === allocationData.supervisorId);
    if (!selectedLeader) {
      toast({
        variant: "destructive",
        title: "Selecione um líder",
        description: "A tarefa precisa ser vinculada a um líder cadastrado na equipe.",
      });
      return;
    }
    
    try {
      // Encontrar o documento do pedido
      const orderRef = doc(db, "companies", "mecald", "orders", selectedTask.orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) return;
      
      const orderData = orderSnap.data();
      if (!Array.isArray(orderData.items)) {
        throw new Error('O pedido não possui uma lista de itens válida.');
      }

      const updatedItems = orderData.items.map((item: any, itemIndex: number) => {
        const resolvedItemId = String(item.id || `item-${itemIndex}`);
        if (itemIndex === selectedTask.itemIndex && resolvedItemId === selectedTask.itemId) {
          const updatedPlan = item.productionPlan.map((stage: any, index: number) => {
            if (index === selectedTask.stageIndex) {
              const selectedResource = selectedSector;
              const selectedSupervisor = selectedLeader;
              
              return {
                ...stage,
                assignedResource: selectedResource ? {
                  resourceId: selectedResource.id,
                  resourceName: selectedResource.name,
                  resourceType: selectedResource.type
                } : null,
                supervisor: selectedSupervisor ? {
                  memberId: selectedSupervisor.id,
                  memberName: selectedSupervisor.name,
                  memberPosition: selectedSupervisor.position
                } : null,
                notes: allocationData.notes,
                estimatedHours: allocationData.estimatedHours,
                updatedAt: Timestamp.now()
              };
            }
            return stage;
          });
          
          return { ...item, productionPlan: updatedPlan };
        }
        return item;
      });
      
      await updateDoc(orderRef, { 
        items: updatedItems,
        lastUpdate: Timestamp.now()
      });

      // A alocação da tarefa ativa alimenta automaticamente a programação do dia.
      const existingDailyTask = dailyTasks.find(dailyTask =>
        dailyTask.sourceTaskId === selectedTask.id ||
        (dailyTask.orderId === selectedTask.orderId &&
          dailyTask.itemId === selectedTask.itemId &&
          dailyTask.stageName === selectedTask.stageName)
      );
      const stageOrder = selectedTask.stageIndex;
      const dailyTaskData = {
        sourceTaskId: selectedTask.id,
        executionDate: Timestamp.fromDate(scheduledExecutionDate),
        orderId: selectedTask.orderId,
        orderNumber: selectedTask.orderNumber,
        customerName: selectedTask.customerName,
        itemId: selectedTask.itemId,
        itemDescription: selectedTask.itemDescription,
        itemCode: selectedTask.itemCode || '',
        stageName: selectedTask.stageName,
        stageOrder,
        resourceId: selectedSector.id,
        resourceName: selectedSector.name,
        responsibleId: selectedLeader.id,
        responsibleName: selectedLeader.name,
        plannedQuantity: 0,
        plannedHours: Number(allocationData.estimatedHours) || 0,
        priority: selectedTask.priority || 'media',
        updatedAt: Timestamp.now(),
      };

      if (existingDailyTask) {
        await updateDoc(doc(db, "companies", "mecald", "dailyTasks", existingDailyTask.id), dailyTaskData);
      } else {
        await addDoc(collection(db, "companies", "mecald", "dailyTasks"), {
          ...dailyTaskData,
          checklist: { ...EMPTY_CHECKLIST },
          blockReason: '',
          status: 'Programada',
          executedHours: 0,
          progress: 0,
          createdAt: Timestamp.now(),
          startedAt: null,
          completedAt: null,
          activeSince: null,
        });
      }
      
      toast({
        title: "Alocação salva!",
        description: "A tarefa foi alocada com sucesso.",
      });
      
      setIsAllocationDialogOpen(false);
      await Promise.all([fetchTasksFromOrders(), fetchDailyTasks()]);
    } catch (error) {
      console.error("Erro ao salvar alocação:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível salvar a alocação.",
      });
    }
  };

  const toggleRowExpansion = (taskId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  // Funções auxiliares para badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pendente':
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
      case 'Em Andamento':
        return <Badge className="bg-blue-600"><PlayCircle className="mr-1 h-3 w-3" />Em Andamento</Badge>;
      case 'Concluído':
        return <Badge className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Concluído</Badge>;
      default:
        return <Badge variant="outline">Indefinido</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'baixa':
        return <Badge variant="outline" className="text-gray-600">Baixa</Badge>;
      case 'media':
        return <Badge variant="secondary">Média</Badge>;
      case 'alta':
        return <Badge className="bg-orange-500">Alta</Badge>;
      case 'urgente':
        return <Badge variant="destructive">Urgente</Badge>;
      default:
        return <Badge variant="outline">Indefinida</Badge>;
    }
  };

  const getPeriodLabel = () => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { locale: ptBR });
      const weekEnd = endOfWeek(currentDate, { locale: ptBR });
      return `${format(weekStart, "dd/MM", { locale: ptBR })} - ${format(weekEnd, "dd/MM/yyyy", { locale: ptBR })}`;
    } else {
      return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  // Exportar PDF da programação semanal
  const exportWeeklyPDF = async () => {
    try {
      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.width;
      let yPos = 15;

      // Header com dados da empresa
      docPdf.setFontSize(18).setFont('helvetica', 'bold');
      docPdf.text(companyData.nomeFantasia || 'Sua Empresa', 15, yPos);
      yPos += 20;
      
      // Título do documento
      const weekStart = startOfWeek(currentDate, { locale: ptBR });
      const weekEnd = endOfWeek(currentDate, { locale: ptBR });
      const allocatedTasks = dailyTasks.filter(task =>
        isWithinInterval(task.executionDate, { start: weekStart, end: weekEnd }) &&
        Boolean(task.resourceId) && Boolean(task.responsibleId) && task.status !== 'Cancelada'
      );

      if (allocatedTasks.length === 0) {
        toast({
          variant: "destructive",
          title: "Sem tarefas alocadas",
          description: "Não há tarefas alocadas neste período.",
        });
        return;
      }
      
      docPdf.setFontSize(16).setFont('helvetica', 'bold');
      docPdf.text('PROGRAMAÇÃO SEMANAL DE TAREFAS', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;
      
      docPdf.setFontSize(12).setFont('helvetica', 'normal');
      docPdf.text(
        `Período: ${format(weekStart, "dd/MM/yyyy", { locale: ptBR })} a ${format(weekEnd, "dd/MM/yyyy", { locale: ptBR })}`,
        pageWidth / 2, yPos, { align: 'center' }
      );
      yPos += 20;

      // Tabela de tarefas
      const tableBody = allocatedTasks.map(task => [
        task.orderNumber,
        task.itemDescription.length > 30 ? task.itemDescription.substring(0, 30) + '...' : task.itemDescription,
        task.stageName,
        task.resourceName || 'N/A',
        task.responsibleName || 'N/A',
        format(task.executionDate, 'dd/MM', { locale: ptBR }),
        task.status
      ]);

      autoTable(docPdf, {
        startY: yPos,
        head: [['Pedido', 'Item', 'Etapa', 'Setor', 'Líder', 'Data', 'Status']],
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255 },
      });

      const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
      const filename = `Programacao_Semanal_${format(weekStart, 'ddMMyy')}_${timestamp}.pdf`;
      
      docPdf.save(filename);
      
      toast({
        title: "PDF gerado com sucesso!",
        description: `O arquivo "${filename}" foi baixado.`,
      });

    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o arquivo PDF.",
      });
    }
  };

  const renderTaskCard = (t: DailyTask) => {
    const exec = liveExecutedHours(t);
    const ready = isChecklistComplete(t.checklist);
    const isToday = isSameDay(t.executionDate, new Date());
    const pred = taskPredictions.get(t.id);

    return (
      <Card
        key={t.id}
        className="p-3 border-l-4"
        style={{
          borderLeftColor:
            t.status === 'Concluída' ? '#16a34a' :
            t.status === 'Em execução' ? '#2563eb' :
            t.status === 'Bloqueada' ? '#dc2626' :
            t.status === 'Não concluída' ? '#dc2626' :
            t.status === 'Parcialmente concluída' ? '#f59e0b' :
            t.status === 'Cancelada' ? '#9ca3af' : '#06b6d4'
        }}
      >
        <div className="flex items-start justify-between mb-1 gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-xs truncate">
              Ped. {t.orderNumber} {t.itemCode && <span className="text-muted-foreground">| {t.itemCode}</span>}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{t.itemDescription}</p>
          </div>
          {getDailyStatusBadge(t.status)}
        </div>

        <div className="space-y-0.5 text-xs">
          <p className="truncate"><span className="text-muted-foreground">Etapa:</span> <span className="font-medium">{t.stageName}</span></p>
          <p className="truncate"><span className="text-muted-foreground">Setor:</span> <span className="font-medium">{t.resourceName || '—'}</span></p>
          <p className="truncate"><span className="text-muted-foreground">Líder:</span> <span className="font-medium">{t.responsibleName || '—'}</span></p>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{isToday ? 'Hoje' : format(t.executionDate, 'dd/MM')}</span>
            {getPriorityBadge(t.priority)}
          </div>
        </div>

        {pred && t.status !== 'Concluída' && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Previsão de término: <span className="font-medium text-foreground">{format(pred.finish, 'dd/MM/yyyy')}</span>
          </p>
        )}

        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-muted-foreground">IPP: {taskIPP(t)}%</span>
            <span className="text-muted-foreground">{t.plannedHours}h / {exec.toFixed(1)}h</span>
          </div>
          <Progress value={taskIPP(t)} className="h-1.5" />
        </div>

        {!ready && t.status !== 'Concluída' && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-red-600">
            <Ban className="h-3 w-3 shrink-0" />
            <span className="truncate">Prep. insuficiente{t.blockReason ? `: ${t.blockReason}` : ''}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t">
          {t.status === 'Programada' && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleReleaseTask(t)}>
              <CheckSquare className="h-3 w-3 mr-1" /> Liberar
            </Button>
          )}
          {(t.status === 'Liberada para execução' || t.status === 'Parcialmente concluída') && (
            <Button size="sm" className="h-7 px-2 text-xs bg-blue-600" onClick={() => handleStartTask(t)}>
              <Play className="h-3 w-3 mr-1" /> Iniciar
            </Button>
          )}
          {t.status === 'Em execução' && (
            <>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handlePauseTask(t)}>
                <Pause className="h-3 w-3 mr-1" /> Pausar
              </Button>
              <Button size="sm" className="h-7 px-2 text-xs bg-green-600" onClick={() => handleCompleteTask(t)}>
                <CheckCircle className="h-3 w-3 mr-1" /> Concluir
              </Button>
            </>
          )}
          {['Liberada para execução', 'Em execução', 'Parcialmente concluída', 'Programada'].includes(t.status) && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600" onClick={() => handleBlockTask(t)}>
              <Ban className="h-3 w-3 mr-1" /> Bloquear
            </Button>
          )}
          {t.status !== 'Cancelada' && t.status !== 'Concluída' && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600" onClick={() => handleNotCompleteTask(t)}>
              <AlertTriangle className="h-3 w-3 mr-1" /> Não concluída
            </Button>
          )}
          {t.status !== 'Cancelada' && t.status !== 'Concluída' && t.status !== 'Não concluída' && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => handleCancelTask(t)}>
              Cancelar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEditTaskModal(t)}>
            <Edit className="h-3 w-3 mr-1" /> Editar
          </Button>
        </div>
      </Card>
    );
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Carregando...</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Validação adicional de dados
  if (!Array.isArray(tasks)) {
    console.error('Tasks não é um array válido:', tasks);
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Erro ao Carregar Dados</h1>
        </div>
        <div className="text-center py-12">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-medium mb-2">Erro ao carregar tarefas</h3>
          <p className="text-gray-600 mb-4">
            Não foi possível carregar as tarefas. Verifique sua conexão e tente novamente.
          </p>
          <Button onClick={fetchTasksFromOrders} variant="outline">
            <Target className="mr-2 h-4 w-4" />
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">Dashboard de Tarefas</h1>
          <p className="text-muted-foreground">
            Visualização e relatórios das tarefas geradas automaticamente dos pedidos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportWeeklyPDF} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar Programação Semanal
          </Button>
          <Button onClick={fetchTasksFromOrders} variant="outline">
            <Target className="mr-2 h-4 w-4" />
            Atualizar Dados
          </Button>
        </div>
      </div>

      {/* Dashboard Principal */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tarefas Programadas"
          value={tasksSummary.totalTasks.toString()}
          icon={Target}
          description={`${tasksSummary.completionRate.toFixed(1)}% concluídas`}
        />
        <StatCard
          title="Tarefas Realizadas"
          value={tasksSummary.completedTasks.toString()}
          icon={CheckCircle}
          description={`${tasksSummary.pendingTasks} pendentes`}
        />
        <StatCard
          title="Setores Alocados"
          value={`${getResourcesAllocation.allocated}/${getResourcesAllocation.total}`}
          icon={Users}
          description={`${getResourcesAllocation.allocationRate.toFixed(1)}% de utilização`}
        />
        <StatCard
          title="Setores sem Tarefas"
          value={getResourcesAllocation.idle.toString()}
          icon={Clock}
          description="Setores sem tarefas pendentes"
        />
      </div>

      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">Tarefas Ativas</TabsTrigger>
          <TabsTrigger value="daily">Tarefas do Dia</TabsTrigger>
          <TabsTrigger value="analytics">Análise de Performance</TabsTrigger>
        </TabsList>

        {/* Aba de Tarefas Ativas */}
        <TabsContent value="tasks" className="space-y-4">
          {/* Controles de Navegação e Filtros */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center rounded-lg border p-1">
                    <Button
                      variant={viewMode === 'week' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('week')}
                    >
                      Semana
                    </Button>
                    <Button
                      variant={viewMode === 'month' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('month')}
                    >
                      Mês
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigatePeriod('prev')}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[200px] text-center">
                      {getPeriodLabel()}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigatePeriod('next')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentDate(new Date())}
                >
                  Hoje
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filtros:</span>
                </div>

                <div className="relative w-[220px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filterOrderNumber}
                    onChange={(event) => setFilterOrderNumber(event.target.value)}
                    placeholder="Buscar OS: 790/26"
                    className="pl-9"
                  />
                </div>

                <select className="h-10 w-[150px] rounded-md border border-input bg-background px-3 text-sm" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
                  <option value="all">Todos os Status</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Em Andamento">Em Andamento</option>
                  <option value="Concluído">Concluído</option>
                </select>

                <select className="h-10 w-[170px] rounded-md border border-input bg-background px-3 text-sm" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)}>
                  <option value="all">Todas as Prioridades</option>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>

                <select className="h-10 w-[200px] rounded-md border border-input bg-background px-3 text-sm" value={filterResource} onChange={(event) => setFilterResource(event.target.value)}>
                  <option value="all">Todos os Setores</option>
                  <option value="unassigned">Sem Setor</option>
                  {RESPONSIBLE_SECTORS.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
                </select>

                <select className="h-10 w-[200px] rounded-md border border-input bg-background px-3 text-sm" value={filterSupervisor} onChange={(event) => setFilterSupervisor(event.target.value)}>
                  <option value="all">Todos os Líderes</option>
                  <option value="unassigned">Sem Líder</option>
                  {leadershipMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>

                {(filterStatus !== 'all' || filterPriority !== 'all' || filterResource !== 'all' || filterSupervisor !== 'all' || filterOrderNumber) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus('all');
                      setFilterPriority('all');
                      setFilterResource('all');
                      setFilterSupervisor('all');
                      setFilterOrderNumber('');
                    }}
                  >
                    Limpar Filtros
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Lista de Tarefas - Tabela Simples */}
          <Card>
            <CardHeader>
              <CardTitle>Tarefas do Período</CardTitle>
              <CardDescription>
                {Array.isArray(getFilteredTasks) ? getFilteredTasks.length : 0} tarefa{Array.isArray(getFilteredTasks) && getFilteredTasks.length !== 1 ? 's' : ''} encontrada{Array.isArray(getFilteredTasks) && getFilteredTasks.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!Array.isArray(getFilteredTasks) || getFilteredTasks.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma tarefa encontrada</h3>
                  <p className="text-gray-600 mb-4">
                    {!Array.isArray(getFilteredTasks) 
                      ? "Erro ao carregar tarefas. Verifique a conexão."
                      : "Não há tarefas para exibir com os filtros aplicados."
                    }
                  </p>
                </div>
              ) : (
                <div className="h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Etapa</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead>Líder</TableHead>
                        <TableHead>Prazo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTasks.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">{task.orderNumber}</TableCell>
                          <TableCell>{task.itemDescription.substring(0, 30)}...</TableCell>
                          <TableCell>{task.stageName}</TableCell>
                          <TableCell>
                            {task.assignedResource ? (
                              <div className="flex items-center gap-2">
                                <Settings className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{task.assignedResource.resourceName}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sem setor</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.supervisor ? (
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{task.supervisor.memberName}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sem líder</span>
                            )}
                          </TableCell>
                          <TableCell>{task.endDate ? format(task.endDate, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                          <TableCell>{getStatusBadge(task.status)}</TableCell>
                          <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAllocateTask(task)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Alocar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {getFilteredTasks.length > TASKS_PER_PAGE && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Página {Math.min(taskPage, totalTaskPages)} de {totalTaskPages} · {getFilteredTasks.length} tarefas
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={taskPage <= 1} onClick={() => setTaskPage(page => Math.max(1, page - 1))}>
                      Anterior
                    </Button>
                    <Button variant="outline" size="sm" disabled={taskPage >= totalTaskPages} onClick={() => setTaskPage(page => Math.min(totalTaskPages, page + 1))}>
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="daily" className="space-y-4">
          {productForecast.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-5 w-5" /> Previsão de Conclusão por Produto
                </CardTitle>
                <CardDescription>Estimativa baseada na cadeia de etapas (dias úteis, {HOURS_PER_DAY}h/dia).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {productForecast.map((p, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          Ped. {p.orderNumber} {p.itemCode && `| ${p.itemCode}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{p.itemDescription}</p>
                        <p className="text-xs text-muted-foreground">{p.pending} de {p.total} etapa(s) pendentes</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-xs text-muted-foreground">Término previsto</p>
                        <p className="text-sm font-bold text-primary">{format(p.finish, 'dd/MM/yyyy')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Calendário de capacidade / conflitos */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-5 w-5" /> Mapa de Capacidade
                  </CardTitle>
                  <CardDescription>
                    Dias em vermelho têm recurso acima de {RESOURCE_DAILY_CAPACITY}h. Clique no dia para abri-lo.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setCalendarMonth(p => subMonths(p, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[150px] text-center capitalize">
                    {format(calendarMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setCalendarMonth(p => addMonths(p, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCalendarMonth(new Date())}>Hoje</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(dayName => <div key={dayName}>{dayName}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {capacityCalendarDays.map((day, i) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const isToday = isSameDay(day, new Date());
                  const over = overloadedDays.get(key);
                  const dayLoad = resourceLoadByDay.get(key);
                  const taskCount = dayLoad
                    ? Array.from(dayLoad.values()).reduce((sum, resourceLoad) => sum + resourceLoad.tasks.length, 0)
                    : 0;

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setScheduleViewMode('day');
                        setDailyFilterDate(new Date(day));
                      }}
                      className={cn(
                        "min-h-[68px] rounded-md border p-1 text-left transition-colors hover:bg-muted/60",
                        !isCurrentMonth && "opacity-40",
                        isToday && "ring-2 ring-primary",
                        over ? "bg-red-50 border-red-300" : taskCount > 0 ? "bg-blue-50 border-blue-200" : ""
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs font-medium", isToday && "text-primary font-bold")}>{day.getDate()}</span>
                        {over && <AlertTriangle className="h-3 w-3 text-red-600" />}
                      </div>

                      {taskCount > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{taskCount} tarefa(s)</p>
                      )}

                      {over && (
                        <p
                          className="text-[10px] text-red-700 font-medium truncate"
                          title={over.map(o => `${o.resourceName}: ${o.hours}h`).join(' | ')}
                        >
                          {over.length} recurso(s) sobrec.
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Lista textual dos conflitos do mês visível */}
              {Array.from(overloadedDays.entries())
                .filter(([key]) => {
                  const date = new Date(`${key}T00:00:00`);
                  return date.getMonth() === calendarMonth.getMonth() && date.getFullYear() === calendarMonth.getFullYear();
                }).length > 0 && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <p className="text-sm font-medium text-red-800">Conflitos de capacidade neste mês</p>
                  </div>
                  <div className="space-y-1">
                    {Array.from(overloadedDays.entries())
                      .filter(([key]) => {
                        const date = new Date(`${key}T00:00:00`);
                        return date.getMonth() === calendarMonth.getMonth() && date.getFullYear() === calendarMonth.getFullYear();
                      })
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([key, over]) => (
                        <p key={key} className="text-xs text-red-700">
                          <span className="font-medium">{format(new Date(`${key}T00:00:00`), 'dd/MM')}:</span>{' '}
                          {over.map(o => `${o.resourceName} (${o.hours}h, ${o.count} tarefas)`).join(' · ')}
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Programação</CardTitle>
                  <div className="flex items-center rounded-lg border p-1 ml-2">
                    <Button size="sm" variant={scheduleViewMode === 'day' ? 'default' : 'ghost'} onClick={() => setScheduleViewMode('day')}>Dia</Button>
                    <Button size="sm" variant={scheduleViewMode === 'week' ? 'default' : 'ghost'} onClick={() => setScheduleViewMode('week')}>Semana</Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {scheduleViewMode === 'day' ? (
                    <Input
                      type="date"
                      value={format(dailyFilterDate, 'yyyy-MM-dd')}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        setDailyFilterDate(new Date(y, m - 1, d));
                      }}
                      className="w-[160px]"
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => setWeekAnchor(p => subWeeks(p, 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium min-w-[180px] text-center">
                        {format(startOfWeek(weekAnchor, { locale: ptBR }), 'dd/MM')} – {format(endOfWeek(weekAnchor, { locale: ptBR }), 'dd/MM/yyyy')}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setWeekAnchor(p => addWeeks(p, 1))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setWeekAnchor(new Date())}>Hoje</Button>
                    </div>
                  )}
                  <Button variant="outline" onClick={scheduleViewMode === 'week' ? exportWeekPDF : exportDailyPDF}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar {scheduleViewMode === 'week' ? 'Semana' : 'Dia'}
                  </Button>
                  <Button onClick={openNewTaskModal}>
                    <Plus className="mr-2 h-4 w-4" /> Nova Tarefa
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {scheduleViewMode === 'day' ? (
                dailyTasksForDate.length === 0 ? (
                  <div className="text-center py-12">
                    <ListChecks className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhuma tarefa para esta data</h3>
                    <p className="text-gray-600">Use "Nova Tarefa" para programar a execução.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {dailyTasksForDate.map(t => renderTaskCard(t))}
                  </div>
                )
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-7 gap-3 min-w-[1100px]">
                    {weekDays.map(day => {
                      const key = format(day, 'yyyy-MM-dd');
                      const list = tasksByDay.get(key) || [];
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isToday = isSameDay(day, new Date());
                      const dayHours = list.reduce((s, t) => s + (t.plannedHours || 0), 0);

                      return (
                        <div key={key} className={`rounded-lg border ${isWeekend ? 'bg-muted/30' : ''} ${isToday ? 'ring-2 ring-primary' : ''}`}>
                          <div className="p-2 border-b text-center">
                            <p className="text-xs font-semibold capitalize">{format(day, 'EEE', { locale: ptBR })}</p>
                            <p className="text-sm font-bold">{format(day, 'dd/MM')}</p>
                            <p className="text-[10px] text-muted-foreground">{list.length} tarefa(s) · {dayHours}h</p>
                          </div>
                          <div className="p-2 space-y-2 min-h-[120px] max-h-[600px] overflow-y-auto">
                            {list.length === 0 ? (
                              <p className="text-[11px] text-center text-muted-foreground py-4">—</p>
                            ) : (
                              list.map(t => renderTaskCard(t))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Análise de Performance */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Taxa de Cumprimento de Prazos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{tasksSummary.completedTasks}</p>
                      <p className="text-sm text-muted-foreground">Concluídas</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="text-2xl font-bold text-red-600">{tasksSummary.overdueTasks}</p>
                      <p className="text-sm text-muted-foreground">Atrasadas</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Desempenho por Líder</CardTitle>
                <CardDescription>
                  Somente membros designados como líderes nas tarefas ativas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leaderPerformance.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum líder possui tarefas alocadas ainda.
                    </div>
                  ) : leaderPerformance.map(leader => (
                      <div key={leader.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                        <div>
                          <p className="font-medium">{leader.name}</p>
                          <p className="text-sm text-muted-foreground">{leader.position}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 text-xs">
                          <Badge variant="secondary">{leader.total} tarefas</Badge>
                          <Badge className="bg-blue-600">{leader.inProgress} em andamento</Badge>
                          <Badge variant={leader.overdue > 0 ? "destructive" : "outline"}>
                            {leader.overdue} atrasadas
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>


      <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Editar Tarefa do Dia' : 'Nova Tarefa do Dia'}</DialogTitle>
            <DialogDescription>
              Programe a execução de uma etapa do produto e libere o recurso através do checklist.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data da execução</Label>
                <Input
                  type="date"
                  value={taskForm.executionDate}
                  onChange={(e) => setTaskForm(p => ({ ...p, executionDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={taskForm.priority} onValueChange={(v) => setTaskForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pedido</Label>
              <Select
                value={taskForm.orderId}
                onValueChange={(v) => setTaskForm(p => ({ ...p, orderId: v, itemId: '', stageName: '', stageOrder: 0, scheduleChain: false }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o pedido" /></SelectTrigger>
                <SelectContent>
                  {orderOptions.map(o => (
                    <SelectItem key={o.orderId} value={o.orderId}>
                      Pedido {o.orderNumber} — {o.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Produto do pedido</Label>
              <Select
                value={taskForm.itemId}
                disabled={!taskForm.orderId}
                onValueChange={(v) => setTaskForm(p => ({ ...p, itemId: v, stageName: '', stageOrder: 0, scheduleChain: false }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {itemOptions.map(i => (
                    <SelectItem key={i.itemId} value={i.itemId}>
                      {i.itemCode ? `[${i.itemCode}] ` : ''}{i.itemDescription}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Etapa do produto</Label>
              <Select
                value={taskForm.stageName}
                disabled={!taskForm.itemId}
                onValueChange={(v) => {
                  const idx = stageOptions.findIndex(s => s.stageName === v);
                  const st = stageOptions[idx];
                  setTaskForm(p => ({
                    ...p,
                    stageName: v,
                    stageOrder: idx >= 0 ? idx : 0,
                    plannedHours: p.plannedHours || (st?.estimatedHours || 0),
                  }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                <SelectContent>
                  {stageOptions.map((s, i) => (
                    <SelectItem key={`${s.stageName}-${i}`} value={s.stageName}>{s.stageName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editingTask && taskForm.stageName && (
              <div className="flex items-center justify-between rounded-lg border p-3 bg-secondary/40">
                <div className="pr-3">
                  <Label className="font-normal cursor-pointer">Programar etapas seguintes em cadeia</Label>
                  <p className="text-xs text-muted-foreground">
                    Cria automaticamente as próximas etapas deste produto, cada uma iniciando após a anterior, calculando a previsão de término.
                  </p>
                </div>
                <Checkbox
                  checked={taskForm.scheduleChain}
                  onCheckedChange={(c) => setTaskForm(p => ({ ...p, scheduleChain: c === true }))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Recurso</Label>
                <Select value={taskForm.resourceId} onValueChange={(v) => setTaskForm(p => ({ ...p, resourceId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o recurso" /></SelectTrigger>
                  <SelectContent>
                    {resources.filter(r => Boolean(String(r.id || '').trim())).map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({r.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={taskForm.responsibleId} onValueChange={(v) => setTaskForm(p => ({ ...p, responsibleId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                  <SelectContent>
                    {teamMembers.filter(m => Boolean(String(m.id || '').trim())).map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name} — {m.position}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {taskForm.resourceId && dailyTasks.some(t =>
              t.resourceId === taskForm.resourceId && t.status === 'Em execução' &&
              (!editingTask || t.id !== editingTask.id)) && (
              <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
                <AlertTriangle className="h-4 w-4" />
                <span>Atenção: este recurso já está em execução em outra tarefa.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade planejada</Label>
                <Input
                  type="number"
                  min="0"
                  value={taskForm.plannedQuantity}
                  onChange={(e) => setTaskForm(p => ({ ...p, plannedQuantity: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Horas planejadas</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={taskForm.plannedHours}
                  onChange={(e) => setTaskForm(p => ({ ...p, plannedHours: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-base">Checklist de liberação</Label>
              {CHECKLIST_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="cursor-pointer font-normal">{label}</Label>
                  <Checkbox
                    checked={taskForm.checklist[key]}
                    onCheckedChange={(c) => setTaskForm(p => ({
                      ...p,
                      checklist: { ...p.checklist, [key]: c === true },
                    }))}
                  />
                </div>
              ))}
            </div>

            {!isChecklistComplete(taskForm.checklist) && (
              <div className="space-y-2">
                <Label className="text-red-600">Observação / motivo do bloqueio *</Label>
                <Textarea
                  placeholder="Descreva o que está faltando (material, desenho, equipamento, insumo...)"
                  value={taskForm.blockReason}
                  onChange={(e) => setTaskForm(p => ({ ...p, blockReason: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Status da tarefa</Label>
              <Select value={taskForm.status} onValueChange={(v) => setTaskForm(p => ({ ...p, status: v as TaskStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Programada">Programada</SelectItem>
                  <SelectItem value="Liberada para execução" disabled={!isChecklistComplete(taskForm.checklist)}>
                    Liberada para execução {!isChecklistComplete(taskForm.checklist) && '(checklist incompleto)'}
                  </SelectItem>
                  <SelectItem value="Bloqueada">Bloqueada</SelectItem>
                  <SelectItem value="Parcialmente concluída">Parcialmente concluída</SelectItem>
                  <SelectItem value="Não concluída">Não concluída</SelectItem>
                  <SelectItem value="Concluída">Concluída</SelectItem>
                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {editingTask ? (
              <Button variant="ghost" className="text-red-600 mr-auto" onClick={() => handleDeleteTask(editingTask.id)}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsTaskModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveTask}>Salvar Tarefa</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Alocação */}
      <Dialog open={isAllocationDialogOpen} onOpenChange={setIsAllocationDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Alocar Setor e Líder</DialogTitle>
            <DialogDescription>
              Defina o setor e o líder responsáveis pela execução desta tarefa.
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-6">
              {/* Informações da tarefa */}
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2">{selectedTask.stageName}</h4>
                <p className="text-sm text-muted-foreground">
                  Pedido: {selectedTask.orderNumber} | Item: {selectedTask.itemDescription}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Data Programada</Label>
                <Input
                  type="date"
                  value={allocationData.scheduledDate || ''}
                  onChange={(e) => setAllocationData(prev => ({
                    ...prev,
                    scheduledDate: e.target.value,
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  A tarefa será incluída automaticamente em Tarefas do Dia nesta data.
                </p>
              </div>
              
              {/* Seleção do setor */}
              <div className="space-y-2">
                <Label>Setor Responsável</Label>
                <Select 
                  value={allocationData.resourceId || UNASSIGNED_SELECT_VALUE}
                  onValueChange={(value) => 
                    setAllocationData(prev => ({ 
                      ...prev, 
                      resourceId: value === UNASSIGNED_SELECT_VALUE ? undefined : value
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um setor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_SELECT_VALUE}>Selecione um setor</SelectItem>
                    {RESPONSIBLE_SECTORS.map(sector => (
                      <SelectItem key={sector.id} value={sector.id}>
                        {sector.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Seleção do líder */}
              <div className="space-y-2">
                <Label>Líder Responsável</Label>
                <Select 
                  value={allocationData.supervisorId || UNASSIGNED_SELECT_VALUE}
                  onValueChange={(value) => 
                    setAllocationData(prev => ({ 
                      ...prev, 
                      supervisorId: value === UNASSIGNED_SELECT_VALUE ? undefined : value
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um líder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_SELECT_VALUE}>Selecione um líder</SelectItem>
                    {leadershipMembers.map(member => (
                      <SelectItem key={member.id} value={String(member.id)}>
                        <div className="flex items-center gap-2">
                          <span>{member.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {member.position}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leadershipMembers.length === 0 && (
                  <p className="text-sm text-amber-600">
                    Nenhum líder foi identificado. Cadastre na aba Empresa &gt; Equipe um cargo ou permissão como Líder, Supervisor, Encarregado, Coordenador, Gerente ou Gestor.
                  </p>
                )}
              </div>
              
              {/* Horas estimadas */}
              <div className="space-y-2">
                <Label>Horas Estimadas</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={allocationData.estimatedHours}
                  onChange={(e) => setAllocationData(prev => ({ 
                    ...prev, 
                    estimatedHours: parseFloat(e.target.value) || 0 
                  }))}
                />
              </div>
              
              {/* Observações */}
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Adicione observações sobre a tarefa..."
                  value={allocationData.notes}
                  onChange={(e) => setAllocationData(prev => ({ 
                    ...prev, 
                    notes: e.target.value 
                  }))}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAllocationDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAllocation}>
              Salvar Alocação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
