"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isAfter, isBefore, addDays, isSameDay } from "date-fns";
import { pt } from 'date-fns/locale';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Componentes UI
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Ícones
import { 
  CalendarDays, 
  Clock, 
  Users, 
  Settings, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar as CalendarIcon, 
  FileDown, 
  Filter, 
  Search, 
  Eye, 
  PlayCircle, 
  PauseCircle, 
  RotateCcw,
  User,
  Package,
  Building,
  Hash,
  Timer,
  Target,
  Activity,
  FileText,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

interface TeamMember {
  id: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  permission: "admin" | "user";
}

interface Resource {
  id: string;
  name: string;
  type: "maquina" | "equipamento" | "veiculo" | "ferramenta" | "espaco" | "mao_de_obra";
  description?: string;
  capacity: number;
  status: "disponivel" | "ocupado" | "manutencao" | "inativo" | "ausente" | "ferias";
  location?: string;
  serialNumber?: string;
}

interface ProductionStage {
  stageName: string;
  status: "Pendente" | "Em Andamento" | "Concluído";
  startDate: Date | null;
  completedDate: Date | null;
  durationDays: number;
  useBusinessDays?: boolean;
}

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unitWeight?: number;
  code?: string;
  itemNumber?: string;
  productionPlan?: ProductionStage[];
}

interface Order {
  id: string;
  quotationNumber: string;
  internalOS?: string;
  projectName?: string;
  customer: {
    id: string;
    name: string;
  };
  status: string;
  deliveryDate?: Date;
  items: OrderItem[];
}

interface Task {
  id: string;
  orderId: string;
  orderNumber: string;
  internalOS?: string;
  projectName?: string;
  customerName: string;
  itemId: string;
  itemDescription: string;
  itemCode?: string;
  itemNumber?: string;
  stageName: string;
  status: "Pendente" | "Em Andamento" | "Concluído" | "Reprogramada";
  startDate: Date | null;
  completedDate: Date | null;
  durationDays: number;
  useBusinessDays?: boolean;
  assignedResourceId?: string;
  assignedResourceName?: string;
  responsibleMemberId?: string;
  responsibleMemberName?: string;
  priority: "Baixa" | "Normal" | "Alta" | "Urgente";
  estimatedEffort?: number;
  actualStartDate?: Date;
  actualEndDate?: Date;
  notes?: string;
}

interface CompanyData {
  nomeFantasia?: string;
  cnpj?: string;
  inscricaoEstadual?: string;
  email?: string;
  celular?: string;
  endereco?: string;
  website?: string;
  logo?: { preview?: string };
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

const safeToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? null : timestamp;
  }
  
  if (timestamp && typeof timestamp.toDate === 'function') {
    try {
      const date = timestamp.toDate();
      return (date instanceof Date && !isNaN(date.getTime())) ? date : null;
    } catch (error) {
      console.warn("Erro ao converter timestamp do Firestore:", error);
      return null;
    }
  }
  
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    try {
      const date = new Date(timestamp.seconds * 1000);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      console.warn("Erro ao converter objeto timestamp:", error);
      return null;
    }
  }
  
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      console.warn("Erro ao converter string/number para data:", error);
      return null;
    }
  }
  
  return null;
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case "Pendente":
      return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100";
    case "Em Andamento":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "Concluído":
      return "bg-green-100 text-green-800 hover:bg-green-100";
    case "Reprogramada":
      return "bg-orange-100 text-orange-800 hover:bg-orange-100";
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-100";
  }
};

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case "Urgente":
      return "bg-red-100 text-red-800 hover:bg-red-100";
    case "Alta":
      return "bg-orange-100 text-orange-800 hover:bg-orange-100";
    case "Normal":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "Baixa":
      return "bg-gray-100 text-gray-800 hover:bg-gray-100";
    default:
      return "bg-gray-100 text-gray-800 hover:bg-gray-100";
  }
};

const calculateTaskPriority = (task: Task): "Baixa" | "Normal" | "Alta" | "Urgente" => {
  if (!task.startDate) return "Normal";
  
  const today = new Date();
  const daysUntilStart = Math.ceil((task.startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilStart < 0) return "Urgente"; // Atrasada
  if (daysUntilStart <= 2) return "Alta";
  if (daysUntilStart <= 7) return "Normal";
  return "Baixa";
};

const isTaskOverdue = (task: Task): boolean => {
  if (!task.startDate || task.status === "Concluído") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const taskDate = new Date(task.startDate);
  taskDate.setHours(0, 0, 0, 0);
  return taskDate < today;
};

const formatDuration = (days: number): string => {
  if (days < 1) {
    const hours = Math.round(days * 8); // Assumindo 8h por dia
    return `${hours}h`;
  }
  if (days === 1) return "1 dia";
  return `${days} dias`;
};

// ============================================================================
// COMPONENTE PRINCIPAL - PARTE 1
// ============================================================================

export default function TasksPage() {
  // Estados principais
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [companyData, setCompanyData] = useState<CompanyData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  
  // Estados de filtros
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Estados para visualização
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'resource'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // ============================================================================
  // FUNÇÕES DE BUSCA DE DADOS
  // ============================================================================

  const fetchCompanyData = async () => {
    if (!user) return;
    
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      
      if (docSnap.exists()) {
        setCompanyData(docSnap.data() as CompanyData);
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar dados da empresa",
        description: "Não foi possível carregar as informações da empresa.",
      });
    }
  };

  const fetchTeamMembers = async () => {
    if (!user) return;
    
    try {
      const teamRef = doc(db, "companies", "mecald", "settings", "team");
      const docSnap = await getDoc(teamRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTeamMembers(data.members || []);
      }
    } catch (error) {
      console.error("Error fetching team members:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar equipe",
        description: "Não foi possível carregar os membros da equipe.",
      });
    }
  };

  const fetchResources = async () => {
    if (!user) return;
    
    try {
      const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
      const docSnap = await getDoc(resourcesRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setResources(data.resources || []);
      }
    } catch (error) {
      console.error("Error fetching resources:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar recursos",
        description: "Não foi possível carregar os recursos produtivos.",
      });
    }
  };

  const fetchOrdersAndGenerateTasks = async () => {
    if (!user) return;
    
    try {
      const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const allTasks: Task[] = [];
      
      ordersSnapshot.forEach(orderDoc => {
        const orderData = orderDoc.data();
        const orderId = orderDoc.id;
        
        // Converter dados do pedido
        const order: Order = {
          id: orderId,
          quotationNumber: orderData.quotationNumber || 'N/A',
          internalOS: orderData.internalOS,
          projectName: orderData.projectName,
          customer: orderData.customer || { id: '', name: 'Cliente não informado' },
          status: orderData.status || 'Pendente',
          deliveryDate: safeToDate(orderData.deliveryDate),
          items: orderData.items || []
        };
        
        // Processar itens do pedido para extrair tarefas
        order.items.forEach((item: any) => {
          if (item.productionPlan && Array.isArray(item.productionPlan)) {
            item.productionPlan.forEach((stage: any, stageIndex: number) => {
              // Apenas incluir tarefas que não estão concluídas
              if (stage.status !== "Concluído") {
                const task: Task = {
                  id: `${orderId}-${item.id}-${stageIndex}`,
                  orderId: orderId,
                  orderNumber: order.quotationNumber,
                  internalOS: order.internalOS,
                  projectName: order.projectName,
                  customerName: order.customer.name,
                  itemId: item.id,
                  itemDescription: item.description,
                  itemCode: item.code,
                  itemNumber: item.itemNumber,
                  stageName: stage.stageName,
                  status: stage.status || "Pendente",
                  startDate: safeToDate(stage.startDate),
                  completedDate: safeToDate(stage.completedDate),
                  durationDays: stage.durationDays || 1,
                  useBusinessDays: stage.useBusinessDays !== false,
                  priority: "Normal", // Será calculado dinamicamente
                  assignedResourceId: stage.assignedResourceId,
                  assignedResourceName: stage.assignedResourceName,
                  responsibleMemberId: stage.responsibleMemberId,
                  responsibleMemberName: stage.responsibleMemberName,
                  actualStartDate: safeToDate(stage.actualStartDate),
                  actualEndDate: safeToDate(stage.actualEndDate),
                  notes: stage.notes
                };
                
                // Calcular prioridade baseada na data
                task.priority = calculateTaskPriority(task);
                
                allTasks.push(task);
              }
            });
          }
        });
      });
      
      // Ordenar tarefas por prioridade e data
      allTasks.sort((a, b) => {
        const priorityOrder = { "Urgente": 4, "Alta": 3, "Normal": 2, "Baixa": 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        if (a.startDate && b.startDate) {
          return a.startDate.getTime() - b.startDate.getTime();
        }
        
        if (a.startDate && !b.startDate) return -1;
        if (!a.startDate && b.startDate) return 1;
        
        return 0;
      });
      
      setTasks(allTasks);
      
    } catch (error) {
      console.error("Error fetching orders and generating tasks:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar tarefas",
        description: "Não foi possível carregar as tarefas dos pedidos.",
      });
    }
  };

  // ============================================================================
  // EFEITO PRINCIPAL - CORREÇÃO DO PROBLEMA DE AUTENTICAÇÃO
  // ============================================================================

  useEffect(() => {
    // IMPORTANTE: Só executar quando auth estiver carregado E usuário estiver presente
    if (!authLoading && user) {
      const loadData = async () => {
        setIsLoading(true);
        
        try {
          // Carregar dados em paralelo
          await Promise.all([
            fetchCompanyData(),
            fetchTeamMembers(),
            fetchResources(),
            fetchOrdersAndGenerateTasks()
          ]);
        } catch (error) {
          console.error("Error loading data:", error);
          toast({
            variant: "destructive",
            title: "Erro ao carregar dados",
            description: "Ocorreu um erro ao carregar os dados do sistema.",
          });
        } finally {
          setIsLoading(false);
        }
      };
      
      loadData();
    }
  }, [user, authLoading]); // Dependências corretas

  // ============================================================================
  // FILTROS E PROCESSAMENTO
  // ============================================================================

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const statusMatch = statusFilter === 'all' || task.status === statusFilter;
      const resourceMatch = resourceFilter === 'all' || 
                           (resourceFilter === 'unassigned' && !task.assignedResourceId) ||
                           task.assignedResourceId === resourceFilter;
      const priorityMatch = priorityFilter === 'all' || task.priority === priorityFilter;
      const dateMatch = !dateFilter || (task.startDate && isSameDay(task.startDate, dateFilter));
      const searchMatch = !searchQuery || 
                         task.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.itemDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.stageName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (task.internalOS && task.internalOS.toLowerCase().includes(searchQuery.toLowerCase()));

      return statusMatch && resourceMatch && priorityMatch && dateMatch && searchMatch;
    });
  }, [tasks, statusFilter, resourceFilter, priorityFilter, dateFilter, searchQuery]);

  // ============================================================================
  // RENDERIZAÇÃO - LOADING E SKELETON
  // ============================================================================

  // IMPORTANTE: Verificar estado de autenticação primeiro
  if (authLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
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

  // Se não há usuário após o carregamento, não renderizar nada (deixar o layout lidar com redirecionamento)
  if (!user) {
    return null;
  }

  // Loading dos dados
  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
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

  // ============================================================================
  // HANDLERS PARA OS MODAIS
  // ============================================================================

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    // Abrir modal de visualização (opcional)
  };

  const handleAssignTask = (task: Task) => {
    setSelectedTask(task);
    setIsAssignDialogOpen(true);
  };

  const handleUpdateTask = (task: Task) => {
    setSelectedTask(task);
    setIsUpdateDialogOpen(true);
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setResourceFilter('all');
    setPriorityFilter('all');
    setDateFilter(undefined);
    setSearchQuery('');
  };

  // Handler para atribuição de tarefa
  const handleTaskAssignment = async (assignment: any) => {
    if (!selectedTask) return;

    const selectedResource = resources.find(r => r.id === assignment.assignedResourceId);
    const selectedMember = teamMembers.find(m => m.id === assignment.responsibleMemberId);
    
    const updateData = {
      assignedResourceId: assignment.assignedResourceId,
      assignedResourceName: selectedResource?.name,
      responsibleMemberId: assignment.responsibleMemberId,
      responsibleMemberName: selectedMember?.name,
      priority: assignment.priority,
      notes: assignment.notes,
      status: "Em Andamento",
      ...(assignment.scheduledStartDate && { 
        startDate: assignment.scheduledStartDate,
        actualStartDate: assignment.scheduledStartDate 
      })
    };
    
    const success = await updateTaskInFirebase(selectedTask, updateData, toast);
    
    if (success) {
      // Recarregar tarefas
      await fetchOrdersAndGenerateTasks();
    }
  };

  // Handler para atualização de status
  const handleTaskUpdate = async (update: any) => {
    if (!selectedTask) return;

    const updateData: any = {
      status: update.status,
      notes: update.notes,
      ...(update.actualStartDate && { actualStartDate: update.actualStartDate }),
      ...(update.actualEndDate && { actualEndDate: update.actualEndDate }),
    };
    
    if (update.status === "Concluído") {
      updateData.completedDate = update.actualEndDate || new Date();
    }
    
    if (update.status === "Reprogramada" && update.newScheduledDate) {
      updateData.startDate = update.newScheduledDate;
      updateData.status = "Pendente"; // Volta para pendente após reprogramação
    }
    
    const success = await updateTaskInFirebase(selectedTask, updateData, toast);
    
    if (success) {
      // Recarregar tarefas
      await fetchOrdersAndGenerateTasks();
    }
  };

  // Handler para exportação PDF
  const handleExportTasks = async () => {
    try {
      const fileName = await exportTasksToPDF(
        filteredTasks,
        companyData,
        teamMembers,
        resources,
        {
          statusFilter,
          resourceFilter,
          priorityFilter,
          dateFilter
        }
      );

      toast({
        title: "Relatório exportado!",
        description: `O arquivo ${fileName} foi baixado com sucesso.`,
      });
    } catch (error) {
      console.error("Error exporting tasks:", error);
      toast({
        variant: "destructive",
        title: "Erro na exportação",
        description: "Não foi possível gerar o relatório em PDF.",
      });
    }
  };

  // ============================================================================
  // RENDERIZAÇÃO PRINCIPAL
  // ============================================================================

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Gestão de Tarefas
          </h1>
          <p className="text-muted-foreground">
            Monitore e gerencie todas as tarefas de produção da empresa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExportTasks}
            variant="outline"
            disabled={filteredTasks.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <TaskStatistics tasks={filteredTasks} />

      {/* Filtros */}
      <TaskFilters
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        resourceFilter={resourceFilter}
        setResourceFilter={setResourceFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        resources={resources}
        onClearFilters={handleClearFilters}
      />

      {/* Tabela de tarefas */}
      <TaskTable
        tasks={filteredTasks}
        resources={resources}
        teamMembers={teamMembers}
        onViewTask={handleViewTask}
        onAssignTask={handleAssignTask}
        onUpdateTask={handleUpdateTask}
      />

      {/* Modal de Atribuição */}
      <TaskAssignmentModal
        isOpen={isAssignDialogOpen}
        onClose={() => setIsAssignDialogOpen(false)}
        task={selectedTask}
        resources={resources}
        teamMembers={teamMembers}
        onAssign={handleTaskAssignment}
      />

      {/* Modal de Atualização */}
      <TaskUpdateModal
        isOpen={isUpdateDialogOpen}
        onClose={() => setIsUpdateDialogOpen(false)}
        task={selectedTask}
        onUpdate={handleTaskUpdate}
      />
    </div>
  );
}
// ============================================================================
// COMPONENTES DA INTERFACE - PARTE 2
// Adicione estes componentes ao arquivo tasks/page.tsx
// ============================================================================

import React from 'react';

// Componente de Estatísticas
export const TaskStatistics = React.memo(({ tasks }: { tasks: Task[] }) => {
  const stats = useMemo(() => {
    return {
      total: tasks.length,
      pendentes: tasks.filter(t => t.status === 'Pendente').length,
      emAndamento: tasks.filter(t => t.status === 'Em Andamento').length,
      concluidas: tasks.filter(t => t.status === 'Concluído').length,
      reprogramadas: tasks.filter(t => t.status === 'Reprogramada').length,
      atrasadas: tasks.filter(t => isTaskOverdue(t)).length,
      urgentes: tasks.filter(t => t.priority === 'Urgente').length,
      semRecurso: tasks.filter(t => !t.assignedResourceId).length,
      semResponsavel: tasks.filter(t => !t.responsibleMemberId).length
    };
  }, [tasks]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground">
            {stats.semRecurso} sem recurso • {stats.semResponsavel} sem responsável
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
          <PlayCircle className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">{stats.emAndamento}</div>
          <p className="text-xs text-muted-foreground">
            {stats.total > 0 ? Math.round((stats.emAndamento / stats.total) * 100) : 0}% do total
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Atrasadas</CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{stats.atrasadas}</div>
          <p className="text-xs text-muted-foreground">
            {stats.urgentes} tarefas urgentes
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{stats.concluidas}</div>
          <p className="text-xs text-muted-foreground">
            {stats.total > 0 ? Math.round((stats.concluidas / stats.total) * 100) : 0}% completude
          </p>
        </CardContent>
      </Card>
    </div>
  );
});

TaskStatistics.displayName = 'TaskStatistics';

// Componente de Filtros
export const TaskFilters = React.memo(({
  statusFilter,
  setStatusFilter,
  resourceFilter,
  setResourceFilter,
  priorityFilter,
  setPriorityFilter,
  dateFilter,
  setDateFilter,
  searchQuery,
  setSearchQuery,
  resources,
  onClearFilters
}: {
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  resourceFilter: string;
  setResourceFilter: (value: string) => void;
  priorityFilter: string;
  setPriorityFilter: (value: string) => void;
  dateFilter?: Date;
  setDateFilter: (date?: Date) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  resources: Resource[];
  onClearFilters: () => void;
}) => {
    const hasActiveFilters = statusFilter !== 'all' || resourceFilter !== 'all' || priorityFilter !== 'all' || dateFilter || searchQuery;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtros
        </CardTitle>
        <CardDescription>
          Filtre as tarefas por diferentes critérios
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {/* Busca */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pedido, item, etapa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Filtro de Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Reprogramada">Reprogramada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro de Recurso */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Recurso</label>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os recursos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="unassigned">Não atribuídos</SelectItem>
                {resources.map((resource) => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro de Prioridade */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Prioridade</label>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as prioridades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="Baixa">Baixa</SelectItem>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="Alta">Alta</SelectItem>
                <SelectItem value="Urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filtro de Data */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Data</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateFilter && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFilter ? format(dateFilter, "dd/MM/yyyy") : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFilter}
                  onSelect={setDateFilter}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Botão para limpar filtros */}
        {hasActiveFilters && (
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={onClearFilters} size="sm">
              <RotateCcw className="mr-2 h-4 w-4" />
              Limpar Filtros
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

TaskFilters.displayName = 'TaskFilters';

// ============================================================================
// COMPONENTE DE TABELA DE TAREFAS - PARTE 3
// Adicione este componente ao arquivo tasks/page.tsx
// ============================================================================

export const TaskTable = React.memo(({
  tasks,
  resources,
  teamMembers,
  onViewTask,
  onAssignTask,
  onUpdateTask
}: {
  tasks: Task[];
  resources: Resource[];
  teamMembers: TeamMember[];
  onViewTask: (task: Task) => void;
  onAssignTask: (task: Task) => void;
  onUpdateTask: (task: Task) => void;
}) => {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma tarefa encontrada</h3>
          <p className="text-muted-foreground text-center">
            Não há tarefas que correspondam aos filtros aplicados.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista de Tarefas</CardTitle>
        <CardDescription>
          Gerencie e acompanhe todas as tarefas de produção em andamento
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido/Item</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Data Início</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const resource = resources.find(r => r.id === task.assignedResourceId);
                const member = teamMembers.find(m => m.id === task.responsibleMemberId);
                const isOverdue = isTaskOverdue(task);

                return (
                  <TableRow 
                    key={task.id}
                    className={cn(
                      "hover:bg-muted/50",
                      isOverdue && "bg-red-50 hover:bg-red-100"
                    )}
                  >
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {task.orderNumber}
                          </Badge>
                          {task.internalOS && (
                            <Badge variant="secondary" className="text-xs">
                              {task.internalOS}
                            </Badge>
                          )}
                        </div>
                        <div className="font-medium text-sm">
                          {task.itemDescription.length > 40 
                            ? `${task.itemDescription.substring(0, 40)}...`
                            : task.itemDescription
                          }
                        </div>
                        {task.itemCode && (
                          <div className="text-xs text-muted-foreground">
                            Código: {task.itemCode}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Cliente: {task.customerName}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-medium">{task.stageName}</div>
                    </TableCell>

                    <TableCell>
                      <Badge className={getStatusColor(task.status)}>
                        {task.status}
                      </Badge>
                      {isOverdue && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3 text-red-600" />
                          <span className="text-xs text-red-600">Atrasada</span>
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge className={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        {task.startDate ? format(task.startDate, "dd/MM/yyyy") : "Não definida"}
                      </div>
                      {task.startDate && (
                        <div className="text-xs text-muted-foreground">
                          {format(task.startDate, "EEEE", { locale: pt })}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="text-sm font-medium">
                        {formatDuration(task.durationDays)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {task.useBusinessDays ? "Dias úteis" : "Dias corridos"}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        {resource ? (
                          <>
                            <div className="font-medium text-sm">{resource.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {resource.type.replace('_', ' ')}
                            </div>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-xs",
                                resource.status === 'disponivel' && "border-green-500 text-green-700",
                                resource.status === 'ocupado' && "border-yellow-500 text-yellow-700",
                                resource.status === 'manutencao' && "border-red-500 text-red-700"
                              )}
                            >
                              {resource.status}
                            </Badge>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">Não atribuído</div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {member ? (
                        <div className="space-y-1">
                          <div className="font-medium text-sm">{member.name}</div>
                          <div className="text-xs text-muted-foreground">{member.position}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Não atribuído</div>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => onViewTask(task)}
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        
                        {!task.assignedResourceId && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => onAssignTask(task)}
                            title="Atribuir recurso"
                          >
                            <User className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {task.status !== "Concluído" && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => onUpdateTask(task)}
                            title="Atualizar status"
                          >
                            {task.status === "Pendente" ? (
                              <PlayCircle className="h-4 w-4" />
                            ) : (
                              <Settings className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
});

TaskTable.displayName = 'TaskTable';

// ============================================================================
// FUNÇÕES DE ATUALIZAÇÃO NO FIREBASE
// ============================================================================

export const updateTaskInFirebase = async (
  task: Task,
  updateData: any,
  toast: any
) => {
  try {
    // Buscar o pedido
    const orderRef = doc(db, "companies", "mecald", "orders", task.orderId);
    const orderSnap = await getDoc(orderRef);
    
    if (!orderSnap.exists()) {
      throw new Error("Pedido não encontrado");
    }
    
    const orderData = orderSnap.data();
    const updatedItems = orderData.items.map((item: any) => {
      if (item.id === task.itemId) {
        const updatedProductionPlan = item.productionPlan?.map((stage: any, index: number) => {
          if (stage.stageName === task.stageName) {
            return {
              ...stage,
              ...updateData,
              // Converter datas para Timestamp se necessário
              ...(updateData.startDate && { startDate: Timestamp.fromDate(updateData.startDate) }),
              ...(updateData.completedDate && { completedDate: Timestamp.fromDate(updateData.completedDate) }),
              ...(updateData.actualStartDate && { actualStartDate: Timestamp.fromDate(updateData.actualStartDate) }),
              ...(updateData.actualEndDate && { actualEndDate: Timestamp.fromDate(updateData.actualEndDate) }),
            };
          }
          return stage;
        });
        
        return {
          ...item,
          productionPlan: updatedProductionPlan
        };
      }
      return item;
    });
    
    await updateDoc(orderRef, {
      items: updatedItems,
      lastUpdate: Timestamp.now()
    });
    
    toast({
      title: "Tarefa atualizada!",
      description: "As alterações foram salvas com sucesso.",
    });
    
    return true;
    
  } catch (error) {
    console.error("Error updating task:", error);
    toast({
      variant: "destructive",
      title: "Erro ao atualizar tarefa",
      description: "Não foi possível salvar as alterações.",
    });
    return false;
  }
};
// ============================================================================
// FUNÇÃO DE EXPORTAÇÃO PDF - PARTE 4
// Adicione esta função ao arquivo tasks/page.tsx
// ============================================================================

export const exportTasksToPDF = async (
  tasks: Task[],
  companyData: CompanyData,
  teamMembers: TeamMember[],
  resources: Resource[],
  filters: {
    statusFilter: string;
    resourceFilter: string;
    priorityFilter: string;
    dateFilter?: Date;
  }
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPos = 15;

  // Cabeçalho da empresa
  if (companyData.logo?.preview) {
    try {
      doc.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
    } catch (e) {
      console.error("Error adding logo to PDF:", e);
    }
  }

  let textX = 65;
  let textY = yPos;
  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY);
  textY += 6;
  
  doc.setFontSize(9).setFont('helvetica', 'normal');
  if (companyData.endereco) {
    const addressLines = doc.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
    doc.text(addressLines, textX, textY);
    textY += (addressLines.length * 4);
  }
  if (companyData.cnpj) {
    doc.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
    textY += 4;
  }
  if (companyData.email) {
    doc.text(`Email: ${companyData.email}`, textX, textY);
    textY += 4;
  }
  if (companyData.celular) {
    doc.text(`Telefone: ${companyData.celular}`, textX, textY);
  }

  yPos = 55;

  // Título do relatório
  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE TAREFAS DE PRODUÇÃO', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Informações do relatório
  doc.setFontSize(10).setFont('helvetica', 'normal');
  doc.text(`Data de Geração: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, 15, yPos);
  doc.text(`Total de Tarefas: ${tasks.length}`, pageWidth - 15, yPos, { align: 'right' });
  yPos += 7;

  // Filtros aplicados
  if (filters.statusFilter !== 'all' || filters.resourceFilter !== 'all' || filters.priorityFilter !== 'all' || filters.dateFilter) {
    doc.setFont('helvetica', 'bold');
    doc.text('Filtros Aplicados:', 15, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    
    if (filters.statusFilter !== 'all') {
      doc.text(`• Status: ${filters.statusFilter}`, 15, yPos);
      yPos += 4;
    }
    if (filters.resourceFilter !== 'all') {
      const resourceName = resources.find(r => r.id === filters.resourceFilter)?.name || filters.resourceFilter;
      doc.text(`• Recurso: ${resourceName}`, 15, yPos);
      yPos += 4;
    }
    if (filters.priorityFilter !== 'all') {
      doc.text(`• Prioridade: ${filters.priorityFilter}`, 15, yPos);
      yPos += 4;
    }
    if (filters.dateFilter) {
      doc.text(`• Data: ${format(filters.dateFilter, "dd/MM/yyyy")}`, 15, yPos);
      yPos += 4;
    }
    yPos += 5;
  }

  // Tabela de tarefas
  const tableBody = tasks.map(task => {
    const resource = resources.find(r => r.id === task.assignedResourceId);
    const member = teamMembers.find(m => m.id === task.responsibleMemberId);
    
    return [
      task.orderNumber,
      task.internalOS || 'N/A',
      task.itemDescription.length > 30 ? task.itemDescription.substring(0, 30) + '...' : task.itemDescription,
      task.stageName,
      task.status,
      task.priority,
      task.startDate ? format(task.startDate, 'dd/MM/yy') : 'N/A',
      formatDuration(task.durationDays),
      resource?.name || 'Não atribuído',
      member?.name || 'Não atribuído'
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Pedido', 'OS', 'Item', 'Etapa', 'Status', 'Prioridade', 'Início', 'Duração', 'Recurso', 'Responsável']],
    body: tableBody,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], fontSize: 8, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 18 }, // Pedido
      1: { cellWidth: 15 }, // OS
      2: { cellWidth: 35 }, // Item
      3: { cellWidth: 25 }, // Etapa
      4: { cellWidth: 20 }, // Status
      5: { cellWidth: 18 }, // Prioridade
      6: { cellWidth: 15 }, // Início
      7: { cellWidth: 15 }, // Duração
      8: { cellWidth: 25 }, // Recurso
      9: { cellWidth: 25 }, // Responsável
    },
    didParseCell: (data) => {
      // Colorir células baseado no status
      if (data.column.index === 4 && data.section === 'body') {
        const status = data.cell.raw as string;
        switch (status) {
          case 'Pendente':
            data.cell.styles.fillColor = [254, 249, 195];
            data.cell.styles.textColor = [146, 64, 14];
            break;
          case 'Em Andamento':
            data.cell.styles.fillColor = [219, 234, 254];
            data.cell.styles.textColor = [30, 64, 175];
            break;
          case 'Concluído':
            data.cell.styles.fillColor = [220, 252, 231];
            data.cell.styles.textColor = [21, 128, 61];
            break;
          case 'Reprogramada':
            data.cell.styles.fillColor = [255, 237, 213];
            data.cell.styles.textColor = [154, 52, 18];
            break;
        }
      }
      
      // Colorir células baseado na prioridade
      if (data.column.index === 5 && data.section === 'body') {
        const priority = data.cell.raw as string;
        switch (priority) {
          case 'Urgente':
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [185, 28, 28];
            break;
          case 'Alta':
            data.cell.styles.fillColor = [255, 237, 213];
            data.cell.styles.textColor = [154, 52, 18];
            break;
          case 'Normal':
            data.cell.styles.fillColor = [219, 234, 254];
            data.cell.styles.textColor = [30, 64, 175];
            break;
          case 'Baixa':
            data.cell.styles.fillColor = [243, 244, 246];
            data.cell.styles.textColor = [55, 65, 81];
            break;
        }
      }
    }
  });

  // Estatísticas no rodapé
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  const pageHeight = doc.internal.pageSize.height;
  
  if (finalY + 40 < pageHeight - 20) {
    doc.setFontSize(10).setFont('helvetica', 'bold');
    doc.text('ESTATÍSTICAS:', 15, finalY);
    
    const stats = {
      pendentes: tasks.filter(t => t.status === 'Pendente').length,
      emAndamento: tasks.filter(t => t.status === 'Em Andamento').length,
      concluidas: tasks.filter(t => t.status === 'Concluído').length,
      reprogramadas: tasks.filter(t => t.status === 'Reprogramada').length,
      atrasadas: tasks.filter(t => isTaskOverdue(t)).length,
      urgentes: tasks.filter(t => t.priority === 'Urgente').length
    };
    
    doc.setFontSize(9).setFont('helvetica', 'normal');
    let statsY = finalY + 7;
    doc.text(`Pendentes: ${stats.pendentes}`, 15, statsY);
    doc.text(`Em Andamento: ${stats.emAndamento}`, 70, statsY);
    doc.text(`Concluídas: ${stats.concluidas}`, 140, statsY);
    statsY += 5;
    doc.text(`Reprogramadas: ${stats.reprogramadas}`, 15, statsY);
    doc.text(`Atrasadas: ${stats.atrasadas}`, 70, statsY);
    doc.text(`Urgentes: ${stats.urgentes}`, 140, statsY);
  }

  // Salvar o PDF
  const fileName = `Tarefas_Producao_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
  doc.save(fileName);
  
  return fileName;
};
// ============================================================================
// MODAIS DE ATRIBUIÇÃO E ATUALIZAÇÃO - PARTE 5
// Adicione estes componentes ao arquivo tasks/page.tsx
// ============================================================================

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

// Schemas de validação
const taskAssignmentSchema = z.object({
  assignedResourceId: z.string().min(1, "Selecione um recurso"),
  responsibleMemberId: z.string().min(1, "Selecione um responsável"),
  priority: z.enum(["Baixa", "Normal", "Alta", "Urgente"]),
  notes: z.string().optional(),
  scheduledStartDate: z.date().optional(),
});

const taskUpdateSchema = z.object({
  status: z.enum(["Pendente", "Em Andamento", "Concluído", "Reprogramada"]),
  actualStartDate: z.date().optional(),
  actualEndDate: z.date().optional(),
  newScheduledDate: z.date().optional(),
  notes: z.string().optional(),
});

type TaskAssignment = z.infer<typeof taskAssignmentSchema>;
type TaskUpdate = z.infer<typeof taskUpdateSchema>;

// Modal para atribuir tarefa a recurso
export const TaskAssignmentModal = ({
  isOpen,
  onClose,
  task,
  resources,
  teamMembers,
  onAssign
}: {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  resources: Resource[];
  teamMembers: TeamMember[];
  onAssign: (assignment: TaskAssignment) => void;
}) => {
  const assignmentForm = useForm<TaskAssignment>({
    resolver: zodResolver(taskAssignmentSchema),
    defaultValues: {
      assignedResourceId: "",
      responsibleMemberId: "",
      priority: "Normal",
      notes: "",
    }
  });

  const availableResources = resources.filter(r => 
    r.status === 'disponivel' || r.status === 'ocupado'
  );

  const handleSubmit = (data: TaskAssignment) => {
    onAssign(data);
    assignmentForm.reset();
    onClose();
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atribuir Tarefa</DialogTitle>
          <DialogDescription>
            Atribua um recurso e responsável para a execução desta tarefa.
          </DialogDescription>
        </DialogHeader>

        {/* Informações da tarefa */}
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{task.orderNumber}</Badge>
            {task.internalOS && <Badge variant="secondary">{task.internalOS}</Badge>}
          </div>
          <div>
            <div className="font-medium">{task.itemDescription}</div>
            <div className="text-sm text-muted-foreground">Etapa: {task.stageName}</div>
            <div className="text-sm text-muted-foreground">Cliente: {task.customerName}</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CalendarIcon className="h-4 w-4" />
              <span>{task.startDate ? format(task.startDate, "dd/MM/yyyy") : "Data a definir"}</span>
            </div>
            <div className="flex items-center gap-1">
              <Timer className="h-4 w-4" />
              <span>{formatDuration(task.durationDays)}</span>
            </div>
          </div>
        </div>

        <Form {...assignmentForm}>
          <form onSubmit={assignmentForm.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={assignmentForm.control}
              name="assignedResourceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recurso</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um recurso" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableResources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{resource.name}</span>
                            <Badge variant="outline" className="ml-2">
                              {resource.status}
                            </Badge>
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
              name="responsibleMemberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsável</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um responsável" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>{member.name}</span>
                            <span className="text-sm text-muted-foreground">{member.position}</span>
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
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Baixa">Baixa</SelectItem>
                      <SelectItem value="Normal">Normal</SelectItem>
                      <SelectItem value="Alta">Alta</SelectItem>
                      <SelectItem value="Urgente">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={assignmentForm.control}
              name="scheduledStartDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Início Programada</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "dd/MM/yyyy")
                          ) : (
                            <span>Selecione uma data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date()
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
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
                      placeholder="Adicione observações sobre a tarefa..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">
                Atribuir Tarefa
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

TaskAssignmentModal.displayName = 'TaskAssignmentModal';

// Modal para atualizar status da tarefa
export const TaskUpdateModal = ({
  isOpen,
  onClose,
  task,
  onUpdate
}: {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onUpdate: (update: TaskUpdate) => void;
}) => {
  const updateForm = useForm<TaskUpdate>({
    resolver: zodResolver(taskUpdateSchema),
    defaultValues: {
      status: "Pendente",
      notes: "",
    }
  });

  const handleSubmit = (data: TaskUpdate) => {
    onUpdate(data);
    updateForm.reset();
    onClose();
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atualizar Tarefa</DialogTitle>
          <DialogDescription>
            Atualize o status e informações da tarefa.
          </DialogDescription>
        </DialogHeader>

        {/* Informações da tarefa */}
        <div className="space-y-3 p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{task.orderNumber}</Badge>
            {task.internalOS && <Badge variant="secondary">{task.internalOS}</Badge>}
          </div>
          <div>
            <div className="font-medium">{task.itemDescription}</div>
            <div className="text-sm text-muted-foreground">Etapa: {task.stageName}</div>
            <div className="text-sm text-muted-foreground">Cliente: {task.customerName}</div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CalendarIcon className="h-4 w-4" />
              <span>{task.startDate ? format(task.startDate, "dd/MM/yyyy") : "Data a definir"}</span>
            </div>
            <div className="flex items-center gap-1">
              <Timer className="h-4 w-4" />
              <span>{formatDuration(task.durationDays)}</span>
            </div>
          </div>
        </div>

        <Form {...updateForm}>
          <form onSubmit={updateForm.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={updateForm.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                      <SelectItem value="Concluído">Concluído</SelectItem>
                      <SelectItem value="Reprogramada">Reprogramada</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {updateForm.watch("status") === "Reprogramada" && (
              <FormField
                control={updateForm.control}
                name="newScheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova Data Programada</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>Selecione uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date()
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {updateForm.watch("status") === "Em Andamento" && (
              <FormField
                control={updateForm.control}
                name="actualStartDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Início Real</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>Selecione uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {updateForm.watch("status") === "Concluído" && (
              <FormField
                control={updateForm.control}
                name="actualEndDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Conclusão</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>Selecione uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={updateForm.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Adicione observações sobre a atualização..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">
                Atualizar Tarefa
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

TaskUpdateModal.displayName = 'TaskUpdateModal';

// ============================================================================
// INTEGRAÇÃO FINAL NO COMPONENTE PRINCIPAL
// Este código mostra como integrar todas as partes no componente TasksPage
// ============================================================================

// Adicione estas funções handlers no componente TasksPage:

// Handlers para os modais
const handleViewTask = (task: Task) => {
  setSelectedTask(task);
  // Abrir modal de visualização (opcional)
};

const handleAssignTask = (task: Task) => {
  setSelectedTask(task);
  setIsAssignDialogOpen(true);
};

const handleUpdateTask = (task: Task) => {
  setSelectedTask(task);
  setIsUpdateDialogOpen(true);
};

const handleClearFilters = () => {
  setStatusFilter('all');
  setResourceFilter('all');
  setPriorityFilter('all');
  setDateFilter(undefined);
  setSearchQuery('');
};

// Handler para atribuição de tarefa
const handleTaskAssignment = async (assignment: TaskAssignment) => {
  if (!selectedTask) return;

  const selectedResource = resources.find(r => r.id === assignment.assignedResourceId);
  const selectedMember = teamMembers.find(m => m.id === assignment.responsibleMemberId);
  
  const updateData = {
    assignedResourceId: assignment.assignedResourceId,
    assignedResourceName: selectedResource?.name,
    responsibleMemberId: assignment.responsibleMemberId,
    responsibleMemberName: selectedMember?.name,
    priority: assignment.priority,
    notes: assignment.notes,
    status: "Em Andamento",
    ...(assignment.scheduledStartDate && { 
      startDate: assignment.scheduledStartDate,
      actualStartDate: assignment.scheduledStartDate 
    })
  };
  
  const success = await updateTaskInFirebase(selectedTask, updateData, toast);
  
  if (success) {
    // Recarregar tarefas
    await fetchOrdersAndGenerateTasks();
  }
};

// Handler para atualização de status
const handleTaskUpdate = async (update: TaskUpdate) => {
  if (!selectedTask) return;

  const updateData: any = {
    status: update.status,
    notes: update.notes,
    ...(update.actualStartDate && { actualStartDate: update.actualStartDate }),
    ...(update.actualEndDate && { actualEndDate: update.actualEndDate }),
  };
  
  if (update.status === "Concluído") {
    updateData.completedDate = update.actualEndDate || new Date();
  }
  
  if (update.status === "Reprogramada" && update.newScheduledDate) {
    updateData.startDate = update.newScheduledDate;
    updateData.status = "Pendente"; // Volta para pendente após reprogramação
  }
  
  const success = await updateTaskInFirebase(selectedTask, updateData, toast);
  
  if (success) {
    // Recarregar tarefas
    await fetchOrdersAndGenerateTasks();
  }
};

// Handler para exportação PDF
const handleExportTasks = async () => {
  try {
    const fileName = await exportTasksToPDF(
      filteredTasks,
      companyData,
      teamMembers,
      resources,
      {
        statusFilter,
        resourceFilter,
        priorityFilter,
        dateFilter
      }
    );

    toast({
      title: "Relatório exportado!",
      description: `O arquivo ${fileName} foi baixado com sucesso.`,
    });
  } catch (error) {
    console.error("Error exporting tasks:", error);
    toast({
      variant: "destructive",
      title: "Erro na exportação",
      description: "Não foi possível gerar o relatório em PDF.",
    });
  }
};

// ============================================================================
// RENDERIZAÇÃO COMPLETA DO COMPONENTE
// Substitua o return temporário pelo código abaixo:
// ============================================================================

return (
  <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
    {/* Cabeçalho */}
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Gestão de Tarefas
        </h1>
        <p className="text-muted-foreground">
          Monitore e gerencie todas as tarefas de produção da empresa
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          onClick={handleExportTasks}
          variant="outline"
          disabled={filteredTasks.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </div>
    </div>

    {/* Estatísticas */}
    <TaskStatistics tasks={filteredTasks} />

    {/* Filtros */}
    <TaskFilters
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      resourceFilter={resourceFilter}
      setResourceFilter={setResourceFilter}
      priorityFilter={priorityFilter}
      setPriorityFilter={setPriorityFilter}
      dateFilter={dateFilter}
      setDateFilter={setDateFilter}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      resources={resources}
      onClearFilters={handleClearFilters}
    />

    {/* Tabela de tarefas */}
    <TaskTable
      tasks={filteredTasks}
      resources={resources}
      teamMembers={teamMembers}
      onViewTask={handleViewTask}
      onAssignTask={handleAssignTask}
      onUpdateTask={handleUpdateTask}
    />

    {/* Modal de Atribuição */}
    <TaskAssignmentModal
      isOpen={isAssignDialogOpen}
      onClose={() => setIsAssignDialogOpen(false)}
      task={selectedTask}
      resources={resources}
      teamMembers={teamMembers}
      onAssign={handleTaskAssignment}
    />

    {/* Modal de Atualização */}
    <TaskUpdateModal
      isOpen={isUpdateDialogOpen}
      onClose={() => setIsUpdateDialogOpen(false)}
      task={selectedTask}
      onUpdate={handleTaskUpdate}
    />
  </div>
);
