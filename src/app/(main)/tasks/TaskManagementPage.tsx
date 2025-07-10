"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, addDays, isWeekend, startOfDay, endOfDay } from "date-fns";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Activity,
  UserCheck,
  Edit3,
  Search,
  CheckSquare,
  X,
  RotateCcw,
  Ban,
  Crown,
  TrendingUp,
  Award
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

type TeamMember = {
  id: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  permission: string;
};

type Task = {
  id: string;
  orderId: string;
  orderNumber: string;
  itemId: string;
  itemDescription: string;
  stageName: string;
  stageIndex: number;
  status: string;
  originalStartDate: Date | null;
  originalCompletedDate: Date | null;
  originalDurationDays: number;
  customer: string;
  priority: 'alta' | 'media' | 'baixa';
  assignedResource?: string;
  assignedResourceName?: string;
  responsibleMember?: string;
  responsibleMemberName?: string;
  location?: string;
  actualStartDate?: Date;
  actualCompletedDate?: Date;
  reprogrammedDate?: Date;
  reprogrammedDuration?: number;
  reprogrammedReason?: string;
  taskNotes?: string;
  completedBy?: string;
  completedAt?: Date;
  selected?: boolean;
};

type TaskAssignment = {
  taskId: string;
  resourceId: string;
  resourceName: string;
  responsibleId: string;
  responsibleName: string;
  assignedAt: Date;
  notes?: string;
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

// Feriados nacionais brasileiros para 2024-2025
const brazilianHolidays = [
  // 2024
  new Date(2024, 0, 1),   // Ano Novo
  new Date(2024, 1, 12),  // Carnaval (Segunda-feira)
  new Date(2024, 1, 13),  // Carnaval (Terça-feira)  
  new Date(2024, 2, 29),  // Sexta-feira Santa
  new Date(2024, 3, 21),  // Tiradentes
  new Date(2024, 4, 1),   // Dia do Trabalho
  new Date(2024, 4, 30),  // Corpus Christi
  new Date(2024, 8, 7),   // Independência do Brasil
  new Date(2024, 9, 12),  // Nossa Senhora Aparecida
  new Date(2024, 10, 2),  // Finados
  new Date(2024, 10, 15), // Proclamação da República
  new Date(2024, 11, 25), // Natal
  // 2025
  new Date(2025, 0, 1),   // Ano Novo
  new Date(2025, 2, 3),   // Carnaval (Segunda-feira)
  new Date(2025, 2, 4),   // Carnaval (Terça-feira)
  new Date(2025, 3, 18),  // Sexta-feira Santa
  new Date(2025, 3, 21),  // Tiradentes
  new Date(2025, 4, 1),   // Dia do Trabalho
  new Date(2025, 5, 19),  // Corpus Christi
  new Date(2025, 8, 7),   // Independência do Brasil
  new Date(2025, 9, 12),  // Nossa Senhora Aparecida
  new Date(2025, 10, 2),  // Finados
  new Date(2025, 10, 15), // Proclamação da República
  new Date(2025, 11, 25), // Natal
];

// Funções utilitárias para cálculo de dias úteis
const isHoliday = (date: Date): boolean => {
  return brazilianHolidays.some(holiday => 
    holiday.getDate() === date.getDate() && 
    holiday.getMonth() === date.getMonth() && 
    holiday.getFullYear() === date.getFullYear()
  );
};

const isBusinessDay = (date: Date): boolean => {
  return !isWeekend(date) && !isHoliday(date);
};

const addBusinessDays = (startDate: Date, days: number): Date => {
  if (days === 0) return new Date(startDate);
  
  let currentDate = new Date(startDate);
  let remainingDays = Math.abs(days);
  const isAdding = days > 0;
  
  while (remainingDays > 0) {
    currentDate = addDays(currentDate, isAdding ? 1 : -1);
    if (isBusinessDay(currentDate)) {
      remainingDays--;
    }
  }
  return currentDate;
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
    case 'Concluída':
      return 'bg-green-100 text-green-800 hover:bg-green-100';
    case 'Em Andamento':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
    case 'Pendente':
      return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
    case 'Reprogramada':
      return 'bg-purple-100 text-purple-800 hover:bg-purple-100';
    case 'Atribuída':
      return 'bg-orange-100 text-orange-800 hover:bg-orange-100';
    default:
      return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Concluído':
    case 'Concluída':
      return <CheckCircle className="h-3 w-3 mr-1" />;
    case 'Em Andamento':
      return <PlayCircle className="h-3 w-3 mr-1" />;
    case 'Pendente':
      return <Hourglass className="h-3 w-3 mr-1" />;
    case 'Reprogramada':
      return <RotateCcw className="h-3 w-3 mr-1" />;
    case 'Atribuída':
      return <UserCheck className="h-3 w-3 mr-1" />;
    default:
      return <Hourglass className="h-3 w-3 mr-1" />;
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
    }
  };

  const selectedTasksCount = tasks.filter(task => task.selected).length;

  if (isLoading) {
};

export default function TaskManagementPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskAssignments, setTaskAssignments] = useState<TaskAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal states
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isRemoveAssignmentDialogOpen, setIsRemoveAssignmentDialogOpen] = useState(false);
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  // Assignment form states
  const [selectedResourceForAssign, setSelectedResourceForAssign] = useState<string>("");
  const [selectedResponsibleForAssign, setSelectedResponsibleForAssign] = useState<string>("");
  const [assignmentNotes, setAssignmentNotes] = useState<string>("");
  
  // Complete form states
  const [completionNotes, setCompletionNotes] = useState<string>("");
  
  // Reschedule form states
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleDuration, setRescheduleDuration] = useState<number>(1);
  const [rescheduleReason, setRescheduleReason] = useState<string>("");
  
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Fetch data functions
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

  const fetchTeamMembers = async () => {
    if (!user) return [];
    try {
      const teamRef = doc(db, "companies", "mecald", "settings", "team");
      const docSnap = await getDoc(teamRef);
      if (docSnap.exists()) {
        return docSnap.data().members || [];
      }
      return [];
    } catch (error) {
      console.error("Error fetching team members:", error);
      return [];
    }
  };

  const fetchTaskAssignments = async () => {
    if (!user) return [];
    try {
      const assignmentsRef = doc(db, "companies", "mecald", "settings", "taskAssignments");
      const docSnap = await getDoc(assignmentsRef);
      if (docSnap.exists()) {
        const assignments = docSnap.data().assignments || [];
        return assignments.map((assignment: any) => ({
          ...assignment,
          assignedAt: assignment.assignedAt?.toDate ? assignment.assignedAt.toDate() : new Date(),
        }));
      }
      return [];
    } catch (error) {
      console.error("Error fetching task assignments:", error);
      return [];
    }
  };

  const generateTasks = (ordersList: Order[], assignmentsList: TaskAssignment[]): Task[] => {
    const tasksList: Task[] = [];
    
    ordersList.forEach(order => {
      order.items.forEach(item => {
        if (item.productionPlan && item.productionPlan.length > 0) {
          item.productionPlan.forEach((stage, stageIndex) => {
            // Incluir tarefas Pendentes e Em Andamento
            if (stage.status === 'Pendente' || stage.status === 'Em Andamento') {
              const priority = getTaskPriority(order.deliveryDate);
              const taskId = `${order.id}-${item.id}-${stage.stageName}`;
              
              // Busca se existe atribuição para esta tarefa
              const assignment = assignmentsList.find(a => a.taskId === taskId);
              
              // Determinar o status da tarefa
              let taskStatus = stage.status; // 'Pendente' ou 'Em Andamento'
              if (stage.status === 'Pendente' && assignment) {
                taskStatus = 'Atribuída';
              }
              
              const task: Task = {
                id: taskId,
                orderId: order.id,
                orderNumber: order.quotationNumber,
                itemId: item.id,
                itemDescription: item.description,
                stageName: stage.stageName,
                stageIndex: stageIndex,
                status: taskStatus,
                originalStartDate: stage.startDate,
                originalCompletedDate: stage.completedDate,
                originalDurationDays: stage.durationDays || 1,
                customer: order.customer.name,
                priority: priority,
                assignedResource: assignment?.resourceId,
                assignedResourceName: assignment?.resourceName,
                responsibleMember: assignment?.responsibleId,
                responsibleMemberName: assignment?.responsibleName,
                taskNotes: assignment?.notes,
                selected: false,
              };
              
              tasksList.push(task);
            }
          });
        }
      });
    });
    
    return tasksList;
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersList, resourcesList, teamList, assignmentsList] = await Promise.all([
        fetchOrders(),
        fetchResources(),
        fetchTeamMembers(),
        fetchTaskAssignments()
      ]);
      
      setOrders(ordersList);
      setResources(resourcesList);
      setTeamMembers(teamList);
      setTaskAssignments(assignmentsList);
      
      const tasksList = generateTasks(ordersList, assignmentsList);
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
      const query = searchQuery.toLowerCase();
      const textMatch = 
        task.orderNumber.toLowerCase().includes(query) ||
        task.customer.toLowerCase().includes(query) ||
        task.itemDescription.toLowerCase().includes(query) ||
        task.stageName.toLowerCase().includes(query);

      const statusMatch = statusFilter === "all" || task.status === statusFilter;
      const priorityMatch = priorityFilter === "all" || task.priority === priorityFilter;
      
      let resourceMatch = true;
      if (resourceFilter === "unassigned") {
        resourceMatch = !task.assignedResource;
      } else if (resourceFilter !== "all") {
        resourceMatch = task.assignedResource === resourceFilter;
      }
      
      let responsibleMatch = true;
      if (responsibleFilter === "unassigned") {
        responsibleMatch = !task.responsibleMember;
      } else if (responsibleFilter !== "all") {
        responsibleMatch = task.responsibleMember === responsibleFilter;
      }

      return textMatch && statusMatch && priorityMatch && resourceMatch && responsibleMatch;
    });
  }, [tasks, searchQuery, statusFilter, priorityFilter, resourceFilter, responsibleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = tasks.length;
    const assigned = tasks.filter(t => t.status === 'Atribuída').length;
    const pending = tasks.filter(t => t.status === 'Pendente').length;
    const inProgress = tasks.filter(t => t.status === 'Em Andamento').length;
    const completed = tasks.filter(t => t.status === 'Concluído').length;
    const rescheduled = tasks.filter(t => t.status === 'Reprogramada').length;
    const highPriority = tasks.filter(t => t.priority === 'alta').length;
    
    return { total, assigned, pending, inProgress, completed, rescheduled, highPriority };
  }, [tasks]);

  // Leadership statistics
  const leadershipStats = useMemo(() => {
    const memberStats = teamMembers.map(member => {
      const memberTasks = tasks.filter(t => t.responsibleMember === member.id);
      const completed = memberTasks.filter(t => t.status === 'Concluído').length;
      const rescheduled = memberTasks.filter(t => t.status === 'Reprogramada').length;
      const total = memberTasks.length;
      
      return {
        id: member.id,
        name: member.name,
        position: member.position,
        completed,
        rescheduled,
        total,
        efficiency: total > 0 ? (completed / total) * 100 : 0
      };
    }).filter(stat => stat.total > 0)
      .sort((a, b) => b.completed - a.completed);

    return memberStats;
  }, [tasks, teamMembers]);

  // Task assignment handlers
  const handleAssignTask = (task: Task) => {
    setSelectedTask(task);
    setSelectedResourceForAssign(task.assignedResource || "");
    setSelectedResponsibleForAssign(task.responsibleMember || "");
    setAssignmentNotes(task.taskNotes || "");
    setIsAssignDialogOpen(true);
  };

  const handleSaveAssignment = async () => {
    if (!selectedTask || !selectedResourceForAssign || !selectedResponsibleForAssign) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Selecione um recurso e um responsável para atribuir a tarefa.",
      });
      return;
    }

    try {
      const selectedResource = resources.find(r => r.id === selectedResourceForAssign);
      const selectedResponsible = teamMembers.find(m => m.id === selectedResponsibleForAssign);
      
      if (!selectedResource || !selectedResponsible) {
        throw new Error("Recurso ou responsável não encontrado");
      }

      const assignment: TaskAssignment = {
        taskId: selectedTask.id,
        resourceId: selectedResourceForAssign,
        resourceName: selectedResource.name,
        responsibleId: selectedResponsibleForAssign,
        responsibleName: selectedResponsible.name,
        assignedAt: new Date(),
        notes: assignmentNotes
      };

      // Salvar no Firebase - usar setDoc com merge para criar o documento se não existir
      const assignmentsRef = doc(db, "companies", "mecald", "settings", "taskAssignments");
      
      // Verificar se o documento existe
      const docSnap = await getDoc(assignmentsRef);
      
      let currentAssignments: TaskAssignment[] = [];
      if (docSnap.exists()) {
        currentAssignments = docSnap.data().assignments || [];
      }
      
      // Remover atribuição existente da mesma tarefa (se houver)
      const filteredAssignments = currentAssignments.filter(a => a.taskId !== selectedTask.id);
      const updatedAssignments = [...filteredAssignments, assignment];
      
      // Usar setDoc com merge para garantir que o documento seja criado se não existir
      await setDoc(assignmentsRef, { 
        assignments: updatedAssignments.map(a => {
          const assignedAt = a.assignedAt instanceof Date ? a.assignedAt : new Date(a.assignedAt);
          return {
            ...a,
            assignedAt: Timestamp.fromDate(assignedAt)
          };
        })
      }, { merge: true });

      toast({
        title: "Tarefa atribuída!",
        description: `Tarefa "${selectedTask.stageName}" atribuída ao recurso "${selectedResource.name}" sob responsabilidade de "${selectedResponsible.name}".`,
      });

      setIsAssignDialogOpen(false);
      setSelectedTask(null);
      setSelectedResourceForAssign("");
      setSelectedResponsibleForAssign("");
      setAssignmentNotes("");
      
      await loadData();

    } catch (error) {
      console.error("Error assigning task:", error);
      toast({
        variant: "destructive",
        title: "Erro ao atribuir tarefa",
        description: "Não foi possível salvar a atribuição da tarefa.",
      });
    }
  };

  // Task completion handlers
  const handleCompleteTask = (task: Task) => {
    setSelectedTask(task);
    setCompletionNotes("");
    setIsCompleteDialogOpen(true);
  };

  const handleSaveCompletion = async () => {
    if (!selectedTask) return;

    try {
      // Atualizar o status da etapa no pedido
      const orderRef = doc(db, "companies", "mecald", "orders", selectedTask.orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        throw new Error("Pedido não encontrado");
      }

      const orderData = orderSnap.data();
      const updatedItems = orderData.items.map((item: any) => {
        if (item.id === selectedTask.itemId) {
          const updatedPlan = item.productionPlan.map((stage: any, index: number) => {
            if (index === selectedTask.stageIndex) {
              return {
                ...stage,
                status: 'Concluído',
                completedDate: Timestamp.fromDate(new Date()),
                actualCompletedDate: Timestamp.fromDate(new Date()),
                completedBy: user?.email || 'Sistema',
                completionNotes: completionNotes
              };
            }
            return stage;
          });
          return { ...item, productionPlan: updatedPlan };
        }
        return item;
      });

      await updateDoc(orderRef, { items: updatedItems });

      // Remover da lista de atribuições
      const assignmentsRef = doc(db, "companies", "mecald", "settings", "taskAssignments");
      
      // Verificar se o documento existe
      const assignmentsSnap = await getDoc(assignmentsRef);
      
      if (assignmentsSnap.exists()) {
        const currentAssignments = assignmentsSnap.data().assignments || [];
        const updatedAssignments = currentAssignments.filter((a: any) => a.taskId !== selectedTask.id);
        
        await setDoc(assignmentsRef, { 
          assignments: updatedAssignments.map((a: any) => {
            const assignedAt = a.assignedAt instanceof Date ? a.assignedAt : 
                             (a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(a.assignedAt));
            return {
              ...a,
              assignedAt: Timestamp.fromDate(assignedAt)
            };
          })
        }, { merge: true });
      }

      toast({
        title: "Tarefa concluída!",
        description: `Tarefa "${selectedTask.stageName}" foi marcada como concluída.`,
      });

      setIsCompleteDialogOpen(false);
      setSelectedTask(null);
      setCompletionNotes("");
      
      await loadData();

    } catch (error) {
      console.error("Error completing task:", error);
      toast({
        variant: "destructive",
        title: "Erro ao concluir tarefa",
        description: "Não foi possível marcar a tarefa como concluída.",
      });
    }
  };

  // Task reschedule handlers
  const handleRescheduleTask = (task: Task) => {
    setSelectedTask(task);
    setRescheduleDate(undefined);
    setRescheduleDuration(task.originalDurationDays);
    setRescheduleReason("");
    setIsRescheduleDialogOpen(true);
  };

  const handleSaveReschedule = async () => {
    if (!selectedTask || !rescheduleDate || !rescheduleReason.trim()) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha a nova data, duração e motivo da reprogramação.",
      });
      return;
    }

    try {
      // Calcular nova data de conclusão considerando dias úteis
      const newCompletedDate = addBusinessDays(rescheduleDate, rescheduleDuration - 1);

      // Atualizar o status da etapa no pedido
      const orderRef = doc(db, "companies", "mecald", "orders", selectedTask.orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        throw new Error("Pedido não encontrado");
      }

      const orderData = orderSnap.data();
      const updatedItems = orderData.items.map((item: any) => {
        if (item.id === selectedTask.itemId) {
          const updatedPlan = item.productionPlan.map((stage: any, index: number) => {
            if (index === selectedTask.stageIndex) {
              return {
                ...stage,
                status: 'Reprogramada',
                startDate: Timestamp.fromDate(rescheduleDate),
                completedDate: Timestamp.fromDate(newCompletedDate),
                durationDays: rescheduleDuration,
                reprogrammedReason: rescheduleReason,
                reprogrammedBy: user?.email || 'Sistema',
                reprogrammedAt: Timestamp.fromDate(new Date())
              };
            }
            return stage;
          });
          return { ...item, productionPlan: updatedPlan };
        }
        return item;
      });

      await updateDoc(orderRef, { items: updatedItems });

      // Atualizar a atribuição para refletir a reprogramação
      const assignmentsRef = doc(db, "companies", "mecald", "settings", "taskAssignments");
      
      // Verificar se o documento existe
      const assignmentsSnap = await getDoc(assignmentsRef);
      
      if (assignmentsSnap.exists()) {
        const currentAssignments = assignmentsSnap.data().assignments || [];
        const updatedAssignments = currentAssignments.map((a: any) => {
          if (a.taskId === selectedTask.id) {
            return {
              ...a,
              reprogrammedDate: rescheduleDate,
              reprogrammedDuration: rescheduleDuration,
              reprogrammedReason: rescheduleReason,
              reprogrammedAt: new Date()
            };
          }
          return a;
        });
        
        await setDoc(assignmentsRef, { 
          assignments: updatedAssignments.map((a: any) => {
            const assignedAt = a.assignedAt instanceof Date ? a.assignedAt : 
                             (a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(a.assignedAt));
            const reprogrammedAt = a.reprogrammedAt ? 
              (a.reprogrammedAt instanceof Date ? a.reprogrammedAt : 
               (a.reprogrammedAt?.toDate ? a.reprogrammedAt.toDate() : new Date(a.reprogrammedAt))) : 
              undefined;
            
            return {
              ...a,
              assignedAt: Timestamp.fromDate(assignedAt),
              reprogrammedAt: reprogrammedAt ? Timestamp.fromDate(reprogrammedAt) : undefined
            };
          })
        }, { merge: true });
      }

      toast({
        title: "Tarefa reprogramada!",
        description: `Tarefa "${selectedTask.stageName}" foi reprogramada para ${format(rescheduleDate, 'dd/MM/yyyy')}.`,
      });

      setIsRescheduleDialogOpen(false);
      setSelectedTask(null);
      setRescheduleDate(undefined);
      setRescheduleDuration(1);
      setRescheduleReason("");
      
      await loadData();

    } catch (error) {
      console.error("Error rescheduling task:", error);
      toast({
        variant: "destructive",
        title: "Erro ao reprogramar tarefa",
        description: "Não foi possível reprogramar a tarefa.",
      });
    }
  };

  // Export functions
  const exportDailyTasks = async () => {
    const selectedTasks = tasks.filter(task => task.selected);
    
    if (selectedTasks.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma tarefa selecionada",
        description: "Selecione pelo menos uma tarefa para gerar o relatório.",
      });
      return;
    }

    toast({ title: "Gerando relatório...", description: "Por favor, aguarde." });

    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
      
      const docPdf = new jsPDF('landscape'); // Formato paisagem
      const pageWidth = docPdf.internal.pageSize.width;
      const pageHeight = docPdf.internal.pageSize.height;
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
      docPdf.text('RELATÓRIO DIÁRIO DE TAREFAS', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      docPdf.setFontSize(11).setFont(undefined, 'normal');
      docPdf.text(`Data: ${format(new Date(), "dd/MM/yyyy")}`, 15, yPos);
      docPdf.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, pageWidth - 15, yPos, { align: 'right' });
      yPos += 12;

      // Statistics
      docPdf.setFontSize(10).setFont(undefined, 'bold');
      docPdf.text('RESUMO DAS TAREFAS SELECIONADAS:', 15, yPos);
      yPos += 8;
      
      docPdf.setFont(undefined, 'normal');
      docPdf.text(`Total de Tarefas: ${selectedTasks.length}`, 15, yPos);
      yPos += 5;

      const statusCounts = {
        'Em Andamento': selectedTasks.filter(t => t.status === 'Em Andamento').length,
        'Atribuída': selectedTasks.filter(t => t.status === 'Atribuída').length,
        'Pendente': selectedTasks.filter(t => t.status === 'Pendente').length,
        'Concluído': selectedTasks.filter(t => t.status === 'Concluído').length,
        'Reprogramada': selectedTasks.filter(t => t.status === 'Reprogramada').length,
      };

      Object.entries(statusCounts).forEach(([status, count]) => {
        if (count > 0) {
          docPdf.text(`${status}: ${count}`, 15, yPos);
          yPos += 5;
        }
      });
      
      yPos += 10;

      // Group tasks by responsible member
      const tasksByResponsible = selectedTasks.reduce((acc, task) => {
        const responsible = task.responsibleMemberName || 'Não Atribuído';
        if (!acc[responsible]) acc[responsible] = [];
        acc[responsible].push(task);
        return acc;
      }, {} as { [key: string]: Task[] });

      // Tasks table for each responsible
      Object.entries(tasksByResponsible).forEach(([responsible, responsibleTasks]) => {
        // Check if we need a new page
        if (yPos > 200) {
          docPdf.addPage();
          yPos = 20;
        }

        docPdf.setFontSize(12).setFont(undefined, 'bold');
        docPdf.text(`RESPONSÁVEL: ${responsible.toUpperCase()}`, 15, yPos);
        yPos += 8;

        const tableBody = responsibleTasks.map(task => [
          task.orderNumber || 'N/A',
          task.customer || 'N/A',
          task.itemDescription.length > 40 ? 
            task.itemDescription.substring(0, 40) + '...' : 
            task.itemDescription,
          task.stageName || 'N/A',
          task.assignedResourceName || 'Não atribuído',
          task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
          task.status || 'Pendente',
          task.originalStartDate ? format(task.originalStartDate, 'dd/MM/yy') : 'A definir',
          task.originalCompletedDate ? format(task.originalCompletedDate, 'dd/MM/yy') : 'A definir',
          `${task.originalDurationDays} dia(s)`,
          '☐', // Checkbox para Concluído
          '☐', // Checkbox para Reprogramado
          '', // Campo para observações
        ]);

        autoTable(docPdf, {
          startY: yPos,
          head: [['Pedido', 'Cliente', 'Item', 'Etapa', 'Recurso', 'Prioridade', 'Status', 'Início', 'Conclusão', 'Duração', 'Concluído', 'Reprog.', 'Observações']],
          body: tableBody,
          styles: { 
            fontSize: 6,
            cellPadding: 1.5,
          },
          headStyles: { 
            fillColor: [37, 99, 235], 
            fontSize: 7, 
            textColor: 255, 
            halign: 'center',
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { cellWidth: 18, halign: 'center' }, // Pedido
            1: { cellWidth: 35 }, // Cliente
            2: { cellWidth: 45 }, // Item
            3: { cellWidth: 30, halign: 'center' }, // Etapa
            4: { cellWidth: 35 }, // Recurso
            5: { cellWidth: 18, halign: 'center' }, // Prioridade
            6: { cellWidth: 22, halign: 'center' }, // Status
            7: { cellWidth: 18, halign: 'center' }, // Início
            8: { cellWidth: 18, halign: 'center' }, // Conclusão
            9: { cellWidth: 18, halign: 'center' }, // Duração
            10: { cellWidth: 15, halign: 'center' }, // Concluído
            11: { cellWidth: 15, halign: 'center' }, // Reprogramado
            12: { cellWidth: 30, halign: 'center' }, // Observações
          },
          margin: { left: 15, right: 15 },
          tableWidth: 'auto'
        });

        yPos = (docPdf as any).lastAutoTable.finalY + 15;
        
        // Add space for notes and status update
        if (responsibleTasks.length > 0) {
          docPdf.setFontSize(8).setFont(undefined, 'normal');
          docPdf.text('Instruções para Preenchimento:', 15, yPos);
          yPos += 4;
          docPdf.setFontSize(7);
          docPdf.text('• Marque "Concluído" quando a tarefa for finalizada com sucesso', 15, yPos);
          yPos += 4;
          docPdf.text('• Marque "Reprog." quando a tarefa precisar ser reagendada e anote o motivo', 15, yPos);
          yPos += 4;
          docPdf.text('• Use o campo "Observações" para anotar problemas, qualidade ou informações importantes', 15, yPos);
          yPos += 6;
          
          docPdf.setFontSize(8).setFont(undefined, 'bold');
          docPdf.text('Anotações Gerais do Responsável:', 15, yPos);
          yPos += 5;
          
          // Draw lines for manual notes
          for (let i = 0; i < 4; i++) {
            docPdf.line(15, yPos + (i * 6), pageWidth - 15, yPos + (i * 6));
          }
          yPos += 30;
        }
      });

      // Add signature footer
      if (yPos + 40 > pageHeight - 20) {
        docPdf.addPage();
        yPos = 20;
      }

      docPdf.setFontSize(10).setFont(undefined, 'bold');
      docPdf.text('CONTROLE E ASSINATURAS', 15, yPos);
      yPos += 12;

      docPdf.setFontSize(9).setFont(undefined, 'normal');
      
      // Create two columns for signatures
      const leftColumn = 15;
      const rightColumn = pageWidth / 2 + 20;
      
      // Left column signatures
      docPdf.text('Supervisor/Coordenador:', leftColumn, yPos);
      docPdf.line(leftColumn + 55, yPos, leftColumn + 140, yPos);
      docPdf.text('Data: ___/___/_____', leftColumn + 150, yPos);
      
      // Right column signatures  
      docPdf.text('Controle de Qualidade:', rightColumn, yPos);
      docPdf.line(rightColumn + 55, yPos, rightColumn + 140, yPos);
      docPdf.text('Data: ___/___/_____', rightColumn + 150, yPos);
      
      yPos += 20;
      
      // Additional signature line
      docPdf.text('Responsável pela Execução:', leftColumn, yPos);
      docPdf.line(leftColumn + 65, yPos, leftColumn + 150, yPos);
      docPdf.text('Data: ___/___/_____', leftColumn + 160, yPos);
      
      docPdf.text('Gerente de Produção:', rightColumn, yPos);
      docPdf.line(rightColumn + 55, yPos, rightColumn + 140, yPos);
      docPdf.text('Data: ___/___/_____', rightColumn + 150, yPos);

      yPos += 15;

      // Final instructions
      docPdf.setFontSize(8).setFont(undefined, 'italic');
      docPdf.text('Importante: Este documento deve ser preenchido durante a execução das tarefas e devolvido ao final do expediente.', 
                  pageWidth / 2, yPos, { align: 'center' });

      docPdf.save(`Relatorio_Tarefas_${format(new Date(), 'yyyyMMdd')}.pdf`);

      toast({
        title: "Relatório gerado com sucesso!",
        description: `O arquivo PDF foi baixado com ${selectedTasks.length} tarefas selecionadas.`,
      });

    } catch (error) {
      console.error("Error generating tasks report:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Não foi possível gerar o arquivo PDF.",
      });
    }
  };

  // Task selection handlers
  const handleTaskSelection = (taskId: string, selected: boolean) => {
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.id === taskId ? { ...task, selected } : task
      )
    );
  };

  const handleSelectAllTasks = (selected: boolean) => {
    setTasks(prevTasks => 
      prevTasks.map(task => ({ ...task, selected }))
    );
  };

  // Remove assignment handler
  const handleRemoveAssignment = (task: Task) => {
    setSelectedTask(task);
    setIsRemoveAssignmentDialogOpen(true);
  };

  const handleConfirmRemoveAssignment = async () => {
    if (!selectedTask) return;

    try {
      // Remover da lista de atribuições
      const assignmentsRef = doc(db, "companies", "mecald", "settings", "taskAssignments");
      
      // Verificar se o documento existe
      const assignmentsSnap = await getDoc(assignmentsRef);
      
      if (assignmentsSnap.exists()) {
        const currentAssignments = assignmentsSnap.data().assignments || [];
        const updatedAssignments = currentAssignments.filter((a: any) => a.taskId !== selectedTask.id);
        
        await setDoc(assignmentsRef, { 
          assignments: updatedAssignments.map((a: any) => {
            const assignedAt = a.assignedAt instanceof Date ? a.assignedAt : 
                             (a.assignedAt?.toDate ? a.assignedAt.toDate() : new Date(a.assignedAt));
            return {
              ...a,
              assignedAt: Timestamp.fromDate(assignedAt)
            };
          })
        }, { merge: true });
      }

      toast({
        title: "Atribuição removida!",
        description: `A atribuição da tarefa "${selectedTask.stageName}" foi removida.`,
      });

      setIsRemoveAssignmentDialogOpen(false);
      setSelectedTask(null);
      
      await loadData();

    } catch (error) {
      console.error("Error removing assignment:", error);
      toast({
        variant: "destructive",
        title: "Erro ao remover atribuição",
        description: "Não foi possível remover a atribuição da tarefa.",
      });
    }
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setResourceFilter("all");
    setResponsibleFilter("all");
    setSearchQuery("");
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alta Prioridade</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.highPriority}</div>
            <p className="text-xs text-muted-foreground">Urgentes</p>
          </CardContent>
        </Card>
        {/* Dialog para Reprogramação de Tarefa */}
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
          <Button 
            onClick={exportDailyTasks}
            disabled={selectedTasksCount === 0}
            variant="default"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar Selecionadas ({selectedTasksCount})
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tarefas</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Tarefas pendentes</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atribuídas</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.assigned}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.assigned / stats.total) * 100) : 0}% do total
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
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">Finalizadas</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reprogramadas</CardTitle>
            <RotateCcw className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.rescheduled}</div>
            <p className="text-xs text-muted-foreground">Reagendadas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">Gestão de Tarefas</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard de Liderança</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          {/* Filters */}
          <Card className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por pedido, cliente, item, etapa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="ghost" onClick={clearFilters}>
                  <Filter className="mr-2 h-4 w-4" />
                  Limpar Filtros
                </Button>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="Pendente">Pendente</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Atribuída">Atribuída</SelectItem>
                    <SelectItem value="Concluído">Concluída</SelectItem>
                    <SelectItem value="Reprogramada">Reprogramada</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Prioridades</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={resourceFilter} onValueChange={setResourceFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Recurso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Recursos</SelectItem>
                    {resources
                      .filter(r => r.status === 'disponivel')
                      .map(resource => (
                        <SelectItem key={resource.id} value={resource.id}>
                          {resource.name} ({getResourceTypeLabel(resource.type)})
                        </SelectItem>
                      ))}
                    <SelectItem value="unassigned">Não Atribuídas</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Responsáveis</SelectItem>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} ({member.position})
                      </SelectItem>
                    ))}
                    <SelectItem value="unassigned">Não Atribuídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Tasks Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lista de Tarefas</CardTitle>
                  <CardDescription>
                    Gerencie a atribuição e execução de tarefas de produção
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllTasks(true)}
                  >
                    Selecionar Todas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllTasks(false)}
                  >
                    Desmarcar Todas
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Sel.</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.length > 0 ? (
                    filteredTasks
                      .sort((a, b) => {
                        // Sort by priority first, then by status
                        const priorityOrder = { alta: 3, media: 2, baixa: 1 };
                        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
                        if (priorityDiff !== 0) return priorityDiff;
                        
                        const statusOrder = { 'Em Andamento': 4, 'Atribuída': 3, 'Pendente': 2, 'Reprogramada': 1, 'Concluído': 0 };
                        return (statusOrder[b.status as keyof typeof statusOrder] || 0) - 
                               (statusOrder[a.status as keyof typeof statusOrder] || 0);
                      })
                      .map((task) => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={task.selected || false}
                              onChange={(e) => handleTaskSelection(task.id, e.target.checked)}
                              className="rounded border-gray-300"
                            />
                          </TableCell>
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
                              {getStatusIcon(task.status)}
                              {task.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getPriorityColor(task.priority)}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {task.assignedResourceName ? (
                              <div className="flex items-center gap-2">
                                <UserCheck className="h-4 w-4 text-green-600" />
                                <span className="text-sm">{task.assignedResourceName}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                                <span className="text-sm text-muted-foreground">Não atribuído</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {task.responsibleMemberName ? (
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-blue-600" />
                                <span className="text-sm">{task.responsibleMemberName}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                                <span className="text-sm text-muted-foreground">Não atribuído</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center gap-1">
                              {(task.status === 'Pendente' || task.status === 'Em Andamento') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAssignTask(task)}
                                >
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  {task.status === 'Em Andamento' && (task.assignedResource || task.responsibleMember) ? 'Reatribuir' : 'Atribuir'}
                                </Button>
                              )}
                              {(task.assignedResource || task.responsibleMember) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveAssignment(task)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Remover
                                </Button>
                              )}
                              {(task.status === 'Atribuída' || task.status === 'Em Andamento') && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCompleteTask(task)}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Concluir
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRescheduleTask(task)}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                    Reprogramar
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center h-24">
                        Nenhuma tarefa encontrada com os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          {/* Leadership Dashboard */}
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-yellow-500" />
                  Ranking de Performance da Equipe
                </CardTitle>
                <CardDescription>
                  Desempenho dos membros da equipe na conclusão e reprogramação de tarefas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posição</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Concluídas</TableHead>
                      <TableHead>Reprogramadas</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Eficiência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leadershipStats.map((member, index) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {index === 0 && <Crown className="h-4 w-4 text-yellow-500" />}
                            {index === 1 && <Award className="h-4 w-4 text-gray-400" />}
                            {index === 2 && <Award className="h-4 w-4 text-orange-400" />}
                            <span className="font-medium">#{index + 1}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.position}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            {member.completed}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                            {member.rescheduled}
                          </Badge>
                        </TableCell>
                        <TableCell>{member.total}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={member.efficiency} className="h-2 w-20" />
                            <span className="text-sm font-medium">{Math.round(member.efficiency)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {leadershipStats.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center h-24">
                          Nenhum membro da equipe com tarefas atribuídas ainda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Top Performer
                </CardTitle>
                <CardDescription>
                  Membro da equipe com melhor desempenho
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leadershipStats.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <Crown className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                      <h3 className="text-lg font-bold">{leadershipStats[0].name}</h3>
                      <p className="text-sm text-muted-foreground">{leadershipStats[0].position}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Tarefas Concluídas</span>
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          {leadershipStats[0].completed}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Taxa de Eficiência</span>
                        <span className="font-bold text-green-600">
                          {Math.round(leadershipStats[0].efficiency)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Total de Tarefas</span>
                        <span className="font-medium">{leadershipStats[0].total}</span>
                      </div>
                    </div>
                    <Progress value={leadershipStats[0].efficiency} className="h-3" />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma tarefa foi atribuída ainda</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Additional Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Membros Ativos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{leadershipStats.length}</div>
                <p className="text-xs text-muted-foreground">Com tarefas atribuídas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Média de Eficiência</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {leadershipStats.length > 0 
                    ? Math.round(leadershipStats.reduce((acc, member) => acc + member.efficiency, 0) / leadershipStats.length)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground">Da equipe</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Concluídas</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {leadershipStats.reduce((acc, member) => acc + member.completed, 0)}
                </div>
                <p className="text-xs text-muted-foreground">Por toda a equipe</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Reprogramadas</CardTitle>
                <RotateCcw className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {leadershipStats.reduce((acc, member) => acc + member.rescheduled, 0)}
                </div>
                <p className="text-xs text-muted-foreground">Por toda a equipe</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog para Atribuição de Tarefa */}
      <Dialog open={isAssignDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAssignDialogOpen(false);
          setSelectedTask(null);
          setSelectedResourceForAssign("");
          setSelectedResponsibleForAssign("");
          setAssignmentNotes("");
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Atribuir Tarefa</DialogTitle>
            <DialogDescription>
              Atribua um recurso e um responsável para executar a tarefa "{selectedTask?.stageName}" do item "{selectedTask?.itemDescription}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Recurso Produtivo</Label>
                <Select 
                  value={selectedResourceForAssign} 
                  onValueChange={setSelectedResourceForAssign}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um recurso" />
                  </SelectTrigger>
                  <SelectContent>
                    {resources
                      .filter(r => r.status === 'disponivel')
                      .map(resource => (
                        <SelectItem key={resource.id} value={resource.id}>
                          <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-blue-600" />
                            <div>
                              <div className="font-medium">{resource.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {getResourceTypeLabel(resource.type)} - Capacidade: {resource.capacity}
                                {resource.location && ` - ${resource.location}`}
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {resources.filter(r => r.status === 'disponivel').length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum recurso disponível no momento.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Membro Responsável</Label>
                <Select 
                  value={selectedResponsibleForAssign} 
                  onValueChange={setSelectedResponsibleForAssign}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-green-600" />
                          <div>
                            <div className="font-medium">{member.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {member.position} - {member.email}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Observações da Atribuição</Label>
              <Textarea
                placeholder="Instruções especiais, observações ou recomendações para a execução da tarefa..."
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                rows={3}
              />
            </div>
            
            {selectedTask && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <h4 className="font-medium text-sm mb-2">Detalhes da Tarefa</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong>Pedido:</strong> {selectedTask.orderNumber}</p>
                  <p><strong>Cliente:</strong> {selectedTask.customer}</p>
                  <p><strong>Item:</strong> {selectedTask.itemDescription}</p>
                  <p><strong>Etapa:</strong> {selectedTask.stageName}</p>
                  <p><strong>Duração Original:</strong> {selectedTask.originalDurationDays} dia(s) úteis</p>
                  <p><strong>Prioridade:</strong> {selectedTask.priority.charAt(0).toUpperCase() + selectedTask.priority.slice(1)}</p>
                  {selectedTask.originalStartDate && (
                    <p><strong>Início Planejado:</strong> {format(selectedTask.originalStartDate, 'dd/MM/yyyy')}</p>
                  )}
                  {selectedTask.originalCompletedDate && (
                    <p><strong>Conclusão Planejada:</strong> {format(selectedTask.originalCompletedDate, 'dd/MM/yyyy')}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveAssignment}
              disabled={!selectedResourceForAssign || !selectedResponsibleForAssign}
            >
              Atribuir Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Conclusão de Tarefa */}
      <Dialog open={isCompleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCompleteDialogOpen(false);
          setSelectedTask(null);
          setCompletionNotes("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir Tarefa</DialogTitle>
            <DialogDescription>
              Marque a tarefa "{selectedTask?.stageName}" como concluída.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Observações da Conclusão</Label>
              <Textarea
                placeholder="Descreva como a tarefa foi executada, problemas encontrados, qualidade do resultado..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={4}
              />
            </div>
            
            {selectedTask && (
              <div className="rounded-lg border p-3 bg-green-50">
                <h4 className="font-medium text-sm mb-2 text-green-800">Resumo da Tarefa</h4>
                <div className="space-y-1 text-xs text-green-700">
                  <p><strong>Pedido:</strong> {selectedTask.orderNumber}</p>
                  <p><strong>Cliente:</strong> {selectedTask.customer}</p>
                  <p><strong>Etapa:</strong> {selectedTask.stageName}</p>
                  <p><strong>Recurso:</strong> {selectedTask.assignedResourceName}</p>
                  <p><strong>Responsável:</strong> {selectedTask.responsibleMemberName}</p>
                  <p><strong>Data de Conclusão:</strong> {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCompletion} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="mr-2 h-4 w-4" />
              Marcar como Concluída
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Remover Atribuição */}
      <Dialog open={isRemoveAssignmentDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsRemoveAssignmentDialogOpen(false);
          setSelectedTask(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Atribuição</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover a atribuição da tarefa "{selectedTask?.stageName}"?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedTask && (
              <div className="rounded-lg border p-3 bg-red-50">
                <h4 className="font-medium text-sm mb-2 text-red-800">Atribuição Atual</h4>
                <div className="space-y-1 text-xs text-red-700">
                  <p><strong>Tarefa:</strong> {selectedTask.stageName}</p>
                  <p><strong>Item:</strong> {selectedTask.itemDescription}</p>
                  {selectedTask.assignedResourceName && (
                    <p><strong>Recurso:</strong> {selectedTask.assignedResourceName}</p>
                  )}
                  {selectedTask.responsibleMemberName && (
                    <p><strong>Responsável:</strong> {selectedTask.responsibleMemberName}</p>
                  )}
                  <p className="text-red-600 mt-2">
                    ⚠️ Esta ação removerá todas as atribuições de recurso e responsável desta tarefa.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRemoveAssignmentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmRemoveAssignment}
              variant="destructive"
            >
              <X className="mr-2 h-4 w-4" />
              Remover Atribuição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isRescheduleDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsRescheduleDialogOpen(false);
          setSelectedTask(null);
          setRescheduleDate(undefined);
          setRescheduleDuration(1);
          setRescheduleReason("");
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reprogramar Tarefa</DialogTitle>
            <DialogDescription>
              Reprograme a tarefa "{selectedTask?.stageName}" para uma nova data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nova Data de Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant={"outline"} 
                      className={cn(
                        "w-full justify-start text-left font-normal", 
                        !rescheduleDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {rescheduleDate ? format(rescheduleDate, "dd/MM/yyyy") : <span>Escolha a data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar 
                      mode="single" 
                      selected={rescheduleDate} 
                      onSelect={setRescheduleDate} 
                      initialFocus 
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Nova Duração (dias úteis)</Label>
                <Input
                  type="number"
                  min="1"
                  value={rescheduleDuration}
                  onChange={(e) => setRescheduleDuration(parseInt(e.target.value) || 1)}
                  placeholder="Quantidade de dias úteis"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Motivo da Reprogramação *</Label>
              <Textarea
                placeholder="Explique o motivo da reprogramação: falta de material, problemas técnicos, priorização de outros pedidos..."
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                rows={3}
                required
              />
            </div>

            {rescheduleDate && (
              <div className="rounded-lg border p-3 bg-blue-50">
                <h4 className="font-medium text-sm mb-2 text-blue-800">Novo Cronograma</h4>
                <div className="space-y-1 text-xs text-blue-700">
                  <p><strong>Início:</strong> {format(rescheduleDate, 'dd/MM/yyyy')}</p>
                  <p><strong>Conclusão:</strong> {format(addBusinessDays(rescheduleDate, rescheduleDuration - 1), 'dd/MM/yyyy')}</p>
                  <p><strong>Duração:</strong> {rescheduleDuration} dia(s) úteis</p>
                  <p className="text-blue-600 mt-2">
                    ⚠️ Esta reprogramação será registrada no histórico da tarefa e do pedido.
                  </p>
                </div>
              </div>
            )}
            
            {selectedTask && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <h4 className="font-medium text-sm mb-2">Cronograma Original</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><strong>Início Original:</strong> {selectedTask.originalStartDate ? format(selectedTask.originalStartDate, 'dd/MM/yyyy') : 'Não definido'}</p>
                  <p><strong>Conclusão Original:</strong> {selectedTask.originalCompletedDate ? format(selectedTask.originalCompletedDate, 'dd/MM/yyyy') : 'Não definido'}</p>
                  <p><strong>Duração Original:</strong> {selectedTask.originalDurationDays} dia(s) úteis</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRescheduleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveReschedule}
              disabled={!rescheduleDate || !rescheduleReason.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reprogramar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
