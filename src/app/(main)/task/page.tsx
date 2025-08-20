"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  getDoc, 
  setDoc,
  Timestamp, 
  query, 
  where,
  orderBy
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isSameWeek, addDays, startOfWeek, endOfWeek, isWithinInterval, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Calendar, 
  Users, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  PlayCircle, 
  FileText, 
  Plus, 
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Target,
  Trophy,
  TrendingUp,
  TrendingDown,
  User,
  Settings,
  Eye,
  Edit,
  Trash2,
  BarChart3,
  CalendarDays
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/dashboard/stat-card";
import { Separator } from "@/components/ui/separator";

// Schemas
const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3, "O título é obrigatório"),
  description: z.string().optional(),
  assignedTo: z.object({
    resourceId: z.string().min(1, "Selecione um recurso"),
    resourceName: z.string(),
  }),
  supervisor: z.object({
    memberId: z.string().min(1, "Selecione um supervisor"),
    memberName: z.string(),
  }),
  priority: z.enum(["baixa", "media", "alta", "urgente"]),
  status: z.enum(["pendente", "em_andamento", "concluida", "cancelada"]),
  estimatedHours: z.number().min(0.25, "Mínimo 0.25 horas"),
  startDate: z.date(),
  endDate: z.date(),
  actualStartDate: z.date().optional(),
  actualEndDate: z.date().optional(),
  actualHours: z.number().optional(),
  notes: z.string().optional(),
  // Campos para integração com pedidos
  relatedOrderId: z.string().optional(),
  relatedItemId: z.string().optional(),
  relatedStageIndex: z.number().optional(),
  isFromOrder: z.boolean().default(false),
});

type Task = z.infer<typeof taskSchema>;

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

type TaskSummary = {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  completionRate: number;
  averageDelay: number;
};

type SupervisorRanking = {
  memberId: string;
  memberName: string;
  totalTasks: number;
  completedOnTime: number;
  completedLate: number;
  pending: number;
  accuracyRate: number;
  averageDelay: number;
};

export default function TasksPage() {
  // Estados principais
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [companyData, setCompanyData] = useState<CompanyData>({});
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Estados do modal
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Estados de filtro e navegação
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterResource, setFilterResource] = useState<string>('all');
  const [filterSupervisor, setFilterSupervisor] = useState<string>('all');

  // Form
  const form = useForm<Task>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      priority: "media",
      status: "pendente",
      estimatedHours: 8,
      isFromOrder: false,
    },
  });

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

      // Buscar tarefas
      await fetchTasks();

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

  // Buscar tarefas do Firestore
  const fetchTasks = async () => {
    try {
      const tasksRef = collection(db, "companies", "mecald", "tasks");
      const tasksSnapshot = await getDocs(tasksRef);
      
      const tasksList = tasksSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          startDate: data.startDate?.toDate() || new Date(),
          endDate: data.endDate?.toDate() || new Date(),
          actualStartDate: data.actualStartDate?.toDate(),
          actualEndDate: data.actualEndDate?.toDate(),
        } as Task;
      });

      setTasks(tasksList);
    } catch (error) {
      console.error("Erro ao buscar tarefas:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar tarefas",
        description: "Não foi possível carregar as tarefas.",
      });
    }
  };

  // Buscar tarefas pendentes dos pedidos
  const syncTasksFromOrders = async () => {
    try {
      const ordersRef = collection(db, "companies", "mecald", "orders");
      const ordersSnapshot = await getDocs(ordersRef);
      
      const pendingTasks: Partial<Task>[] = [];

      ordersSnapshot.docs.forEach(orderDoc => {
        const orderData = orderDoc.data();
        const orderId = orderDoc.id;
        
        if (orderData.items && Array.isArray(orderData.items)) {
          orderData.items.forEach((item: any, itemIndex: number) => {
            if (item.productionPlan && Array.isArray(item.productionPlan)) {
              item.productionPlan.forEach((stage: any, stageIndex: number) => {
                if (stage.status === 'Pendente' || stage.status === 'Em Andamento') {
                  // Verificar se já existe uma tarefa para esta etapa
                  const existingTask = tasks.find(task => 
                    task.relatedOrderId === orderId && 
                    task.relatedItemId === item.id && 
                    task.relatedStageIndex === stageIndex
                  );

                  if (!existingTask) {
                    pendingTasks.push({
                      title: `${stage.stageName} - ${item.description.substring(0, 50)}...`,
                      description: `Pedido ${orderData.quotationNumber || orderData.orderNumber} - Item: ${item.description}`,
                      priority: "media",
                      status: stage.status === 'Em Andamento' ? 'em_andamento' : 'pendente',
                      estimatedHours: (stage.durationDays || 1) * 8, // Converter dias para horas
                      startDate: stage.startDate?.toDate() || new Date(),
                      endDate: stage.completedDate?.toDate() || addDays(stage.startDate?.toDate() || new Date(), stage.durationDays || 1),
                      relatedOrderId: orderId,
                      relatedItemId: item.id,
                      relatedStageIndex: stageIndex,
                      isFromOrder: true,
                    });
                  }
                }
              });
            }
          });
        }
      });

      // Criar tarefas automaticamente se houver pendências
      if (pendingTasks.length > 0) {
        toast({
          title: "Tarefas sincronizadas",
          description: `${pendingTasks.length} novas tarefas foram encontradas nos pedidos.`,
        });
      }

    } catch (error) {
      console.error("Erro ao sincronizar tarefas dos pedidos:", error);
    }
  };

  // UseEffect principal
  useEffect(() => {
    if (!authLoading && user) {
      fetchInitialData();
    }
  }, [user, authLoading]);

  // Periodicamente sincronizar com pedidos
  useEffect(() => {
    const interval = setInterval(() => {
      if (user) {
        syncTasksFromOrders();
      }
    }, 30000); // A cada 30 segundos

    return () => clearInterval(interval);
  }, [tasks, user]);

  // Salvar tarefa
  const onSubmit = async (values: Task) => {
    try {
      const taskData = {
        ...values,
        startDate: Timestamp.fromDate(values.startDate),
        endDate: Timestamp.fromDate(values.endDate),
        actualStartDate: values.actualStartDate ? Timestamp.fromDate(values.actualStartDate) : null,
        actualEndDate: values.actualEndDate ? Timestamp.fromDate(values.actualEndDate) : null,
        updatedAt: Timestamp.now(),
      };

      if (selectedTask?.id) {
        // Atualizar tarefa existente
        const taskRef = doc(db, "companies", "mecald", "tasks", selectedTask.id);
        await updateDoc(taskRef, taskData);
        
        // Se a tarefa está relacionada a um pedido, atualizar o progresso do pedido
        if (selectedTask.relatedOrderId && selectedTask.relatedItemId !== undefined && selectedTask.relatedStageIndex !== undefined) {
          await updateOrderProgress(selectedTask.relatedOrderId, selectedTask.relatedItemId, selectedTask.relatedStageIndex, values.status);
        }
        
        toast({
          title: "Tarefa atualizada!",
          description: "A tarefa foi atualizada com sucesso.",
        });
      } else {
        // Criar nova tarefa
        const newTaskRef = doc(collection(db, "companies", "mecald", "tasks"));
        await setDoc(newTaskRef, { ...taskData, createdAt: Timestamp.now() });
        
        toast({
          title: "Tarefa criada!",
          description: "A nova tarefa foi criada com sucesso.",
        });
      }

      setIsTaskDialogOpen(false);
      setSelectedTask(null);
      setIsEditing(false);
      form.reset();
      await fetchTasks();

    } catch (error) {
      console.error("Erro ao salvar tarefa:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível salvar a tarefa.",
      });
    }
  };

  // Atualizar progresso do pedido quando tarefa for concluída
  const updateOrderProgress = async (orderId: string, itemId: string, stageIndex: number, taskStatus: string) => {
    try {
      const orderRef = doc(db, "companies", "mecald", "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        const items = [...orderData.items];
        
        if (items[stageIndex] && items[stageIndex].productionPlan && items[stageIndex].productionPlan[stageIndex]) {
          const stage = items[stageIndex].productionPlan[stageIndex];
          
          if (taskStatus === 'concluida') {
            stage.status = 'Concluído';
            stage.completedDate = Timestamp.now();
          } else if (taskStatus === 'em_andamento') {
            stage.status = 'Em Andamento';
            if (!stage.startDate) {
              stage.startDate = Timestamp.now();
            }
          }
          
          await updateDoc(orderRef, { items });
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar progresso do pedido:", error);
    }
  };

  // Deletar tarefa
  const handleDeleteTask = async () => {
    if (!taskToDelete?.id) return;
    
    try {
      const taskRef = doc(db, "companies", "mecald", "tasks", taskToDelete.id);
      await updateDoc(taskRef, { status: 'cancelada' });
      
      toast({
        title: "Tarefa cancelada!",
        description: "A tarefa foi cancelada com sucesso.",
      });
      
      setIsDeleteDialogOpen(false);
      setTaskToDelete(null);
      await fetchTasks();
      
    } catch (error) {
      console.error("Erro ao deletar tarefa:", error);
      toast({
        variant: "destructive",
        title: "Erro ao cancelar",
        description: "Não foi possível cancelar a tarefa.",
      });
    }
  };

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
      // Filtro por período
      const isInPeriod = isWithinInterval(task.startDate, { start: periodStart, end: periodEnd });
      
      // Filtros adicionais
      const statusMatch = filterStatus === 'all' || task.status === filterStatus;
      const priorityMatch = filterPriority === 'all' || task.priority === filterPriority;
      const resourceMatch = filterResource === 'all' || task.assignedTo?.resourceId === filterResource;
      const supervisorMatch = filterSupervisor === 'all' || task.supervisor?.memberId === filterSupervisor;

      return isInPeriod && statusMatch && priorityMatch && resourceMatch && supervisorMatch;
    });
  }, [tasks, currentDate, viewMode, filterStatus, filterPriority, filterResource, filterSupervisor]);

  // Calcular estatísticas
  const tasksSummary = useMemo((): TaskSummary => {
    const filteredTasks = getFilteredTasks;
    const total = filteredTasks.length;
    const completed = filteredTasks.filter(t => t.status === 'concluida').length;
    const pending = filteredTasks.filter(t => t.status === 'pendente').length;
    const inProgress = filteredTasks.filter(t => t.status === 'em_andamento').length;
    
    // Tarefas atrasadas (passaram da data de fim e não estão concluídas)
    const overdue = filteredTasks.filter(t => 
      t.status !== 'concluida' && new Date() > t.endDate
    ).length;

    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    // Calcular atraso médio
    const completedTasks = filteredTasks.filter(t => t.status === 'concluida' && t.actualEndDate);
    const totalDelay = completedTasks.reduce((acc, task) => {
      if (task.actualEndDate) {
        const delay = (task.actualEndDate.getTime() - task.endDate.getTime()) / (1000 * 60 * 60 * 24);
        return acc + Math.max(0, delay);
      }
      return acc;
    }, 0);
    const averageDelay = completedTasks.length > 0 ? totalDelay / completedTasks.length : 0;

    return {
      totalTasks: total,
      completedTasks: completed,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      overdueTasks: overdue,
      completionRate,
      averageDelay,
    };
  }, [getFilteredTasks]);

  // Ranking de supervisores
  const supervisorRanking = useMemo((): SupervisorRanking[] => {
    const supervisorStats = new Map<string, SupervisorRanking>();

    tasks.forEach(task => {
      const supervisorId = task.supervisor?.memberId;
      const supervisorName = task.supervisor?.memberName;
      
      if (!supervisorId || !supervisorName) return;

      if (!supervisorStats.has(supervisorId)) {
        supervisorStats.set(supervisorId, {
          memberId: supervisorId,
          memberName: supervisorName,
          totalTasks: 0,
          completedOnTime: 0,
          completedLate: 0,
          pending: 0,
          accuracyRate: 0,
          averageDelay: 0,
        });
      }

      const stats = supervisorStats.get(supervisorId)!;
      stats.totalTasks++;

      if (task.status === 'concluida' && task.actualEndDate) {
        const delay = (task.actualEndDate.getTime() - task.endDate.getTime()) / (1000 * 60 * 60 * 24);
        if (delay <= 0) {
          stats.completedOnTime++;
        } else {
          stats.completedLate++;
        }
      } else if (task.status === 'pendente' || task.status === 'em_andamento') {
        stats.pending++;
      }
    });

    // Calcular taxas e médias
    supervisorStats.forEach(stats => {
      const completed = stats.completedOnTime + stats.completedLate;
      stats.accuracyRate = completed > 0 ? (stats.completedOnTime / completed) * 100 : 0;
      
      // Calcular atraso médio (implementação simplificada)
      const supervisorCompletedTasks = tasks.filter(t => 
        t.supervisor?.memberId === stats.memberId && 
        t.status === 'concluida' && 
        t.actualEndDate
      );
      
      if (supervisorCompletedTasks.length > 0) {
        const totalDelay = supervisorCompletedTasks.reduce((acc, task) => {
          const delay = (task.actualEndDate!.getTime() - task.endDate.getTime()) / (1000 * 60 * 60 * 24);
          return acc + Math.max(0, delay);
        }, 0);
        stats.averageDelay = totalDelay / supervisorCompletedTasks.length;
      }
    });

    return Array.from(supervisorStats.values())
      .sort((a, b) => b.accuracyRate - a.accuracyRate);
  }, [tasks]);

  // Funções de manipulação do formulário
  const handleNewTask = () => {
    setSelectedTask(null);
    setIsEditing(false);
    form.reset({
      priority: "media",
      status: "pendente",
      estimatedHours: 8,
      startDate: new Date(),
      endDate: addDays(new Date(), 1),
      isFromOrder: false,
    });
    setIsTaskDialogOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(true);
    form.reset(task);
    setIsTaskDialogOpen(true);
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsViewDialogOpen(true);
  };

  // Exportar PDF semanal
  const exportWeeklyPDF = async () => {
    try {
      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.width;
      let yPos = 15;

      // Header com logo e dados da empresa
      if (companyData.logo?.preview) {
        try {
          docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
        } catch (e) {
          console.warn("Erro ao adicionar logo:", e);
        }
      }

      let textX = 65;
      let textY = yPos;
      docPdf.setFontSize(18).setFont('helvetica', 'bold');
      docPdf.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY);
      textY += 6;
      
      docPdf.setFontSize(9).setFont('helvetica', 'normal');
      if (companyData.endereco) {
        const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
        docPdf.text(addressLines, textX, textY);
        textY += (addressLines.length * 4);
      }

      yPos = 55;

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

      // Resumo estatístico
      docPdf.setFontSize(12).setFont('helvetica', 'bold');
      docPdf.text('RESUMO DA SEMANA:', 15, yPos);
      yPos += 8;

      docPdf.setFontSize(10).setFont('helvetica', 'normal');
      const summaryText = `Total: ${tasksSummary.totalTasks} | Concluídas: ${tasksSummary.completedTasks} | Em Andamento: ${tasksSummary.inProgressTasks} | Pendentes: ${tasksSummary.pendingTasks} | Atrasadas: ${tasksSummary.overdueTasks}`;
      docPdf.text(summaryText, 15, yPos);
      yPos += 15;

      // Tabela de tarefas
      const tableBody = getFilteredTasks.map(task => [
        task.title.length > 30 ? task.title.substring(0, 30) + '...' : task.title,
        task.assignedTo?.resourceName || 'N/A',
        task.supervisor?.memberName || 'N/A',
        format(task.startDate, 'dd/MM', { locale: ptBR }),
        format(task.endDate, 'dd/MM', { locale: ptBR }),
        task.priority === 'baixa' ? 'Baixa' :
        task.priority === 'media' ? 'Média' :
        task.priority === 'alta' ? 'Alta' : 'Urgente',
        task.status === 'pendente' ? 'Pendente' :
        task.status === 'em_andamento' ? 'Em Andamento' :
        task.status === 'concluida' ? 'Concluída' : 'Cancelada',
        `${task.estimatedHours}h`
      ]);

      autoTable(docPdf, {
        startY: yPos,
        head: [['Tarefa', 'Recurso', 'Supervisor', 'Início', 'Fim', 'Prioridade', 'Status', 'Horas']],
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255 },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 25 },
          2: { cellWidth: 25 },
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 15, halign: 'center' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 20, halign: 'center' },
          7: { cellWidth: 15, halign: 'center' },
        }
      });

      const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
      const filename = `Tarefas_Semanais_${format(weekStart, 'ddMMyy')}_${timestamp}.pdf`;
      
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

  // Funções auxiliares
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
      case 'em_andamento':
        return <Badge className="bg-blue-600"><PlayCircle className="mr-1 h-3 w-3" />Em Andamento</Badge>;
      case 'concluida':
        return <Badge className="bg-green-600"><CheckCircle className="mr-1 h-3 w-3" />Concluída</Badge>;
      case 'cancelada':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Cancelada</Badge>;
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

  if (isLoading || authLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Gestão de Tarefas</h1>
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

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
          <p className="text-muted-foreground">
            Organize e acompanhe tarefas semanais e mensais dos recursos da empresa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportWeeklyPDF} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
          <Button onClick={handleNewTask}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Dashboard de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Tarefas"
          value={tasksSummary.totalTasks.toString()}
          icon={Target}
          description={`${tasksSummary.completionRate.toFixed(1)}% de conclusão`}
        />
        <StatCard
          title="Concluídas"
          value={tasksSummary.completedTasks.toString()}
          icon={CheckCircle}
          description={`${tasksSummary.pendingTasks} ainda pendentes`}
        />
        <StatCard
          title="Em Andamento"
          value={tasksSummary.inProgressTasks.toString()}
          icon={PlayCircle}
          description={`${tasksSummary.overdueTasks} em atraso`}
        />
        <StatCard
          title="Atraso Médio"
          value={`${tasksSummary.averageDelay.toFixed(1)} dias`}
          icon={Clock}
          description="Para tarefas concluídas"
        />
      </div>

      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">Tarefas</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="analytics">Análises</TabsTrigger>
        </TabsList>

        {/* Aba de Tarefas */}
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
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Prioridades</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterResource} onValueChange={setFilterResource}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Recurso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Recursos</SelectItem>
                    {resources.map(resource => (
                      <SelectItem key={resource.id} value={resource.id}>
                        {resource.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterSupervisor} onValueChange={setFilterSupervisor}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Supervisores</SelectItem>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(filterStatus !== 'all' || filterPriority !== 'all' || filterResource !== 'all' || filterSupervisor !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterStatus('all');
                      setFilterPriority('all');
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

          {/* Lista de Tarefas */}
          <Card>
            <CardHeader>
              <CardTitle>Tarefas do Período</CardTitle>
              <CardDescription>
                {getFilteredTasks.length} tarefa{getFilteredTasks.length !== 1 ? 's' : ''} encontrada{getFilteredTasks.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getFilteredTasks.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhuma tarefa encontrada</h3>
                  <p className="text-gray-600 mb-4">
                    Não há tarefas para o período selecionado com os filtros aplicados.
                  </p>
                  <Button onClick={handleNewTask}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Primeira Tarefa
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {getFilteredTasks.map((task) => (
                      <Card key={task.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{task.title}</h4>
                              {task.isFromOrder && (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="mr-1 h-3 w-3" />
                                  Do Pedido
                                </Badge>
                              )}
                            </div>
                            
                            {task.description && (
                              <p className="text-sm text-muted-foreground mb-3">
                                {task.description}
                              </p>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Recurso:</span>
                                <p className="font-medium">{task.assignedTo?.resourceName || 'N/A'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Supervisor:</span>
                                <p className="font-medium">{task.supervisor?.memberName || 'N/A'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Período:</span>
                                <p className="font-medium">
                                  {format(task.startDate, 'dd/MM', { locale: ptBR })} - {format(task.endDate, 'dd/MM', { locale: ptBR })}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Duração:</span>
                                <p className="font-medium">{task.estimatedHours}h estimadas</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-3">
                              {getStatusBadge(task.status)}
                              {getPriorityBadge(task.priority)}
                              {task.status !== 'concluida' && new Date() > task.endDate && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Atrasada
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewTask(task)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditTask(task)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {task.status !== 'concluida' && !task.isFromOrder && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setTaskToDelete(task);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Ranking */}
        <TabsContent value="ranking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Ranking de Supervisores
              </CardTitle>
              <CardDescription>
                Classificação baseada na taxa de acuracidade no cumprimento de prazos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {supervisorRanking.length === 0 ? (
                <div className="text-center py-8">
                  <Trophy className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-muted-foreground">Nenhum dado de ranking disponível ainda.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {supervisorRanking.map((supervisor, index) => (
                    <Card key={supervisor.memberId} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                            index === 0 ? 'bg-yellow-500' :
                            index === 1 ? 'bg-gray-400' :
                            index === 2 ? 'bg-orange-500' :
                            'bg-blue-500'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <h4 className="font-semibold">{supervisor.memberName}</h4>
                            <p className="text-sm text-muted-foreground">
                              {supervisor.totalTasks} tarefas supervisionadas
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl font-bold">
                              {supervisor.accuracyRate.toFixed(1)}%
                            </span>
                            {supervisor.accuracyRate >= 80 ? (
                              <TrendingUp className="h-5 w-5 text-green-500" />
                            ) : (
                              <TrendingDown className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Taxa de acuracidade
                          </p>
                        </div>
                      </div>

                      <Separator className="my-3" />

                      <div className="grid grid-cols-4 gap-4 text-center text-sm">
                        <div>
                          <p className="font-medium text-green-600">{supervisor.completedOnTime}</p>
                          <p className="text-muted-foreground">No Prazo</p>
                        </div>
                        <div>
                          <p className="font-medium text-red-600">{supervisor.completedLate}</p>
                          <p className="text-muted-foreground">Atrasadas</p>
                        </div>
                        <div>
                          <p className="font-medium text-blue-600">{supervisor.pending}</p>
                          <p className="text-muted-foreground">Pendentes</p>
                        </div>
                        <div>
                          <p className="font-medium">{supervisor.averageDelay.toFixed(1)} dias</p>
                          <p className="text-muted-foreground">Atraso Médio</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba de Análises */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Programado vs Realizado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Taxa de Conclusão</span>
                      <span>{tasksSummary.completionRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={tasksSummary.completionRate} className="h-2" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{tasksSummary.completedTasks}</p>
                      <p className="text-sm text-muted-foreground">Concluídas</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{tasksSummary.pendingTasks + tasksSummary.inProgressTasks}</p>
                      <p className="text-sm text-muted-foreground">Em Andamento</p>
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
                      taskCount: getFilteredTasks.filter(task => task.assignedTo?.resourceId === resource.id).length
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

      {/* Modal de Criação/Edição de Tarefa */}
      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Tarefa' : 'Nova Tarefa'}
            </DialogTitle>
            <DialogDescription>
              {isEditing ? 'Atualize as informações da tarefa.' : 'Preencha as informações para criar uma nova tarefa.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título da Tarefa</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Preparação de material para solda" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Detalhes adicionais sobre a tarefa..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="assignedTo.resourceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recurso Responsável</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const resource = resources.find(r => r.id === value);
                          if (resource) {
                            field.onChange(value);
                            form.setValue('assignedTo.resourceName', resource.name);
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um recurso" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {resources.filter(r => r.status === 'disponivel').map(resource => (
                            <SelectItem key={resource.id} value={resource.id}>
                              {resource.name} - {resource.type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="supervisor.memberId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supervisor</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const member = teamMembers.find(m => m.id === value);
                          if (member) {
                            field.onChange(value);
                            form.setValue('supervisor.memberName', member.name);
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um supervisor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamMembers.map(member => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name} - {member.position}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a prioridade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                          <SelectItem value="urgente">Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="em_andamento">Em Andamento</SelectItem>
                          <SelectItem value="concluida">Concluída</SelectItem>
                          <SelectItem value="cancelada">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="estimatedHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horas Estimadas</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.25"
                          min="0.25"
                          placeholder="8"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Início</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                          onChange={(e) => field.onChange(new Date(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Fim</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                          onChange={(e) => field.onChange(new Date(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Campos para acompanhamento de execução */}
              {(form.watch('status') === 'em_andamento' || form.watch('status') === 'concluida') && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="font-medium">Acompanhamento de Execução</h4>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="actualStartDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data Real de Início</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {form.watch('status') === 'concluida' && (
                        <>
                          <FormField
                            control={form.control}
                            name="actualEndDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Data Real de Conclusão</FormLabel>
                                <FormControl>
                                  <Input
                                    type="date"
                                    value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                    onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="actualHours"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Horas Reais</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.25"
                                    min="0"
                                    placeholder="8"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observações</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Anotações sobre a execução da tarefa..."
                              className="min-h-[60px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTaskDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {isEditing ? 'Atualizar Tarefa' : 'Criar Tarefa'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Modal de Visualização de Tarefa */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Tarefa</DialogTitle>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">{selectedTask.title}</h3>
                {selectedTask.description && (
                  <p className="text-muted-foreground">{selectedTask.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Recurso Responsável</label>
                    <p className="font-medium">{selectedTask.assignedTo?.resourceName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Supervisor</label>
                    <p className="font-medium">{selectedTask.supervisor?.memberName || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Prioridade</label>
                    <div className="mt-1">{getPriorityBadge(selectedTask.priority)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div className="mt-1">{getStatusBadge(selectedTask.status)}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Período Planejado</label>
                    <p className="font-medium">
                      {format(selectedTask.startDate, 'dd/MM/yyyy', { locale: ptBR })} - {format(selectedTask.endDate, 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  
                  {selectedTask.actualStartDate && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Período Real</label>
                      <p className="font-medium">
                        {format(selectedTask.actualStartDate, 'dd/MM/yyyy', { locale: ptBR })}
                        {selectedTask.actualEndDate && ` - ${format(selectedTask.actualEndDate, 'dd/MM/yyyy', { locale: ptBR })}`}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Horas</label>
                    <p className="font-medium">
                      {selectedTask.estimatedHours}h estimadas
                      {selectedTask.actualHours && ` / ${selectedTask.actualHours}h reais`}
                    </p>
                  </div>

                  {selectedTask.isFromOrder && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Origem</label>
                      <p className="font-medium text-blue-600">Gerada automaticamente do pedido</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedTask.notes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Observações</label>
                  <p className="mt-2 p-3 bg-muted rounded-lg">{selectedTask.notes}</p>
                </div>
              )}

              {/* Análise de Performance */}
              {selectedTask.status === 'concluida' && selectedTask.actualEndDate && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-800 mb-2">Análise de Performance</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-green-700">Prazo:</span>
                      <p className="font-medium">
                        {selectedTask.actualEndDate <= selectedTask.endDate ? (
                          <span className="text-green-600">✓ Concluída no prazo</span>
                        ) : (
                          <span className="text-red-600">
                            ⚠ {Math.ceil((selectedTask.actualEndDate.getTime() - selectedTask.endDate.getTime()) / (1000 * 60 * 60 * 24))} dia(s) de atraso
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-green-700">Eficiência:</span>
                      <p className="font-medium">
                        {selectedTask.actualHours && selectedTask.estimatedHours ? (
                          `${((selectedTask.estimatedHours / selectedTask.actualHours) * 100).toFixed(1)}%`
                        ) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Fechar
            </Button>
            {selectedTask && (
              <Button onClick={() => {
                setIsViewDialogOpen(false);
                handleEditTask(selectedTask);
              }}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar a tarefa "{taskToDelete?.title}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não, manter</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive hover:bg-destructive/90">
              Sim, cancelar tarefa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
