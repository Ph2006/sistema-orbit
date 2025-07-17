"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isToday, isThisWeek, startOfWeek, endOfWeek, addDays, isSameDay } from "date-fns";
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
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
  Download
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

type TaskAssignmentFormData = z.infer<typeof taskAssignmentSchema>;

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
  const [activeTab, setActiveTab] = useState("today");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Form para atribuição de tarefas
  const assignmentForm = useForm<TaskAssignmentFormData>({
    resolver: zodResolver(taskAssignmentSchema),
    defaultValues: {
      resourceId: "",
      responsibleId: "",
      estimatedHours: 8,
      notes: "",
    },
  });

  // =============================================================================
  // FUNÇÕES UTILITÁRIAS
  // =============================================================================

  // Função para calcular prioridade baseada na data de entrega
  const calculatePriority = (deliveryDate?: Date): 'baixa' | 'media' | 'alta' | 'urgente' => {
    if (!deliveryDate) return 'media';
    
    const today = new Date();
    const diffTime = deliveryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'urgente'; // Atrasado
    if (diffDays <= 3) return 'alta';
    if (diffDays <= 7) return 'media';
    return 'baixa';
  };

  // =============================================================================
  // BUSCA DE DADOS
  // =============================================================================

  // Função para buscar dados
  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      // Buscar pedidos
      const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const allTasks: Task[] = [];

      ordersSnapshot.docs.forEach(orderDoc => {
        const orderData = orderDoc.data();
        
        // Filtrar apenas pedidos não concluídos
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
              };
              allTasks.push(task);
            });
          }
        });
      });

      // Buscar recursos
      const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
      const resourcesSnap = await getDoc(resourcesRef);
      const resourcesData = resourcesSnap.exists() ? resourcesSnap.data().resources || [] : [];
      
      // Buscar membros da equipe
      const teamRef = doc(db, "companies", "mecald", "settings", "team");
      const teamSnap = await getDoc(teamRef);
      const teamData = teamSnap.exists() ? teamSnap.data().members || [] : [];

      // Enriquecer tarefas com nomes dos recursos e responsáveis
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

  // Filtrar tarefas
  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // Filtro por status
    if (statusFilter !== "all") {
      filtered = filtered.filter(task => task.status === statusFilter);
    }

    // Filtro por recurso
    if (resourceFilter !== "all") {
      filtered = filtered.filter(task => task.assignedResourceId === resourceFilter);
    }

    // Filtro por responsável
    if (responsibleFilter !== "all") {
      filtered = filtered.filter(task => task.responsibleId === responsibleFilter);
    }

    return filtered;
  }, [tasks, statusFilter, resourceFilter, responsibleFilter]);

  // Tarefas por período
  const tasksByPeriod = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

    return {
      today: filteredTasks.filter(task => 
        task.startDate && isToday(task.startDate) || 
        task.status === 'Em Andamento'
      ),
      thisWeek: filteredTasks.filter(task => 
        task.startDate && isThisWeek(task.startDate, { weekStartsOn: 1 }) ||
        (task.status === 'Em Andamento' && task.startDate && task.startDate <= weekEnd)
      ),
      pending: filteredTasks.filter(task => task.status === 'Pendente'),
      inProgress: filteredTasks.filter(task => task.status === 'Em Andamento'),
      completed: filteredTasks.filter(task => task.status === 'Concluído'),
      overdue: filteredTasks.filter(task => 
        task.startDate && 
        task.startDate < today && 
        task.status !== 'Concluído'
      ),
    };
  }, [filteredTasks]);

  // Estatísticas
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Concluído').length;
    const inProgress = tasks.filter(t => t.status === 'Em Andamento').length;
    const pending = tasks.filter(t => t.status === 'Pendente').length;
    const overdue = tasks.filter(t => 
      t.startDate && 
      t.startDate < new Date() && 
      t.status !== 'Concluído'
    ).length;

    return { total, completed, inProgress, pending, overdue };
  }, [tasks]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  // Handlers
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

  const onAssignmentSubmit = async (values: TaskAssignmentFormData) => {
    if (!selectedTask) return;

    try {
      // Atualizar a tarefa no Firestore
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
      await fetchData(); // Recarregar dados

    } catch (error) {
      console.error("Error assigning task:", error);
      toast({
        variant: "destructive",
        title: "Erro ao atribuir tarefa",
        description: "Não foi possível atribuir a tarefa.",
      });
    }
  };

  // =============================================================================
  // GERAÇÃO DE RELATÓRIOS
  // =============================================================================

  // Função para gerar relatório PDF
  const generateTaskReport = async (period: 'daily' | 'weekly') => {
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};

      const pdfDoc = new jsPDF();
      const pageWidth = pdfDoc.internal.pageSize.width;
      let yPos = 15;

      // Header com logo e informações da empresa
      if (companyData.logo?.preview) {
        try {
          pdfDoc.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
        } catch (e) {
          console.error("Error adding logo to PDF:", e);
        }
      }

      // Informações da empresa
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

      // Título do relatório
      pdfDoc.setFontSize(18).setFont('helvetica', 'bold');
      const title = period === 'daily' ? 'TAREFAS DIÁRIAS' : 'TAREFAS SEMANAIS';
      pdfDoc.text(title, pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Data do relatório
      pdfDoc.setFontSize(10).setFont('helvetica', 'normal');
      const dateStr = period === 'daily' 
        ? `Data: ${format(new Date(), 'dd/MM/yyyy')}`
        : `Semana de ${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'dd/MM')} a ${format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'dd/MM/yyyy')}`;
      pdfDoc.text(dateStr, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Dados para o relatório
      const tasksToShow = period === 'daily' ? tasksByPeriod.today : tasksByPeriod.thisWeek;

      if (tasksToShow.length === 0) {
        pdfDoc.text('Nenhuma tarefa encontrada para este período.', pageWidth / 2, yPos, { align: 'center' });
      } else {
        // Estatísticas rápidas
        const periodStats = {
          total: tasksToShow.length,
          pending: tasksToShow.filter(t => t.status === 'Pendente').length,
          inProgress: tasksToShow.filter(t => t.status === 'Em Andamento').length,
          completed: tasksToShow.filter(t => t.status === 'Concluído').length,
        };

        pdfDoc.setFontSize(12).setFont('helvetica', 'bold');
        pdfDoc.text('RESUMO:', 15, yPos);
        yPos += 8;

        pdfDoc.setFontSize(10).setFont('helvetica', 'normal');
        pdfDoc.text(`Total de tarefas: ${periodStats.total}`, 15, yPos);
        pdfDoc.text(`Pendentes: ${periodStats.pending}`, 70, yPos);
        pdfDoc.text(`Em andamento: ${periodStats.inProgress}`, 120, yPos);
        pdfDoc.text(`Concluídas: ${periodStats.completed}`, 170, yPos);
        yPos += 15;

        // Tabela de tarefas
        const tableBody = tasksToShow.map(task => [
          task.orderNumber,
          task.customer,
          task.itemDescription.substring(0, 30) + (task.itemDescription.length > 30 ? '...' : ''),
          task.stageName,
          task.status,
          task.assignedResourceName || 'Não atribuído',
          task.responsibleName || 'Não atribuído',
          task.deliveryDate ? format(task.deliveryDate, 'dd/MM/yy') : 'N/A',
        ]);

        autoTable(pdfDoc, {
          startY: yPos,
          head: [['Pedido', 'Cliente', 'Item', 'Etapa', 'Status', 'Recurso', 'Responsável', 'Entrega']],
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
            0: { cellWidth: 20 }, // Pedido
            1: { cellWidth: 35 }, // Cliente
            2: { cellWidth: 40 }, // Item
            3: { cellWidth: 30 }, // Etapa
            4: { cellWidth: 25 }, // Status
            5: { cellWidth: 30 }, // Recurso
            6: { cellWidth: 30 }, // Responsável
            7: { cellWidth: 20 }, // Entrega
          }
        });

        // Rodapé
        const finalY = (pdfDoc as any).lastAutoTable.finalY;
        if (finalY + 20 < pdfDoc.internal.pageSize.height - 20) {
          yPos = finalY + 15;
          pdfDoc.setFontSize(8).setFont('helvetica', 'italic');
          pdfDoc.text(
            `Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
            pageWidth / 2,
            yPos,
            { align: 'center' }
          );
        }
      }

      // Salvar PDF
      const filename = `Tarefas_${period === 'daily' ? 'Diarias' : 'Semanais'}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      pdfDoc.save(filename);

      toast({
        title: "Relatório gerado!",
        description: `O relatório ${period === 'daily' ? 'diário' : 'semanal'} foi baixado com sucesso.`,
      });

    } catch (error) {
      console.error("Error generating report:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Não foi possível gerar o relatório PDF.",
      });
    }
  };

  // =============================================================================
  // COMPONENTES AUXILIARES
  // =============================================================================

  // Componentes auxiliares
  const TaskTable = ({ tasks, title }: { tasks: Task[]; title: string }) => {
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
        'Concluído': "bg-green-100 text-green-800"
      };
      
      return (
        <Badge className={variants[status as keyof typeof variants] || "bg-gray-100 text-gray-800"}>
          {status}
        </Badge>
      );
    };

    if (tasks.length === 0) {
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
            <Badge variant="outline">{tasks.length} tarefas</Badge>
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
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.orderNumber}</TableCell>
                  <TableCell>{task.customer}</TableCell>
                  <TableCell>
                    <div>
                      {task.itemCode && <div className="text-xs text-muted-foreground">[{task.itemCode}]</div>}
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

  // =============================================================================
  // LOADING STATE
  // =============================================================================

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
        <TabsList className="grid w-full grid-cols-6">
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
              {/* Informações da Tarefa */}
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

              {/* Formulário de Atribuição */}
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
                            {resources
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
    </div>
  );
};

export default TaskManagementPage;
