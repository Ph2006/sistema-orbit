"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
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
  Package
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/dashboard/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Tipos simplificados
type SimpleTask = {
  id: string;
  orderNumber: string;
  itemDescription: string;
  stageName: string;
  assignedResource?: {
    resourceId: string;
    resourceName: string;
  };
  supervisor?: {
    memberId: string;
    memberName: string;
  };
  status: string;
  startDate: Date;
  endDate: Date;
  priority: string;
  estimatedHours: number;
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

  // Função simplificada para buscar tarefas dos pedidos
  const fetchTasksFromOrders = async () => {
    try {
      const ordersRef = collection(db, "companies", "mecald", "orders");
      const ordersSnapshot = await getDocs(ordersRef);
      
      const tasksList: SimpleTask[] = [];
      
      ordersSnapshot.docs.forEach(orderDoc => {
        const orderData = orderDoc.data();
        
        // Processar apenas pedidos ativos
        if (!['Em Produção', 'Aguardando Produção', 'Pronto para Entrega'].includes(orderData.status)) {
          return;
        }
        
        orderData.items?.forEach((item: any) => {
          item.productionPlan?.forEach((stage: any, stageIndex: number) => {
            if (stage.assignedResource || stage.supervisor) {
              tasksList.push({
                id: `${orderDoc.id}-${item.id}-${stageIndex}`,
                orderNumber: orderData.quotationNumber || orderData.orderNumber || 'N/A',
                itemDescription: item.description,
                stageName: stage.stageName,
                assignedResource: stage.assignedResource,
                supervisor: stage.supervisor,
                status: stage.status,
                startDate: stage.startDate?.toDate() || new Date(),
                endDate: stage.completedDate?.toDate() || new Date(),
                priority: determinePriority(orderData),
                estimatedHours: (stage.durationDays || 1) * 8,
              });
            }
          });
        });
      });
      
      setTasks(tasksList);
    } catch (error) {
      console.error("Erro ao buscar tarefas:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar tarefas",
        description: "Não foi possível carregar as tarefas dos pedidos.",
      });
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
      fetchInitialData();
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
      const resourceMatch = filterResource === 'all' || task.assignedResource?.resourceId === filterResource;
      const supervisorMatch = filterSupervisor === 'all' || task.supervisor?.memberId === filterSupervisor;

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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredTasks.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">{task.orderNumber}</TableCell>
                          <TableCell>{task.itemDescription.substring(0, 30)}...</TableCell>
                          <TableCell>{task.stageName}</TableCell>
                          <TableCell>{task.assignedResource?.resourceName || 'N/A'}</TableCell>
                          <TableCell>{task.supervisor?.memberName || 'N/A'}</TableCell>
                          <TableCell>{format(task.endDate, 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{getStatusBadge(task.status)}</TableCell>
                          <TableCell>{getPriorityBadge(task.priority)}</TableCell>
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
    </div>
  );
}
