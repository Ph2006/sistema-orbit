"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, startOfWeek, endOfWeek, isWithinInterval, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
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
  Edit
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

  // Função simplificada para determinar prioridade
  const determinePriority = (orderData: any): string => {
    if (orderData.deliveryDate) {
      const deliveryDate = new Date(orderData.deliveryDate.seconds ? orderData.deliveryDate.toDate() : orderData.deliveryDate);
      const today = new Date();
      const daysUntilDelivery = Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDelivery < 0) return "urgente";
      if (daysUntilDelivery <= 3) return "alta";
      if (daysUntilDelivery <= 7) return "media";
    }
    return "baixa";
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
              // Só incluir etapas que não estão concluídas
              if (stage.status !== 'Concluído') {
                // Determinar status da tarefa
                let taskStatus = stage.status;
                const endDate = safeToDate(stage.endDate);
                if (endDate && endDate < new Date() && stage.status !== 'Concluído') {
                  taskStatus = 'Atrasado';
                }

                // Calcular progresso
                const progress = taskStatus === 'Concluído' ? 100 : 
                               taskStatus === 'Em Andamento' ? 50 : 0;

                tasksList.push({
                  id: `${orderDoc.id}-${item.id}-${stageIndex}`,
                  orderId: orderDoc.id,
                  orderNumber: orderData.quotationNumber || orderData.orderNumber || 'N/A',
                  customerName: orderData.customer?.name || 'Cliente não informado',
                  itemId: item.id || `item-${stageIndex}`,
                  itemDescription: item.description,
                  itemNumber: item.itemNumber,
                  stageName: stage.stageName,
                  assignedResource: stage.assignedResource,
                  supervisor: stage.supervisor,
                  status: taskStatus,
                  startDate: safeToDate(stage.startDate),
                  endDate: safeToDate(stage.completedDate),
                  completedDate: safeToDate(stage.completedDate),
                  priority: determinePriority(orderData),
                  estimatedHours: (stage.durationDays || 1) * 8,
                  actualHours: stage.actualHours,
                  notes: stage.notes,
                  progress,
                });
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
          fetchResourcesAndTeam()
        ]);
        setIsLoading(false);
      };
      loadData();
    }
  }, [user, authLoading]);

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

  // Funções de manipulação de alocação
  const handleAllocateTask = (task: SimpleTask) => {
    setSelectedTask(task);
    setAllocationData({
      taskId: task.id,
      resourceId: task.assignedResource?.resourceId,
      supervisorId: task.supervisor?.memberId,
      notes: task.notes || '',
      estimatedHours: task.estimatedHours
    });
    setIsAllocationDialogOpen(true);
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
                <Select value={allocationData.resourceId || ''} onValueChange={(value) => 
                  setAllocationData(prev => ({ ...prev, resourceId: value || undefined }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um recurso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum recurso</SelectItem>
                    {resources.filter(r => r.status === 'disponivel').map(resource => (
                      <SelectItem key={resource.id} value={resource.id}>
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
                <Select value={allocationData.supervisorId || ''} onValueChange={(value) => 
                  setAllocationData(prev => ({ ...prev, supervisorId: value || undefined }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum supervisor</SelectItem>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
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
