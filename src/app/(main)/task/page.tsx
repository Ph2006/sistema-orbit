'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  CheckSquare, 
  Plus, 
  Calendar as CalendarIcon, 
  User, 
  Filter, 
  Search, 
  Edit, 
  Trash2, 
  Clock, 
  AlertTriangle,
  FileText,
  Download,
  BarChart3,
  Settings,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, addDays, isAfter, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Task, Resource, TeamMember, TaskMetrics } from './types';
import { 
  calculateTaskMetrics, 
  filterTasks, 
  groupTasksByStatus, 
  getStatusConfig, 
  getPriorityConfig,
  validateTaskDates,
  checkResourceConflicts,
  formatDate,
  formatDateTime,
  generateSampleTasks,
  generateSampleResources,
  generateSampleTeamMembers
} from './utils';
import { TaskNotifications, TaskAlertsWidget } from './components/TaskNotifications';

export const metadata: Metadata = {
  title: 'Tarefas | Sistema de Gestão',
  description: 'Gerencie suas tarefas e projetos com controle completo',
};

export default function TaskPage() {
  // Estados principais
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados de interface
  const [view, setView] = useState<'list' | 'kanban' | 'calendar' | 'dashboard'>('list');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  // Estados de filtros
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    resourceId: '',
    responsibleId: '',
    search: ''
  });

  // Estados do formulário
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    resourceId: '',
    responsibleId: '',
    priority: 'media' as const,
    plannedStartDate: new Date(),
    plannedEndDate: addDays(new Date(), 1),
    estimatedHours: 8,
    orderId: '',
    orderNumber: '',
    itemId: '',
    itemDescription: '',
    stage: ''
  });

  // Carregar dados iniciais
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Simular carregamento de dados do Firestore
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Usar dados de exemplo para demonstração
        const sampleTasks = generateSampleTasks();
        const sampleResources = generateSampleResources();
        const sampleTeamMembers = generateSampleTeamMembers();
        
        setTasks(sampleTasks);
        setResources(sampleResources);
        setTeamMembers(sampleTeamMembers);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Calcular métricas
  const metrics = useMemo(() => calculateTaskMetrics(tasks), [tasks]);

  // Filtrar tarefas
  const filteredTasks = useMemo(() => {
    return filterTasks(tasks, filters);
  }, [tasks, filters]);

  // Agrupar tarefas para Kanban
  const groupedTasks = useMemo(() => groupTasksByStatus(filteredTasks), [filteredTasks]);

  // Tarefas do calendário
  const calendarTasks = useMemo(() => {
    if (!selectedDate) return [];
    return filteredTasks.filter(task => {
      const taskStart = startOfDay(task.plannedStartDate);
      const taskEnd = startOfDay(task.plannedEndDate);
      const selected = startOfDay(selectedDate);
      return !isBefore(selected, taskStart) && !isAfter(selected, taskEnd);
    });
  }, [filteredTasks, selectedDate]);

  // Handlers
  const handleCreateTask = () => {
    const newTask: Task = {
      id: Date.now().toString(),
      ...formData,
      status: 'pendente',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setTasks(prev => [...prev, newTask]);
    setIsCreateDialogOpen(false);
    resetForm();
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      resourceId: task.resourceId,
      responsibleId: task.responsibleId,
      priority: task.priority,
      plannedStartDate: task.plannedStartDate,
      plannedEndDate: task.plannedEndDate,
      estimatedHours: task.estimatedHours || 8,
      orderId: task.orderId || '',
      orderNumber: task.orderNumber || '',
      itemId: task.itemId || '',
      itemDescription: task.itemDescription || '',
      stage: task.stage || ''
    });
    setIsCreateDialogOpen(true);
  };

  const handleUpdateTask = () => {
    if (!editingTask) return;

    const updatedTask: Task = {
      ...editingTask,
      ...formData,
      updatedAt: new Date()
    };

    setTasks(prev => prev.map(t => t.id === editingTask.id ? updatedTask : t));
    setIsCreateDialogOpen(false);
    setEditingTask(null);
    resetForm();
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleStatusChange = (taskId: string, newStatus: Task['status']) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: newStatus, updatedAt: new Date() }
        : task
    ));
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      resourceId: '',
      responsibleId: '',
      priority: 'media',
      plannedStartDate: new Date(),
      plannedEndDate: addDays(new Date(), 1),
      estimatedHours: 8,
      orderId: '',
      orderNumber: '',
      itemId: '',
      itemDescription: '',
      stage: ''
    });
    setEditingTask(null);
  };

  const handleTaskClick = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      handleEditTask(task);
    }
  };

  // Gerar relatório PDF
  const generatePDFReport = () => {
    // Implementação do relatório PDF seria feita aqui
    console.log('Gerando relatório PDF...');
  };

  // Exportar CSV
  const exportCSV = () => {
    const csvContent = [
      ['Título', 'Status', 'Prioridade', 'Recurso', 'Responsável', 'Início', 'Fim', 'Horas Estimadas'],
      ...filteredTasks.map(task => [
        task.title,
        getStatusConfig(task.status).label,
        getPriorityConfig(task.priority).label,
        resources.find(r => r.id === task.resourceId)?.name || '',
        teamMembers.find(t => t.id === task.responsibleId)?.name || '',
        formatDate(task.plannedStartDate),
        formatDate(task.plannedEndDate),
        task.estimatedHours?.toString() || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tarefas-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Carregando tarefas...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
        <div className="flex items-center space-x-2">
          <TaskNotifications 
            tasks={tasks}
            resources={resources}
            teamMembers={teamMembers}
            onTaskClick={handleTaskClick}
          />
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filtros
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalTasks}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.pendingTasks} pendentes, {metrics.inProgressTasks} em andamento
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.inProgressTasks}</div>
            <p className="text-xs text-muted-foreground">Tarefas ativas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.completedTasks}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.onTimeRate.toFixed(1)}% no prazo
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Atraso</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.overdueTasks}</div>
            <p className="text-xs text-muted-foreground">Tarefas atrasadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      <TaskAlertsWidget 
        tasks={tasks}
        resources={resources}
        teamMembers={teamMembers}
      />

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <Input
                placeholder="Buscar tarefas..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prioridade</label>
              <Select value={filters.priority} onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as prioridades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Recurso</label>
              <Select value={filters.resourceId} onValueChange={(value) => setFilters(prev => ({ ...prev, resourceId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os recursos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {resources.map(resource => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Responsável</label>
              <Select value={filters.responsibleId} onValueChange={(value) => setFilters(prev => ({ ...prev, responsibleId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os responsáveis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visualizações */}
      <Tabs value={view} onValueChange={(value) => setView(value as any)} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="calendar">Calendário</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={generatePDFReport}>
              <FileText className="mr-2 h-4 w-4" />
              Relatório PDF
            </Button>
          </div>
        </div>

        {/* Visualização em Lista */}
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Tarefas</CardTitle>
              <CardDescription>
                {filteredTasks.length} tarefa(s) encontrada(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma tarefa encontrada</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm">
                    Tente ajustar os filtros ou criar uma nova tarefa.
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Tarefa
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Recurso</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map(task => {
                      const resource = resources.find(r => r.id === task.resourceId);
                      const responsible = teamMembers.find(t => t.id === task.responsibleId);
                      const statusConfig = getStatusConfig(task.status);
                      const priorityConfig = getPriorityConfig(task.priority);
                      const isOverdue = task.status !== 'concluida' && task.status !== 'cancelada' && isAfter(new Date(), task.plannedEndDate);

                      return (
                        <TableRow key={task.id} className={isOverdue ? 'bg-red-50' : ''}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{task.title}</div>
                              {task.description && (
                                <div className="text-sm text-muted-foreground">{task.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${statusConfig.color} ${statusConfig.textColor}`}>
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${priorityConfig.color} ${priorityConfig.textColor}`}>
                              {priorityConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{resource?.name}</div>
                              <div className="text-muted-foreground">{resource?.location}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{responsible?.name}</div>
                              <div className="text-muted-foreground">{responsible?.position}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {formatDate(task.plannedStartDate)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {formatDate(task.plannedEndDate)}
                              {isOverdue && (
                                <div className="text-red-600 text-xs">Atrasado</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditTask(task)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTask(task.id!)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visualização Kanban */}
        <TabsContent value="kanban" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Object.entries(groupedTasks).map(([status, statusTasks]) => {
              const statusConfig = getStatusConfig(status);
              return (
                <Card key={status}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center">
                        <div className={`w-3 h-3 rounded-full ${statusConfig.color} mr-2`}></div>
                        {statusConfig.label}
                      </span>
                      <Badge variant="secondary">{statusTasks.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96">
                      <div className="space-y-2">
                        {statusTasks.map(task => {
                          const resource = resources.find(r => r.id === task.resourceId);
                          const responsible = teamMembers.find(t => t.id === task.responsibleId);
                          const priorityConfig = getPriorityConfig(task.priority);
                          const isOverdue = task.status !== 'concluida' && task.status !== 'cancelada' && isAfter(new Date(), task.plannedEndDate);

                          return (
                            <Card key={task.id} className={`cursor-pointer hover:shadow-md transition-shadow ${isOverdue ? 'border-red-200 bg-red-50' : ''}`}>
                              <CardContent className="p-3">
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between">
                                    <h4 className="font-medium text-sm">{task.title}</h4>
                                    <Badge className={`${priorityConfig.color} ${priorityConfig.textColor} text-xs`}>
                                      {priorityConfig.label}
                                    </Badge>
                                  </div>
                                  
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground">{task.description}</p>
                                  )}
                                  
                                  <div className="text-xs text-muted-foreground">
                                    <div>Recurso: {resource?.name}</div>
                                    <div>Responsável: {responsible?.name}</div>
                                    <div>Prazo: {formatDate(task.plannedEndDate)}</div>
                                    {isOverdue && (
                                      <div className="text-red-600 font-medium">ATRASADO</div>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center space-x-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditTask(task)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    {task.status === 'pendente' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleStatusChange(task.id!, 'em_andamento')}
                                        className="h-6 w-6 p-0"
                                      >
                                        <Play className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {task.status === 'em_andamento' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleStatusChange(task.id!, 'concluida')}
                                        className="h-6 w-6 p-0"
                                      >
                                        <CheckCircle className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Visualização Calendário */}
        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Calendário de Tarefas</CardTitle>
              <CardDescription>
                Visualize as tarefas em formato de calendário
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    className="rounded-md border"
                  />
                </div>
                <div>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Tarefas do Dia
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedDate ? (
                        <div className="space-y-2">
                          {calendarTasks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Nenhuma tarefa para {format(selectedDate, 'dd/MM/yyyy')}
                            </p>
                          ) : (
                            calendarTasks.map(task => {
                              const statusConfig = getStatusConfig(task.status);
                              const priorityConfig = getPriorityConfig(task.priority);
                              const resource = resources.find(r => r.id === task.resourceId);

                              return (
                                <Card key={task.id} className="p-3">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-medium text-sm">{task.title}</h4>
                                      <Badge className={`${statusConfig.color} ${statusConfig.textColor} text-xs`}>
                                        {statusConfig.label}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      <div>Recurso: {resource?.name}</div>
                                      <div>Prioridade: {priorityConfig.label}</div>
                                      <div>Horas: {task.estimatedHours}h</div>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditTask(task)}
                                      className="w-full"
                                    >
                                      Ver Detalhes
                                    </Button>
                                  </div>
                                </Card>
                              );
                            })
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Selecione uma data para ver as tarefas
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Performance Geral */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Performance Geral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Taxa de Pontualidade</span>
                    <span className="font-medium">{metrics.onTimeRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={metrics.onTimeRate} className="mt-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Tempo Médio de Conclusão</span>
                    <span className="font-medium">{metrics.averageCompletionTime.toFixed(1)}h</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance por Recurso */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Performance por Recurso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(metrics.resourceEfficiency).map(([resourceId, efficiency]) => {
                    const resource = resources.find(r => r.id === resourceId);
                    return (
                      <div key={resourceId}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{resource?.name || resourceId}</span>
                          <span className="font-medium">{efficiency.toFixed(1)}%</span>
                        </div>
                        <Progress value={Math.abs(efficiency)} className="mt-1" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Performance por Responsável */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tarefas Concluídas por Responsável</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(metrics.responsiblePerformance).map(([responsibleId, count]) => {
                    const responsible = teamMembers.find(t => t.id === responsibleId);
                    return (
                      <div key={responsibleId}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{responsible?.name || responsibleId}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <Progress value={(count / metrics.completedTasks) * 100} className="mt-1" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de Criação/Edição de Tarefa */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
            </DialogTitle>
            <DialogDescription>
              {editingTask ? 'Modifique os dados da tarefa' : 'Crie uma nova tarefa para o sistema'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Título *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Digite o título da tarefa"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Prioridade</label>
              <Select value={formData.priority} onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descreva a tarefa..."
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Recurso *</label>
              <Select value={formData.resourceId} onValueChange={(value) => setFormData(prev => ({ ...prev, resourceId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um recurso" />
                </SelectTrigger>
                <SelectContent>
                  {resources.filter(r => r.status === 'disponível').map(resource => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.name} - {resource.location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Responsável *</label>
              <Select value={formData.responsibleId} onValueChange={(value) => setFormData(prev => ({ ...prev, responsibleId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um responsável" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} - {member.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Data de Início *</label>
              <Input
                type="date"
                value={format(formData.plannedStartDate, 'yyyy-MM-dd')}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  plannedStartDate: new Date(e.target.value) 
                }))}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Data de Fim *</label>
              <Input
                type="date"
                value={format(formData.plannedEndDate, 'yyyy-MM-dd')}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  plannedEndDate: new Date(e.target.value) 
                }))}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Horas Estimadas</label>
              <Input
                type="number"
                value={formData.estimatedHours}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  estimatedHours: parseInt(e.target.value) || 0 
                }))}
                placeholder="8"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Número do Pedido</label>
              <Input
                value={formData.orderNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, orderNumber: e.target.value }))}
                placeholder="PC-2024-001"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={editingTask ? handleUpdateTask : handleCreateTask}
              disabled={!formData.title || !formData.resourceId || !formData.responsibleId}
            >
              {editingTask ? 'Atualizar' : 'Criar'} Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
