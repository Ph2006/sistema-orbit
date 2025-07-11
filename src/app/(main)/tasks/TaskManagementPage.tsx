"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '../layout';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Plus, Edit, Trash2, CheckCircle, Clock, AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assignedTo: string;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskFormData {
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assignedTo: string;
  dueDate: Date | null;
}

const defaultFormData: TaskFormData = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  assignedTo: '',
  dueDate: null,
};

const getStatusProps = (status: string) => {
  switch (status) {
    case 'pending':
      return { variant: 'secondary' as const, icon: Clock, label: 'Pendente', colorClass: '' };
    case 'in-progress':
      return { variant: 'default' as const, icon: User, label: 'Em Progresso', colorClass: 'bg-blue-500 hover:bg-blue-600' };
    case 'completed':
      return { variant: 'default' as const, icon: CheckCircle, label: 'Concluída', colorClass: 'bg-green-600 hover:bg-green-700' };
    default:
      return { variant: 'outline' as const, icon: AlertTriangle, label: 'Indefinido', colorClass: '' };
  }
};

const getPriorityProps = (priority: string) => {
  switch (priority) {
    case 'low':
      return { variant: 'outline' as const, label: 'Baixa', colorClass: 'text-green-600 border-green-600' };
    case 'medium':
      return { variant: 'outline' as const, label: 'Média', colorClass: 'text-yellow-600 border-yellow-600' };
    case 'high':
      return { variant: 'destructive' as const, label: 'Alta', colorClass: '' };
    default:
      return { variant: 'outline' as const, label: 'Indefinida', colorClass: '' };
  }
};

export default function TaskManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<TaskFormData>(defaultFormData);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const fetchTasks = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'companies', 'mecald', 'tasks'));
      const tasksList = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          assignedTo: data.assignedTo,
          dueDate: data.dueDate?.toDate() || null,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as Task;
      });
      setTasks(tasksList);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao buscar tarefas',
        description: 'Ocorreu um erro ao carregar a lista de tarefas.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchTasks();
    }
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      if (isEditing && selectedTask) {
        await updateDoc(doc(db, 'companies', 'mecald', 'tasks', selectedTask.id), {
          ...formData,
          dueDate: formData.dueDate || null,
          updatedAt: new Date(),
        });
        toast({
          title: 'Tarefa atualizada!',
          description: 'A tarefa foi atualizada com sucesso.',
        });
      } else {
        await addDoc(collection(db, 'companies', 'mecald', 'tasks'), {
          ...formData,
          dueDate: formData.dueDate || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        toast({
          title: 'Tarefa criada!',
          description: 'A nova tarefa foi criada com sucesso.',
        });
      }
      
      setIsDialogOpen(false);
      setFormData(defaultFormData);
      setIsEditing(false);
      setSelectedTask(null);
      fetchTasks();
    } catch (error) {
      console.error('Error saving task:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar tarefa',
        description: 'Não foi possível salvar a tarefa.',
      });
    }
  };

  const handleEdit = (task: Task) => {
    setSelectedTask(task);
    setFormData({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo,
      dueDate: task.dueDate,
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'companies', 'mecald', 'tasks', taskId));
      toast({
        title: 'Tarefa excluída!',
        description: 'A tarefa foi removida com sucesso.',
      });
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir tarefa',
        description: 'Não foi possível excluir a tarefa.',
      });
    }
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsSheetOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Carregando...</CardDescription>
            </CardHeader>
          </Card>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
        <Button onClick={() => {
          setFormData(defaultFormData);
          setIsEditing(false);
          setSelectedTask(null);
          setIsDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Tarefa
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Tarefas</CardTitle>
          <CardDescription>Gerencie e acompanhe todas as tarefas da equipe.</CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhuma tarefa encontrada.</p>
              <Button
                onClick={() => {
                  setFormData(defaultFormData);
                  setIsEditing(false);
                  setSelectedTask(null);
                  setIsDialogOpen(true);
                }}
                className="mt-4"
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar primeira tarefa
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => {
                  const statusProps = getStatusProps(task.status);
                  const priorityProps = getPriorityProps(task.priority);
                  return (
                    <TableRow key={task.id} onClick={() => handleViewTask(task)} className="cursor-pointer">
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>{task.assignedTo || 'Não atribuído'}</TableCell>
                      <TableCell>
                        <Badge variant={priorityProps.variant} className={priorityProps.colorClass}>
                          {priorityProps.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusProps.variant} className={statusProps.colorClass}>
                          <statusProps.icon className="mr-2 h-4 w-4" />
                          {statusProps.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {task.dueDate ? format(task.dueDate, 'dd/MM/yyyy') : 'Sem prazo'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(task);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(task.id);
                            }}
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

      {/* Dialog para criar/editar tarefa */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Atualize as informações da tarefa.' : 'Preencha os dados para criar uma nova tarefa.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Digite o título da tarefa"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva a tarefa em detalhes"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: 'low' | 'medium' | 'high') => 
                    setFormData({ ...formData, priority: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'pending' | 'in-progress' | 'completed') => 
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in-progress">Em Progresso</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignedTo">Responsável</Label>
              <Input
                id="assignedTo"
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                placeholder="Nome do responsável"
              />
            </div>

            <div className="space-y-2">
              <Label>Prazo</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dueDate ? format(formData.dueDate, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dueDate || undefined}
                    onSelect={(date) => setFormData({ ...formData, dueDate: date || null })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {isEditing ? 'Atualizar' : 'Criar'} Tarefa
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sheet para visualizar tarefa */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent>
          {selectedTask && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedTask.title}</SheetTitle>
                <SheetDescription>
                  Criada em {format(selectedTask.createdAt, 'dd/MM/yyyy')}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 py-6">
                <div>
                  <Label className="text-sm font-medium">Descrição</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedTask.description || 'Sem descrição'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <div className="mt-1">
                      <Badge variant={getStatusProps(selectedTask.status).variant} className={getStatusProps(selectedTask.status).colorClass}>
                        <getStatusProps(selectedTask.status).icon className="mr-2 h-4 w-4" />
                        {getStatusProps(selectedTask.status).label}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Prioridade</Label>
                    <div className="mt-1">
                      <Badge variant={getPriorityProps(selectedTask.priority).variant} className={getPriorityProps(selectedTask.priority).colorClass}>
                        {getPriorityProps(selectedTask.priority).label}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Responsável</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedTask.assignedTo || 'Não atribuído'}
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Prazo</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedTask.dueDate ? format(selectedTask.dueDate, 'dd/MM/yyyy') : 'Sem prazo definido'}
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Última atualização</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {format(selectedTask.updatedAt, 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
              <SheetFooter>
                <Button
                  onClick={() => {
                    setIsSheetOpen(false);
                    handleEdit(selectedTask);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar Tarefa
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
