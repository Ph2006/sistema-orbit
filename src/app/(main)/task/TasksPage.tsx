// utils/taskUtils.ts
import { format, addDays, isBefore, isAfter, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface TaskAnalytics {
  onTimeRate: number;
  averageDelay: number;
  productivityRate: number;
  resourceUtilization: { [key: string]: number };
  weeklyTrend: number[];
}

export const calculateTaskAnalytics = (tasks: any[]): TaskAnalytics => {
  const completedTasks = tasks.filter(t => t.status === 'concluida');
  const onTimeTasks = completedTasks.filter(t => 
    t.actualEndDate && t.actualEndDate <= t.endDate
  );
  
  const onTimeRate = completedTasks.length > 0 ? 
    (onTimeTasks.length / completedTasks.length) * 100 : 0;

  const totalDelay = completedTasks.reduce((acc, task) => {
    if (task.actualEndDate && isAfter(task.actualEndDate, task.endDate)) {
      return acc + differenceInDays(task.actualEndDate, task.endDate);
    }
    return acc;
  }, 0);
  
  const averageDelay = completedTasks.length > 0 ? totalDelay / completedTasks.length : 0;

  const productivityRate = completedTasks.reduce((acc, task) => {
    if (task.estimatedHours && task.actualHours) {
      return acc + ((task.estimatedHours / task.actualHours) * 100);
    }
    return acc;
  }, 0) / (completedTasks.filter(t => t.actualHours).length || 1);

  // Calcular utilização de recursos
  const resourceUtilization: { [key: string]: number } = {};
  const resourceTaskCounts: { [key: string]: number } = {};
  
  tasks.forEach(task => {
    if (task.assignedTo?.resourceId) {
      const resourceId = task.assignedTo.resourceId;
      resourceTaskCounts[resourceId] = (resourceTaskCounts[resourceId] || 0) + 1;
    }
  });

  Object.keys(resourceTaskCounts).forEach(resourceId => {
    const resourceTasks = tasks.filter(t => t.assignedTo?.resourceId === resourceId);
    const completedResourceTasks = resourceTasks.filter(t => t.status === 'concluida');
    resourceUtilization[resourceId] = resourceTasks.length > 0 ? 
      (completedResourceTasks.length / resourceTasks.length) * 100 : 0;
  });

  // Tendência semanal (últimas 4 semanas)
  const weeklyTrend = Array.from({ length: 4 }, (_, weekIndex) => {
    const weekStart = addDays(new Date(), -((3 - weekIndex) * 7 + 7));
    const weekEnd = addDays(weekStart, 6);
    
    const weekTasks = tasks.filter(task => 
      task.startDate >= weekStart && task.startDate <= weekEnd
    );
    
    const weekCompleted = weekTasks.filter(t => t.status === 'concluida');
    return weekTasks.length > 0 ? (weekCompleted.length / weekTasks.length) * 100 : 0;
  });

  return {
    onTimeRate,
    averageDelay,
    productivityRate,
    resourceUtilization,
    weeklyTrend
  };
};

export const getTaskPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'baixa': return 'text-gray-600';
    case 'media': return 'text-blue-600';
    case 'alta': return 'text-orange-600';
    case 'urgente': return 'text-red-600';
    default: return 'text-gray-600';
  }
};

export const getTaskStatusColor = (status: string): string => {
  switch (status) {
    case 'pendente': return 'text-yellow-600';
    case 'em_andamento': return 'text-blue-600';
    case 'concluida': return 'text-green-600';
    case 'cancelada': return 'text-red-600';
    default: return 'text-gray-600';
  }
};

export const formatTaskDuration = (hours: number): string => {
  if (hours < 1) {
    return `${Math.round(hours * 60)}min`;
  } else if (hours < 8) {
    return `${hours}h`;
  } else {
    const days = Math.floor(hours / 8);
    const remainingHours = hours % 8;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
};

export const isTaskOverdue = (task: any): boolean => {
  return task.status !== 'concluida' && isBefore(task.endDate, new Date());
};

export const getTaskProgress = (task: any): number => {
  if (task.status === 'concluida') return 100;
  if (task.status === 'pendente') return 0;
  if (task.status === 'cancelada') return 0;
  
  // Para tarefas em andamento, calcular baseado no tempo decorrido
  if (task.status === 'em_andamento' && task.actualStartDate) {
    const totalDuration = differenceInDays(task.endDate, task.startDate);
    const elapsedDuration = differenceInDays(new Date(), task.actualStartDate);
    return Math.min(90, Math.max(10, (elapsedDuration / totalDuration) * 100));
  }
  
  return 10; // 10% para tarefas em andamento sem data de início real
};

// hooks/useTaskSync.ts
import { useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const useTaskSync = (onTasksUpdate: (tasks: any[]) => void) => {
  const syncTasks = useCallback(() => {
    const tasksRef = collection(db, "companies", "mecald", "tasks");
    
    const unsubscribe = onSnapshot(tasksRef, (snapshot) => {
      const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: doc.data().startDate?.toDate() || new Date(),
        endDate: doc.data().endDate?.toDate() || new Date(),
        actualStartDate: doc.data().actualStartDate?.toDate(),
        actualEndDate: doc.data().actualEndDate?.toDate(),
      })) as Task[];
    } catch (error) {
      console.error("Erro ao buscar tarefas por recurso:", error);
      throw error;
    }
  }

  static async getTasksBySupervisor(supervisorId: string): Promise<Task[]> {
    try {
      const q = query(
        this.collection,
        where('supervisor.memberId', '==', supervisorId),
        orderBy('startDate', 'desc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: doc.data().startDate?.toDate() || new Date(),
        endDate: doc.data().endDate?.toDate() || new Date(),
        actualStartDate: doc.data().actualStartDate?.toDate(),
        actualEndDate: doc.data().actualEndDate?.toDate(),
      })) as Task[];
    } catch (error) {
      console.error("Erro ao buscar tarefas por supervisor:", error);
      throw error;
    }
  }
}

// components/TaskKanban.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, User, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TaskKanbanProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export const TaskKanban: React.FC<TaskKanbanProps> = ({ tasks, onTaskClick }) => {
  const columns = [
    { id: 'pendente', title: 'Pendente', color: 'bg-yellow-100 border-yellow-300' },
    { id: 'em_andamento', title: 'Em Andamento', color: 'bg-blue-100 border-blue-300' },
    { id: 'concluida', title: 'Concluída', color: 'bg-green-100 border-green-300' },
    { id: 'cancelada', title: 'Cancelada', color: 'bg-red-100 border-red-300' },
  ];

  const getTasksByStatus = (status: string) => 
    tasks.filter(task => task.status === status);

  const isOverdue = (task: Task) => 
    task.status !== 'concluida' && new Date() > task.endDate;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {columns.map(column => {
        const columnTasks = getTasksByStatus(column.id);
        
        return (
          <div key={column.id} className="space-y-4">
            <Card className={`${column.color} border-2`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  {column.title}
                  <Badge variant="secondary">{columnTasks.length}</Badge>
                </CardTitle>
              </CardHeader>
            </Card>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {columnTasks.map(task => (
                <Card 
                  key={task.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onTaskClick(task)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-sm leading-tight">
                          {task.title}
                        </h4>
                        {isOverdue(task) && (
                          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 ml-2" />
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(task.startDate, 'dd/MM', { locale: ptBR })} - 
                          {format(task.endDate, 'dd/MM', { locale: ptBR })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {task.assignedTo?.resourceName?.charAt(0) || 'R'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">
                            {task.assignedTo?.resourceName}
                          </span>
                        </div>

                        <Badge 
                          variant={
                            task.priority === 'urgente' ? 'destructive' :
                            task.priority === 'alta' ? 'default' :
                            task.priority === 'media' ? 'secondary' :
                            'outline'
                          }
                          className="text-xs"
                        >
                          {task.priority}
                        </Badge>
                      </div>

                      {task.estimatedHours && (
                        <div className="text-xs text-muted-foreground">
                          {formatTaskDuration(task.estimatedHours)} estimado
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {columnTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Nenhuma tarefa</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// components/TaskFilters.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Filter, X, Search } from 'lucide-react';

interface TaskFiltersProps {
  filters: TaskFilter;
  onFiltersChange: (filters: TaskFilter) => void;
  resources: Resource[];
  teamMembers: TeamMember[];
}

export const TaskFilters: React.FC<TaskFiltersProps> = ({
  filters,
  onFiltersChange,
  resources,
  teamMembers
}) => {
  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.keys(filters).some(key => 
    filters[key] && filters[key] !== 'all'
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros:</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tarefas..."
              className="pl-9 w-64"
              // value={searchQuery}
              // onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select 
            value={filters.status || 'all'} 
            onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
          >
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

          <Select 
            value={filters.priority || 'all'} 
            onValueChange={(value) => onFiltersChange({ ...filters, priority: value })}
          >
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

          <Select 
            value={filters.resource || 'all'} 
            onValueChange={(value) => onFiltersChange({ ...filters, resource: value })}
          >
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

          <Select 
            value={filters.supervisor || 'all'} 
            onValueChange={(value) => onFiltersChange({ ...filters, supervisor: value })}
          >
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

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-2" />
              Limpar Filtros
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// components/TaskChart.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface TaskChartProps {
  tasks: Task[];
}

export const TaskChart: React.FC<TaskChartProps> = ({ tasks }) => {
  // Dados para gráfico de barras (tarefas por semana)
  const weeklyData = Array.from({ length: 4 }, (_, index) => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((3 - index) * 7));
    
    const weekTasks = tasks.filter(task => {
      const taskWeek = new Date(task.startDate);
      return Math.abs(taskWeek.getTime() - weekStart.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    });

    return {
      semana: `Sem ${index + 1}`,
      pendente: weekTasks.filter(t => t.status === 'pendente').length,
      em_andamento: weekTasks.filter(t => t.status === 'em_andamento').length,
      concluida: weekTasks.filter(t => t.status === 'concluida').length,
    };
  });

  // Dados para gráfico de pizza (distribuição por status)
  const statusData = [
    { name: 'Pendente', value: tasks.filter(t => t.status === 'pendente').length, color: '#f59e0b' },
    { name: 'Em Andamento', value: tasks.filter(t => t.status === 'em_andamento').length, color: '#3b82f6' },
    { name: 'Concluída', value: tasks.filter(t => t.status === 'concluida').length, color: '#10b981' },
    { name: 'Cancelada', value: tasks.filter(t => t.status === 'cancelada').length, color: '#ef4444' },
  ].filter(item => item.value > 0);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Tarefas por Semana</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="semana" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="pendente" stackId="a" fill="#f59e0b" />
              <Bar dataKey="em_andamento" stackId="a" fill="#3b82f6" />
              <Bar dataKey="concluida" stackId="a" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

// components/TaskTimeline.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Calendar, User } from 'lucide-react';

interface TaskTimelineProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export const TaskTimeline: React.FC<TaskTimelineProps> = ({ tasks, onTaskClick }) => {
  const sortedTasks = [...tasks].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const getDateLabel = (date: Date) => {
    if (isToday(date)) return 'Hoje';
    if (isTomorrow(date)) return 'Amanhã';
    if (isYesterday(date)) return 'Ontem';
    return format(date, "eeee, dd 'de' MMMM", { locale: ptBR });
  };

  const groupedTasks = sortedTasks.reduce((groups, task) => {
    const dateKey = format(task.startDate, 'yyyy-MM-dd');
    if (!groups[dateKey]) {
      groups[dateKey] = {
        date: task.startDate,
        tasks: []
      };
    }
    groups[dateKey].tasks.push(task);
    return groups;
  }, {} as Record<string, { date: Date; tasks: Task[] }>);

  return (
    <div className="space-y-6">
      {Object.values(groupedTasks).map(({ date, tasks: dayTasks }) => (
        <Card key={format(date, 'yyyy-MM-dd')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {getDateLabel(date)}
              <Badge variant="secondary">{dayTasks.length} tarefa{dayTasks.length !== 1 ? 's' : ''}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dayTasks.map(task => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onTaskClick(task)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{task.title}</h4>
                      {task.isFromOrder && (
                        <Badge variant="outline" className="text-xs">Pedido</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {task.assignedTo?.resourceName}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTaskDuration(task.estimatedHours)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusBadge(task.status)}
                    {getPriorityBadge(task.priority)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {Object.keys(groupedTasks).length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma tarefa no período</h3>
            <p className="text-muted-foreground">
              Não há tarefas programadas para o período selecionado.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Export all utilities and components
export {
  TaskService,
  TaskCalendar,
  TaskMetrics,
  TaskKanban,
  TaskFilters,
  TaskChart,
  TaskTimeline,
  useTaskSync,
  useOrderTaskSync,
  calculateTaskAnalytics,
  getTaskPriorityColor,
  getTaskStatusColor,
  formatTaskDuration,
  isTaskOverdue,
  getTaskProgress
};dDate?.toDate() || new Date(),
        actualStartDate: doc.data().actualStartDate?.toDate(),
        actualEndDate: doc.data().actualEndDate?.toDate(),
      }));
      
      onTasksUpdate(tasks);
    });

    return unsubscribe;
  }, [onTasksUpdate]);

  useEffect(() => {
    const unsubscribe = syncTasks();
    return unsubscribe;
  }, [syncTasks]);
};

// hooks/useOrderTaskSync.ts
export const useOrderTaskSync = () => {
  const syncWithOrders = useCallback(async () => {
    try {
      // Buscar pedidos com tarefas pendentes
      const ordersRef = collection(db, "companies", "mecald", "orders");
      const ordersSnapshot = await getDocs(ordersRef);
      
      const pendingOrderTasks: any[] = [];
      
      ordersSnapshot.docs.forEach(orderDoc => {
        const orderData = orderDoc.data();
        
        if (orderData.items && Array.isArray(orderData.items)) {
          orderData.items.forEach((item: any, itemIndex: number) => {
            if (item.productionPlan && Array.isArray(item.productionPlan)) {
              item.productionPlan.forEach((stage: any, stageIndex: number) => {
                if (stage.status === 'Pendente' || stage.status === 'Em Andamento') {
                  pendingOrderTasks.push({
                    orderId: orderDoc.id,
                    itemId: item.id,
                    stageIndex,
                    stageName: stage.stageName,
                    status: stage.status,
                    duration: stage.durationDays || 1,
                    startDate: stage.startDate?.toDate(),
                    endDate: stage.completedDate?.toDate(),
                    orderNumber: orderData.quotationNumber || orderData.orderNumber,
                    itemDescription: item.description,
                  });
                }
              });
            }
          });
        }
      });
      
      return pendingOrderTasks;
      
    } catch (error) {
      console.error("Erro ao sincronizar tarefas dos pedidos:", error);
      return [];
    }
  }, []);

  return { syncWithOrders };
};

// components/TaskCalendar.tsx
import React from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'pt-BR': ptBR,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface TaskCalendarProps {
  tasks: any[];
  onTaskSelect: (task: any) => void;
}

export const TaskCalendar: React.FC<TaskCalendarProps> = ({ tasks, onTaskSelect }) => {
  const events = tasks.map(task => ({
    id: task.id,
    title: task.title,
    start: task.startDate,
    end: task.endDate,
    resource: task,
    style: {
      backgroundColor: 
        task.status === 'concluida' ? '#10b981' :
        task.status === 'em_andamento' ? '#3b82f6' :
        task.status === 'pendente' ? '#f59e0b' :
        '#ef4444',
    },
  }));

  return (
    <div style={{ height: 500 }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        onSelectEvent={(event) => onTaskSelect(event.resource)}
        culture="pt-BR"
        messages={{
          next: "Próximo",
          previous: "Anterior",
          today: "Hoje",
          month: "Mês",
          week: "Semana",
          day: "Dia",
          agenda: "Agenda",
          date: "Data",
          time: "Hora",
          event: "Tarefa",
          noEventsInRange: "Não há tarefas neste período.",
        }}
        eventPropGetter={(event) => ({
          style: event.style,
        })}
      />
    </div>
  );
};

// components/TaskMetrics.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Target, Clock } from 'lucide-react';

interface TaskMetricsProps {
  analytics: TaskAnalytics;
}

export const TaskMetrics: React.FC<TaskMetricsProps> = ({ analytics }) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taxa de Pontualidade</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.onTimeRate.toFixed(1)}%</div>
          <Progress value={analytics.onTimeRate} className="mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Atraso Médio</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.averageDelay.toFixed(1)} dias</div>
          <p className="text-xs text-muted-foreground">
            {analytics.averageDelay <= 1 ? 'Excelente' : 
             analytics.averageDelay <= 3 ? 'Bom' : 'Precisa melhorar'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Produtividade</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.productivityRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">
            Eficiência horas estimadas vs reais
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tendência Semanal</CardTitle>
          {analytics.weeklyTrend[3] > analytics.weeklyTrend[0] ? 
            <TrendingUp className="h-4 w-4 text-green-500" /> :
            <TrendingDown className="h-4 w-4 text-red-500" />
          }
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {analytics.weeklyTrend[3]?.toFixed(1) || 0}%
          </div>
          <p className="text-xs text-muted-foreground">
            Conclusão esta semana
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// types/task.ts
export interface Task {
  id?: string;
  title: string;
  description?: string;
  assignedTo: {
    resourceId: string;
    resourceName: string;
  };
  supervisor: {
    memberId: string;
    memberName: string;
  };
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  estimatedHours: number;
  startDate: Date;
  endDate: Date;
  actualStartDate?: Date;
  actualEndDate?: Date;
  actualHours?: number;
  notes?: string;
  relatedOrderId?: string;
  relatedItemId?: string;
  relatedStageIndex?: number;
  isFromOrder: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  status: string;
  location?: string;
  capacity?: number;
  serialNumber?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  position: string;
  email: string;
  phone?: string;
  permission: string;
}

export interface TaskFilter {
  status?: string;
  priority?: string;
  resource?: string;
  supervisor?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// services/taskService.ts
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  Timestamp,
  query,
  where,
  orderBy 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export class TaskService {
  private static collection = collection(db, "companies", "mecald", "tasks");

  static async getAllTasks(): Promise<Task[]> {
    try {
      const snapshot = await getDocs(this.collection);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: doc.data().startDate?.toDate() || new Date(),
        endDate: doc.data().endDate?.toDate() || new Date(),
        actualStartDate: doc.data().actualStartDate?.toDate(),
        actualEndDate: doc.data().actualEndDate?.toDate(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
      })) as Task[];
    } catch (error) {
      console.error("Erro ao buscar tarefas:", error);
      throw error;
    }
  }

  static async createTask(task: Omit<Task, 'id'>): Promise<string> {
    try {
      const taskDoc = doc(this.collection);
      const taskData = {
        ...task,
        startDate: Timestamp.fromDate(task.startDate),
        endDate: Timestamp.fromDate(task.endDate),
        actualStartDate: task.actualStartDate ? Timestamp.fromDate(task.actualStartDate) : null,
        actualEndDate: task.actualEndDate ? Timestamp.fromDate(task.actualEndDate) : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      
      await setDoc(taskDoc, taskData);
      return taskDoc.id;
    } catch (error) {
      console.error("Erro ao criar tarefa:", error);
      throw error;
    }
  }

  static async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
    try {
      const taskDoc = doc(this.collection, taskId);
      const updateData = {
        ...updates,
        startDate: updates.startDate ? Timestamp.fromDate(updates.startDate) : undefined,
        endDate: updates.endDate ? Timestamp.fromDate(updates.endDate) : undefined,
        actualStartDate: updates.actualStartDate ? Timestamp.fromDate(updates.actualStartDate) : undefined,
        actualEndDate: updates.actualEndDate ? Timestamp.fromDate(updates.actualEndDate) : undefined,
        updatedAt: Timestamp.now(),
      };

      // Remove campos undefined
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      await updateDoc(taskDoc, updateData);
    } catch (error) {
      console.error("Erro ao atualizar tarefa:", error);
      throw error;
    }
  }

  static async deleteTask(taskId: string): Promise<void> {
    try {
      await this.updateTask(taskId, { status: 'cancelada' });
    } catch (error) {
      console.error("Erro ao deletar tarefa:", error);
      throw error;
    }
  }

  static async getTasksByDateRange(startDate: Date, endDate: Date): Promise<Task[]> {
    try {
      const q = query(
        this.collection,
        where('startDate', '>=', Timestamp.fromDate(startDate)),
        where('startDate', '<=', Timestamp.fromDate(endDate)),
        orderBy('startDate', 'asc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: doc.data().startDate?.toDate() || new Date(),
        endDate: doc.data().endDate?.toDate() || new Date(),
        actualStartDate: doc.data().actualStartDate?.toDate(),
        actualEndDate: doc.data().actualEndDate?.toDate(),
      })) as Task[];
    } catch (error) {
      console.error("Erro ao buscar tarefas por período:", error);
      throw error;
    }
  }

  static async getTasksByResource(resourceId: string): Promise<Task[]> {
    try {
      const q = query(
        this.collection,
        where('assignedTo.resourceId', '==', resourceId),
        orderBy('startDate', 'desc')
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        startDate: doc.data().startDate?.toDate() || new Date(),
        endDate: doc.data().en
