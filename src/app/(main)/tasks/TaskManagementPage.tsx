"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isToday, isThisWeek, startOfWeek, endOfWeek, addDays, isSameDay, parseISO, startOfDay, endOfDay, differenceInHours, addHours, isWithinInterval } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Icons
import { 
  Calendar, 
  Clock, 
  User, 
  Settings, 
  CheckCircle, 
  PlayCircle, 
  Hourglass, 
  AlertTriangle,
  FileText,
  Printer,
  Filter,
  Users,
  ClipboardList,
  Target,
  TrendingUp,
  Activity,
  CalendarDays,
  Download,
  Schedule,
  AlertCircle,
  Edit,
  RotateCcw,
  CheckSquare
} from "lucide-react";

// =============================================================================
// SCHEMAS E TYPES
// =============================================================================

const taskAssignmentSchema = z.object({
  taskId: z.string(),
  resourceId: z.string().optional(),
  responsibleId: z.string().optional(),
  estimatedHours: z.number().min(0.1).optional(),
  notes: z.string().optional(),
});

const taskSchedulingSchema = z.object({
  taskId: z.string(),
  resourceId: z.string().optional(),
  responsibleId: z.string().optional(),
  estimatedHours: z.number().min(0.1),
  startDate: z.string(),
  startTime: z.string(),
  notes: z.string().optional(),
});

const taskUpdateSchema = z.object({
  taskId: z.string(),
  status: z.enum(['Concluído', 'Reprogramado']),
  completedDate: z.string().optional(),
  newStartDate: z.string().optional(),
  newStartTime: z.string().optional(),
  notes: z.string().optional(),
});

type TaskAssignmentFormData = z.infer<typeof taskAssignmentSchema>;
type TaskSchedulingFormData = z.infer<typeof taskSchedulingSchema>;
type TaskUpdateFormData = z.infer<typeof taskUpdateSchema>;

interface Task {
  id: string;
  orderId: string;
  orderNumber: string;
  customer: string;
  projectName?: string;
  itemId: string;
  itemDescription: string;
  itemCode?: string;
  stageName: string;
  status: string;
  startDate?: Date;
  completedDate?: Date;
  durationDays?: number;
  useBusinessDays?: boolean;
  assignedResourceId?: string;
  assignedResourceName?: string;
  responsibleId?: string;
  responsibleName?: string;
  estimatedHours?: number;
  notes?: string;
  deliveryDate?: Date;
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  scheduledStartDate?: Date;
  scheduledStartTime?: string;
}

interface Resource {
  id: string;
  name: string;
  type: string;
  status: string;
  capacity: number;
}

interface TeamMember {
  id: string;
  name: string;
  position: string;
  email: string;
}

interface CompanyData {
  nomeFantasia?: string;
  logo?: { preview?: string };
  endereco?: string;
  cnpj?: string;
}

interface ResourceConflict {
  resourceId: string;
  resourceName: string;
  date: string;
  conflictingTasks: Task[];
  totalHours: number;
  capacity: number;
}

interface ScheduledTask extends Task {
  scheduledStartDate: Date;
  scheduledStartTime: string;
  scheduledEndDate: Date;
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

const TaskManagementPage = () => {
  // Estados principais
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [isSchedulingDialogOpen, setIsSchedulingDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("today");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  const [orderFilter, setOrderFilter] = useState<string>("all");
  const [selectedViewDate, setSelectedViewDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Forms
  const assignmentForm = useForm<TaskAssignmentFormData>({
    resolver: zodResolver(taskAssignmentSchema),
    defaultValues: {
      resourceId: "",
      responsibleId: "",
      estimatedHours: 8,
      notes: "",
    },
  });

  const schedulingForm = useForm<TaskSchedulingFormData>({
    resolver: zodResolver(taskSchedulingSchema),
    defaultValues: {
      resourceId: "",
      responsibleId: "",
      estimatedHours: 8,
      startDate: format(new Date(), 'yyyy-MM-dd'),
      startTime: "08:00",
      notes: "",
    },
  });

  const updateForm = useForm<TaskUpdateFormData>({
    resolver: zodResolver(taskUpdateSchema),
    defaultValues: {
      status: 'Concluído',
      completedDate: format(new Date(), 'yyyy-MM-dd'),
      notes: "",
    },
  });

  // =============================================================================
  // FUNÇÕES UTILITÁRIAS
  // =============================================================================

  const calculatePriority = (deliveryDate?: Date): 'baixa' | 'media' | 'alta' | 'urgente' => {
    if (!deliveryDate) return 'media';
    
    const today = new Date();
    const diffTime = deliveryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'urgente';
    if (diffDays <= 3) return 'alta';
    if (diffDays <= 7) return 'media';
    return 'baixa';
  };

  // Função para detectar conflitos de recursos
  const detectResourceConflicts = (scheduledTasks: ScheduledTask[]): ResourceConflict[] => {
    const conflicts: ResourceConflict[] = [];
    const resourceTasksByDate: { [key: string]: { [resourceId: string]: ScheduledTask[] } } = {};

    // Agrupar tarefas por data e recurso
    scheduledTasks.forEach(task => {
      if (!task.assignedResourceId || !task.scheduledStartDate) return;
      
      const dateKey = format(task.scheduledStartDate, 'yyyy-MM-dd');
      if (!resourceTasksByDate[dateKey]) {
        resourceTasksByDate[dateKey] = {};
      }
      if (!resourceTasksByDate[dateKey][task.assignedResourceId]) {
        resourceTasksByDate[dateKey][task.assignedResourceId] = [];
      }
      
      resourceTasksByDate[dateKey][task.assignedResourceId].push(task);
    });

    // Verificar conflitos
    Object.entries(resourceTasksByDate).forEach(([date, resourceTasks]) => {
      Object.entries(resourceTasks).forEach(([resourceId, tasks]) => {
        if (tasks.length <= 1) return;

        const resource = resources.find(r => r.id === resourceId);
        if (!resource) return;

        // Verificar sobreposição de horários
        const sortedTasks = tasks.sort((a, b) => 
          new Date(`${date} ${a.scheduledStartTime}`).getTime() - 
          new Date(`${date} ${b.scheduledStartTime}`).getTime()
        );

        let totalHours = 0;
        let hasTimeConflict = false;

        for (let i = 0; i < sortedTasks.length; i++) {
          const currentTask = sortedTasks[i];
          totalHours += currentTask.estimatedHours || 0;

          if (i < sortedTasks.length - 1) {
            const nextTask = sortedTasks[i + 1];
            const currentEnd = addHours(
              new Date(`${date} ${currentTask.scheduledStartTime}`),
              currentTask.estimatedHours || 0
            );
            const nextStart = new Date(`${date} ${nextTask.scheduledStartTime}`);

            if (currentEnd > nextStart) {
              hasTimeConflict = true;
            }
          }
        }

        if (hasTimeConflict || totalHours > (resource.capacity || 8)) {
          conflicts.push({
            resourceId,
            resourceName: resource.name,
            date,
            conflictingTasks: tasks,
            totalHours,
            capacity: resource.capacity || 8,
          });
        }
      });
    });

    return conflicts;
  };

  // =============================================================================
  // BUSCA DE DADOS
  // =============================================================================

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const allTasks: Task[] = [];

      ordersSnapshot.docs.forEach(orderDoc => {
        const orderData = orderDoc.data();
        
        if (orderData.status === 'Concluído' || orderData.status === 'Cancelado') {
          return;
        }

        const deliveryDate = orderData.deliveryDate?.toDate();
        
        orderData.items?.forEach((item: any, itemIndex: number) => {
          if (item.productionPlan && Array.isArray(item.productionPlan)) {
            item.productionPlan.forEach((stage: any, stageIndex: number) => {
              const task: Task = {
                id: `${orderDoc.id}-${itemIndex}-${stageIndex}`,
                orderId: orderDoc.id,
                orderNumber: orderData.quotationNumber || orderData.orderNumber || 'N/A',
                customer: orderData.customer?.name || orderData.customerName || 'Cliente não informado',
                projectName: orderData.projectName,
                itemId: item.id || `item-${itemIndex}`,
                itemDescription: item.description || 'Item sem descrição',
                itemCode: item.code,
                stageName: stage.stageName || 'Etapa sem nome',
                status: stage.status || 'Pendente',
                startDate: stage.startDate?.toDate(),
                completedDate: stage.completedDate?.toDate(),
                durationDays: stage.durationDays,
                useBusinessDays: stage.useBusinessDays !== false,
                assignedResourceId: stage.assignedResourceId,
                responsibleId: stage.responsibleId,
                estimatedHours: stage.estimatedHours,
                notes: stage.notes,
                deliveryDate,
                priority: calculatePriority(deliveryDate),
                scheduledStartDate: stage.scheduledStartDate?.toDate(),
                scheduledStartTime: stage.scheduledStartTime,
              };
              allTasks.push(task);
            });
          }
        });
      });

      const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
      const resourcesSnap = await getDoc(resourcesRef);
      const resourcesData = resourcesSnap.exists() ? resourcesSnap.data().resources || [] : [];
      
      const teamRef = doc(db, "companies", "mecald", "settings", "team");
      const teamSnap = await getDoc(teamRef);
      const teamData = teamSnap.exists() ? teamSnap.data().members || [] : [];

      const enrichedTasks = allTasks.map(task => ({
        ...task,
        assignedResourceName: task.assignedResourceId 
          ? resourcesData.find((r: any) => r.id === task.assignedResourceId)?.name
          : undefined,
        responsibleName: task.responsibleId 
          ? teamData.find((m: any) => m.id === task.responsibleId)?.name
          : undefined,
      }));

      setTasks(enrichedTasks);
      setResources(resourcesData);
      setTeamMembers(teamData);

    } catch (error) {
      console.error("Error fetching tasks data:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as tarefas.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchData();
    }
  }, [user, authLoading]);

  // =============================================================================
  // DADOS COMPUTADOS
  // =============================================================================

  const filteredTasks = useMemo(() => {
    const safeTasks = tasks || [];
    let filtered = safeTasks;

    if (statusFilter !== "all") {
      filtered = filtered.filter(task => task.status === statusFilter);
    }

    if (resourceFilter !== "all") {
      filtered = filtered.filter(task => task.assignedResourceId === resourceFilter);
    }

    if (responsibleFilter !== "all") {
      filtered = filtered.filter(task => task.responsibleId === responsibleFilter);
    }

    if (orderFilter !== "all") {
      filtered = filtered.filter(task => task.orderId === orderFilter);
    }

    return filtered;
  }, [tasks, statusFilter, resourceFilter, responsibleFilter, orderFilter]);

  const tasksByPeriod = useMemo(() => {
    const safeFilteredTasks = filteredTasks || [];
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

    return {
      today: safeFilteredTasks.filter(task => 
        task.startDate && isToday(task.startDate) || 
        task.status === 'Em Andamento'
      ),
      thisWeek: safeFilteredTasks.filter(task => 
        task.startDate && isThisWeek(task.startDate, { weekStartsOn: 1 }) ||
        (task.status === 'Em Andamento' && task.startDate && task.startDate <= weekEnd)
      ),
      pending: safeFilteredTasks.filter(task => task.status === 'Pendente'),
      inProgress: safeFilteredTasks.filter(task => task.status === 'Em Andamento'),
      completed: safeFilteredTasks.filter(task => task.status === 'Concluído'),
      overdue: safeFilteredTasks.filter(task => 
        task.startDate && 
        task.startDate < today && 
        task.status !== 'Concluído'
      ),
    };
  }, [filteredTasks]);

  const stats = useMemo(() => {
    const safeTasks = tasks || [];
    const total = safeTasks.length;
    const completed = safeTasks.filter(t => t.status === 'Concluído').length;
    const inProgress = safeTasks.filter(t => t.status === 'Em Andamento').length;
    const pending = safeTasks.filter(t => t.status === 'Pendente').length;
    const overdue = safeTasks.filter(t => 
      t.startDate && 
      t.startDate < new Date() && 
      t.status !== 'Concluído'
    ).length;

    return { total, completed, inProgress, pending, overdue };
  }, [tasks]);

  // Dados para programação
  const schedulingData = useMemo(() => {
    const safeTasks = tasks || [];
    const pendingTasks = safeTasks.filter(task => task.status === 'Pendente');
    const scheduledTasks = safeTasks.filter(task => 
      task.scheduledStartDate && task.assignedResourceId
    ) as ScheduledTask[];
    
    const conflicts = detectResourceConflicts(scheduledTasks);
    
    // Recursos disponíveis vs ocupados
    const safeResources = resources || [];
    const resourceUtilization = safeResources.map(resource => {
      const tasksForResource = scheduledTasks.filter(task => 
        task.assignedResourceId === resource.id &&
        task.scheduledStartDate &&
        isSameDay(task.scheduledStartDate, parseISO(selectedViewDate))
      );
      
      const totalHours = tasksForResource.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
      const utilization = (totalHours / (resource.capacity || 8)) * 100;
      
      return {
        resource,
        tasks: tasksForResource,
        totalHours,
        utilization: Math.min(utilization, 100),
        isOverutilized: totalHours > (resource.capacity || 8),
      };
    });

    return {
      pendingTasks,
      scheduledTasks,
      conflicts,
      resourceUtilization,
    };
  }, [tasks, resources, selectedViewDate]);

  // Lista de ordens únicas
  const uniqueOrders = useMemo(() => {
    const safeTasks = tasks || [];
    const orders = safeTasks.reduce((acc, task) => {
      if (!acc.find(o => o.id === task.orderId)) {
        acc.push({
          id: task.orderId,
          number: task.orderNumber,
          customer: task.customer,
        });
      }
      return acc;
    }, [] as Array<{ id: string; number: string; customer: string }>);
    
    return orders.sort((a, b) => a.number.localeCompare(b.number));
  }, [tasks]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleAssignTask = (task: Task) => {
    setSelectedTask(task);
    assignmentForm.reset({
      taskId: task.id,
      resourceId: task.assignedResourceId || "",
      responsibleId: task.responsibleId || "",
      estimatedHours: task.estimatedHours || 8,
      notes: task.notes || "",
    });
    setIsAssignmentDialogOpen(true);
  };

  const handleScheduleTask = (task: Task) => {
    setSelectedTask(task);
    schedulingForm.reset({
      taskId: task.id,
      resourceId: task.assignedResourceId || "",
      responsibleId: task.responsibleId || "",
      estimatedHours: task.estimatedHours || 8,
      startDate: task.scheduledStartDate ? format(task.scheduledStartDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      startTime: task.scheduledStartTime || "08:00",
      notes: task.notes || "",
    });
    setIsSchedulingDialogOpen(true);
  };

  const handleUpdateTask = (task: Task) => {
    setSelectedTask(task);
    updateForm.reset({
      taskId: task.id,
      status: 'Concluído',
      completedDate: format(new Date(), 'yyyy-MM-dd'),
      notes: "",
    });
    setIsUpdateDialogOpen(true);
  };

  const onAssignmentSubmit = async (values: TaskAssignmentFormData) => {
    if (!selectedTask) return;

    try {
      const orderRef = doc(db, "companies", "mecald", "orders", selectedTask.orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        throw new Error("Pedido não encontrado");
      }

      const orderData = orderSnap.data();
      const updatedItems = orderData.items.map((item: any, itemIndex: number) => {
        if (item.id === selectedTask.itemId || itemIndex.toString() === selectedTask.itemId.split('-').pop()) {
          const updatedProductionPlan = item.productionPlan?.map((stage: any, stageIndex: number) => {
            const taskId = `${selectedTask.orderId}-${itemIndex}-${stageIndex}`;
            if (taskId === selectedTask.id) {
              return {
                ...stage,
                assignedResourceId: values.resourceId || null,
                responsibleId: values.responsibleId || null,
                estimatedHours: values.estimatedHours || null,
                notes: values.notes || null,
              };
            }
            return stage;
          });
          
          return {
            ...item,
            productionPlan: updatedProductionPlan,
          };
        }
        return item;
      });

      await updateDoc(orderRef, { items: updatedItems });

      toast({
        title: "Tarefa atribuída!",
        description: "A tarefa foi atribuída com sucesso.",
      });

      setIsAssignmentDialogOpen(false);
      setSelectedTask(null);
      await fetchData();

    } catch (error) {
      console.error("Error assigning task:", error);
      toast({
        variant: "destructive",
        title: "Erro ao atribuir tarefa",
        description: "Não foi possível atribuir a tarefa.",
      });
    }
  };

  const onSchedulingSubmit = async (values: TaskSchedulingFormData) => {
    if (!selectedTask) return;

    try {
      const orderRef = doc(db, "companies", "mecald", "orders", selectedTask.orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        throw new Error("Pedido não encontrado");
      }

      const orderData = orderSnap.data();
      const updatedItems = orderData.items.map((item: any, itemIndex: number) => {
        if (item.id === selectedTask.itemId || itemIndex.toString() === selectedTask.itemId.split('-').pop()) {
          const updatedProductionPlan = item.productionPlan?.map((stage: any, stageIndex: number) => {
            const taskId = `${selectedTask.orderId}-${itemIndex}-${stageIndex}`;
            if (taskId === selectedTask.id) {
              return {
                ...stage,
                assignedResourceId: values.resourceId || null,
                responsibleId: values.responsibleId || null,
                estimatedHours: values.estimatedHours,
                scheduledStartDate: Timestamp.fromDate(parseISO(values.startDate)),
                scheduledStartTime: values.startTime,
                notes: values.notes || null,
                status: 'Programado',
              };
            }
            return stage;
          });
          
          return {
            ...item,
            productionPlan: updatedProductionPlan,
          };
        }
        return item;
      });

      await updateDoc(orderRef, { items: updatedItems });

      toast({
        title: "Tarefa programada!",
        description: "A tarefa foi programada com sucesso.",
      });

      setIsSchedulingDialogOpen(false);
      setSelectedTask(null);
      await fetchData();

    } catch (error) {
      console.error("Error scheduling task:", error);
      toast({
        variant: "destructive",
        title: "Erro ao programar tarefa",
        description: "Não foi possível programar a tarefa.",
      });
    }
  };

  const onUpdateSubmit = async (values: TaskUpdateFormData) => {
    if (!selectedTask) return;

    try {
      const orderRef = doc(db, "companies", "mecald", "orders", selectedTask.orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        throw new Error("Pedido não encontrado");
      }

      const orderData = orderSnap.data();
      const updatedItems = orderData.items.map((item: any, itemIndex: number) => {
        if (item.id === selectedTask.itemId || itemIndex.toString() === selectedTask.itemId.split('-').pop()) {
          const updatedProductionPlan = item.productionPlan?.map((stage: any, stageIndex: number) => {
            const taskId = `${selectedTask.orderId}-${itemIndex}-${stageIndex}`;
            if (taskId === selectedTask.id) {
              const updateData: any = {
                ...stage,
                status: values.status,
                notes: values.notes || stage.notes,
              };

              if (values.status === 'Concluído' && values.completedDate) {
                updateData.completedDate = Timestamp.fromDate(parseISO(values.completedDate));
                updateData.actualCompletionDate = Timestamp.fromDate(new Date());
              }

              if (values.status === 'Reprogramado' && values.newStartDate) {
                updateData.scheduledStartDate = Timestamp.fromDate(parseISO(values.newStartDate));
                updateData.scheduledStartTime = values.newStartTime || stage.scheduledStartTime;
                updateData.status = 'Programado';
              }

              return updateData;
            }
            return stage;
          });
          
          return {
            ...item,
            productionPlan: updatedProductionPlan,
          };
        }
        return item;
      });

      await updateDoc(orderRef, { items: updatedItems });

      toast({
        title: "Tarefa atualizada!",
        description: `A tarefa foi ${values.status === 'Concluído' ? 'concluída' : 'reprogramada'} com sucesso.`,
      });

      setIsUpdateDialogOpen(false);
      setSelectedTask(null);
      await fetchData();

    } catch (error) {
      console.error("Error updating task:", error);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar tarefa",
        description: "Não foi possível atualizar a tarefa.",
      });
    }
  };

  // =============================================================================
  // GERAÇÃO DE RELATÓRIOS
  // =============================================================================

  const generateTaskReport = async (period: 'daily' | 'weekly') => {
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};

      const pdfDoc = new jsPDF();
      const pageWidth = pdfDoc.internal.pageSize.width;
      let yPos = 15;

      if (companyData.logo?.preview) {
        try {
          pdfDoc.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
        } catch (e) {
          console.error("Error adding logo to PDF:", e);
        }
      }

      let companyInfoX = 65;
      let companyInfoY = yPos + 5;
      pdfDoc.setFontSize(16).setFont('helvetica', 'bold');
      pdfDoc.text(companyData.nomeFantasia || 'Sua Empresa', companyInfoX, companyInfoY);
      companyInfoY += 6;
      
      pdfDoc.setFontSize(8).setFont('helvetica', 'normal');
      if (companyData.endereco) {
        const addressLines = pdfDoc.splitTextToSize(companyData.endereco, pageWidth - companyInfoX - 15);
        pdfDoc.text(addressLines, companyInfoX, companyInfoY);
        companyInfoY += (addressLines.length * 3);
      }

      yPos = 45;

      pdfDoc.setFontSize(18).setFont('helvetica', 'bold');
      const title = period === 'daily' ? 'PROGRAMAÇÃO DIÁRIA' : 'PROGRAMAÇÃO SEMANAL';
      pdfDoc.text(title, pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      pdfDoc.setFontSize(10).setFont('helvetica', 'normal');
      const dateStr = period === 'daily' 
        ? `Data: ${format(parseISO(selectedViewDate), 'dd/MM/yyyy')}`
        : `Semana de ${format(startOfWeek(parseISO(selectedViewDate), { weekStartsOn: 1 }), 'dd/MM')} a ${format(endOfWeek(parseISO(selectedViewDate), { weekStartsOn: 1 }), 'dd/MM/yyyy')}`;
      pdfDoc.text(dateStr, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      const tasksToShow = period === 'daily' 
        ? schedulingData.scheduledTasks.filter(task => 
            task.scheduledStartDate && isSameDay(task.scheduledStartDate, parseISO(selectedViewDate))
          )
        : schedulingData.scheduledTasks.filter(task => 
            task.scheduledStartDate && isThisWeek(task.scheduledStartDate, { weekStartsOn: 1 })
          );

      if (tasksToShow.length === 0) {
        pdfDoc.text('Nenhuma tarefa programada para este período.', pageWidth / 2, yPos, { align: 'center' });
      } else {
        // Estatísticas da programação
        const scheduleStats = {
          total: tasksToShow.length,
          resources: [...new Set(tasksToShow.map(t => t.assignedResourceId))].length,
          totalHours: tasksToShow.reduce((sum, t) => sum + (t.estimatedHours || 0), 0),
        };

        pdfDoc.setFontSize(12).setFont('helvetica', 'bold');
        pdfDoc.text('RESUMO DA PROGRAMAÇÃO:', 15, yPos);
        yPos += 8;

        pdfDoc.setFontSize(10).setFont('helvetica', 'normal');
        pdfDoc.text(`Total de tarefas: ${scheduleStats.total}`, 15, yPos);
        pdfDoc.text(`Recursos utilizados: ${scheduleStats.resources}`, 80, yPos);
        pdfDoc.text(`Horas programadas: ${scheduleStats.totalHours}h`, 150, yPos);
        yPos += 15;

        // Tabela de programação
        const tableBody = tasksToShow
          .sort((a, b) => {
            if (a.scheduledStartDate && b.scheduledStartDate) {
              const dateCompare = a.scheduledStartDate.getTime() - b.scheduledStartDate.getTime();
              if (dateCompare === 0) {
                return (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || '');
              }
              return dateCompare;
            }
            return 0;
          })
          .map(task => [
            task.scheduledStartDate ? format(task.scheduledStartDate, 'dd/MM') : 'N/A',
            task.scheduledStartTime || 'N/A',
            task.orderNumber,
            task.customer.substring(0, 20) + (task.customer.length > 20 ? '...' : ''),
            task.stageName.substring(0, 25) + (task.stageName.length > 25 ? '...' : ''),
            task.assignedResourceName || 'N/A',
            task.responsibleName || 'N/A',
            `${task.estimatedHours || 0}h`,
          ]);

        autoTable(pdfDoc, {
          startY: yPos,
          head: [['Data', 'Hora', 'OS', 'Cliente', 'Etapa', 'Recurso', 'Responsável', 'Horas']],
          body: tableBody,
          styles: { 
            fontSize: 8,
            cellPadding: 2
          },
          headStyles: { 
            fillColor: [37, 99, 235], 
            fontSize: 9, 
            textColor: 255,
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { cellWidth: 20 }, // Data
            1: { cellWidth: 20 }, // Hora
            2: { cellWidth: 25 }, // OS
            3: { cellWidth: 35 }, // Cliente
            4: { cellWidth: 40 }, // Etapa
            5: { cellWidth: 30 }, // Recurso
            6: { cellWidth: 30 }, // Responsável
            7: { cellWidth: 20 }, // Horas
          }
        });

        // Conflitos (se houver)
        if (schedulingData.conflicts.length > 0) {
          const finalY = (pdfDoc as any).lastAutoTable.finalY;
          yPos = finalY + 15;
          
          pdfDoc.setFontSize(12).setFont('helvetica', 'bold');
          pdfDoc.setTextColor(220, 38, 38); // Vermelho
          pdfDoc.text('⚠️ CONFLITOS DETECTADOS:', 15, yPos);
          yPos += 8;
          
          pdfDoc.setFontSize(10).setFont('helvetica', 'normal');
          pdfDoc.setTextColor(0, 0, 0); // Preto
          
          schedulingData.conflicts.forEach((conflict, index) => {
            pdfDoc.text(
              `${index + 1}. ${conflict.resourceName} em ${format(parseISO(conflict.date), 'dd/MM/yyyy')}: ${conflict.totalHours}h programadas (capacidade: ${conflict.capacity}h)`,
              15, yPos
            );
            yPos += 5;
          });
        }

        // Rodapé
        const finalY = (pdfDoc as any).lastAutoTable?.finalY || yPos;
        if (finalY + 20 < pdfDoc.internal.pageSize.height - 20) {
          yPos = finalY + 15;
          pdfDoc.setFontSize(8).setFont('helvetica', 'italic');
          pdfDoc.setTextColor(100, 100, 100);
          pdfDoc.text(
            `Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
            pageWidth / 2,
            yPos,
            { align: 'center' }
          );
        }
      }

      const filename = `Programacao_${period === 'daily' ? 'Diaria' : 'Semanal'}_${format(parseISO(selectedViewDate), 'yyyyMMdd')}.pdf`;
      pdfDoc.save(filename);

      toast({
        title: "Relatório gerado!",
        description: `O relatório de programação ${period === 'daily' ? 'diária' : 'semanal'} foi baixado com sucesso.`,
      });

    } catch (error) {
      console.error("Error generating scheduling report:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Não foi possível gerar o relatório de programação.",
      });
    }
  };

  // =============================================================================
  // COMPONENTES AUXILIARES
  // =============================================================================

  const TaskTable = ({ tasks, title }: { tasks: Task[]; title: string }) => {
    // Garantir que tasks seja sempre um array válido
    const safeTasks = tasks || [];
    
    const getPriorityBadge = (priority: Task['priority']) => {
      const variants = {
        baixa: "bg-blue-100 text-blue-800",
        media: "bg-yellow-100 text-yellow-800", 
        alta: "bg-orange-100 text-orange-800",
        urgente: "bg-red-100 text-red-800"
      };
      
      return (
        <Badge className={variants[priority]}>
          {priority.charAt(0).toUpperCase() + priority.slice(1)}
        </Badge>
      );
    };

    const getStatusBadge = (status: string) => {
      const variants = {
        'Pendente': "bg-gray-100 text-gray-800",
        'Em Andamento': "bg-blue-100 text-blue-800",
        'Programado': "bg-purple-100 text-purple-800",
        'Concluído': "bg-green-100 text-green-800"
      };
      
      return (
        <Badge className={variants[status as keyof typeof variants] || "bg-gray-100 text-gray-800"}>
          {status}
        </Badge>
      );
    };

    if (safeTasks.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              Nenhuma tarefa encontrada para este período.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {title}
            <Badge variant="outline">{safeTasks.length} tarefas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {safeTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.orderNumber}</TableCell>
                  <TableCell>{task.customer}</TableCell>
                  <TableCell>
                    <div>
                      {task.itemCode ? <div className="text-xs text-muted-foreground">[{task.itemCode}]</div> : null}
                      <div className="truncate max-w-[150px]" title={task.itemDescription}>
                        {task.itemDescription}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{task.stageName}</TableCell>
                  <TableCell>{getStatusBadge(task.status)}</TableCell>
                  <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                  <TableCell>
                    {task.assignedResourceName ? (
                      <Badge variant="outline">{task.assignedResourceName}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Não atribuído</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {task.responsibleName ? (
                      <Badge variant="outline">{task.responsibleName}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Não atribuído</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleAssignTask(task)}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      {task.assignedResourceId || task.responsibleId ? 'Editar' : 'Atribuir'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  // Componente para a aba de programação
  const SchedulingTab = () => {
    return (
      <div className="space-y-6">
        {/* Filtros para programação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Schedule className="h-5 w-5" />
              Programação de Tarefas
            </CardTitle>
            <CardDescription>
              Programe tarefas pendentes e gerencie conflitos de recursos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Data de Visualização:</label>
                <Input
                  type="date"
                  value={selectedViewDate}
                  onChange={(e) => setSelectedViewDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Filtrar por OS:</label>
                <Select value={orderFilter} onValueChange={setOrderFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Todas as OS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as OS</SelectItem>
                    {uniqueOrders.map(order => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.number} - {order.customer.substring(0, 30)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => generateTaskReport('daily')}>
                  <Printer className="mr-2 h-4 w-4" />
                  Exportar Diário
                </Button>
                <Button variant="outline" onClick={() => generateTaskReport('weekly')}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Semanal
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alertas de conflitos */}
        {schedulingData.conflicts && schedulingData.conflicts.length > 0 && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium text-red-800">
                  {schedulingData.conflicts.length} conflito(s) de recursos detectado(s):
                </p>
                {(schedulingData.conflicts || []).map((conflict, index) => (
                  <div key={index} className="text-sm text-red-700">
                    • <strong>{conflict.resourceName}</strong> em {format(parseISO(conflict.date), 'dd/MM/yyyy')}: 
                    {conflict.totalHours}h programadas (capacidade: {conflict.capacity}h)
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Dashboard de recursos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Utilização de Recursos - {format(parseISO(selectedViewDate), 'dd/MM/yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(schedulingData.resourceUtilization || []).map((item) => (
                <Card key={item.resource.id} className={item.isOverutilized ? "border-red-200" : ""}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      {item.resource.name}
                      {item.isOverutilized && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {item.resource.type} • Capacidade: {item.resource.capacity || 8}h
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Utilização:</span>
                        <span className={item.isOverutilized ? "text-red-600 font-medium" : ""}>
                          {item.totalHours}h ({item.utilization.toFixed(0)}%)
                        </span>
                      </div>
                      <Progress 
                        value={item.utilization} 
                        className={`h-2 ${item.isOverutilized ? '[&>div]:bg-red-500' : ''}`}
                      />
                      <div className="text-xs text-muted-foreground">
                        {item.tasks.length} tarefa(s) programada(s)
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tarefas pendentes para programação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Tarefas Pendentes para Programação
              </span>
              <Badge variant="outline">{schedulingData.pendingTasks.length} tarefas</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedulingData.pendingTasks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Todas as tarefas foram programadas!
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(schedulingData.pendingTasks || [])
                    .filter(task => orderFilter === "all" || task.orderId === orderFilter)
                    .map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.orderNumber}</TableCell>
                      <TableCell>{task.customer}</TableCell>
                      <TableCell>
                        <div>
                          {task.itemCode ? <div className="text-xs text-muted-foreground">[{task.itemCode}]</div> : null}
                          <div className="truncate max-w-[150px]" title={task.itemDescription}>
                            {task.itemDescription}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{task.stageName}</TableCell>
                      <TableCell>
                        <Badge className={
                          task.priority === 'urgente' ? "bg-red-100 text-red-800" :
                          task.priority === 'alta' ? "bg-orange-100 text-orange-800" :
                          task.priority === 'media' ? "bg-yellow-100 text-yellow-800" :
                          "bg-blue-100 text-blue-800"
                        }>
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {task.deliveryDate ? format(task.deliveryDate, 'dd/MM/yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="sm"
                          onClick={() => handleScheduleTask(task)}
                        >
                          <Schedule className="h-4 w-4 mr-1" />
                          Programar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Tarefas programadas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Tarefas Programadas - {format(parseISO(selectedViewDate), 'dd/MM/yyyy')}
              </span>
              <Badge variant="outline">
                {schedulingData.scheduledTasks.filter(task => 
                  task.scheduledStartDate && isSameDay(task.scheduledStartDate, parseISO(selectedViewDate))
                ).length} tarefas
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {schedulingData.scheduledTasks.filter(task => 
              task.scheduledStartDate && isSameDay(task.scheduledStartDate, parseISO(selectedViewDate))
            ).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma tarefa programada para esta data.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(schedulingData.scheduledTasks || [])
                    .filter(task => 
                      task.scheduledStartDate && isSameDay(task.scheduledStartDate, parseISO(selectedViewDate)) &&
                      (orderFilter === "all" || task.orderId === orderFilter)
                    )
                    .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''))
                    .map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.scheduledStartTime}</TableCell>
                      <TableCell>{task.orderNumber}</TableCell>
                      <TableCell>{task.customer}</TableCell>
                      <TableCell>{task.stageName}</TableCell>
                      <TableCell>
                        {task.assignedResourceName ? (
                          <Badge variant="outline">{task.assignedResourceName}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {task.responsibleName ? (
                          <Badge variant="outline">{task.responsibleName}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>{task.estimatedHours || 0}h</TableCell>
                      <TableCell>
                        <Badge className={
                          task.status === 'Concluído' ? "bg-green-100 text-green-800" :
                          task.status === 'Em Andamento' ? "bg-blue-100 text-blue-800" :
                          "bg-purple-100 text-purple-800"
                        }>
                          {task.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            size="sm"
                            variant="outline"
                            onClick={() => handleScheduleTask(task)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          {(task.status === 'Programado' || task.status === 'Em Andamento') && (
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateTask(task)}
                            >
                              <CheckSquare className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dashboard Realizado x Programado */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Realizado x Programado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Tarefas Programadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {schedulingData.scheduledTasks.filter(task => 
                      task.scheduledStartDate && isSameDay(task.scheduledStartDate, parseISO(selectedViewDate))
                    ).length}
                  </div>
                  <p className="text-xs text-muted-foreground">para hoje</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Tarefas Concluídas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {schedulingData.scheduledTasks.filter(task => 
                      task.scheduledStartDate && 
                      isSameDay(task.scheduledStartDate, parseISO(selectedViewDate)) &&
                      task.status === 'Concluído'
                    ).length}
                  </div>
                  <p className="text-xs text-muted-foreground">hoje</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Taxa de Conclusão</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {(() => {
                      const scheduled = schedulingData.scheduledTasks.filter(task => 
                        task.scheduledStartDate && isSameDay(task.scheduledStartDate, parseISO(selectedViewDate))
                      ).length;
                      const completed = schedulingData.scheduledTasks.filter(task => 
                        task.scheduledStartDate && 
                        isSameDay(task.scheduledStartDate, parseISO(selectedViewDate)) &&
                        task.status === 'Concluído'
                      ).length;
                      return scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
                    })()}%
                  </div>
                  <p className="text-xs text-muted-foreground">de eficiência</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  // Verificar autenticação primeiro
  if (authLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Se não há usuário autenticado, não renderizar
  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // =============================================================================
  // RENDER PRINCIPAL
  // =============================================================================

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => generateTaskReport('daily')}>
            <Printer className="mr-2 h-4 w-4" />
            Relatório Diário
          </Button>
          <Button variant="outline" onClick={() => generateTaskReport('weekly')}>
            <Download className="mr-2 h-4 w-4" />
            Relatório Semanal
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">tarefas ativas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Hourglass className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">aguardando início</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <PlayCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">sendo executadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">finalizadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Atraso</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground">atrasadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                  <SelectItem value="Programado">Programado</SelectItem>
                  <SelectItem value="Concluído">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Recurso:</label>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Recurso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {resources.map(resource => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Responsável:</label>
              <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(statusFilter !== "all" || resourceFilter !== "all" || responsibleFilter !== "all") && (
              <Button 
                variant="outline" 
                onClick={() => {
                  setStatusFilter("all");
                  setResourceFilter("all");
                  setResponsibleFilter("all");
                }}
              >
                Limpar Filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progresso Geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Progresso Geral
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Tarefas Concluídas</span>
              <span>{stats.completed} de {stats.total}</span>
            </div>
            <Progress value={stats.total > 0 ? (stats.completed / stats.total) * 100 : 0} className="h-2" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Pendentes:</span>
                <span className="font-medium">{stats.pending}</span>
              </div>
              <Progress value={stats.total > 0 ? (stats.pending / stats.total) * 100 : 0} className="h-1 [&>div]:bg-yellow-500" />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Em Andamento:</span>
                <span className="font-medium">{stats.inProgress}</span>
              </div>
              <Progress value={stats.total > 0 ? (stats.inProgress / stats.total) * 100 : 0} className="h-1 [&>div]:bg-blue-500" />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>Atrasadas:</span>
                <span className="font-medium">{stats.overdue}</span>
              </div>
              <Progress value={stats.total > 0 ? (stats.overdue / stats.total) * 100 : 0} className="h-1 [&>div]:bg-red-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Abas de Tarefas */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="today" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Hoje ({tasksByPeriod.today.length})
          </TabsTrigger>
          <TabsTrigger value="week" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Semana ({tasksByPeriod.thisWeek.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Hourglass className="h-4 w-4" />
            Pendentes ({tasksByPeriod.pending.length})
          </TabsTrigger>
          <TabsTrigger value="progress" className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Andamento ({tasksByPeriod.inProgress.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Concluídas ({tasksByPeriod.completed.length})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Atrasadas ({tasksByPeriod.overdue.length})
          </TabsTrigger>
          <TabsTrigger value="scheduling" className="flex items-center gap-2">
            <Schedule className="h-4 w-4" />
            Programar ({schedulingData.pendingTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <TaskTable tasks={tasksByPeriod.today} title="Tarefas de Hoje" />
        </TabsContent>

        <TabsContent value="week">
          <TaskTable tasks={tasksByPeriod.thisWeek} title="Tarefas desta Semana" />
        </TabsContent>

        <TabsContent value="pending">
          <TaskTable tasks={tasksByPeriod.pending} title="Tarefas Pendentes" />
        </TabsContent>

        <TabsContent value="progress">
          <TaskTable tasks={tasksByPeriod.inProgress} title="Tarefas em Andamento" />
        </TabsContent>

        <TabsContent value="completed">
          <TaskTable tasks={tasksByPeriod.completed} title="Tarefas Concluídas" />
        </TabsContent>

        <TabsContent value="overdue">
          <TaskTable tasks={tasksByPeriod.overdue} title="Tarefas em Atraso" />
        </TabsContent>

        <TabsContent value="scheduling">
          <SchedulingTab />
        </TabsContent>
      </Tabs>

      {/* Dialog de Atribuição de Tarefas */}
      <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Atribuir Tarefa</DialogTitle>
            <DialogDescription>
              Defina o recurso e responsável para a execução desta tarefa.
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-4">
              <Card className="p-4 bg-muted/50">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Pedido:</span>
                    <span>{selectedTask.orderNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Cliente:</span>
                    <span>{selectedTask.customer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Item:</span>
                    <span className="truncate max-w-[200px]" title={selectedTask.itemDescription}>
                      {selectedTask.itemDescription}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Etapa:</span>
                    <span>{selectedTask.stageName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Status Atual:</span>
                    <Badge>{selectedTask.status}</Badge>
                  </div>
                  {selectedTask.deliveryDate && (
                    <div className="flex justify-between">
                      <span className="font-medium">Entrega:</span>
                      <span>{format(selectedTask.deliveryDate, 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                </div>
              </Card>

              <Form {...assignmentForm}>
                <form onSubmit={assignmentForm.handleSubmit(onAssignmentSubmit)} className="space-y-4">
                  <FormField
                    control={assignmentForm.control}
                    name="resourceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recurso Produtivo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um recurso" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Nenhum recurso</SelectItem>
                            {(resources || [])
                              .filter(r => r.status === 'disponivel')
                              .map(resource => (
                                <SelectItem key={resource.id} value={resource.id}>
                                  <div className="flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    {resource.name} ({resource.type})
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="responsibleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsável</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um responsável" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Nenhum responsável</SelectItem>
                            {(teamMembers || []).map(member => (
                              <SelectItem key={member.id} value={member.id}>
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  {member.name} - {member.position}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="estimatedHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Horas Estimadas</FormLabel>
                        <FormControl>
                          <Select 
                            onValueChange={(value) => field.onChange(parseFloat(value))} 
                            value={field.value?.toString() || ""}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione as horas" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0.5">0,5 horas</SelectItem>
                              <SelectItem value="1">1 hora</SelectItem>
                              <SelectItem value="2">2 horas</SelectItem>
                              <SelectItem value="4">4 horas</SelectItem>
                              <SelectItem value="8">8 horas (1 dia)</SelectItem>
                              <SelectItem value="16">16 horas (2 dias)</SelectItem>
                              <SelectItem value="24">24 horas (3 dias)</SelectItem>
                              <SelectItem value="40">40 horas (1 semana)</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={assignmentForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Instruções especiais, materiais necessários, etc."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAssignmentDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={assignmentForm.formState.isSubmitting}>
                      {assignmentForm.formState.isSubmitting ? "Salvando..." : "Atribuir Tarefa"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Programação de Tarefas */}
      <Dialog open={isSchedulingDialogOpen} onOpenChange={setIsSchedulingDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Programar Tarefa</DialogTitle>
            <DialogDescription>
              Defina data, horário e recursos para esta tarefa.
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-4">
              <Card className="p-4 bg-muted/50">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Pedido:</span>
                    <span>{selectedTask.orderNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Cliente:</span>
                    <span>{selectedTask.customer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Etapa:</span>
                    <span>{selectedTask.stageName}</span>
                  </div>
                  {selectedTask.deliveryDate && (
                    <div className="flex justify-between">
                      <span className="font-medium">Entrega:</span>
                      <span className={
                        selectedTask.priority === 'urgente' ? "text-red-600 font-medium" :
                        selectedTask.priority === 'alta' ? "text-orange-600 font-medium" :
                        ""
                      }>
                        {format(selectedTask.deliveryDate, 'dd/MM/yyyy')}
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              <Form {...schedulingForm}>
                <form onSubmit={schedulingForm.handleSubmit(onSchedulingSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={schedulingForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data de Início</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={schedulingForm.control}
                      name="startTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horário de Início</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={schedulingForm.control}
                    name="resourceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recurso Produtivo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um recurso" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Nenhum recurso</SelectItem>
                            {resources
                              .filter(r => r.status === 'disponivel')
                              .map(resource => (
                                <SelectItem key={resource.id} value={resource.id}>
                                  <div className="flex items-center gap-2">
                                    <Settings className="h-4 w-4" />
                                    {resource.name} ({resource.type}) - Cap: {resource.capacity || 8}h
                                  </div>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={schedulingForm.control}
                    name="responsibleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsável</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um responsável" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">Nenhum responsável</SelectItem>
                            {teamMembers.map(member => (
                              <SelectItem key={member.id} value={member.id}>
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4" />
                                  {member.name} - {member.position}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={schedulingForm.control}
                    name="estimatedHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duração (horas)</FormLabel>
                        <FormControl>
                          <Select 
                            onValueChange={(value) => field.onChange(parseFloat(value))} 
                            value={field.value?.toString() || ""}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a duração" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0.5">0,5 horas</SelectItem>
                              <SelectItem value="1">1 hora</SelectItem>
                              <SelectItem value="2">2 horas</SelectItem>
                              <SelectItem value="4">4 horas</SelectItem>
                              <SelectItem value="8">8 horas</SelectItem>
                              <SelectItem value="12">12 horas</SelectItem>
                              <SelectItem value="16">16 horas</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={schedulingForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Instruções especiais, materiais necessários, etc."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsSchedulingDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={schedulingForm.formState.isSubmitting}>
                      {schedulingForm.formState.isSubmitting ? "Programando..." : "Programar Tarefa"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Atualização de Tarefas */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Atualizar Status da Tarefa</DialogTitle>
            <DialogDescription>
              Marque a tarefa como concluída ou reprograme para outra data.
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-4">
              <Card className="p-4 bg-muted/50">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Pedido:</span>
                    <span>{selectedTask.orderNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Etapa:</span>
                    <span>{selectedTask.stageName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Status Atual:</span>
                    <Badge>{selectedTask.status}</Badge>
                  </div>
                  {selectedTask.scheduledStartDate && (
                    <div className="flex justify-between">
                      <span className="font-medium">Programado para:</span>
                      <span>
                        {format(selectedTask.scheduledStartDate, 'dd/MM/yyyy')} às {selectedTask.scheduledStartTime}
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              <Form {...updateForm}>
                <form onSubmit={updateForm.handleSubmit(onUpdateSubmit)} className="space-y-4">
                  <FormField
                    control={updateForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nova Situação</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Concluído">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                Marcar como Concluída
                              </div>
                            </SelectItem>
                            <SelectItem value="Reprogramado">
                              <div className="flex items-center gap-2">
                                <RotateCcw className="h-4 w-4 text-blue-600" />
                                Reprogramar Tarefa
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {updateForm.watch('status') === 'Concluído' ? (
                    <FormField
                      control={updateForm.control}
                      name="completedDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data de Conclusão</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}

                  {updateForm.watch('status') === 'Reprogramado' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={updateForm.control}
                        name="newStartDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nova Data</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={updateForm.control}
                        name="newStartTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Novo Horário</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : null}

                  <FormField
                    control={updateForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Comentários sobre a conclusão ou motivo da reprogramação..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsUpdateDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={updateForm.formState.isSubmitting}>
                      {updateForm.formState.isSubmitting ? "Salvando..." : "Atualizar Tarefa"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskManagementPage;
