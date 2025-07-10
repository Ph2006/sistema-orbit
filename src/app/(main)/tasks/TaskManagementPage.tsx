"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isSameDay, addDays, isWeekend, startOfDay, endOfDay } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { 
  CalendarIcon, 
  Clock, 
  Users, 
  Settings, 
  FileText, 
  CheckCircle, 
  PlayCircle, 
  Hourglass, 
  AlertTriangle,
  Package,
  User,
  MapPin,
  Filter,
  Download,
  Calendar as CalendarPlus,
  BarChart3,
  RefreshCw,
  Activity
} from "lucide-react";

// Types
type ProductionStage = {
  stageName: string;
  status: string;
  startDate: Date | null;
  completedDate: Date | null;
  durationDays?: number;
};

type OrderItem = {
  id: string;
  code?: string;
  description: string;
  quantity: number;
  productionPlan?: ProductionStage[];
};

type Order = {
  id: string;
  quotationNumber: string;
  customer: { name: string };
  items: OrderItem[];
  status: string;
  deliveryDate?: Date;
  projectName?: string;
};

type Resource = {
  id: string;
  name: string;
  type: string;
  capacity: number;
  status: string;
  location?: string;
};

type Task = {
  id: string;
  orderId: string;
  orderNumber: string;
  itemId: string;
  itemDescription: string;
  stageName: string;
  status: string;
  startDate: Date | null;
  completedDate: Date | null;
  durationDays: number;
  customer: string;
  priority: 'alta' | 'media' | 'baixa';
  assignedResource?: string;
  location?: string;
};

type TasksByDate = {
  [date: string]: Task[];
};

type CompanyData = {
  nomeFantasia?: string;
  logo?: { preview?: string };
  endereco?: string;
  cnpj?: string;
  email?: string;
  celular?: string;
  website?: string;
};

// Utility functions
const getTaskPriority = (deliveryDate?: Date): 'alta' | 'media' | 'baixa' => {
  if (!deliveryDate) return 'baixa';
  const today = new Date();
  const diffDays = Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 7) return 'alta';
  if (diffDays <= 30) return 'media';
  return 'baixa';
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Concluído':
      return 'bg-green-100 text-green-800 hover:bg-green-100';
    case 'Em Andamento':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
    case 'Pendente':
      return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'alta':
      return 'bg-red-100 text-red-800 hover:bg-red-100';
    case 'media':
      return 'bg-orange-100 text-orange-800 hover:bg-orange-100';
    case 'baixa':
      return 'bg-green-100 text-green-800 hover:bg-green-100';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  }
};

const getResourceTypeLabel = (type: string) => {
  const types = {
    'maquina': 'Máquina',
    'equipamento': 'Equipamento',
    'veiculo': 'Veículo',
    'ferramenta': 'Ferramenta',
    'espaco': 'Espaço',
    'mao_de_obra': 'Mão de Obra'
  };
  return types[type as keyof typeof types] || type;
};

export default function TaskManagementPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Fetch data
  const fetchOrders = async () => {
    if (!user) return [];
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const ordersList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const deliveryDate = data.deliveryDate?.toDate ? data.deliveryDate.toDate() : undefined;
        
        const enrichedItems = (data.items || []).map((item: any, index: number) => ({
          ...item,
          id: item.id || `${doc.id}-${index}`,
          productionPlan: (item.productionPlan || []).map((p: any) => ({
            ...p,
            startDate: p.startDate?.toDate ? p.startDate.toDate() : null,
            completedDate: p.completedDate?.toDate ? p.completedDate.toDate() : null,
          }))
        }));

        return {
          id: doc.id,
          quotationNumber: data.quotationNumber || data.orderNumber || 'N/A',
          customer: { name: data.customer?.name || data.customerName || 'Cliente não informado' },
          items: enrichedItems,
          status: data.status || 'Pendente',
          deliveryDate: deliveryDate,
          projectName: data.projectName || '',
        } as Order;
      });
      
      return ordersList;
    } catch (error) {
      console.error("Error fetching orders:", error);
      return [];
    }
  };

  const fetchResources = async () => {
    if (!user) return [];
    try {
      const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
      const docSnap = await getDoc(resourcesRef);
      if (docSnap.exists()) {
        return docSnap.data().resources || [];
      }
      return [];
    } catch (error) {
      console.error("Error fetching resources:", error);
      return [];
    }
  };

  const generateTasks = (ordersList: Order[]): Task[] => {
    const tasksList: Task[] = [];
    
    ordersList.forEach(order => {
      order.items.forEach(item => {
        if (item.productionPlan && item.productionPlan.length > 0) {
          item.productionPlan.forEach(stage => {
            const priority = getTaskPriority(order.deliveryDate);
            
            tasksList.push({
              id: `${order.id}-${item.id}-${stage.stageName}`,
              orderId: order.id,
              orderNumber: order.quotationNumber,
              itemId: item.id,
              itemDescription: item.description,
              stageName: stage.stageName,
              status: stage.status,
              startDate: stage.startDate,
              completedDate: stage.completedDate,
              durationDays: stage.durationDays || 1,
              customer: order.customer.name,
              priority: priority,
              location: undefined, // Pode ser atribuído baseado no recurso
            });
          });
        }
      });
    });
    
    return tasksList;
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersList, resourcesList] = await Promise.all([
        fetchOrders(),
        fetchResources()
      ]);
      
      setOrders(ordersList);
      setResources(resourcesList);
      
      const tasksList = generateTasks(ordersList);
      setTasks(tasksList);
      
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as informações.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      loadData();
    }
  }, [user, authLoading]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const statusMatch = statusFilter === "all" || task.status === statusFilter;
      const priorityMatch = priorityFilter === "all" || task.priority === priorityFilter;
      const resourceMatch = resourceFilter === "all" || task.assignedResource === resourceFilter;
      
      return statusMatch && priorityMatch && resourceMatch;
    });
  }, [tasks, statusFilter, priorityFilter, resourceFilter]);

  // Tasks by date
  const tasksByDate = useMemo(() => {
    const grouped: TasksByDate = {};
    
    filteredTasks.forEach(task => {
      if (task.startDate) {
        const dateKey = format(task.startDate, 'yyyy-MM-dd');
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(task);
      }
    });
    
    return grouped;
  }, [filteredTasks]);

  // Tasks for selected date
  const tasksForSelectedDate = useMemo(() => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return tasksByDate[dateKey] || [];
  }, [tasksByDate, selectedDate]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter(t => t.status === 'Concluído').length;
    const inProgress = filteredTasks.filter(t => t.status === 'Em Andamento').length;
    const pending = filteredTasks.filter(t => t.status === 'Pendente').length;
    const highPriority = filteredTasks.filter(t => t.priority === 'alta').length;
    
    return { total, completed, inProgress, pending, highPriority };
  }, [filteredTasks]);

  // Export functions
  const exportDailyTasks = async () => {
    toast({ title: "Gerando relatório...", description: "Por favor, aguarde." });

    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
      
      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.width;
      let yPos = 15;

      // Header
      if (companyData.logo?.preview) {
        try {
          docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
        } catch (e) {
          console.error("Error adding logo to PDF:", e);
        }
      }

      let textX = 65;
      let textY = yPos;
      docPdf.setFontSize(18).setFont(undefined, 'bold');
      docPdf.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY, { align: 'left' });
      textY += 6;
      
      docPdf.setFontSize(9).setFont(undefined, 'normal');
      if (companyData.endereco) {
        const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
        docPdf.text(addressLines, textX, textY);
        textY += (addressLines.length * 4);
      }

      yPos = 55;
      docPdf.setFontSize(14).setFont(undefined, 'bold');
      docPdf.text('RELATÓRIO DE TAREFAS DIÁRIAS', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      docPdf.setFontSize(11).setFont(undefined, 'normal');
      docPdf.text(`Data: ${format(selectedDate, "dd/MM/yyyy")}`, 15, yPos);
      docPdf.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, pageWidth - 15, yPos, { align: 'right' });
      yPos += 12;

      // Statistics
      docPdf.setFontSize(10).setFont(undefined, 'bold');
      docPdf.text('RESUMO DO DIA:', 15, yPos);
      yPos += 8;
      
      docPdf.setFont(undefined, 'normal');
      docPdf.text(`Total de Tarefas: ${tasksForSelectedDate.length}`, 15, yPos);
      docPdf.text(`Concluídas: ${tasksForSelectedDate.filter(t => t.status === 'Concluído').length}`, 80, yPos);
      docPdf.text(`Em Andamento: ${tasksForSelectedDate.filter(t => t.status === 'Em Andamento').length}`, 140, yPos);
      yPos += 15;

      // Group tasks by location/sector
      const tasksByLocation = tasksForSelectedDate.reduce((acc, task) => {
        const location = task.location || 'Setor Geral';
        if (!acc[location]) acc[location] = [];
        acc[location].push(task);
        return acc;
      }, {} as { [key: string]: Task[] });

      // Tasks table for each sector
      Object.entries(tasksByLocation).forEach(([location, locationTasks]) => {
        docPdf.setFontSize(12).setFont(undefined, 'bold');
        docPdf.text(`SETOR: ${location.toUpperCase()}`, 15, yPos);
        yPos += 8;

        const tableBody = locationTasks.map(task => [
          task.orderNumber,
          task.customer,
          task.itemDescription.substring(0, 40) + (task.itemDescription.length > 40 ? '...' : ''),
          task.stageName,
          task.status,
          task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
        ]);

        autoTable(docPdf, {
          startY: yPos,
          head: [['Pedido', 'Cliente', 'Item', 'Etapa', 'Status', 'Prioridade']],
          body: tableBody,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255, halign: 'center' },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 35 },
            2: { cellWidth: 50 },
            3: { cellWidth: 30 },
            4: { cellWidth: 25 },
            5: { cellWidth: 25 },
          },
          margin: { left: 15, right: 15 }
        });

        yPos = (docPdf as any).lastAutoTable.finalY + 10;
        
        // Check if we need a new page
        if (yPos > 250) {
          docPdf.addPage();
          yPos = 20;
        }
      });

      docPdf.save(`Tarefas_Diarias_${format(selectedDate, 'yyyyMMdd')}.pdf`);

    } catch (error) {
      console.error("Error generating daily tasks report:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Não foi possível gerar o arquivo PDF.",
      });
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setResourceFilter("all");
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-[60px]" />
                <Skeleton className="h-3 w-[120px] mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button onClick={exportDailyTasks}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Tarefas do Dia
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Em todos os projetos</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% do total
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <PlayCircle className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.inProgress / stats.total) * 100) : 0}% do total
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Hourglass className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0}% do total
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alta Prioridade</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.highPriority}</div>
            <p className="text-xs text-muted-foreground">Requer atenção urgente</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="calendar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar">Visão por Data</TabsTrigger>
          <TabsTrigger value="list">Lista Completa</TabsTrigger>
          <TabsTrigger value="resources">Recursos</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <Card>
              <CardHeader>
                <CardTitle>Selecionar Data</CardTitle>
                <CardDescription>Clique em uma data para ver as tarefas programadas</CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="rounded-md border"
                  modifiers={{
                    hasTasks: (date) => {
                      const dateKey = format(date, 'yyyy-MM-dd');
                      return tasksByDate[dateKey] && tasksByDate[dateKey].length > 0;
                    }
                  }}
                  modifiersStyles={{
                    hasTasks: {
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      fontWeight: 'bold'
                    }
                  }}
                />
              </CardContent>
            </Card>

            {/* Tasks for Selected Date */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>
                  Tarefas para {format(selectedDate, "dd/MM/yyyy")}
                </CardTitle>
                <CardDescription>
                  {tasksForSelectedDate.length} tarefa(s) programada(s) para este dia
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tasksForSelectedDate.length > 0 ? (
                  <div className="space-y-4">
                    {tasksForSelectedDate.map(task => (
                      <div key={task.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(task.status)}>
                              {task.status === 'Concluído' && <CheckCircle className="h-3 w-3 mr-1" />}
                              {task.status === 'Em Andamento' && <PlayCircle className="h-3 w-3 mr-1" />}
                              {task.status === 'Pendente' && <Hourglass className="h-3 w-3 mr-1" />}
                              {task.status}
                            </Badge>
                            <Badge className={getPriorityColor(task.priority)}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">Pedido {task.orderNumber}</span>
                        </div>
                        <h4 className="font-semibold">{task.stageName}</h4>
                        <p className="text-sm text-muted-foreground">{task.itemDescription}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.customer}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {task.durationDays} dia(s)
                          </span>
                          {task.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {task.location}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma tarefa programada para esta data</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium">Filtrar por:</span>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                  <SelectItem value="Concluído">Concluído</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Prioridades</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="ghost" onClick={clearFilters}>
                <Filter className="mr-2 h-4 w-4" />
                Limpar Filtros
              </Button>
            </div>
          </Card>

          {/* Tasks Table */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Tarefas</CardTitle>
              <CardDescription>
                Todas as tarefas de produção organizadas por prioridade e data
              </CardDescription>
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
                    <TableHead>Início Previsto</TableHead>
                    <TableHead>Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.length > 0 ? (
                    filteredTasks
                      .sort((a, b) => {
                        // Sort by priority first, then by start date
                        const priorityOrder = { alta: 3, media: 2, baixa: 1 };
                        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
                        if (priorityDiff !== 0) return priorityDiff;
                        
                        if (a.startDate && b.startDate) {
                          return a.startDate.getTime() - b.startDate.getTime();
                        }
                        if (a.startDate && !b.startDate) return -1;
                        if (!a.startDate && b.startDate) return 1;
                        return 0;
                      })
                      .map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">{task.orderNumber}</TableCell>
                          <TableCell>{task.customer}</TableCell>
                          <TableCell>
                            <div className="max-w-[200px] truncate" title={task.itemDescription}>
                              {task.itemDescription}
                            </div>
                          </TableCell>
                          <TableCell>{task.stageName}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(task.status)}>
                              {task.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getPriorityColor(task.priority)}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {task.startDate ? format(task.startDate, "dd/MM/yyyy") : "A definir"}
                          </TableCell>
                          <TableCell>{task.durationDays} dia(s)</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center h-24">
                        Nenhuma tarefa encontrada com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          {/* Resource Statistics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Recursos</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resources.length}</div>
                <p className="text-xs text-muted-foreground">Recursos cadastrados</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Disponíveis</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {resources.filter(r => r.status === 'disponivel').length}
                </div>
                <p className="text-xs text-muted-foreground">Prontos para uso</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ocupados</CardTitle>
                <Activity className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {resources.filter(r => r.status === 'ocupado').length}
                </div>
                <p className="text-xs text-muted-foreground">Em uso atualmente</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Manutenção</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {resources.filter(r => r.status === 'manutencao').length}
                </div>
                <p className="text-xs text-muted-foreground">Indisponíveis</p>
              </CardContent>
            </Card>
          </div>

          {/* Resources by Type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recursos por Tipo</CardTitle>
                <CardDescription>Distribuição dos recursos por categoria</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(
                    resources.reduce((acc, resource) => {
                      acc[resource.type] = (acc[resource.type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm">{getResourceTypeLabel(type)}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{
                              width: `${resources.length > 0 ? (count / resources.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status dos Recursos</CardTitle>
                <CardDescription>Situação atual de todos os recursos</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {['disponivel', 'ocupado', 'manutencao', 'inativo'].map(status => {
                    const count = resources.filter(r => r.status === status).length;
                    const percentage = resources.length > 0 ? (count / resources.length) * 100 : 0;
                    const labels = {
                      disponivel: 'Disponível',
                      ocupado: 'Ocupado',
                      manutencao: 'Manutenção',
                      inativo: 'Inativo'
                    };
                    const colors = {
                      disponivel: 'bg-green-500',
                      ocupado: 'bg-yellow-500',
                      manutencao: 'bg-red-500',
                      inativo: 'bg-gray-500'
                    };
                    
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <span className="text-sm">{labels[status as keyof typeof labels]}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-secondary rounded-full h-2">
                            <div
                              className={`${colors[status as keyof typeof colors]} h-2 rounded-full transition-all`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resources Table */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Recursos</CardTitle>
              <CardDescription>Todos os recursos produtivos disponíveis</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Capacidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Localização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resources.length > 0 ? (
                    resources.map((resource) => (
                      <TableRow key={resource.id}>
                        <TableCell className="font-medium">{resource.name}</TableCell>
                        <TableCell>{getResourceTypeLabel(resource.type)}</TableCell>
                        <TableCell>{resource.capacity}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(resource.status)}>
                            {resource.status === 'disponivel' && 'Disponível'}
                            {resource.status === 'ocupado' && 'Ocupado'}
                            {resource.status === 'manutencao' && 'Manutenção'}
                            {resource.status === 'inativo' && 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>{resource.location || "-"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24">
                        Nenhum recurso cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
