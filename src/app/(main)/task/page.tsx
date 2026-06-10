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
import { useAuth } from "../layout";
import { format, startOfWeek, endOfWeek, isWithinInterval, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay } from "date-fns";
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
  Trash2
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
  notes?: string;
  estimatedHours?: number;
};

type SimpleTask = {
  id: string;
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

type TaskStatus =
  | 'Programada'
  | 'Liberada para execução'
  | 'Em execução'
  | 'Bloqueada'
  | 'Parcialmente concluída'
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
  executionDate: Date;
  orderId: string;
  orderNumber: string;
  customerName: string;
  itemId: string;
  itemDescription: string;
  itemCode: string;
  stageName: string;
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

type TaskFormState = {
  executionDate: string;
  orderId: string;
  itemId: string;
  stageName: string;
  resourceId: string;
  responsibleId: string;
  plannedQuantity: number;
  plannedHours: number;
  priority: string;
  checklist: ReleaseChecklist;
  blockReason: string;
  status: TaskStatus;
};

const newTaskForm = (): TaskFormState => ({
  executionDate: format(new Date(), 'yyyy-MM-dd'),
  orderId: '',
  itemId: '',
  stageName: '',
  resourceId: '',
  responsibleId: '',
  plannedQuantity: 0,
  plannedHours: 0,
  priority: 'media',
  checklist: { ...EMPTY_CHECKLIST },
  blockReason: '',
  status: 'Programada',
});


export default function TasksPage() {
  // Estados simplificados
  const [tasks, setTasks] = useState<SimpleTask[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [companyData, setCompanyData] = useState<CompanyData>({});
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Estados de filtro e navegação
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterResource, setFilterResource] = useState<string>('all');
  const [filterSupervisor, setFilterSupervisor] = useState<string>('all');
  
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

  // Estados para tarefas do dia
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(newTaskForm());
  const [dailyFilterDate, setDailyFilterDate] = useState<Date>(new Date());
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

                  tasksList.push({
                    id: `${orderDoc.id}-${item.id || itemIndex}-${stageIndex}`,
                    orderId: orderDoc.id,
                    orderNumber: String(orderData.quotationNumber || orderData.orderNumber || 'N/A'),
                    customerName: String(orderData.customer?.name || 'Cliente não informado'),
                    itemId: String(item.id || `item-${itemIndex}`),
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
      const ref = collection(db, "companies", "mecald", "dailyTasks");
      const snap = await getDocs(ref);
      const list: DailyTask[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          executionDate: safeToDate(data.executionDate) || new Date(),
          orderId: data.orderId || '',
          orderNumber: data.orderNumber || '',
          customerName: data.customerName || '',
          itemId: data.itemId || '',
          itemDescription: data.itemDescription || '',
          itemCode: data.itemCode || '',
          stageName: data.stageName || '',
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

  // Calcular recursos alocados vs ociosos
  const getResourcesAllocation = useMemo(() => {
    const allocatedResources = new Set(
      tasks
        .filter(task => task.status !== 'Concluído')
        .map(task => task.assignedResource?.resourceId)
        .filter(Boolean)
    );
    
    const totalResources = resources.filter(r => r.status === 'disponivel').length;
    const allocated = allocatedResources.size;
    const idle = totalResources - allocated;
    
    return {
      total: totalResources,
      allocated,
      idle,
      allocationRate: totalResources > 0 ? (allocated / totalResources) * 100 : 0
    };
  }, [tasks, resources]);

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
    if (!authLoading && user) {
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
  }, [user, authLoading]);

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
      const isInPeriod = task.startDate && isWithinInterval(task.startDate, { start: periodStart, end: periodEnd });
      
      // Filtros adicionais
      const statusMatch = filterStatus === 'all' || task.status === filterStatus;
      const resourceMatch = filterResource === 'all' || 
        (filterResource === 'unassigned' ? !task.assignedResource : task.assignedResource?.resourceId === filterResource);
      const supervisorMatch = filterSupervisor === 'all' || 
        (filterSupervisor === 'unassigned' ? !task.supervisor : task.supervisor?.memberId === filterSupervisor);

      return isInPeriod && statusMatch && resourceMatch && supervisorMatch;
    });
  }, [tasks, currentDate, viewMode, filterStatus, filterResource, filterSupervisor]);

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
      .filter(t => isSameDay(t.executionDate, dailyFilterDate))
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));
  }, [dailyTasks, dailyFilterDate]);

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
      resourceId: t.resourceId,
      responsibleId: t.responsibleId,
      plannedQuantity: t.plannedQuantity,
      plannedHours: t.plannedHours,
      priority: t.priority,
      checklist: { ...t.checklist },
      blockReason: t.blockReason,
      status: t.status,
    });
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!taskForm.orderId || !taskForm.itemId || !taskForm.stageName) {
      toast({ variant: "destructive", title: "Campos obrigatórios", description: "Selecione pedido, produto e etapa." });
      return;
    }
    if (!taskForm.resourceId) {
      toast({ variant: "destructive", title: "Recurso obrigatório", description: "Selecione o recurso responsável pela execução." });
      return;
    }

    const checklistOk = isChecklistComplete(taskForm.checklist);
    if (!checklistOk && !taskForm.blockReason.trim()) {
      toast({
        variant: "destructive",
        title: "Observação obrigatória",
        description: "Há item do checklist marcado como Não. Informe o motivo do bloqueio.",
      });
      return;
    }

    let status = taskForm.status;
    if ((status === 'Liberada para execução' || status === 'Em execução') && !checklistOk) {
      status = 'Bloqueada';
      toast({
        title: "Tarefa bloqueada",
        description: "Bloqueada por preparação insuficiente — checklist incompleto.",
      });
    }

    const order = orderOptions.find(o => o.orderId === taskForm.orderId);
    const itemInfo = itemOptions.find(i => i.itemId === taskForm.itemId);
    const res = resources.find(r => r.id === taskForm.resourceId);
    const mem = teamMembers.find(m => m.id === taskForm.responsibleId);
    const [y, m, d] = taskForm.executionDate.split('-').map(Number);

    const payload: any = {
      executionDate: Timestamp.fromDate(new Date(y, m - 1, d)),
      orderId: taskForm.orderId,
      orderNumber: order?.orderNumber || '',
      customerName: order?.customerName || '',
      itemId: taskForm.itemId,
      itemDescription: itemInfo?.itemDescription || '',
      itemCode: itemInfo?.itemCode || '',
      stageName: taskForm.stageName,
      resourceId: taskForm.resourceId,
      resourceName: res?.name || '',
      responsibleId: taskForm.responsibleId || '',
      responsibleName: mem?.name || '',
      plannedQuantity: Number(taskForm.plannedQuantity) || 0,
      plannedHours: Number(taskForm.plannedHours) || 0,
      priority: taskForm.priority,
      checklist: taskForm.checklist,
      blockReason: checklistOk ? '' : taskForm.blockReason.trim(),
      status,
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingTask) {
        await updateDoc(doc(db, "companies", "mecald", "dailyTasks", editingTask.id), payload);
      } else {
        await addDoc(collection(db, "companies", "mecald", "dailyTasks"), {
          ...payload,
          executedHours: 0,
          progress: 0,
          createdAt: Timestamp.now(),
          startedAt: null,
          completedAt: null,
          activeSince: null,
        });
      }
      toast({ title: editingTask ? "Tarefa atualizada!" : "Tarefa criada!" });
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
      case 'Concluída': return <Badge className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Concluída</Badge>;
      case 'Cancelada': return <Badge variant="outline" className="text-muted-foreground">Cancelada</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Funções de manipulação de alocação
  const handleAllocateTask = (task: SimpleTask) => {
    console.log('Alocando tarefa:', task);
    
    try {
      setSelectedTask(task);
      setAllocationData({
        taskId: String(task.id),
        resourceId: task.assignedResource?.resourceId ? String(task.assignedResource.resourceId) : undefined,
        supervisorId: task.supervisor?.memberId ? String(task.supervisor.memberId) : undefined,
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
    
    try {
      // Encontrar o documento do pedido
      const orderRef = doc(db, "companies", "mecald", "orders", selectedTask.orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) return;
      
      const orderData = orderSnap.data();
      const updatedItems = orderData.items.map((item: any) => {
        if (item.id === selectedTask.itemId) {
          const updatedPlan = item.productionPlan.map((stage: any, index: number) => {
            if (`${selectedTask.orderId}-${selectedTask.itemId}-${index}` === selectedTask.id) {
              const selectedResource = resources.find(r => r.id === allocationData.resourceId);
              const selectedSupervisor = teamMembers.find(m => m.id === allocationData.supervisorId);
              
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
      
      toast({
        title: "Alocação salva!",
        description: "A tarefa foi alocada com sucesso.",
      });
      
      setIsAllocationDialogOpen(false);
      fetchTasksFromOrders(); // Recarregar dados
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
      const tableBody = getFilteredTasks.map(task => [
        task.orderNumber,
        task.itemDescription.length > 30 ? task.itemDescription.substring(0, 30) + '...' : task.itemDescription,
        task.stageName,
        task.assignedResource?.resourceName || 'N/A',
        task.supervisor?.memberName || 'N/A',
        format(task.endDate, 'dd/MM', { locale: ptBR }),
        task.status
      ]);

      autoTable(docPdf, {
        startY: yPos,
        head: [['Pedido', 'Item', 'Etapa', 'Recurso', 'Supervisor', 'Prazo', 'Status']],
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
          title="Recursos Alocados"
          value={`${getResourcesAllocation.allocated}/${getResourcesAllocation.total}`}
          icon={Users}
          description={`${getResourcesAllocation.allocationRate.toFixed(1)}% de utilização`}
        />
        <StatCard
          title="Recursos Ociosos"
          value={getResourcesAllocation.idle.toString()}
          icon={Clock}
          description="Recursos disponíveis sem tarefas"
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

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="Pendente">Pendente</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Concluído">Concluído</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterResource} onValueChange={setFilterResource}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filtrar por Recurso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Recursos</SelectItem>
                    <SelectItem value="unassigned">Sem Recurso</SelectItem>
                    {resources.map(resource => (
                      <SelectItem key={resource.id} value={resource.id}>
                        {resource.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterSupervisor} onValueChange={setFilterSupervisor}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filtrar por Supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Supervisores</SelectItem>
                    <SelectItem value="unassigned">Sem Supervisor</SelectItem>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(filterStatus !== 'all' || filterResource !== 'all' || filterSupervisor !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus('all');
                      setFilterResource('all');
                      setFilterSupervisor('all');
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
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Etapa</TableHead>
                        <TableHead>Recurso</TableHead>
                        <TableHead>Supervisor</TableHead>
                        <TableHead>Prazo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(getFilteredTasks) && getFilteredTasks.map((task) => (
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
                              <span className="text-xs text-muted-foreground">Não alocado</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.supervisor ? (
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{task.supervisor.memberName}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sem supervisor</span>
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
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Tarefas do Dia</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={format(dailyFilterDate, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      setDailyFilterDate(new Date(y, m - 1, d));
                    }}
                    className="w-[170px]"
                  />
                  <Button onClick={openNewTaskModal}>
                    <Plus className="mr-2 h-4 w-4" /> Nova Tarefa
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold">{dailySummary.total}</p>
                  <p className="text-xs text-muted-foreground">Tarefas</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 text-center">
                  <p className="text-2xl font-bold text-blue-600">{dailySummary.running}</p>
                  <p className="text-xs text-muted-foreground">Em execução</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 text-center">
                  <p className="text-2xl font-bold text-red-600">{dailySummary.blocked}</p>
                  <p className="text-xs text-muted-foreground">Bloqueadas</p>
                </div>
                <div className="p-3 rounded-lg bg-green-50 text-center">
                  <p className="text-2xl font-bold text-green-600">{dailySummary.done}</p>
                  <p className="text-xs text-muted-foreground">Concluídas</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary text-center">
                  <p className="text-sm font-bold">
                    {dailySummary.executedHours.toFixed(1)}h / {dailySummary.plannedHours.toFixed(1)}h
                  </p>
                  <p className="text-xs text-muted-foreground">Exec. / Planej.</p>
                </div>
              </div>

              {dailyTasksForDate.length === 0 ? (
                <div className="text-center py-12">
                  <ListChecks className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma tarefa para esta data</h3>
                  <p className="text-gray-600 mb-4">Clique em "Nova Tarefa" para programar a execução do dia.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {dailyTasksForDate.map(t => {
                    const exec = liveExecutedHours(t);
                    const ready = isChecklistComplete(t.checklist);
                    const isToday = isSameDay(t.executionDate, new Date());
                    return (
                      <Card
                        key={t.id}
                        className="p-4 border-l-4"
                        style={{
                          borderLeftColor:
                            t.status === 'Concluída' ? '#16a34a' :
                            t.status === 'Em execução' ? '#2563eb' :
                            t.status === 'Bloqueada' ? '#dc2626' :
                            t.status === 'Parcialmente concluída' ? '#f59e0b' :
                            t.status === 'Cancelada' ? '#9ca3af' : '#06b6d4'
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">
                              Pedido {t.orderNumber} {t.itemCode && <span className="text-muted-foreground">| Produto {t.itemCode}</span>}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{t.itemDescription}</p>
                          </div>
                          {getDailyStatusBadge(t.status)}
                        </div>

                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">Etapa:</span> <span className="font-medium">{t.stageName}</span></p>
                          <p><span className="text-muted-foreground">Recurso:</span> <span className="font-medium">{t.resourceName || 'Não alocado'}</span></p>
                          {t.responsibleName && <p><span className="text-muted-foreground">Responsável:</span> {t.responsibleName}</p>}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Prazo: {isToday ? 'Hoje' : format(t.executionDate, 'dd/MM')}</span>
                            {getPriorityBadge(t.priority)}
                          </div>
                        </div>

                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">IPP: {taskIPP(t)}%</span>
                            <span className="text-muted-foreground">{t.plannedHours}h planej. / {exec.toFixed(1)}h exec.</span>
                          </div>
                          <Progress value={taskIPP(t)} className="h-1.5" />
                        </div>

                        {!ready && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                            <Ban className="h-3 w-3" />
                            <span>Preparação insuficiente{t.blockReason ? `: ${t.blockReason}` : ''}</span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t">
                          {t.status === 'Programada' && (
                            <Button size="sm" variant="outline" onClick={() => handleReleaseTask(t)}>
                              <CheckSquare className="h-3 w-3 mr-1" /> Liberar
                            </Button>
                          )}
                          {(t.status === 'Liberada para execução' || t.status === 'Parcialmente concluída') && (
                            <Button size="sm" className="bg-blue-600" onClick={() => handleStartTask(t)}>
                              <Play className="h-3 w-3 mr-1" /> Iniciar
                            </Button>
                          )}
                          {t.status === 'Em execução' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => handlePauseTask(t)}>
                                <Pause className="h-3 w-3 mr-1" /> Pausar
                              </Button>
                              <Button size="sm" className="bg-green-600" onClick={() => handleCompleteTask(t)}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Concluir
                              </Button>
                            </>
                          )}
                          {['Liberada para execução', 'Em execução', 'Parcialmente concluída', 'Programada'].includes(t.status) && (
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleBlockTask(t)}>
                              <Ban className="h-3 w-3 mr-1" /> Bloquear
                            </Button>
                          )}
                          {t.status !== 'Cancelada' && t.status !== 'Concluída' && (
                            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => handleCancelTask(t)}>
                              Cancelar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEditTaskModal(t)}>
                            <Edit className="h-3 w-3 mr-1" /> Editar
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
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
                <CardTitle>Recursos mais Utilizados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {resources
                    .map(resource => ({
                      ...resource,
                      taskCount: getFilteredTasks.filter(task => task.assignedResource?.resourceId === resource.id).length
                    }))
                    .sort((a, b) => b.taskCount - a.taskCount)
                    .slice(0, 5)
                    .map(resource => (
                      <div key={resource.id} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{resource.name}</p>
                          <p className="text-sm text-muted-foreground">{resource.type}</p>
                        </div>
                        <Badge variant="secondary">{resource.taskCount} tarefas</Badge>
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
                onValueChange={(v) => setTaskForm(p => ({ ...p, orderId: v, itemId: '', stageName: '' }))}
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
                onValueChange={(v) => setTaskForm(p => ({ ...p, itemId: v, stageName: '' }))}
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
                  const st = stageOptions.find(s => s.stageName === v);
                  setTaskForm(p => ({ ...p, stageName: v, plannedHours: p.plannedHours || (st?.estimatedHours || 0) }));
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Recurso</Label>
                <Select value={taskForm.resourceId} onValueChange={(v) => setTaskForm(p => ({ ...p, resourceId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o recurso" /></SelectTrigger>
                  <SelectContent>
                    {resources.map(r => (
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
                    {teamMembers.map(m => (
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
            <DialogTitle>Alocar Recurso e Supervisor</DialogTitle>
            <DialogDescription>
              Defina o recurso e supervisor responsáveis pela execução desta tarefa.
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
              
              {/* Seleção de recurso */}
              <div className="space-y-2">
                <Label>Recurso Produtivo</Label>
                <Select 
                  value={allocationData.resourceId || ''} 
                  onValueChange={(value) => 
                    setAllocationData(prev => ({ 
                      ...prev, 
                      resourceId: value === '' ? undefined : value 
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um recurso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum recurso</SelectItem>
                    {resources.filter(r => r.status === 'disponivel').map(resource => (
                      <SelectItem key={resource.id} value={String(resource.id)}>
                        <div className="flex items-center gap-2">
                          <span>{resource.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {resource.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Seleção de supervisor */}
              <div className="space-y-2">
                <Label>Supervisor</Label>
                <Select 
                  value={allocationData.supervisorId || ''} 
                  onValueChange={(value) => 
                    setAllocationData(prev => ({ 
                      ...prev, 
                      supervisorId: value === '' ? undefined : value 
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum supervisor</SelectItem>
                    {teamMembers.map(member => (
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
