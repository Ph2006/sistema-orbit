"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, getDoc, Timestamp, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isSameDay, addDays, isWeekend } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from 'qrcode';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle, Weight, CalendarDays, Edit, X, CalendarIcon, Truck, AlertTriangle, FolderGit2, FileText, File, ClipboardCheck, Palette, ListChecks, GanttChart, Trash2, Copy, ClipboardPaste, ReceiptText, CalendarClock, ClipboardList, PlusCircle, XCircle as XCircleIcon, ArrowDown, CalendarCheck, QrCode, TrendingUp, TrendingDown, Clock, MoreHorizontal, ChevronUp, ChevronDown, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

const productionStageSchema = z.object({
    stageName: z.string(),
    status: z.string(),
    startDate: z.date().nullable().optional(),
    completedDate: z.date().nullable().optional(),
    durationDays: z.coerce.number().min(0).optional(),
    useBusinessDays: z.boolean().optional().default(true), // true = dias úteis, false = dias corridos
    workSchedule: z.enum(['normal', 'especial']).default('normal'),
});

const orderItemSchema = z.object({
    id: z.string().optional(),
    code: z.string().optional(),
    product_code: z.string().optional(),
    description: z.string().min(1, "A descrição é obrigatória."),
    quantity: z.coerce.number().min(0, "A quantidade não pode ser negativa."),
    unitWeight: z.coerce.number().min(0, "O peso não pode ser negativo.").optional(),
    itemNumber: z.string().optional(), // Número do item no pedido de compra
    productionPlan: z.array(productionStageSchema).optional(),
    itemDeliveryDate: z.date().nullable().optional(),
    shippingList: z.string().optional(),
    invoiceNumber: z.string().optional(),
    shippingDate: z.date().nullable().optional(),
});

const orderStatusEnum = z.enum([
    "Aguardando Produção",
    "Em Produção",
    "Pronto para Entrega",
    "Concluído",
    "Cancelado",
    "Atrasado",
]);

const customerInfoSchema = z.object({
  id: z.string({ required_error: "Selecione um cliente." }),
  name: z.string(),
});

const orderSchema = z.object({
  id: z.string(),
  customer: customerInfoSchema,
  quotationNumber: z.string().optional(),
  internalOS: z.string().optional(),
  projectName: z.string().optional(),
  status: orderStatusEnum,
  deliveryDate: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
  dataBookSent: z.boolean().default(false),
  dataBookSentAt: z.date().nullable().optional(),
  items: z.array(orderItemSchema).min(1, "O pedido deve ter pelo menos um item"),
  driveLink: z.string().url({ message: "Por favor, insira uma URL válida." }).optional().or(z.literal('')),
  documents: z.object({
    drawings: z.boolean().default(false),
    inspectionTestPlan: z.boolean().default(false),
    paintPlan: z.boolean().default(false),
  }).optional(),
});

type ProductionStage = z.infer<typeof productionStageSchema>;
type OrderItem = z.infer<typeof orderItemSchema>;

type CustomerInfo = { id: string; name: string };

type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
    endereco?: string;
    cnpj?: string;
    email?: string;
    celular?: string;
    website?: string;
};

type Order = {
    id: string;
    quotationId: string;
    quotationNumber: string;
    internalOS?: string;
    projectName?: string;
    customer: CustomerInfo;
    items: OrderItem[];
    totalValue: number;
    totalWeight: number;
    status: string;
    createdAt: Date;
    deliveryDate?: Date;
    completedAt?: Date;
    dataBookSent: boolean;
    dataBookSentAt?: Date;
    driveLink?: string;
    documents: {
        drawings: boolean;
        inspectionTestPlan: boolean;
        paintPlan: boolean;
    };
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
  return brazilianHolidays.some(holiday => isSameDay(holiday, date));
};

const isBusinessDay = (date: Date): boolean => {
  return !isWeekend(date) && !isHoliday(date);
};

// 3. FUNÇÃO AUXILIAR CORRIGIDA - Adicionar dias úteis (corrigida para não pular um dia extra)
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

const countBusinessDaysBetween = (startDate: Date, endDate: Date): number => {
  if (isSameDay(startDate, endDate)) return 1;
  let count = 0;
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  while (currentDate <= end) {
    if (isBusinessDay(currentDate)) {
      count++;
    }
    currentDate = addDays(currentDate, 1);
  }
  return count;
};

// Função para obter o próximo dia útil
const getNextBusinessDay = (date: Date): Date => {
  let nextDay = addDays(date, 1);
  while (!isBusinessDay(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
};

// Função para obter o dia útil anterior
const getPreviousBusinessDay = (date: Date): Date => {
  let prevDay = addDays(date, -1);
  while (!isBusinessDay(prevDay)) {
    prevDay = addDays(prevDay, -1);
  }
  return prevDay;
};

// Componente para exibir informações de dias úteis
interface BusinessDayInfoProps {
  startDate: Date | null;
  endDate: Date | null;
  expectedDuration: number;
}

// 4. COMPONENTE ATUALIZADO - Informações de dias úteis com lógica corrigida
const BusinessDayInfo = ({ startDate, endDate, expectedDuration }: BusinessDayInfoProps) => {
  if (!startDate || !endDate) return null;
  
  const expectedDurationNum = Number(expectedDuration) || 0;
  const isSameDate = isSameDay(startDate, endDate);
  
  // CORREÇÃO: Para duração maior que 1, a tarefa deve terminar após os dias especificados
  const actualDaysDifference = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  return (
    <div className="text-xs mt-2 p-2 rounded bg-blue-50 text-blue-700 border border-blue-200">
      <div className="flex items-center gap-2">
        <span className="font-medium">Duração:</span>
        <span>{expectedDurationNum} dia(s)</span>
      </div>
      
      {isSameDate && expectedDurationNum <= 1 && (
        <p className="text-blue-600 mt-1">
          ✓ Tarefa executada no mesmo dia (duração ≤ 1 dia)
        </p>
      )}
      
      {!isSameDate && expectedDurationNum > 1 && (
        <p className="text-green-600 mt-1">
          ✓ Cronograma sequencial: próxima tarefa inicia em {format(endDate, 'dd/MM/yyyy')}
        </p>
      )}
      
      {!isBusinessDay(startDate) && (
        <p className="text-orange-600 mt-1">
          ⚠️ Data de início será ajustada para próximo dia útil
        </p>
      )}
      
      {!isBusinessDay(endDate) && (
        <p className="text-orange-600 mt-1">
          ⚠️ Data de fim será ajustada para dia útil
        </p>
      )}
      
      <p className="text-blue-600 mt-1 text-xs">
        💡 Tarefas são executadas sequencialmente: a próxima sempre inicia no mesmo dia que a anterior termina
      </p>
    </div>
  );
};

const calculateTotalWeight = (items: OrderItem[]): number => {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((acc, item) => {
        const quantity = Number(item.quantity) || 0;
        const unitWeight = Number(item.unitWeight) || 0;
        return acc + (quantity * unitWeight);
    }, 0);
};

const calculateItemProgress = (item: OrderItem): number => {
    if (item.productionPlan && item.productionPlan.length > 0) {
        const completedStages = item.productionPlan.filter(p => p.status === 'Concluído').length;
        return (completedStages / item.productionPlan.length) * 100;
    }

    if (item.code && item.code.trim() !== "") {
        return 0;
    }
    
    return 100;
};

const calculateOrderProgress = (order: Order): number => {
    if (!order.items || order.items.length === 0) {
        return 0;
    }
    const totalProgress = order.items.reduce((acc, item) => acc + calculateItemProgress(item), 0);
    return totalProgress / order.items.length;
};

const mapOrderStatus = (status?: string): string => {
    if (!status) return "Não definido";
    const lowerStatus = status.toLowerCase().trim();
    
    const statusMap: { [key: string]: string } = {
        'in production': 'Em Produção',
        'em produção': 'Em Produção',
        'in progress': 'Em Produção',
        'in-progress': 'Em Produção',
        'em progresso': 'Em Produção',
        'awaiting production': 'Aguardando Produção',
        'aguardando produção': 'Aguardando Produção',
        'pending': 'Aguardando Produção',
        'completed': 'Concluído',
        'concluído': 'Concluído',
        'finished': 'Concluído',
        'cancelled': 'Cancelado',
        'cancelado': 'Cancelado',
        'ready': 'Pronto para Entrega',
        'pronto para entrega': 'Pronto para Entrega'
    };

    return statusMap[lowerStatus] || status;
};

const getStatusProps = (status: string): { variant: "default" | "secondary" | "destructive" | "outline", icon: React.ElementType, label: string, colorClass: string } => {
    switch (status) {
        case "Em Produção":
            return { variant: "default", icon: PlayCircle, label: "Em Produção", colorClass: "" };
        case "Aguardando Produção":
            return { variant: "secondary", icon: Hourglass, label: "Aguardando Produção", colorClass: "" };
        case "Concluído":
            return { variant: "default", icon: CheckCircle, label: "Concluído", colorClass: "bg-green-600 hover:bg-green-600/90" };
        case "Pronto para Entrega":
            return { variant: "default", icon: Truck, label: "Pronto para Entrega", colorClass: "bg-blue-500 hover:bg-blue-500/90" };
        case "Cancelado":
            return { variant: "destructive", icon: XCircle, label: "Cancelado", colorClass: "" };
        case "Atrasado":
            return { variant: "destructive", icon: AlertTriangle, label: "Atrasado", colorClass: "bg-orange-500 hover:bg-orange-500/90 border-transparent text-destructive-foreground" };
        default:
            return { variant: "outline", icon: Package, label: status || "Não definido", colorClass: "" };
    }
};

function DocumentStatusIcons({ documents }: { documents?: Order['documents'] }) {
    if (!documents) return null;
    
    const iconClass = (present?: boolean) => cn("h-4 w-4", present ? "text-green-500" : "text-muted-foreground/50");

    return (
        <TooltipProvider>
            <div className="flex items-center justify-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button className="focus:outline-none"><File className={iconClass(documents.drawings)} /></button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Desenhos {documents.drawings ? '(OK)' : '(Pendente)'}</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button className="focus:outline-none"><ClipboardCheck className={iconClass(documents.inspectionTestPlan)} /></button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Plano de Inspeção {documents.inspectionTestPlan ? '(OK)' : '(Pendente)'}</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                       <button className="focus:outline-none"><Palette className={iconClass(documents.paintPlan)} /></button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Plano de Pintura {documents.paintPlan ? '(OK)' : '(Pendente)'}</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    );
}

function OrdersTable({ orders, onOrderClick }: { orders: Order[]; onOrderClick: (order: Order) => void; }) {
    if (orders.length === 0) {
        return (
             <Table>
                <TableBody>
                    <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center">Nenhum pedido encontrado com os filtros atuais.</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
    }
    
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[100px]">Nº Pedido</TableHead>
                    <TableHead className="w-[120px]">OS Interna</TableHead>
                    <TableHead>Projeto Cliente</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-[100px] text-center">Docs</TableHead>
                    <TableHead className="w-[120px]">Data Entrega</TableHead>
                    <TableHead className="w-[120px]">Data Conclusão</TableHead>
                    <TableHead className="w-[120px]">Data Book</TableHead>
                    <TableHead className="w-[120px] text-right">Peso Total</TableHead>
                    <TableHead className="w-[150px]">Progresso</TableHead>
                    <TableHead className="w-[180px]">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {orders.map((order) => {
                    const statusProps = getStatusProps(order.status);
                    const orderProgress = calculateOrderProgress(order);
                    return (
                        <TableRow key={order.id} onClick={() => onOrderClick(order)} className="cursor-pointer">
                            <TableCell className="font-medium">{order.quotationNumber || 'N/A'}</TableCell>
                            <TableCell className="font-medium">{order.internalOS || 'N/A'}</TableCell>
                            <TableCell>{order.projectName || 'N/A'}</TableCell>
                            <TableCell>{order.customer?.name || 'Cliente não informado'}</TableCell>
                            <TableCell>
                                <DocumentStatusIcons documents={order.documents} />
                            </TableCell>
                            <TableCell>{order.deliveryDate ? format(order.deliveryDate, "dd/MM/yyyy") : 'A definir'}</TableCell>
                            <TableCell>
                                {order.completedAt ? format(order.completedAt, "dd/MM/yyyy") : '-'}
                            </TableCell>
                            <TableCell>
                                {order.status === 'Concluído' ? (
                                    order.dataBookSent ? (
                                        <div className="flex items-center gap-1">
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                            <span className="text-sm text-green-700 font-medium">
                                                Enviado
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-4 w-4 text-orange-500" />
                                            <span className="text-sm text-orange-600 font-medium">Pendente</span>
                                        </div>
                                    )
                                ) : (
                                    <span className="text-sm text-muted-foreground">-</span>
                                )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                                {(order.totalWeight || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Progress value={orderProgress} className="h-2" />
                                    <span className="text-xs font-medium text-muted-foreground">{Math.round(orderProgress)}%</span>
                                    {(() => {
                                        // Verifica se há itens concluídos com atraso no embarque
                                        const hasDelayedShipping = order.items.some(item => {
                                            const itemProgress = calculateItemProgress(item);
                                            return itemProgress === 100 && 
                                                   item.shippingDate && 
                                                   order.deliveryDate && 
                                                   item.shippingDate > order.deliveryDate;
                                        });
                                        
                                        if (hasDelayedShipping) {
                                            return (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="flex items-center">
                                                                <AlertTriangle className="h-3 w-3 text-red-500" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>Há itens com atraso no embarque</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={statusProps.variant} className={statusProps.colorClass}>
                                    <statusProps.icon className="mr-2 h-4 w-4" />
                                    {statusProps.label}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [packingSlipQuantities, setPackingSlipQuantities] = useState<Map<string, number>>(new Map());
    const [isPackingSlipDialogOpen, setIsPackingSlipDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
    
    // Estados para deletar itens do pedido
    const [isItemDeleteDialogOpen, setIsItemDeleteDialogOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<{ index: number; item: OrderItem } | null>(null);

    // Estados para adicionar novos itens
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemForm, setNewItemForm] = useState({
      description: '',
      itemNumber: '',
      code: '',
      quantity: 1,
      unitWeight: 0,
    });

    // Progress tracking state
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [itemToTrack, setItemToTrack] = useState<OrderItem | null>(null);
    const [editedPlan, setEditedPlan] = useState<ProductionStage[]>([]);
    const [isFetchingPlan, setIsFetchingPlan] = useState(false);
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [progressClipboard, setProgressClipboard] = useState<OrderItem | null>(null);
    const [newStageNameForPlan, setNewStageNameForPlan] = useState("");
    
    
    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [customers, setCustomers] = useState<CustomerInfo[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [customerFilter, setCustomerFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
    const [dataBookFilter, setDataBookFilter] = useState<string>("all");
    const [monthFilter, setMonthFilter] = useState<string>("all");
    
    // View states
    const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'kanban'>('list');
    const [calendarDate, setCalendarDate] = useState(new Date());

    // Estados para controlar posição do scroll no Kanban
    const kanbanScrollRef = useRef<HTMLDivElement>(null);
    const scrollPositionRef = useRef<number>(0);
    // ADICIONAR ESTE NOVO:
    const columnScrollPositions = useRef<Map<string, number>>(new Map());
    
    // Estados para controlar colunas colapsadas
    const [collapsedYearColumns, setCollapsedYearColumns] = useState<Set<string>>(new Set());

    const form = useForm<z.infer<typeof orderSchema>>({
        resolver: zodResolver(orderSchema),
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    const fetchCustomers = async () => {
        if (!user) return;
        try {
            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "customers"));
            const customersList = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                name: doc.data().nomeFantasia || doc.data().name || "Cliente sem nome",
            }));
            setCustomers(customersList);
        } catch (error) {
            console.error("Error fetching customers for filter:", error);
        }
    };
    
    // Função helper para converter timestamps do Firestore de forma segura
    const safeToDate = (timestamp: any): Date | null => {
        if (!timestamp) return null;
        
        // Se já é uma data JavaScript válida
        if (timestamp instanceof Date) {
            return isNaN(timestamp.getTime()) ? null : timestamp;
        }
        
        // Se é um timestamp do Firestore com método toDate
        if (timestamp && typeof timestamp.toDate === 'function') {
            try {
                const date = timestamp.toDate();
                return (date instanceof Date && !isNaN(date.getTime())) ? date : null;
            } catch (error) {
                console.warn("Erro ao converter timestamp do Firestore:", error);
                return null;
            }
        }
        
        // Se é um objeto com propriedades seconds e nanoseconds (formato Firestore)
        if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
            try {
                const date = new Date(timestamp.seconds * 1000);
                return isNaN(date.getTime()) ? null : date;
            } catch (error) {
                console.warn("Erro ao converter objeto timestamp:", error);
                return null;
            }
        }
        
        // Tenta converter string ou number para data
        if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            try {
                const date = new Date(timestamp);
                return isNaN(date.getTime()) ? null : date;
            } catch (error) {
                console.warn("Erro ao converter string/number para data:", error);
                return null;
            }
        }
        
        console.warn("Tipo de timestamp não reconhecido:", typeof timestamp, timestamp);
        return null;
    };

    const fetchOrders = async (): Promise<Order[]> => {
        if (!user) return [];
        setIsLoading(true);
        let ordersList: Order[] = [];
        try {
            const productsSnapshot = await getDocs(collection(db, "companies", "mecald", "products"));
            const productsMap = new Map<string, { unitWeight: number, productionPlanTemplate?: any[] }>();
            productsSnapshot.forEach(doc => {
                const productCode = (doc.id || '').trim().toUpperCase();
                if (productCode) {
                    const data = doc.data();
                    productsMap.set(productCode, { 
                        unitWeight: data.unitWeight || 0,
                        productionPlanTemplate: data.productionPlanTemplate
                    });
                }
            });

            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
            ordersList = querySnapshot.docs.map(doc => {
                try {
                    const data = doc.data();

                    // LOG TEMPORÁRIO - REMOVER DEPOIS
                    console.log('📋 DOC:', doc.id, '| quotationNumber:', data.quotationNumber, '| items tipo:', typeof data.items, '| isArray:', Array.isArray(data.items));
                    const createdAtDate = safeToDate(data.createdAt) || new Date();
                    const deliveryDate = safeToDate(data.deliveryDate);
                
                const rawItems = data.items;
                let itemsArray: any[] = [];

                if (Array.isArray(rawItems)) {
                    itemsArray = rawItems;
                } else if (rawItems && typeof rawItems === 'object') {
                    // Reconstrói preservando todos os campos aninhados
                    itemsArray = Object.keys(rawItems)
                        .sort((a, b) => Number(a) - Number(b)) // mantém ordem original
                        .map(key => {
                            const item = rawItems[key];
                            // Garante que é um objeto válido com campos esperados
                            if (typeof item === 'object' && item !== null) {
                                return {
                                    description: '',
                                    quantity: 0,
                                    unitWeight: 0,
                                    ...item  // spread preserva todos os campos
                                };
                            }
                            return null;
                        })
                        .filter(Boolean); // remove nulos
                }

                const enrichedItems = itemsArray.map((item: any, index: number) => {
                    const itemCode = item.code || item.product_code || '';
                    const enrichedItem = { 
                        ...item, 
                        id: item.id || `${doc.id}-${index}`,
                        code: itemCode,
                        itemNumber: item.itemNumber || '', // Preserva o número do item no pedido de compra
                    };
                    delete enrichedItem.product_code;

                    enrichedItem.unitWeight = Number(enrichedItem.unitWeight) || 0;

                    const productCodeToSearch = (itemCode).trim().toUpperCase();
                    const productData = productCodeToSearch ? productsMap.get(productCodeToSearch) : undefined;
                    
                    if (enrichedItem.unitWeight === 0) {
                        if (productData && productData.unitWeight) {
                            enrichedItem.unitWeight = Number(productData.unitWeight) || 0;
                        }
                    }

                    let finalProductionPlan = (item.productionPlan || []).map((p: any) => ({
                        ...p,
                        startDate: safeToDate(p.startDate),
                        completedDate: safeToDate(p.completedDate),
                    }));

                    if (finalProductionPlan.length === 0) {
                        if (productData && productData.productionPlanTemplate && productData.productionPlanTemplate.length > 0) {
                            finalProductionPlan = productData.productionPlanTemplate.map((stage: any) => ({
                                ...stage,
                                status: "Pendente",
                                startDate: null,
                                completedDate: null,
                            }));
                        }
                    }
                    enrichedItem.productionPlan = finalProductionPlan;

                    return {
                        ...enrichedItem,
                        itemDeliveryDate: safeToDate(item.itemDeliveryDate) || deliveryDate,
                        shippingList: item.shippingList || '',
                        invoiceNumber: item.invoiceNumber || '',
                        shippingDate: safeToDate(item.shippingDate),
                    };
                });

                let finalStatus = mapOrderStatus(data.status);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                if (deliveryDate && deliveryDate < today && !['Concluído', 'Cancelado'].includes(finalStatus)) {
                    finalStatus = 'Atrasado';
                }
                
                let customerInfo: CustomerInfo = { id: '', name: 'Cliente não informado' };
                if (data.customer && typeof data.customer === 'object' && data.customer.name) {
                    customerInfo = { id: data.customer.id || '', name: data.customer.name };
                } else if (typeof data.customerName === 'string') {
                    customerInfo = { id: data.customerId || '', name: data.customerName };
                } else if (typeof data.customer === 'string') { 
                    customerInfo = { id: '', name: data.customer };
                }

                const orderNum = (data.orderNumber || data.quotationNumber || 'N/A').toString();
                
                console.log('📊 [DEBUG] Processando pedido:', {
                    docId: doc.id,
                    orderNumber: data.orderNumber,
                    quotationNumber: data.quotationNumber,
                    orderNumFinal: orderNum
                });

                return {
                    id: doc.id,
                    quotationId: data.quotationId || '',
                    quotationNumber: orderNum,
                    internalOS: data.internalOS || '',
                    projectName: data.projectName || '',
                    customer: customerInfo,
                    items: enrichedItems,
                    totalValue: data.totalValue || 0,
                    status: finalStatus,
                    createdAt: createdAtDate,
                    deliveryDate: deliveryDate,
                    completedAt: safeToDate(data.completedAt),
                    dataBookSent: Boolean(data.dataBookSent),
                    dataBookSentAt: safeToDate(data.dataBookSentAt),
                    totalWeight: calculateTotalWeight(enrichedItems),
                    driveLink: data.driveLink || '',
                    documents: data.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
                } as Order;
                } catch (error) {
                    console.error("Erro ao processar pedido:", doc.id, error);
                    // Retorna um pedido com dados mínimos em caso de erro
                    return {
                        id: doc.id,
                        quotationId: '',
                        quotationNumber: 'Erro ao carregar',
                        internalOS: '',
                        projectName: '',
                        customer: { id: '', name: 'Erro ao carregar' },
                        items: [],
                        totalValue: 0,
                        status: 'Erro',
                        createdAt: new Date(),
                        deliveryDate: undefined,
                        completedAt: undefined,
                        dataBookSent: false,
                        dataBookSentAt: undefined,
                        totalWeight: 0,
                        driveLink: '',
                        documents: { drawings: false, inspectionTestPlan: false, paintPlan: false },
                    } as Order;
                }
            });
            
            setOrders(ordersList);
        } catch (error) {
            console.error("Error fetching orders:", error);
            toast({
                variant: "destructive",
                title: "Erro ao buscar pedidos",
                description: "Ocorreu um erro ao carregar a lista de pedidos.",
            });
        } finally {
            setIsLoading(false);
        }
        return ordersList;
    };


    useEffect(() => {
        if (!authLoading && user) {
            fetchOrders();
            fetchCustomers();
        }
    }, [user, authLoading]);

    // Efeito para limpar estados quando mudar de modo de visualização
    useEffect(() => {
        if (viewMode !== 'kanban') {
            scrollPositionRef.current = 0;
            sessionStorage.removeItem('kanbanScrollPosition');
        }
    }, [viewMode]);

    // Debug dos componentes para verificar se estão carregados corretamente
    useEffect(() => {
        console.log('🔍 Verificando componentes:', {
            Popover: typeof Popover,
            Calendar: typeof Calendar,
            PopoverTrigger: typeof PopoverTrigger,
            PopoverContent: typeof PopoverContent
        });
    }, []);

    // COMPONENTE PERSONALIZADO PARA DATA DE ENTREGA DO ITEM (ALTERNATIVA MAIS ROBUSTA)
    const ItemDeliveryDateField = ({ form, index }: { form: any; index: number }) => {
      const [inputValue, setInputValue] = useState("");
      const fieldValue = form.watch(`items.${index}.itemDeliveryDate`);

      // Sincronizar valor do input com o valor do formulário
      useEffect(() => {
        if (fieldValue) {
          try {
            const dateToFormat = fieldValue instanceof Date ? fieldValue : new Date(fieldValue);
            if (!isNaN(dateToFormat.getTime())) {
              setInputValue(format(dateToFormat, "yyyy-MM-dd"));
            } else {
              setInputValue("");
            }
          } catch (error) {
            console.warn('Erro ao formatar data:', error);
            setInputValue("");
          }
        } else {
          setInputValue("");
        }
      }, [fieldValue]);

      const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        console.log('📅 [CUSTOM] Valor do input:', newValue);
        
        setInputValue(newValue);
        
        if (newValue) {
          try {
            const [year, month, day] = newValue.split('-').map(Number);
            const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);
            
            if (!isNaN(newDate.getTime())) {
              console.log('📅 [CUSTOM] Data válida criada:', newDate);
              form.setValue(`items.${index}.itemDeliveryDate`, newDate);
            } else {
              console.warn('📅 [CUSTOM] Data inválida:', newValue);
            }
          } catch (error) {
            console.error('📅 [CUSTOM] Erro ao processar data:', error);
          }
        } else {
          console.log('📅 [CUSTOM] Data limpa');
          form.setValue(`items.${index}.itemDeliveryDate`, null);
        }
      };

      return (
        <FormItem>
          <FormLabel>Entrega do Item</FormLabel>
          <FormControl>
            <Input
              type="date"
              value={inputValue}
              onChange={handleDateChange}
              className="w-full"
              placeholder="Selecione a data de entrega"
            />
          </FormControl>
          <FormMessage />
          <FormDescription className="text-xs text-muted-foreground">
            Data específica de entrega deste item (opcional)
          </FormDescription>
        </FormItem>
      );
    };

    const handleViewOrder = (order: Order) => {
        // Salvar posição do scroll horizontal do Kanban
        if (viewMode === 'kanban' && kanbanScrollRef.current) {
            scrollPositionRef.current = kanbanScrollRef.current.scrollLeft;
            sessionStorage.setItem('kanbanScrollPosition', scrollPositionRef.current.toString());
            console.log('💾 Salvando posição horizontal:', scrollPositionRef.current);
        }
        
        // NOVO: Salvar posição do scroll vertical de cada coluna
        if (viewMode === 'kanban') {
            const columns = document.querySelectorAll('[data-column-scroll]');
            columns.forEach((column) => {
                const columnId = column.getAttribute('data-column-id');
                if (columnId) {
                    const scrollTop = column.scrollTop;
                    columnScrollPositions.current.set(columnId, scrollTop);
                    console.log(`💾 Salvando scroll da coluna ${columnId}:`, scrollTop);
                }
            });
        }
        
        console.log('🔍 [DEBUG] Inicializando formulário com:', {
            quotationNumber: order.quotationNumber,
            orderId: order.id
        });
        
        setSelectedOrder(order);
        form.reset({
            ...order,
            status: order.status as any,
            documents: order.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
            quotationNumber: order.quotationNumber || '',
        });
        setIsEditing(false);
        setSelectedItems(new Set());
        setIsSheetOpen(true);
    };

        // Função helper para remover campos undefined (Firestore não aceita undefined)
    const removeUndefinedFields = (obj: any): any => {
        if (obj === null || obj === undefined) {
            return null;
        }
        
        if (Array.isArray(obj)) {
            return obj.map(removeUndefinedFields);
        }
        
        if (typeof obj === 'object') {
            const cleaned: any = {};
            Object.keys(obj).forEach(key => {
                const value = obj[key];
                if (value !== undefined) {
                    cleaned[key] = removeUndefinedFields(value);
                }
            });
            return cleaned;
        }
        
        return obj;
    };

    const onOrderSubmit = async (values: z.infer<typeof orderSchema>) => {
        if (!selectedOrder) {
            console.error('❌ [DEBUG] selectedOrder não encontrado');
            return;
        }

        console.log('🚀 [DEBUG] Iniciando salvamento robusto:', {
            orderId: selectedOrder.id,
            quotationNumberAntigo: selectedOrder.quotationNumber,
            quotationNumberNovo: values.quotationNumber
        });

        console.log('🔍 [DEBUG] Iniciando salvamento:', {
            orderId: selectedOrder.id,
            quotationNumber: values.quotationNumber,
            originalQuotationNumber: selectedOrder.quotationNumber
        });

        console.log('💾 [SUBMIT] Valores do formulário:', values);

        try {
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            
            // Primeiro, verificar se o documento existe
            const currentDoc = await getDoc(orderRef);
            if (!currentDoc.exists()) {
                throw new Error(`Documento ${selectedOrder.id} não encontrado no Firestore`);
            }
            
            console.log('✅ [DEBUG] Documento encontrado, dados atuais:', {
                quotationNumber: currentDoc.data().quotationNumber
            });
            
            // CORREÇÃO: Processamento mais cuidadoso das datas dos itens
            const itemsToSave = values.items.map((formItem, itemIndex) => {
              console.log(`💾 [SUBMIT] Processando item ${itemIndex + 1}:`, formItem);
              
              const originalItem = selectedOrder.items.find(i => i.id === formItem.id);
              const planToSave = originalItem?.productionPlan?.map(p => ({
                ...p,
                startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : (p.startDate || null),
                completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : (p.completedDate || null),
                status: p.status || 'Pendente',
                stageName: p.stageName || '',
                durationDays: p.durationDays || 0,
              })) || [];

              // CORREÇÃO: Conversão cuidadosa das datas do item
              let itemDeliveryTimestamp = null;
              let shippingTimestamp = null;

              if (formItem.itemDeliveryDate) {
                try {
                  const deliveryDate = formItem.itemDeliveryDate instanceof Date 
                    ? formItem.itemDeliveryDate 
                    : new Date(formItem.itemDeliveryDate);
                  
                  if (!isNaN(deliveryDate.getTime())) {
                    itemDeliveryTimestamp = Timestamp.fromDate(deliveryDate);
                    console.log('✅ [SUBMIT] Data de entrega convertida:', deliveryDate.toISOString());
                  }
                } catch (error) {
                  console.warn('⚠️ [SUBMIT] Erro ao converter data de entrega:', error);
                }
              }

              if (formItem.shippingDate) {
                try {
                  const shippingDate = formItem.shippingDate instanceof Date 
                    ? formItem.shippingDate 
                    : new Date(formItem.shippingDate);
                  
                  if (!isNaN(shippingDate.getTime())) {
                    shippingTimestamp = Timestamp.fromDate(shippingDate);
                    console.log('✅ [SUBMIT] Data de embarque convertida:', shippingDate.toISOString());
                  }
                } catch (error) {
                  console.warn('⚠️ [SUBMIT] Erro ao converter data de embarque:', error);
                }
              }

              return {
                ...formItem,
                id: formItem.id || '',
                itemNumber: formItem.itemNumber || '',
                description: formItem.description || '',
                quantity: formItem.quantity || 0,
                unitWeight: formItem.unitWeight || 0,
                unitPrice: formItem.unitPrice || 0,
                code: formItem.code || '',
                itemDeliveryDate: itemDeliveryTimestamp,
                shippingDate: shippingTimestamp,
                shippingList: formItem.shippingList || '',
                invoiceNumber: formItem.invoiceNumber || '',
                productionPlan: planToSave,
              };
            });

            console.log('💾 [SUBMIT] Itens processados para salvamento:', itemsToSave);

            const totalWeight = calculateTotalWeight(itemsToSave);
            
            // Preparar apenas os campos que realmente mudaram
            const updateData: any = {};
            
            if (values.quotationNumber !== selectedOrder.quotationNumber) {
                updateData.quotationNumber = values.quotationNumber || null;
                console.log('📝 [DEBUG] Atualizando quotationNumber:', values.quotationNumber);
            }
            
            if (values.customer?.id !== selectedOrder.customer?.id) {
                updateData.customer = values.customer || null;
                updateData.customerId = values.customer?.id || null;
                updateData.customerName = values.customer?.name || null;
            }
            
            if (values.status !== selectedOrder.status) {
                updateData.status = values.status || null;
            }
            
            // Outros campos que sempre devem ser atualizados
            updateData.internalOS = values.internalOS || null;
            updateData.projectName = values.projectName || null;
            updateData.deliveryDate = values.deliveryDate ? Timestamp.fromDate(new Date(values.deliveryDate)) : null;
            updateData.driveLink = values.driveLink || null;
            updateData.documents = values.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false };
            updateData.items = itemsToSave || [];
            updateData.totalWeight = totalWeight || 0;
            updateData.lastUpdate = Timestamp.now();
            
            console.log('📦 [DEBUG] Dados que serão enviados para o Firestore:', updateData);
            
            const dataToSave = {
                customer: values.customer || null,
                customerId: values.customer?.id || null,
                customerName: values.customer?.name || null,
                internalOS: values.internalOS || null,
                projectName: values.projectName || null,
                quotationNumber: values.quotationNumber || null,
                deliveryDate: values.deliveryDate ? Timestamp.fromDate(new Date(values.deliveryDate)) : null,
                status: values.status || null,
                driveLink: values.driveLink || null,
                documents: values.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
                items: itemsToSave || [],
                totalWeight: totalWeight || 0,
            };

            console.log('💾 [SUBMIT] Dados finais para Firestore:', dataToSave);

            // Remove campos undefined antes de enviar para o Firestore
            const cleanedData = removeUndefinedFields(dataToSave);

            // Salvar no Firestore usando updateData (mais eficiente)
            await updateDoc(orderRef, updateData);
            console.log('✅ [DEBUG] updateDoc executado com sucesso');

            // Verificar se foi salvo corretamente
            const verificationDoc = await getDoc(orderRef);
            if (verificationDoc.exists()) {
                const savedData = verificationDoc.data();
                console.log('🔍 [DEBUG] Verificação - dados salvos:', {
                    quotationNumber: savedData.quotationNumber,
                    lastUpdate: savedData.lastUpdate
                });
                
                if (savedData.quotationNumber === values.quotationNumber) {
                    console.log('✅ [DEBUG] Confirmado: quotationNumber foi salvo corretamente');
                } else {
                    console.error('❌ [DEBUG] Erro: quotationNumber não foi salvo corretamente', {
                        esperado: values.quotationNumber,
                        salvo: savedData.quotationNumber
                    });
                }
            }
    
            toast({
                title: "Pedido atualizado!",
                description: "Os dados do pedido foram salvos com sucesso.",
            });

            console.log('🔄 [DEBUG] Recarregando dados do servidor...');

            // Aguardar um pouco para garantir que o Firestore processou
            await new Promise(resolve => setTimeout(resolve, 500));

            // Buscar dados atualizados
            const updatedOrderDoc = await getDoc(orderRef);
            if (updatedOrderDoc.exists()) {
                const updatedData = updatedOrderDoc.data();
                console.log('✅ [DEBUG] Dados atualizados do servidor:', {
                    quotationNumber: updatedData.quotationNumber,
                    orderId: updatedOrderDoc.id
                });
                
                // Recarregar lista completa
                const allOrders = await fetchOrders();
                const updatedOrderInList = allOrders.find(o => o.id === selectedOrder.id);
                
                if (updatedOrderInList) {
                    console.log('✅ [DEBUG] Pedido encontrado na lista atualizada:', {
                        quotationNumber: updatedOrderInList.quotationNumber
                    });
                    
                    setSelectedOrder(updatedOrderInList);
                    form.reset({
                        ...updatedOrderInList,
                        status: updatedOrderInList.status as any,
                    });
                } else {
                    console.warn('⚠️ [DEBUG] Pedido não encontrado na lista após recarregamento');
                }
            } else {
                console.error('❌ [DEBUG] Documento não encontrado após salvamento');
            }

            setIsEditing(false);
        } catch (error) {
            console.error("❌ [DEBUG] Erro detalhado no salvamento:", {
                error: error.message,
                stack: error.stack,
                orderId: selectedOrder.id
            });
            
            toast({
                variant: "destructive",
                title: "Erro ao salvar",
                description: `Não foi possível atualizar o pedido: ${error.message}`,
            });
        }
    };
    
    const toggleYearCollapse = useCallback((year: string) => {
        setCollapsedYearColumns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(year)) {
                newSet.delete(year);
            } else {
                newSet.add(year);
            }
            return newSet;
        });
    }, []);
    
    const uniqueStatuses = useMemo(() => {
        const statuses = new Set(orders.map(order => order.status).filter(Boolean));
        return Array.from(statuses);
    }, [orders]);

    // Adicione esta função para gerar lista de meses disponíveis
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        orders.forEach(order => {
            if (order.deliveryDate) {
                const monthKey = format(order.deliveryDate, 'yyyy-MM');
                months.add(monthKey);
            }
        });
        
        // Converter para array e ordenar
        return Array.from(months).sort().map(monthKey => {
            const [year, month] = monthKey.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1, 1);
            return {
                value: monthKey,
                label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            };
        });
    }, [orders]);

    const filteredOrders = useMemo(() => {
        const filtered = orders.filter(order => {
            const query = searchQuery.toLowerCase();
            const customerName = order.customer?.name?.toLowerCase() || '';
            const status = order.status?.toLowerCase() || '';
            const quotationNumber = order.quotationNumber?.toString() || '';
            const internalOS = order.internalOS?.toLowerCase() || '';
            const projectName = order.projectName?.toLowerCase() || '';

            const textMatch = quotationNumber.includes(query) ||
                customerName.includes(query) ||
                status.includes(query) ||
                internalOS.includes(query) ||
                projectName.includes(query);

            const statusMatch = statusFilter === 'all' || order.status === statusFilter;
            const customerMatch = customerFilter === 'all' || order.customer.id === customerFilter;
            const dateMatch = !dateFilter || (order.deliveryDate && isSameDay(order.deliveryDate, dateFilter));
            
            // NOVO FILTRO DE MÊS
            let monthMatch = true;
            if (monthFilter !== 'all') {
                if (order.deliveryDate) {
                    const orderMonth = format(order.deliveryDate, 'yyyy-MM');
                    monthMatch = orderMonth === monthFilter;
                } else {
                    monthMatch = false;
                }
            }
            
            // NOVO FILTRO DE DATA BOOK
            let dataBookMatch = true;
            if (dataBookFilter === 'pendente') {
                dataBookMatch = order.status === 'Concluído' && !order.dataBookSent;
            } else if (dataBookFilter === 'enviado') {
                dataBookMatch = order.dataBookSent === true;
            }

            return textMatch && statusMatch && customerMatch && dateMatch && monthMatch && dataBookMatch;
        });

        return filtered.sort((a, b) => {
            const aIsCompleted = a.status === 'Concluído';
            const bIsCompleted = b.status === 'Concluído';

            if (aIsCompleted && !bIsCompleted) return 1;
            if (!aIsCompleted && bIsCompleted) return -1;
            
            const aDate = a.deliveryDate;
            const bDate = b.deliveryDate;

            if (aDate && !bDate) return -1;
            if (!aDate && bDate) return 1;
            if (aDate && bDate) {
                const dateComparison = aDate.getTime() - bDate.getTime();
                if (dateComparison !== 0) return dateComparison;
            }

            return b.createdAt.getTime() - a.createdAt.getTime();
        });
    }, [orders, searchQuery, statusFilter, customerFilter, dateFilter, monthFilter, dataBookFilter]);
    
    // Adicione esta função para calcular o peso total do mês filtrado
    const monthWeightStats = useMemo(() => {
        if (monthFilter === 'all') {
            return null;
        }
        
        let totalWeight = 0;
        let completedWeight = 0;
        const orderSet = new Set<string>();
        
        orders.forEach(order => {
            order.items.forEach(item => {
                const itemDeliveryDate = item.itemDeliveryDate || order.deliveryDate;
                if (!itemDeliveryDate) return;

                const itemMonth = format(itemDeliveryDate, 'yyyy-MM');
                if (itemMonth !== monthFilter) return;

                const quantity = Number(item.quantity) || 0;
                const unitWeight = Number(item.unitWeight) || 0;
                const itemWeight = quantity * unitWeight;

                totalWeight += itemWeight;

                const itemProgress = calculateItemProgress(item);
                if (itemProgress === 100) {
                    completedWeight += itemWeight;
                }

                orderSet.add(order.id);
            });
        });
        
        const pendingWeight = totalWeight - completedWeight;
        
        return {
            totalOrders: orderSet.size,
            totalWeight,
            completedWeight,
            pendingWeight,
            completedPercentage: totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0
        };
    }, [orders, monthFilter]);
    
    const watchedItems = form.watch("items");
    const currentTotalWeight = useMemo(() => calculateTotalWeight(watchedItems || []), [watchedItems]);

    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("all");
        setCustomerFilter("all");
        setDateFilter(undefined);
        setDataBookFilter("all");
        setMonthFilter("all");
    };

    const hasActiveFilters = searchQuery || statusFilter !== 'all' || customerFilter !== 'all' || dateFilter || dataBookFilter !== 'all' || monthFilter !== 'all';

    // Organiza os pedidos por data de entrega para visualização em calendário
    const ordersByDate = useMemo(() => {
        const grouped = new Map<string, Order[]>();
        
        filteredOrders.forEach(order => {
            if (order.deliveryDate) {
                const dateKey = format(order.deliveryDate, 'yyyy-MM-dd');
                if (!grouped.has(dateKey)) {
                    grouped.set(dateKey, []);
                }
                grouped.get(dateKey)!.push(order);
            }
        });
        
        return grouped;
    }, [filteredOrders]);

    // Organiza os pedidos por mês para visualização Kanban - CORRIGIDO
    const ordersByMonth = useMemo(() => {
        const grouped = new Map<string, {
            orders: Order[];
            totalWeight: number;
            itemsByOrder: Map<string, OrderItem[]>;
        }>();
        
        // NOVO: Agrupar concluídos por ano
        const completedByYear = new Map<string, {
            orders: Order[];
            totalWeight: number;
        }>();

        filteredOrders.forEach(order => {
            if (order.status === 'Concluído') {
                let completionYear: string;
                
                if (order.completedAt) {
                    // Prioridade 1: Data de conclusão oficial
                    completionYear = format(new Date(order.completedAt), 'yyyy');
                    console.log('📅 Usando completedAt:', order.quotationNumber, completionYear);
                } else {
                    // Prioridade 2: Data de embarque mais recente dos itens
                    const shippingDates = order.items
                        .map(item => item.shippingDate)
                        .filter(date => date !== null && date !== undefined)
                        .map(date => new Date(date));
                    
                    if (shippingDates.length > 0) {
                        // Pegar a data de embarque mais recente
                        const latestShipping = new Date(Math.max(...shippingDates.map(d => d.getTime())));
                        completionYear = format(latestShipping, 'yyyy');
                        console.log('📦 Usando shippingDate:', order.quotationNumber, completionYear);
                    } else if (order.createdAt) {
                        // Prioridade 3: Data de criação do pedido
                        completionYear = format(new Date(order.createdAt), 'yyyy');
                        console.log('📝 Usando createdAt:', order.quotationNumber, completionYear);
                    } else {
                        completionYear = 'Sem Data';
                        console.log('❌ Sem data:', order.quotationNumber);
                    }
                }
                
                if (!completedByYear.has(completionYear)) {
                    completedByYear.set(completionYear, {
                        orders: [],
                        totalWeight: 0
                    });
                }
                
                const yearData = completedByYear.get(completionYear)!;
                yearData.orders.push(order);
                yearData.totalWeight += order.totalWeight || 0;
                return;
            }

            // CORREÇÃO: Usar apenas a data de entrega do pedido, não dos itens
            if (!order.deliveryDate) return;

            const monthKey = format(order.deliveryDate, 'yyyy-MM');

            if (!grouped.has(monthKey)) {
                grouped.set(monthKey, {
                    orders: [],
                    totalWeight: 0,
                    itemsByOrder: new Map()
                });
            }

            const monthData = grouped.get(monthKey)!;

            // Adicionar pedido apenas uma vez
            if (!monthData.orders.find(o => o.id === order.id)) {
                monthData.orders.push(order);
            }

            // Adicionar TODOS os itens do pedido para esta coluna
            if (!monthData.itemsByOrder.has(order.id)) {
                monthData.itemsByOrder.set(order.id, []);
            }

            // Adicionar todos os itens do pedido
            order.items.forEach(item => {
                monthData.itemsByOrder.get(order.id)!.push(item);
                const quantity = Number(item.quantity) || 0;
                const unitWeight = Number(item.unitWeight) || 0;
                monthData.totalWeight += quantity * unitWeight;
            });
        });

        const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

        return {
            monthColumns: sortedEntries,
            completedByYear: Array.from(completedByYear.entries())
                .sort(([a], [b]) => b.localeCompare(a)) // Anos mais recentes primeiro
        };
    }, [filteredOrders]);

    // Gera os dias do mês atual para o calendário
    const generateCalendarDays = (date: Date): { days: Date[], firstDay: Date, lastDay: Date } => {
        const year = date.getFullYear();
        const month = date.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay()); // Começa no domingo
        
        const days: Date[] = [];
        const current = new Date(startDate);
        
        // Gera 42 dias (6 semanas) para preencher o calendário
        for (let i = 0; i < 42; i++) {
            days.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        
        return { days, firstDay, lastDay };
    };

    const { days: calendarDays, firstDay, lastDay } = generateCalendarDays(calendarDate);

    // Componente Kanban - SEÇÃO CORRIGIDA
    const KanbanView = () => {
        const allColumns = [
            ...ordersByMonth.monthColumns,
            // NOVO: Adicionar colunas de anos concluídos
            ...ordersByMonth.completedByYear.map(([year, data]) => [
                `completed-${year}`,
                {
                    orders: data.orders,
                    totalWeight: data.totalWeight,
                    itemsByOrder: new Map<string, OrderItem[]>()
                }
            ] as [string, { orders: Order[]; totalWeight: number; itemsByOrder?: Map<string, OrderItem[]> }])
        ];

        const totalOrdersToShow = allColumns.reduce((acc, [, monthData]) => acc + monthData.orders.length, 0);
        
        // Efeito para restaurar scroll horizontal E vertical quando modal fecha
        useEffect(() => {
            if (viewMode === 'kanban' && !isSheetOpen) {
                // Restaurar scroll horizontal
                if (kanbanScrollRef.current) {
                    const savedPosition = scrollPositionRef.current || 
                        parseInt(sessionStorage.getItem('kanbanScrollPosition') || '0', 10);
                    
                    if (savedPosition > 0) {
                        setTimeout(() => {
                            if (kanbanScrollRef.current) {
                                kanbanScrollRef.current.scrollLeft = savedPosition;
                                console.log('🔄 Posição horizontal restaurada:', savedPosition);
                            }
                        }, 50);
                    }
                }
                
                // NOVO: Restaurar scroll vertical de cada coluna
                setTimeout(() => {
                    const columns = document.querySelectorAll('[data-column-scroll]');
                    columns.forEach((column) => {
                        const columnId = column.getAttribute('data-column-id');
                        if (columnId) {
                            const savedScroll = columnScrollPositions.current.get(columnId);
                            if (savedScroll !== undefined) {
                                column.scrollTop = savedScroll;
                                console.log(`🔄 Scroll da coluna ${columnId} restaurado:`, savedScroll);
                            }
                        }
                    });
                }, 100);
            }
        }, [viewMode, isSheetOpen]);
        
        if (totalOrdersToShow === 0) {
            return (
                <div className="text-center py-12">
                    <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium mb-2 text-foreground">Nenhum pedido para exibir no Kanban</h3>
                    <p className="text-foreground/70">
                        Os pedidos aparecerão aqui quando tiverem data de entrega definida ou estiverem concluídos.
                        {hasActiveFilters && (
                            <span className="block mt-2 text-sm">
                                Verifique se os filtros aplicados não estão ocultando os pedidos.
                            </span>
                        )}
                    </p>
                </div>
            );
        }

        return (
            <div className="w-full">
                <div 
                    className="w-full overflow-x-auto" 
                    data-kanban-scroll
                    ref={kanbanScrollRef}
                    onScroll={(e) => {
                        const target = e.target as HTMLDivElement;
                        scrollPositionRef.current = target.scrollLeft;
                        sessionStorage.setItem('kanbanScrollPosition', target.scrollLeft.toString());
                    }}
                >
                    <div className="flex w-max space-x-4 p-4 min-w-full">
                        {allColumns.map(([monthKey, monthData]) => {
                            const isCompletedYear = monthKey.startsWith('completed-');
                            
                            // CORREÇÃO PRINCIPAL: Formatação correta do nome do mês
                            let monthLabel = '';
                            if (isCompletedYear) {
                                const year = monthKey.replace('completed-', '');
                                monthLabel = `Concluídos ${year}`;
                            } else {
                                // Criar uma data válida a partir da chave YYYY-MM
                                const [year, month] = monthKey.split('-');
                                const dateForLabel = new Date(parseInt(year), parseInt(month) - 1, 1);
                                
                                monthLabel = dateForLabel.toLocaleDateString('pt-BR', { 
                                    month: 'short', 
                                    year: 'numeric' 
                                }).replace('.', '');
                            }
                            
                            return (
                                <div key={monthKey} className="flex-shrink-0 w-72">
                                    {/* Header da coluna */}
                                    <div 
                                        className={`rounded-lg border-2 p-4 mb-4 ${
                                            isCompletedYear
                                                ? 'bg-green-50 border-green-300' 
                                                : 'bg-blue-50 border-blue-300'
                                        } ${isCompletedYear ? 'cursor-pointer hover:bg-green-100 transition-colors' : ''}`}
                                        onClick={isCompletedYear ? () => {
                                            const year = monthKey.replace('completed-', '');
                                            toggleYearCollapse(year);
                                        } : undefined}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className={`font-semibold text-lg flex items-center gap-2 ${
                                                isCompletedYear
                                                    ? 'text-green-800' 
                                                    : 'text-blue-800'
                                            }`}>
                                                {isCompletedYear ? (
                                                    <CheckCircle className="h-5 w-5 text-green-700" />
                                                ) : (
                                                    <CalendarDays className="h-5 w-5 text-blue-700" />
                                                )}
                                                {monthLabel}
                                                {isCompletedYear && (
                                                    <button 
                                                        className="ml-2 p-1 hover:bg-green-200 rounded transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const year = monthKey.replace('completed-', '');
                                                            toggleYearCollapse(year);
                                                        }}
                                                    >
                                                        {collapsedYearColumns.has(monthKey.replace('completed-', '')) ? (
                                                            <ChevronDown className="h-4 w-4 text-green-700" />
                                                        ) : (
                                                            <ChevronUp className="h-4 w-4 text-green-700" />
                                                        )}
                                                    </button>
                                                )}
                                            </h3>
                                            <Badge variant="secondary" className="font-medium">
                                                {monthData.orders.length}
                                            </Badge>
                                        </div>
                                        <div className={`text-sm ${
                                            isCompletedYear
                                                ? 'text-green-700' 
                                                : 'text-blue-700'
                                        }`}>
                                            <div className="flex items-center gap-1">
                                                <Weight className="h-4 w-4" />
                                                <span className="font-medium">
                                                    {monthData.totalWeight.toLocaleString('pt-BR', { 
                                                        minimumFractionDigits: 2, 
                                                        maximumFractionDigits: 2 
                                                    })} kg
                                                </span>
                                            </div>
                                            {!isCompletedYear && (
                                                <p className="text-xs mt-1 text-muted-foreground">
                                                    Peso dos itens com entrega neste mês
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* NOVO: Indicador quando colapsado */}
                                    {isCompletedYear && collapsedYearColumns.has(monthKey.replace('completed-', '')) && (
                                        <div className="text-center py-4 text-green-700">
                                            <p className="text-sm font-medium">
                                                Clique para expandir e ver os {monthData.orders.length} pedidos
                                            </p>
                                        </div>
                                    )}

                                    {/* Cards dos pedidos - ADICIONAR CONTROLE DE COLAPSO */}
                                    {(!isCompletedYear || !collapsedYearColumns.has(monthKey.replace('completed-', ''))) && (
                                        <div 
                                            className="space-y-3 max-h-[600px] overflow-y-auto pr-2"
                                            data-column-scroll
                                            data-column-id={monthKey}
                                            onScroll={(e) => {
                                                const target = e.target as HTMLDivElement;
                                                columnScrollPositions.current.set(monthKey, target.scrollTop);
                                            }}
                                        >
                                        {monthData.orders.map(order => {
                                            const statusProps = getStatusProps(order.status);
                                            const orderProgress = calculateOrderProgress(order);

                                            // CORREÇÃO: Sempre mostrar peso total e todos os itens do pedido
                                            const monthSpecificWeight = order.totalWeight || 0;
                                            const monthSpecificItems = order.items.length;

                                            return (
                                                <Card 
                                                    key={order.id} 
                                                    className="p-4 cursor-pointer hover:shadow-md transition-shadow duration-200 border-l-4"
                                                    style={{
                                                        borderLeftColor: isCompletedYear 
                                                            ? '#16a34a' 
                                                            : statusProps.colorClass.includes('bg-green-600') ? '#16a34a'
                                                            : statusProps.colorClass.includes('bg-blue-500') ? '#3b82f6'
                                                            : statusProps.colorClass.includes('bg-orange-500') ? '#f97316'
                                                            : statusProps.colorClass.includes('bg-red-') ? '#dc2626'
                                                            : '#6b7280'
                                                    }}
                                                    onClick={() => handleViewOrder(order)}
                                                >
                                                    <div className="space-y-3">
                                                        {/* Header do card */}
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-semibold text-sm truncate">
                                                                    Pedido {order.quotationNumber}
                                                                </h4>
                                                                <p className="text-xs text-muted-foreground truncate">
                                                                    {order.customer.name}
                                                                </p>
                                                            </div>
                                                            <Badge variant={statusProps.variant} className={`text-xs ${statusProps.colorClass}`}>
                                                                <statusProps.icon className="mr-1 h-3 w-3" />
                                                                {statusProps.label}
                                                            </Badge>
                                                        </div>

                                                        {/* Informações do projeto e OS */}
                                                        {(order.projectName || order.internalOS) && (
                                                            <div className="space-y-1">
                                                                {order.projectName && (
                                                                    <p className="text-xs text-muted-foreground truncate">
                                                                        📋 {order.projectName}
                                                                    </p>
                                                                )}
                                                                {order.internalOS && (
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <p className="text-xs text-muted-foreground">
                                                                            🏷️ OS: {order.internalOS}
                                                                        </p>
                                                                        {order.status === 'Concluído' && (
                                                                            <Badge variant="default" className="bg-green-600 text-white text-xs">
                                                                                ✓ Concluído
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Dados importantes */}
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div>
                                                                <span className="text-muted-foreground">
                                                                    Peso Total:
                                                                </span>
                                                                <p className="font-medium">
                                                                    {monthSpecificWeight.toLocaleString('pt-BR', { 
                                                                        minimumFractionDigits: 1, 
                                                                        maximumFractionDigits: 1 
                                                                    })} kg
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground">
                                                                    Total de Itens:
                                                                </span>
                                                                <p className="font-medium">{monthSpecificItems}</p>
                                                            </div>
                                                        </div>

                                                        {/* Data de entrega */}
                                                        {order.deliveryDate && (
                                                            <div className="text-xs">
                                                                <span className="text-muted-foreground">Entrega Geral:</span>
                                                                <p className="font-medium">
                                                                    {format(order.deliveryDate, "dd/MM/yyyy")}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Progresso */}
                                                        {!isCompletedYear && (
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-xs text-muted-foreground">Progresso:</span>
                                                                    <span className="text-xs font-medium">{Math.round(orderProgress)}%</span>
                                                                </div>
                                                                <Progress value={orderProgress} className="h-1.5" />
                                                            </div>
                                                        )}

                                                        {/* Status dos documentos */}
                                                        <div className="flex items-center justify-center pt-2 border-t border-border/50">
                                                            <DocumentStatusIcons documents={order.documents} />
                                                        </div>
                                                    </div>
                                                </Card>
                                            );
                                        })}
                                        
                                        {monthData.orders.length === 0 && (
                                            <div className="text-center py-8 text-gray-500">
                                                <Package className="h-8 w-8 mx-auto mb-2" />
                                                <p className="text-sm">Nenhum pedido</p>
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    // Componente de calendário
    const CalendarView = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return (
            <div className="bg-white rounded-lg border">
                {/* Header do calendário */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-foreground">
                        {calendarDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </h2>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const newDate = new Date(calendarDate);
                                newDate.setMonth(newDate.getMonth() - 1);
                                setCalendarDate(newDate);
                            }}
                        >
                            ←
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCalendarDate(new Date())}
                        >
                            Hoje
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const newDate = new Date(calendarDate);
                                newDate.setMonth(newDate.getMonth() + 1);
                                setCalendarDate(newDate);
                            }}
                        >
                            →
                        </Button>
                    </div>
                </div>

                {/* Dias da semana */}
                <div className="grid grid-cols-7 border-b">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                        <div key={day} className="p-2 text-center text-sm font-medium text-gray-700 border-r last:border-r-0">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Grid do calendário */}
                <div className="grid grid-cols-7">
                    {calendarDays.map((day, index) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const ordersForDay = ordersByDate.get(dateKey) || [];
                        const isCurrentMonth = day.getMonth() === calendarDate.getMonth();
                        const isToday = isSameDay(day, today);
                        const isPast = day < today;
                        
                        return (
                            <div
                                key={index}
                                className={cn(
                                    "min-h-[120px] p-1 border-r border-b last:border-r-0",
                                    !isCurrentMonth && "bg-muted/20",
                                    isToday && "bg-blue-50"
                                )}
                            >
                                <div className={cn(
                                    "text-sm mb-1 p-1",
                                    !isCurrentMonth && "text-gray-400",
                                    isToday && "font-bold text-blue-700",
                                    isPast && isCurrentMonth && "text-gray-600"
                                )}>
                                    {day.getDate()}
                                </div>
                                
                                <div className="space-y-1">
                                    {ordersForDay.slice(0, 3).map(order => {
                                        const statusProps = getStatusProps(order.status);
                                        let bgColor = "bg-gray-600"; // Default
                                        
                                        if (statusProps.colorClass.includes('bg-green-600')) bgColor = "bg-green-600";
                                        else if (statusProps.colorClass.includes('bg-blue-500')) bgColor = "bg-blue-500";
                                        else if (statusProps.colorClass.includes('bg-orange-500')) bgColor = "bg-orange-500";
                                        else if (statusProps.colorClass.includes('bg-red-')) bgColor = "bg-red-600";
                                        
                                        return (
                                            <div
                                                key={order.id}
                                                className={cn(
                                                    "text-xs p-1 rounded cursor-pointer hover:opacity-80 truncate",
                                                    bgColor,
                                                    "text-white"
                                                )}
                                                onClick={() => handleViewOrder(order)}
                                                title={`${order.quotationNumber} - ${order.customer.name} - ${order.status}`}
                                            >
                                                <div className="font-medium truncate">
                                                    {order.quotationNumber}
                                                </div>
                                                <div className="text-white/90 truncate text-[10px]">
                                                    {order.customer.name}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    
                                    {ordersForDay.length > 3 && (
                                        <div className="text-xs text-muted-foreground p-1">
                                            +{ordersForDay.length - 3} mais
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const handleDeleteClick = (order: Order) => {
        setOrderToDelete(order);
        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!orderToDelete) return;
        try {
            await deleteDoc(doc(db, "companies", "mecald", "orders", orderToDelete.id));
            toast({ title: "Pedido excluído!", description: "O pedido foi removido do sistema." });
            setOrderToDelete(null);
            setIsDeleteDialogOpen(false);
            setIsSheetOpen(false);
            await fetchOrders();
        } catch (error) {
            console.error("Error deleting order: ", error);
            toast({
                variant: "destructive",
                title: "Erro ao excluir pedido",
                description: "Não foi possível remover o pedido. Tente novamente.",
            });
        }
    };

    // FUNÇÃO PARA DELETAR UM ITEM
    const handleDeleteItem = (index: number) => {
      const currentItems = form.getValues("items");
      const itemToRemove = currentItems[index];
      
      setItemToDelete({ index, item: itemToRemove });
      setIsItemDeleteDialogOpen(true);
    };

    // FUNÇÃO PARA CONFIRMAR A EXCLUSÃO
    const handleConfirmDeleteItem = () => {
      if (!itemToDelete) return;
      
      // Remove o item usando o useFieldArray
      const currentItems = form.getValues("items");
      const updatedItems = currentItems.filter((_, index) => index !== itemToDelete.index);
      form.setValue("items", updatedItems);
      
      // Fechar dialog
      setIsItemDeleteDialogOpen(false);
      setItemToDelete(null);
      
      toast({
        title: "Item removido!",
        description: `O item "${itemToDelete.item.description}" foi removido do pedido.`,
      });
    };

    // Função para adicionar novo item
    const handleAddNewItem = () => {
      if (!newItemForm.description.trim()) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "A descrição do item é obrigatória.",
        });
        return;
      }

      const currentItems = form.getValues("items");
      const newItem = {
        id: `new-item-${Date.now()}`,
        description: newItemForm.description.trim(),
        itemNumber: newItemForm.itemNumber.trim(),
        code: newItemForm.code.trim(),
        quantity: Number(newItemForm.quantity) || 1,
        unitWeight: Number(newItemForm.unitWeight) || 0,
        itemDeliveryDate: null,
        shippingDate: null,
        shippingList: '',
        invoiceNumber: '',
        productionPlan: [],
      };

      form.setValue("items", [...currentItems, newItem]);
      
      // Limpar formulário
      setNewItemForm({
        description: '',
        itemNumber: '',
        code: '',
        quantity: 1,
        unitWeight: 0,
      });
      setIsAddingItem(false);

      toast({
        title: "Item adicionado!",
        description: "O novo item foi adicionado ao pedido.",
      });
    };

    // Função para cancelar adição de item
    const handleCancelAddItem = () => {
      setNewItemForm({
        description: '',
        itemNumber: '',
        code: '',
        quantity: 1,
        unitWeight: 0,
      });
      setIsAddingItem(false);
    };

    const handlePlanChange = (stageIndex: number, field: string, value: any) => {
      const newPlan = [...editedPlan];
      const updatedStage = { ...newPlan[stageIndex] };
      
      if (field === 'workSchedule') {
        updatedStage[field] = value;
        // Automaticamente define useBusinessDays baseado no horário
        updatedStage.useBusinessDays = value === 'normal';
      } else if (field === 'startDate' || field === 'completedDate') {
        // Código existente para datas
        if (value === null || value === '' || value === undefined) {
          updatedStage[field] = null;
        } else {
          if (typeof value === 'string' && value.includes('-')) {
            const [year, month, day] = value.split('-').map(Number);
            updatedStage[field] = new Date(year, month - 1, day);
          } else {
            updatedStage[field] = new Date(value);
          }
        }
      } else if (field === 'durationDays') {
        const numValue = value === '' ? 0 : parseFloat(value);
        updatedStage[field] = isNaN(numValue) ? 0 : Math.max(0.125, numValue);
      } else if (field === 'status' && value === 'Concluído') {
        updatedStage[field] = value;
        if (!updatedStage.completedDate) {
          updatedStage.completedDate = new Date();
        }
      } else {
        updatedStage[field] = value;
      }
      
      newPlan[stageIndex] = updatedStage;
      
      // Manter lógica sequencial existente
      if (field === 'startDate' || field === 'durationDays' || field === 'workSchedule') {
        recalculateSequentialTasks(newPlan, stageIndex);
      }
      
      setEditedPlan(newPlan);
    };

    // NOVA FUNÇÃO SIMPLES PARA RECÁLCULO SEQUENCIAL
    const recalculateSequentialTasks = (plan: ProductionStage[], fromIndex: number) => {
      console.log('🔄 Recalculando tarefas sequenciais a partir do índice:', fromIndex);
      
      // Primeiro, calcular a data de conclusão da tarefa atual
      const currentStage = plan[fromIndex];
      if (currentStage.startDate && currentStage.durationDays) {
        const duration = Math.max(0.125, Number(currentStage.durationDays));
        const useBusinessDays = currentStage.useBusinessDays !== false;
        
        if (duration <= 1) {
          // Tarefas de 1 dia ou menos: terminam no mesmo dia
          currentStage.completedDate = new Date(currentStage.startDate);
        } else {
          // Tarefas de mais de 1 dia
          if (useBusinessDays) {
            // Dias úteis: adicionar dias úteis
            currentStage.completedDate = addBusinessDaysSimple(currentStage.startDate, Math.ceil(duration) - 1);
          } else {
            // Dias corridos: adicionar dias normais
            currentStage.completedDate = new Date(currentStage.startDate);
            currentStage.completedDate.setDate(currentStage.completedDate.getDate() + Math.ceil(duration) - 1);
          }
        }
      }
      
      // Agora recalcular todas as tarefas seguintes SEQUENCIALMENTE
      for (let i = fromIndex + 1; i < plan.length; i++) {
        const previousStage = plan[i - 1];
        const currentStage = plan[i];
        
        if (previousStage.completedDate) {
          // CORREÇÃO PRINCIPAL: A próxima tarefa SEMPRE inicia no mesmo dia que a anterior termina
          currentStage.startDate = new Date(previousStage.completedDate);
          
          // Calcular data de conclusão
          const duration = Math.max(0.125, Number(currentStage.durationDays) || 1);
          const useBusinessDays = currentStage.useBusinessDays !== false;
          
          if (duration <= 1) {
            // Tarefas de 1 dia ou menos: terminam no mesmo dia
            currentStage.completedDate = new Date(currentStage.startDate);
          } else {
            // Tarefas de mais de 1 dia
            if (useBusinessDays) {
              // Se for dia útil e a data de início for fim de semana, ajustar
              if (!isBusinessDay(currentStage.startDate)) {
                currentStage.startDate = getNextBusinessDay(currentStage.startDate);
              }
              currentStage.completedDate = addBusinessDaysSimple(currentStage.startDate, Math.ceil(duration) - 1);
            } else {
              // Dias corridos
              currentStage.completedDate = new Date(currentStage.startDate);
              currentStage.completedDate.setDate(currentStage.completedDate.getDate() + Math.ceil(duration) - 1);
            }
          }
          
          console.log(`✅ Etapa ${i + 1}: ${currentStage.stageName} | Início: ${currentStage.startDate.toLocaleDateString()} | Fim: ${currentStage.completedDate.toLocaleDateString()}`);
        } else {
          // Se a etapa anterior não tem data de conclusão, limpar as datas desta etapa
          currentStage.startDate = null;
          currentStage.completedDate = null;
        }
      }
      
      // DEBUG: Mostrar análise detalhada do acúmulo
      if (fromIndex === 0) {
        console.log('\n📊 EXECUTANDO DEBUG DETALHADO DO CRONOGRAMA:');
        debugTaskAccumulation(plan);
      }
    };

    // FUNÇÃO AUXILIAR SIMPLES PARA ADICIONAR DIAS ÚTEIS
    const addBusinessDaysSimple = (startDate: Date, daysToAdd: number): Date => {
      if (daysToAdd === 0) return new Date(startDate);
      
      let currentDate = new Date(startDate);
      let remainingDays = daysToAdd;
      
      while (remainingDays > 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (isBusinessDay(currentDate)) {
          remainingDays--;
        }
      }
      
      return currentDate;
    };

    // VERSÃO SIMPLIFICADA - Recalcular a partir de uma etapa específica
    const recalculateFromStage = (plan: ProductionStage[], fromIndex: number) => {
      recalculateSequentialTasks(plan, fromIndex);
    };

    // VERSÃO SIMPLIFICADA - Recalcular cronograma completo
    const recalculateFromFirstStage = (plan: ProductionStage[]) => {
      // Só recalcular se a primeira etapa tem data de início
      if (plan[0] && plan[0].startDate) {
        recalculateSequentialTasks(plan, 0);
      }
    };

    // FUNÇÃO AUXILIAR PARA FORMATAÇÃO DE DATAS
    const formatDate = (date: Date | null): string => {
      if (!date) return 'N/A';
      return date.toLocaleDateString('pt-BR', { 
        weekday: 'short', 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
    };

    // FUNÇÃO PARA MARCAR DATA BOOK COMO ENVIADO
    const handleDataBookSent = async () => {
        if (!selectedOrder || selectedOrder.status !== 'Concluído') {
            toast({
                variant: "destructive",
                title: "Erro",
                description: "Só é possível marcar Data Book para pedidos concluídos.",
            });
            return;
        }

        try {
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            const updateData = {
                dataBookSent: true,
                dataBookSentAt: Timestamp.now(),
                lastUpdate: Timestamp.now(),
            };

            await updateDoc(orderRef, updateData);

            toast({
                title: "Data Book marcado como enviado!",
                description: "A informação foi salva com sucesso.",
            });

            // Atualizar estado local
            const updatedOrder = {
                ...selectedOrder,
                dataBookSent: true,
                dataBookSentAt: new Date(),
            };
            setSelectedOrder(updatedOrder);

            // Recarregar lista
            await fetchOrders();
        } catch (error) {
            console.error("Erro ao marcar Data Book:", error);
            toast({
                variant: "destructive",
                title: "Erro ao salvar",
                description: "Não foi possível marcar o Data Book como enviado.",
            });
        }
    };

    // FUNÇÃO AUXILIAR PARA ADICIONAR APENAS DIAS ÚTEIS
    const addBusinessDaysOnly = (startDate: Date, daysToAdd: number): Date => {
      if (daysToAdd === 0) return new Date(startDate);
      
      let currentDate = new Date(startDate);
      let remainingDays = daysToAdd;
      
      while (remainingDays > 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (isBusinessDay(currentDate)) {
          remainingDays--;
        }
      }
      
      return currentDate;
    };

    // FUNÇÃO DE DEBUG PARA MOSTRAR O CÁLCULO PASSO A PASSO
    const debugTaskAccumulation = (plan: ProductionStage[]) => {
      console.group('🔍 DEBUG - Sistema de Acúmulo de Tarefas');
      
      if (plan.length === 0) {
        console.log('❌ Nenhuma tarefa para processar');
        console.groupEnd();
        return;
      }
      
      console.log('📋 Processando', plan.length, 'tarefas...');
      
      // Primeira tarefa
      const firstStage = plan[0];
      if (!firstStage.startDate) {
        console.log('❌ Primeira tarefa sem data de início');
        console.groupEnd();
        return;
      }
      
      console.log(`\n1️⃣ TAREFA 1: ${firstStage.stageName}`);
      console.log(`   Início: ${formatDate(firstStage.startDate)}`);
      console.log(`   Duração: ${firstStage.durationDays} dias`);
      console.log(`   Fim: ${formatDate(firstStage.completedDate)}`);
      
      // Variáveis de controle
      let currentWorkingDate = new Date(firstStage.completedDate || firstStage.startDate);
      let dailyAccumulator = 0;
      
      console.log(`   📍 Data de trabalho atual: ${formatDate(currentWorkingDate)}`);
      console.log(`   📊 Acumulador inicial: ${dailyAccumulator}`);
      
      // Processar tarefas seguintes
      for (let i = 1; i < plan.length; i++) {
        const stage = plan[i];
        const duration = Number(stage.durationDays) || 0;
        
        console.log(`\n${i + 1}️⃣ TAREFA ${i + 1}: ${stage.stageName}`);
        console.log(`   Duração: ${duration} dias`);
        console.log(`   Acumulador antes: ${dailyAccumulator}`);
        
        dailyAccumulator += duration;
        console.log(`   Acumulador depois: ${dailyAccumulator}`);
        console.log(`   Inicia em: ${formatDate(currentWorkingDate)}`);
        
        if (dailyAccumulator <= 1) {
          console.log(`   ✅ Acumulador ≤ 1 → Termina no mesmo dia`);
          console.log(`   Fim: ${formatDate(currentWorkingDate)}`);
        } else {
          const daysNeeded = Math.ceil(dailyAccumulator) - 1;
          const newEndDate = addBusinessDaysOnly(currentWorkingDate, daysNeeded);
          
          console.log(`   🚀 Acumulador > 1 → Avança ${daysNeeded} dias úteis`);
          console.log(`   Fim: ${formatDate(newEndDate)}`);
          
          currentWorkingDate = new Date(newEndDate);
          dailyAccumulator = dailyAccumulator - Math.ceil(dailyAccumulator);
          
          console.log(`   📍 Nova data de trabalho: ${formatDate(currentWorkingDate)}`);
          console.log(`   📊 Acumulador resetado: ${dailyAccumulator}`);
        }
      }
      
      console.groupEnd();
    };

    // EXEMPLO DE USO DO DEBUG EM OUTRAS FUNÇÕES:
    // 
    // Para usar no handleSaveProgress, adicione esta linha logo antes de salvar:
    // debugTaskAccumulation(editedPlan);
    //
    // Para usar em qualquer lugar do código:
    // console.log('🔍 ANÁLISE DO CRONOGRAMA:');
    // debugTaskAccumulation(planArray);
    //
    // Exemplos de saída do debug:
    // 🔍 DEBUG - Sistema de Acúmulo de Tarefas
    // 📋 Processando 4 tarefas...
    // 1️⃣ TAREFA 1: Preparação
    //    Início: seg., 24/07/2024
    //    Duração: 1 dias
    //    Fim: seg., 24/07/2024
    // 2️⃣ TAREFA 2: Corte
    //    Duração: 0.5 dias
    //    Acumulador antes: 0
    //    Acumulador depois: 0.5
    //    ✅ Acumulador ≤ 1 → Termina no mesmo dia

    const dashboardStats = useMemo(() => {
        const totalOrders = orders.length;
        const totalWeight = orders.reduce((acc, order) => acc + (order.totalWeight || 0), 0);
        
        const completedOrdersList = orders.filter(order => order.status === 'Concluído');
        const completedOrders = completedOrdersList.length;
        const completedWeight = completedOrdersList.reduce((acc, order) => acc + (order.totalWeight || 0), 0);

        const inProgressOrdersList = orders.filter(order => ['Em Produção', 'Aguardando Produção'].includes(order.status));
        const inProgressOrders = inProgressOrdersList.length;
        const inProgressWeight = inProgressOrdersList.reduce((acc, order) => acc + (order.totalWeight || 0), 0);

        const delayedOrders = orders.filter(order => order.status === 'Atrasado').length;

        return { 
            totalOrders, 
            totalWeight,
            completedOrders, 
            completedWeight,
            inProgressOrders, 
            inProgressWeight,
            delayedOrders 
        };
    }, [orders]);

    const handleItemSelection = (itemId: string) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const handleSelectAll = (checked: boolean | 'indeterminate') => {
        if (checked === true && selectedOrder) {
            const allItemIds = new Set(selectedOrder.items.map(item => item.id!));
            setSelectedItems(allItemIds);
        } else {
            setSelectedItems(new Set());
        }
    };

    const resetPackingSlipQuantities = () => {
        if (!selectedOrder) return;
        const newQuantities = new Map<string, number>();
        selectedOrder.items.forEach(item => {
            if (selectedItems.has(item.id!)) {
                newQuantities.set(item.id!, item.quantity);
            }
        });
        setPackingSlipQuantities(newQuantities);
    };

    // Função para gerar e salvar número sequencial do romaneio
    const getNextPackingSlipNumber = async (): Promise<string> => {
        try {
            const counterRef = doc(db, "companies", "mecald", "settings", "counters");
            const counterSnap = await getDoc(counterRef);
            
            let currentNumber = 1;
            
            if (counterSnap.exists()) {
                currentNumber = (counterSnap.data().packingSlipNumber || 0) + 1;
            }
            
            // Atualizar o contador no Firestore
            await updateDoc(counterRef, {
                packingSlipNumber: currentNumber,
                lastPackingSlipDate: Timestamp.now()
            }).catch(async (error) => {
                // Se o documento não existe, criar
                if (error.code === 'not-found') {
                    await setDoc(counterRef, {
                        packingSlipNumber: currentNumber,
                        lastPackingSlipDate: Timestamp.now()
                    });
                }
            });
            
            // Formatar com zeros à esquerda (ex: 000001)
            return currentNumber.toString().padStart(6, '0');
        } catch (error) {
            console.error("Erro ao gerar número do romaneio:", error);
            // Fallback: usar timestamp se houver erro
            return Date.now().toString().slice(-6);
        }
    };
    
    const handleGeneratePackingSlip = async () => {
        if (!selectedOrder || selectedItems.size === 0) return;

        toast({ title: "Gerando Romaneio...", description: "Por favor, aguarde." });

        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const docSnap = await getDoc(companyRef);
            const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
            
            // Gerar número sequencial do romaneio
            const packingSlipNumber = await getNextPackingSlipNumber();
            
            // Filtrar itens selecionados e usar quantidades customizadas
            const itemsToInclude = selectedOrder.items
                .filter(item => selectedItems.has(item.id!))
                .map(item => {
                    const selectedQty = packingSlipQuantities.get(item.id!) || item.quantity;
                    return {
                        ...item,
                        displayQuantity: selectedQty // Quantidade a ser exibida no romaneio
                    };
                });
            
            // Calcular peso total baseado nas quantidades selecionadas
            const totalWeightOfSelection = itemsToInclude.reduce((acc, item) => {
                const qty = Number(item.displayQuantity) || 0;
                const unitWeight = Number(item.unitWeight) || 0;
                return acc + (qty * unitWeight);
            }, 0);
            
            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            const pageHeight = docPdf.internal.pageSize.height;
            let yPos = 15;

            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
                } catch (e) {
                    console.error("Error adding logo to PDF:", e);
                }
            }

            let textX = 65;
            let textY = yPos;
            docPdf.setFontSize(18).setFont('helvetica', 'bold');
            docPdf.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY, { align: 'left' });
            textY += 6;
            
            docPdf.setFontSize(8).setFont('helvetica', 'normal');
            if (companyData.endereco) {
                const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
                docPdf.text(addressLines, textX, textY);
                textY += (addressLines.length * 3.5);
            }
            if (companyData.cnpj) {
                docPdf.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
            }
            
            yPos = 55;
            docPdf.setFontSize(14).setFont('helvetica', 'bold');
            docPdf.text('ROMANEIO DE ENTREGA', pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;

            // Número do Romaneio centralizado e destacado
            docPdf.setFontSize(10).setFont('helvetica', 'bold');
            docPdf.setTextColor(37, 99, 235); // Cor azul
            docPdf.text(`Romaneio Nº ${packingSlipNumber}`, pageWidth / 2, yPos, { align: 'center' });
            docPdf.setTextColor(0, 0, 0); // Voltar para preto
            yPos += 15;

            // Informações do pedido em grid
            docPdf.setFontSize(10).setFont('helvetica', 'normal');

            // Linha 1: Pedido e Data de Emissão
            docPdf.text(`Pedido: ${selectedOrder.quotationNumber}`, 15, yPos);
            docPdf.text(`Data Emissão: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 6;

            // Linha 2: Cliente e OS
            docPdf.text(`Cliente: ${selectedOrder.customer.name}`, 15, yPos);
            docPdf.text(`OS: ${selectedOrder.internalOS || 'N/A'}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 6;

            // Linha 3: Projeto (se houver) e Data de Entrega
            if (selectedOrder.projectName || selectedOrder.deliveryDate) {
                if (selectedOrder.projectName) {
                    docPdf.text(`Projeto: ${selectedOrder.projectName}`, 15, yPos);
                }
                if (selectedOrder.deliveryDate) {
                    docPdf.setFont('helvetica', 'bold');
                    docPdf.text(`Data Entrega: ${format(selectedOrder.deliveryDate, "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
                    docPdf.setFont('helvetica', 'normal');
                }
                yPos += 6;
            }

            yPos += 8;

            // Criar corpo da tabela com quantidades selecionadas
            const tableBody = itemsToInclude.map(item => {
                const selectedQty = Number(item.displayQuantity) || 0;
                const itemTotalWeight = selectedQty * (Number(item.unitWeight) || 0);
                return [
                    item.itemNumber || '-',
                    item.code || '-',
                    item.description,
                    selectedQty.toString(), // Usar quantidade selecionada
                    (Number(item.unitWeight) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                    itemTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                ];
            });
            
            autoTable(docPdf, {
                startY: yPos,
                head: [['Nº Item', 'Cód.', 'Descrição', 'Qtd.', 'Peso Unit. (kg)', 'Peso Total (kg)']],
                body: tableBody,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255, halign: 'center' },
                columnStyles: {
                    0: { cellWidth: 18, halign: 'center' },
                    1: { cellWidth: 18 },
                    2: { cellWidth: 'auto' },
                    3: { cellWidth: 18, halign: 'center' },
                    4: { cellWidth: 28, halign: 'center' },
                    5: { cellWidth: 28, halign: 'center' },
                }
            });

            let finalY = (docPdf as any).lastAutoTable.finalY;
            const footerStartY = pageHeight - 35;

            if (finalY + 20 > footerStartY) {
                docPdf.addPage();
                finalY = 15;
            }

            docPdf.setFontSize(11).setFont('helvetica', 'bold');
            docPdf.text(
                `Peso Total dos Itens: ${totalWeightOfSelection.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`, 
                pageWidth - 15, finalY + 12, { align: 'right' }
            );

            docPdf.setFontSize(9).setFont('helvetica', 'normal');
            docPdf.text('Recebido por:', 15, footerStartY);
            docPdf.line(40, footerStartY, 120, footerStartY);
            docPdf.text('Data:', 15, footerStartY + 8);
            docPdf.line(28, footerStartY + 8, 85, footerStartY + 8);

            docPdf.save(`Romaneio_${packingSlipNumber}_Pedido_${selectedOrder.quotationNumber}.pdf`);
            
            toast({
                title: "Romaneio gerado com sucesso!",
                description: `Romaneio Nº ${packingSlipNumber} foi criado e baixado.`,
            });
            
            // Fechar o dialog após gerar
            setIsPackingSlipDialogOpen(false);
            
        } catch (error) {
            console.error("Error generating packing slip:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar romaneio",
                description: "Não foi possível gerar o arquivo PDF.",
            });
        }
    };

    const handleExportSchedule = async () => {
        if (!selectedOrder) return;

        toast({ title: "Gerando Cronograma...", description: "Por favor, aguarde." });

        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const docSnap = await getDoc(companyRef);
            const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
            
            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            let yPos = 15;

            // Header com logo e informações da empresa
            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
                } catch (e) {
                    console.error("Error adding logo to PDF:", e);
                }
            }

            // Informações da empresa ao lado da logo
            let companyInfoX = 65;
            let companyInfoY = yPos + 5;
            docPdf.setFontSize(16).setFont('helvetica', 'bold');
            docPdf.text(companyData.nomeFantasia || 'Sua Empresa', companyInfoX, companyInfoY);
            companyInfoY += 6;
            
            docPdf.setFontSize(8).setFont('helvetica', 'normal');
            if (companyData.endereco) {
                const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - companyInfoX - 15);
                docPdf.text(addressLines, companyInfoX, companyInfoY);
                companyInfoY += (addressLines.length * 3);
            }
            if (companyData.cnpj) {
                docPdf.text(`CNPJ: ${companyData.cnpj}`, companyInfoX, companyInfoY);
                companyInfoY += 4;
            }
            if (companyData.email) {
                docPdf.text(`Email: ${companyData.email}`, companyInfoX, companyInfoY);
                companyInfoY += 4;
            }
            if (companyData.celular) {
                docPdf.text(`Telefone: ${companyData.celular}`, companyInfoX, companyInfoY);
            }

            yPos = 45;

            // Título do documento
            docPdf.setFontSize(16).setFont('helvetica', 'bold');
            docPdf.text('CRONOGRAMA DE PRODUÇÃO', pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;

            // Informações do pedido em duas colunas
            docPdf.setFontSize(10).setFont('helvetica', 'normal');
            
            // Coluna esquerda
            const leftColumnX = 15;
            let leftColumnY = yPos;
            docPdf.setFont('helvetica', 'bold');
            docPdf.text('DADOS DO PEDIDO:', leftColumnX, leftColumnY);
            leftColumnY += 6;
            docPdf.setFont('helvetica', 'normal');
            docPdf.text(`Pedido Nº: ${selectedOrder.quotationNumber}`, leftColumnX, leftColumnY);
            leftColumnY += 5;
            docPdf.text(`Cliente: ${selectedOrder.customer.name}`, leftColumnX, leftColumnY);
            leftColumnY += 5;
            if (selectedOrder.projectName) {
                docPdf.text(`Projeto: ${selectedOrder.projectName}`, leftColumnX, leftColumnY);
                leftColumnY += 5;
            }
            
            // Coluna direita
            const rightColumnX = pageWidth / 2 + 10;
            let rightColumnY = yPos + 6; // Alinha com o início dos dados
            docPdf.text(`OS Interna: ${selectedOrder.internalOS || 'N/A'}`, rightColumnX, rightColumnY);
            rightColumnY += 5;
            docPdf.text(`Data de Emissão: ${format(new Date(), "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
            rightColumnY += 5;
            if (selectedOrder.deliveryDate) {
                docPdf.text(`Data de Entrega: ${format(selectedOrder.deliveryDate, "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
                rightColumnY += 5;
            }
            docPdf.text(`Status: ${selectedOrder.status}`, rightColumnX, rightColumnY);
            
            yPos = Math.max(leftColumnY, rightColumnY) + 10;

            // Progresso geral do pedido
            const orderProgress = calculateOrderProgress(selectedOrder);
            
            // Título do progresso geral
            docPdf.setFontSize(10).setFont('helvetica', 'bold');
            docPdf.text('PROGRESSO GERAL DO PEDIDO:', 15, yPos);
            yPos += 8;
            
            // Barra de progresso geral
            const progressBarWidth = 120;
            const progressBarHeight = 8;
            const progressBarX = 15;
            
            // Fundo da barra (cinza claro)
            docPdf.setFillColor(230, 230, 230);
            docPdf.rect(progressBarX, yPos, progressBarWidth, progressBarHeight, 'F');
            
            // Barra de progresso colorida
            const progressWidth = (orderProgress / 100) * progressBarWidth;
            if (orderProgress < 30) {
                docPdf.setFillColor(239, 68, 68); // Vermelho
            } else if (orderProgress < 70) {
                docPdf.setFillColor(245, 158, 11); // Amarelo
            } else {
                docPdf.setFillColor(34, 197, 94); // Verde
            }
            docPdf.rect(progressBarX, yPos, progressWidth, progressBarHeight, 'F');
            
            // Borda da barra
            docPdf.setDrawColor(0, 0, 0);
            docPdf.setLineWidth(0.1);
            docPdf.rect(progressBarX, yPos, progressBarWidth, progressBarHeight, 'S');
            
            // Texto da porcentagem
            docPdf.setFontSize(9).setFont('helvetica', 'normal');
            docPdf.setTextColor(0, 0, 0);
            docPdf.text(`${orderProgress.toFixed(1)}%`, progressBarX + progressBarWidth + 5, yPos + 6);
            
            yPos += progressBarHeight + 15;

            // Tabela do cronograma
            const tableBody: any[][] = [];
            selectedOrder.items.forEach(item => {
                if (item.productionPlan && item.productionPlan.length > 0) {
                    // Cabeçalho do item com código, descrição e quantidade na mesma linha
                    const itemHeader = `Item: ${item.code ? `[${item.code}] ` : ''}${item.description} (Qtd: ${item.quantity})`;
                    tableBody.push([{ 
                        content: itemHeader, 
                        colSpan: 5, 
                        styles: { 
                            fontStyle: 'bold', 
                            fillColor: '#f0f0f0',
                            fontSize: 9
                        } 
                    }]);
                    
                    // Linha com barra de progresso do item
                    const itemProgress = calculateItemProgress(item);
                    tableBody.push([{ 
                        content: `Progresso: ${itemProgress.toFixed(1)}%`, 
                        colSpan: 5, 
                        styles: { 
                            fontSize: 8,
                            textColor: '#666666',
                            cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }
                        } 
                    }]);
                    
                    // Etapas do item
                    item.productionPlan.forEach(stage => {
                        tableBody.push([
                            `  • ${stage.stageName}`,
                            stage.startDate ? format(new Date(stage.startDate), 'dd/MM/yy') : 'N/A',
                            stage.completedDate ? format(new Date(stage.completedDate), 'dd/MM/yy') : 'N/A',
                            `${stage.durationDays || 0} dia(s)`,
                            stage.status,
                        ]);
                    });
                    
                    // Linha em branco para separar itens
                    tableBody.push([{ content: '', colSpan: 5, styles: { minCellHeight: 3 } }]);
                }
            });
            
            autoTable(docPdf, {
                startY: yPos,
                head: [['Etapa', 'Início Previsto', 'Fim Previsto', 'Duração', 'Status']],
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
                    0: { cellWidth: 60 }, // Etapa
                    1: { cellWidth: 25, halign: 'center' }, // Início
                    2: { cellWidth: 25, halign: 'center' }, // Fim
                    3: { cellWidth: 20, halign: 'center' }, // Duração
                    4: { cellWidth: 25, halign: 'center' }, // Status
                },
                didParseCell: (data) => {
                    if (data.cell.raw && (data.cell.raw as any).colSpan) {
                        data.cell.styles.halign = 'left';
                    }
                },
                didDrawCell: (data) => {
                    // Verifica se é uma linha de progresso do item
                    if (data.cell.raw && typeof data.cell.raw === 'string' && data.cell.raw.startsWith('Progresso:')) {
                        const progressText = data.cell.raw as string;
                        const progressMatch = progressText.match(/(\d+\.?\d*)%/);
                        
                        if (progressMatch) {
                            const progress = parseFloat(progressMatch[1]);
                            
                            // Posição e dimensões da barra (ajustada para melhor posicionamento)
                            const barX = data.cell.x + 80; // Posição após o texto "Progresso: XX.X%"
                            const barY = data.cell.y + 3;
                            const barWidth = 70;
                            const barHeight = 5;
                            
                            // Fundo da barra (cinza claro)
                            docPdf.setFillColor(230, 230, 230);
                            docPdf.rect(barX, barY, barWidth, barHeight, 'F');
                            
                            // Barra de progresso colorida baseada na porcentagem
                            const fillWidth = (progress / 100) * barWidth;
                            if (fillWidth > 0) { // Só desenha se houver progresso
                                if (progress < 30) {
                                    docPdf.setFillColor(239, 68, 68); // Vermelho para progresso baixo
                                } else if (progress < 70) {
                                    docPdf.setFillColor(245, 158, 11); // Amarelo para progresso médio
                                } else {
                                    docPdf.setFillColor(34, 197, 94); // Verde para progresso alto
                                }
                                docPdf.rect(barX, barY, fillWidth, barHeight, 'F');
                            }
                            
                            // Borda da barra para definir melhor o contorno
                            docPdf.setDrawColor(0, 0, 0);
                            docPdf.setLineWidth(0.2);
                            docPdf.rect(barX, barY, barWidth, barHeight, 'S');
                        }
                    }
                },
                margin: { left: 15, right: 15 }
            });

            // Rodapé com informações adicionais
            const finalY = (docPdf as any).lastAutoTable.finalY;
            const pageHeight = docPdf.internal.pageSize.height;
            
            if (finalY + 30 < pageHeight - 20) {
                yPos = finalY + 15;
                docPdf.setFontSize(8).setFont('helvetica', 'italic');
                docPdf.text(
                    `Documento gerado automaticamente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
                    pageWidth / 2,
                    yPos,
                    { align: 'center' }
                );
            }

            docPdf.save(`Cronograma_Pedido_${selectedOrder.quotationNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`);

        } catch (error) {
            console.error("Error generating schedule PDF:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar cronograma",
                description: "Não foi possível gerar o arquivo PDF.",
            });
        }
    };

    const handleOpenProgressModal = async (item: OrderItem) => {
        setItemToTrack(item);
        setIsProgressModalOpen(true);
        setEditedPlan([]);
        setIsFetchingPlan(true);

        try {
            // Apenas carregar template do produto
            const productDoc = item.code ? 
                await getDoc(doc(db, "companies", "mecald", "products", item.code)) : 
                null;

            let productTemplateMap = new Map<string, any>();
            
            if (productDoc && productDoc.exists()) {
                const template = productDoc.data().productionPlanTemplate || [];
                template.forEach((stage: any) => {
                    productTemplateMap.set(stage.stageName, {
                        durationDays: stage.durationDays || 0,
                        workSchedule: stage.workSchedule || 'normal'
                    });
                });
            }

            let finalPlan: ProductionStage[];

            if (item.productionPlan && item.productionPlan.length > 0) {
                finalPlan = item.productionPlan.map(stage => {
                    const templateData = productTemplateMap.get(stage.stageName) || {};
                    
                    return {
                        stageName: stage.stageName || '',
                        status: stage.status || 'Pendente',
                        durationDays: stage.durationDays ?? templateData.durationDays ?? 0,
                        workSchedule: stage.workSchedule ?? templateData.workSchedule ?? 'normal',
                        useBusinessDays: stage.workSchedule === 'normal',
                        startDate: stage.startDate ? safeToDate(stage.startDate) : null,
                        completedDate: stage.completedDate ? safeToDate(stage.completedDate) : null,
                    };
                });
            } else {
                finalPlan = Array.from(productTemplateMap.entries()).map(([stageName, templateData]) => ({
                    stageName,
                    durationDays: templateData.durationDays,
                    workSchedule: templateData.workSchedule,
                    useBusinessDays: templateData.workSchedule === 'normal',
                    status: "Pendente",
                    startDate: null,
                    completedDate: null,
                }));
            }

            setEditedPlan(finalPlan);
        } catch(error) {
            console.error("Erro ao preparar plano de produção:", error);
            setEditedPlan([]);
        } finally {
            setIsFetchingPlan(false);
        }
    };

    // ==========================================
    // CORREÇÃO DEFINITIVA DO SALVAMENTO NO FIRESTORE
    // ==========================================

    // 1. FUNÇÃO PARA VERIFICAR E CORRIGIR ESTRUTURA DOS DADOS
    const validateAndCleanItemData = (item: any) => {
        console.log('🧹 [validateAndCleanItemData] Limpando item:', item.id);
        
        // Remove campos undefined, null vazios e problemáticos
        const cleanItem = {
            id: item.id || `item_${Date.now()}`,
            description: item.description || '',
            quantity: Number(item.quantity) || 0,
            unitWeight: Number(item.unitWeight) || 0,
            code: item.code || '',
            itemNumber: item.itemNumber || '',
            // Garante que campos opcionais sejam removidos se undefined
            ...(item.itemDeliveryDate && { itemDeliveryDate: item.itemDeliveryDate }),
            ...(item.shippingDate && { shippingDate: item.shippingDate }),
            ...(item.shippingList && { shippingList: item.shippingList }),
            ...(item.invoiceNumber && { invoiceNumber: item.invoiceNumber }),
        };
        
        // Processar productionPlan de forma mais cuidadosa
        if (item.productionPlan && Array.isArray(item.productionPlan)) {
            cleanItem.productionPlan = item.productionPlan
                .filter(stage => stage && stage.stageName) // Remove etapas vazias
                .map(stage => ({
                    stageName: String(stage.stageName).trim(),
                    status: stage.status || 'Pendente',
                    durationDays: Number(stage.durationDays) || 0,
                    useBusinessDays: Boolean(stage.useBusinessDays !== false),
                    workSchedule: stage.workSchedule || 'normal',
                    startDate: stage.startDate || null,
                    completedDate: stage.completedDate || null,
                }));
        } else {
            cleanItem.productionPlan = [];
        }
        
        console.log('🧹 [validateAndCleanItemData] Item limpo:', {
            id: cleanItem.id,
            planStages: cleanItem.productionPlan.length,
            planSummary: cleanItem.productionPlan.map(s => ({
                name: s.stageName,
                status: s.status,
                hasStart: !!s.startDate,
                hasEnd: !!s.completedDate,
                workSchedule: s.workSchedule
            }))
        });
        
        return cleanItem;
    };



    // 2. FUNÇÃO CORRIGIDA DE SALVAMENTO QUE PRESERVA TODOS OS DADOS
    const handleSaveProgress = async () => {
        if (!selectedOrder || !itemToTrack) {
            console.error('❌ [handleSaveProgress] Dados obrigatórios ausentes');
            return;
        }

        console.log('💾 [handleSaveProgress] =================================');
        console.log('💾 [handleSaveProgress] INICIANDO SALVAMENTO COMPLETO');
        console.log('💾 [handleSaveProgress] =================================');
        console.log('💾 [handleSaveProgress] Order ID:', selectedOrder.id);
        console.log('💾 [handleSaveProgress] Item ID:', itemToTrack.id);
        console.log('💾 [handleSaveProgress] Plano editado:', editedPlan.map(s => ({
            name: s.stageName,
            status: s.status,
            start: s.startDate ? s.startDate.toISOString() : null,
            end: s.completedDate ? s.completedDate.toISOString() : null,
            duration: s.durationDays,
            businessDays: s.useBusinessDays,
            assignedResource: s.assignedResource,
            supervisor: s.supervisor
        })));

        try {
            // 1. Buscar dados atuais do pedido COMPLETOS
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            const currentOrderSnap = await getDoc(orderRef);
            
            if (!currentOrderSnap.exists()) {
                throw new Error("Pedido não encontrado no banco de dados.");
            }
            
            const currentOrderData = currentOrderSnap.data();
            console.log('💾 [handleSaveProgress] Dados atuais carregados, itens:', currentOrderData.items?.length || 0);

            // 2. Converter plano editado para formato Firestore com validação
            const convertedProductionPlan = editedPlan
                .filter(stage => stage.stageName && stage.stageName.trim()) // Remove etapas vazias
                .map((stage, index) => {
                    console.log(`💾 [handleSaveProgress] Convertendo etapa ${index + 1}: ${stage.stageName}`);
                    
                    let startTimestamp = null;
                    let endTimestamp = null;
                    
                    // Conversão de data de início
                    if (stage.startDate) {
                        if (stage.startDate instanceof Date && !isNaN(stage.startDate.getTime())) {
                            startTimestamp = Timestamp.fromDate(stage.startDate);
                            console.log(`💾 [handleSaveProgress] ✓ Data início convertida: ${stage.startDate.toISOString()}`);
                        } else {
                            console.warn(`💾 [handleSaveProgress] ⚠️ Data início inválida ignorada:`, stage.startDate);
                        }
                    }
                    
                    // Conversão de data de conclusão
                    if (stage.completedDate) {
                        if (stage.completedDate instanceof Date && !isNaN(stage.completedDate.getTime())) {
                            endTimestamp = Timestamp.fromDate(stage.completedDate);
                            console.log(`💾 [handleSaveProgress] ✓ Data fim convertida: ${stage.completedDate.toISOString()}`);
                        } else {
                            console.warn(`💾 [handleSaveProgress] ⚠️ Data fim inválida ignorada:`, stage.completedDate);
                        }
                    }
                    
                    const convertedStage = {
                        stageName: String(stage.stageName).trim(),
                        status: String(stage.status || 'Pendente'),
                        durationDays: Number(stage.durationDays) || 0,
                        useBusinessDays: Boolean(stage.useBusinessDays !== false),
                        startDate: startTimestamp,
                        completedDate: endTimestamp,
                        // NOVO: Adicionar campos de recurso e supervisor
                        assignedResource: stage.assignedResource || null,
                        supervisor: stage.supervisor || null,
                    };
                    
                    console.log(`💾 [handleSaveProgress] ✓ Etapa ${index + 1} convertida:`, {
                        name: convertedStage.stageName,
                        status: convertedStage.status,
                        duration: convertedStage.durationDays,
                        businessDays: convertedStage.useBusinessDays,
                        hasStart: !!convertedStage.startDate,
                        hasEnd: !!convertedStage.completedDate,
                        hasResource: !!convertedStage.assignedResource,
                        hasSupervisor: !!convertedStage.supervisor
                    });
                    
                    return convertedStage;
                });

            console.log('💾 [handleSaveProgress] Plano convertido completo:', convertedProductionPlan.length, 'etapas');

            // 3. Atualizar APENAS o item específico preservando TODOS os outros dados
            const updatedItems = currentOrderData.items.map((item: any) => {
                if (item.id === itemToTrack.id) {
                    console.log('💾 [handleSaveProgress] ✓ Atualizando item alvo:', item.id);
                    
                    // Limpar e validar dados do item
                    const cleanedItem = validateAndCleanItemData(item);
                    
                    // Substituir APENAS o productionPlan
                    cleanedItem.productionPlan = convertedProductionPlan;
                    cleanedItem.lastProgressUpdate = Timestamp.now();
                    
                    console.log('💾 [handleSaveProgress] ✓ Item atualizado com novo plano');
                    return cleanedItem;
                } else {
                    // Para outros itens, limpar mas manter dados existentes
                    const cleanedItem = validateAndCleanItemData(item);
                    
                    // Preservar productionPlan existente com limpeza
                    if (item.productionPlan && Array.isArray(item.productionPlan)) {
                        cleanedItem.productionPlan = item.productionPlan.map(stage => ({
                            stageName: String(stage.stageName || '').trim(),
                            status: String(stage.status || 'Pendente'),
                            durationDays: Number(stage.durationDays) || 0,
                            useBusinessDays: Boolean(stage.useBusinessDays !== false),
                            startDate: stage.startDate || null,
                            completedDate: stage.completedDate || null,
                            // NOVO: Preservar campos de recurso e supervisor
                            assignedResource: stage.assignedResource || null,
                            supervisor: stage.supervisor || null,
                        }));
                    }
                    
                    return cleanedItem;
                }
            });

            console.log('💾 [handleSaveProgress] Total de itens processados:', updatedItems.length);

            // 4. PREPARAR DADOS PARA SALVAMENTO FINAL
            const updateData = {
                items: updatedItems,
                lastUpdate: Timestamp.now(),
                lastProgressUpdate: Timestamp.now(),
                // Preserva outros campos do pedido
                ...(currentOrderData.customer && { customer: currentOrderData.customer }),
                ...(currentOrderData.quotationNumber && { quotationNumber: currentOrderData.quotationNumber }),
                ...(currentOrderData.status && { status: currentOrderData.status }),
                ...(currentOrderData.deliveryDate && { deliveryDate: currentOrderData.deliveryDate }),
                ...(currentOrderData.driveLink && { driveLink: currentOrderData.driveLink }),
                ...(currentOrderData.documents && { documents: currentOrderData.documents }),
            };

            console.log('💾 [handleSaveProgress] Dados finais preparados para salvamento');

            // 5. SALVAR NO FIRESTORE COM MERGE
            await updateDoc(orderRef, updateData);
            console.log('💾 [handleSaveProgress] ✅ DADOS SALVOS NO FIRESTORE COM SUCESSO!');

            // 6. VERIFICAÇÃO IMEDIATA DOS DADOS SALVOS
            console.log('🔍 [handleSaveProgress] Verificando dados salvos...');
            const verificationSnap = await getDoc(orderRef);
            if (verificationSnap.exists()) {
                const savedData = verificationSnap.data();
                const savedItem = savedData.items.find((item: any) => item.id === itemToTrack.id);
                
                if (savedItem && savedItem.productionPlan) {
                    console.log('✅ [handleSaveProgress] VERIFICAÇÃO: Dados salvos corretamente:', {
                        itemId: savedItem.id,
                        planStages: savedItem.productionPlan.length,
                        stages: savedItem.productionPlan.map((s: any) => ({
                            name: s.stageName,
                            status: s.status,
                            start: s.startDate ? (s.startDate.toDate ? s.startDate.toDate().toISOString() : 'Invalid') : null,
                            end: s.completedDate ? (s.completedDate.toDate ? s.completedDate.toDate().toISOString() : 'Invalid') : null
                        }))
                    });
                } else {
                    console.error('❌ [handleSaveProgress] VERIFICAÇÃO FALHOU: Item não encontrado ou sem plano');
                }
            } else {
                console.error('❌ [handleSaveProgress] VERIFICAÇÃO FALHOU: Documento não existe');
            }

            // 7. Verificar status geral
            const allItemsCompleted = updatedItems.every((item: any) => {
                if (item.productionPlan && item.productionPlan.length > 0) {
                    return item.productionPlan.every((p: any) => p.status === 'Concluído');
                }
                return true;
            });

            if (allItemsCompleted && currentOrderData.status !== 'Concluído') {
                await updateDoc(orderRef, { 
                    status: "Concluído",
                    completedAt: Timestamp.now(),
                    lastUpdate: Timestamp.now()
                });
                
                toast({ 
                    title: "🎉 Pedido Concluído!", 
                    description: "Todos os itens foram finalizados. Status atualizado automaticamente." 
                });
            } else {
                toast({ 
                    title: "✅ Progresso Salvo!", 
                    description: "As etapas foram salvas e estarão disponíveis em todos os dispositivos." 
                });
            }

            // 8. Fechar modal
            setIsProgressModalOpen(false);
            setItemToTrack(null);

            // 9. RECARREGAR DADOS LOCAIS
            console.log('🔄 [handleSaveProgress] Recarregando dados locais...');
            
            // Aguardar um pouco para garantir que o Firestore processou
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const allOrders = await fetchOrders();
            const updatedOrderInList = allOrders.find(o => o.id === selectedOrder.id);
            
            if (updatedOrderInList) {
                setSelectedOrder(updatedOrderInList);
                form.reset({
                    ...updatedOrderInList,
                    status: updatedOrderInList.status as any,
                });
                console.log('✅ [handleSaveProgress] Estado local atualizado com sucesso');
            } else {
                console.warn('⚠️ [handleSaveProgress] Pedido não encontrado após recarregamento');
            }

            console.log('💾 [handleSaveProgress] =================================');
            console.log('💾 [handleSaveProgress] SALVAMENTO CONCLUÍDO COM SUCESSO');
            console.log('💾 [handleSaveProgress] =================================');

        } catch (error) {
            console.error("❌ [handleSaveProgress] ERRO CRÍTICO:", error);
            console.error("❌ [handleSaveProgress] Stack:", error.stack);
            
            toast({ 
                variant: "destructive", 
                title: "Erro Crítico no Salvamento", 
                description: `Falha ao salvar: ${error instanceof Error ? error.message : 'Erro desconhecido'}. Tente novamente.` 
            });
        }
    };

    // Funções de auto-preenchimento inteligente
    const autoScheduleFromToday = () => {
        const today = new Date();
        const updatedPlan = editedPlan.map((stage, index) => {
            if (index === 0) {
                return {
                    ...stage,
                    startDate: today,
                    status: stage.status === 'Pendente' ? 'Em Andamento' : stage.status
                };
            }
            return stage;
        });
        setEditedPlan(updatedPlan);
        toast({
            title: "Agendamento automático aplicado",
            description: "Primeira etapa agendada para hoje e marcada como 'Em Andamento'"
        });
    };

    const markPreviousAsCompleted = () => {
        const updatedPlan = editedPlan.map((stage, index) => {
            const currentIndex = editedPlan.findIndex(s => s.status === 'Em Andamento');
            if (index < currentIndex && stage.status !== 'Concluído') {
                return {
                    ...stage,
                    status: 'Concluído',
                    completedDate: stage.startDate || new Date()
                };
            }
            return stage;
        });
        setEditedPlan(updatedPlan);
        toast({
            title: "Etapas anteriores marcadas como concluídas",
            description: "Todas as etapas anteriores à atual foram finalizadas"
        });
    };

    const applyStandardDurations = () => {
        const standardDurations = {
            'Preparação': 1,
            'Corte': 2,
            'Soldagem': 3,
            'Usinagem': 2,
            'Montagem': 2,
            'Pintura': 1,
            'Inspeção': 0.5,
            'Embalagem': 0.5
        };

        const updatedPlan = editedPlan.map(stage => {
            const standardDuration = standardDurations[stage.stageName] || 1;
            return {
                ...stage,
                durationDays: standardDuration
            };
        });
        setEditedPlan(updatedPlan);
        toast({
            title: "Durações padrão aplicadas",
            description: "Durações padrão foram aplicadas a todas as etapas"
        });
    };

    // Função para ícones de status
    const getStatusIcon = (status: string) => {
        switch(status) {
            case 'Concluído': 
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'Em Andamento': 
                return <PlayCircle className="h-4 w-4 text-blue-500" />;
            default: 
                return <Clock className="h-4 w-4 text-gray-400" />;
        }
    };
    
    const handleCopyProgress = (itemToCopy: OrderItem) => {
        setProgressClipboard(itemToCopy);
        toast({
            title: "Progresso copiado!",
            description: `Selecione 'Colar' no item de destino para aplicar as etapas de "${itemToCopy.description}".`,
        });
    };

    const handleCancelCopy = () => {
        setProgressClipboard(null);
    };

    const handlePasteProgress = async (targetItem: OrderItem) => {
        if (!progressClipboard || !selectedOrder) {
            toast({ variant: "destructive", title: "Erro", description: "Nenhum progresso na área de transferência." });
            return;
        }

        try {
            const sourceProductionPlan = progressClipboard.productionPlan || [];
            
            const updatedItems = selectedOrder.items.map(item => {
                if (item.id === targetItem.id) {
                    const newPlan = JSON.parse(JSON.stringify(sourceProductionPlan));
                    return { ...item, productionPlan: newPlan };
                }
                return item;
            });

            const itemsForFirestore = updatedItems.map(item => {
                const planForFirestore = (item.productionPlan || []).map(p => ({
                    ...p,
                    startDate: p.startDate ? Timestamp.fromDate(new Date(p.startDate)) : null,
                    completedDate: p.completedDate ? Timestamp.fromDate(new Date(p.completedDate)) : null,
                    status: p.status || 'Pendente',
                    stageName: p.stageName || '',
                    durationDays: p.durationDays || 0,
                }));
                
                return {
                    ...item,
                    productionPlan: planForFirestore,
                    itemDeliveryDate: item.itemDeliveryDate ? Timestamp.fromDate(new Date(item.itemDeliveryDate)) : null,
                    shippingDate: item.shippingDate ? Timestamp.fromDate(new Date(item.shippingDate)) : null,
                };
            });

            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            // Remove campos undefined antes de enviar para o Firestore
            const cleanedItems = removeUndefinedFields(itemsForFirestore);
            await updateDoc(orderRef, { items: cleanedItems });

            toast({ title: "Progresso colado!", description: `Etapas aplicadas ao item "${targetItem.description}".` });
            
            const allOrders = await fetchOrders();
            const updatedOrder = allOrders.find(o => o.id === selectedOrder.id);
            if (updatedOrder) {
                setSelectedOrder(updatedOrder);
                form.reset({
                    ...updatedOrder,
                    status: updatedOrder.status as any,
                });
            }

        } catch (error) {
            console.error("Error pasting progress:", error);
            toast({ variant: "destructive", title: "Erro ao colar", description: "Não foi possível colar o progresso." });
        }
    };

    const handleRemoveStageFromPlan = (indexToRemove: number) => {
        setEditedPlan(editedPlan.filter((_, index) => index !== indexToRemove));
    };

    const handleAddStageToPlan = () => {
        const trimmedName = newStageNameForPlan.trim();
        if (!trimmedName) {
        toast({
            variant: "destructive",
            title: "Nome da etapa inválido",
            description: "O nome da etapa não pode estar em branco.",
        });
        return;
        }
        const newStage: ProductionStage = {
            stageName: trimmedName,
            status: "Pendente",
            startDate: null,
            completedDate: null,
            durationDays: 0,
            useBusinessDays: true, // Default para dias úteis
            assignedResource: undefined,
            supervisor: undefined,
        };
        setEditedPlan([...editedPlan, newStage]);
        setNewStageNameForPlan("");
    };

    // Componente para exibir QR Code melhorado
    const QRCodeDisplay = ({ data, size = 150, label = "QR Code" }: { 
      data: string; 
      size?: number; 
      label?: string; 
    }) => {
      const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string>('');

      useEffect(() => {
        const generateQR = async () => {
          try {
            setLoading(true);
            setError('');
            
            const url = await QRCode.toDataURL(data, {
              width: size,
              margin: 2,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              },
              errorCorrectionLevel: 'M'
            });
            
            setQrCodeUrl(url);
          } catch (err) {
            console.error('Erro ao gerar QR Code:', err);
            setError('Erro ao gerar QR Code');
          } finally {
            setLoading(false);
          }
        };

        if (data) {
          generateQR();
        }
      }, [data, size]);

      if (loading) {
        return (
          <div className="flex items-center justify-center" style={{ width: size, height: size }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        );
      }

      if (error) {
        return (
          <div className="flex items-center justify-center bg-red-50 border border-red-200 rounded p-2" 
               style={{ width: size, height: size }}>
            <p className="text-red-600 text-xs text-center">{error}</p>
          </div>
        );
      }

      return (
        <div className="text-center">
          <img src={qrCodeUrl} alt={label} className="border rounded mx-auto" />
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      );
    };

    const handleGenerateTimesheet = async (item: OrderItem) => {
        if (!selectedOrder) return;

        toast({ title: "Gerando Folha de Apontamento...", description: "Por favor, aguarde." });

        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const docSnap = await getDoc(companyRef);
            const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
            
            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            let yPos = 15;

            // Header com logo e informações da empresa
            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
                } catch (e) {
                    console.error("Error adding logo to PDF:", e);
                }
            }

            // Informações da empresa
            let companyInfoX = 65;
            let companyInfoY = yPos + 5;
            docPdf.setFontSize(16).setFont('helvetica', 'bold');
            docPdf.text(companyData.nomeFantasia || 'Sua Empresa', companyInfoX, companyInfoY);
            companyInfoY += 6;
            
            docPdf.setFontSize(8).setFont('helvetica', 'normal');
            if (companyData.endereco) {
                const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - companyInfoX - 15);
                docPdf.text(addressLines, companyInfoX, companyInfoY);
                companyInfoY += (addressLines.length * 3);
            }

            yPos = 45;

            // Título - ajusta baseado no progresso do item
            const itemProgress = calculateItemProgress(item);
            docPdf.setFontSize(18).setFont('helvetica', 'bold');
            if (itemProgress === 100) {
                docPdf.text('CONTROLE DE EMBARQUE E ENTREGA', pageWidth / 2, yPos, { align: 'center' });
            } else {
                docPdf.text('FOLHA DE APONTAMENTO DE PRODUÇÃO', pageWidth / 2, yPos, { align: 'center' });
            }
            yPos += 15;

            // Informações do pedido
            docPdf.setFontSize(11).setFont('helvetica', 'normal');
            docPdf.text(`Pedido: ${selectedOrder.quotationNumber}`, 15, yPos);
            docPdf.text(`Data: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 7;
            
            docPdf.text(`Cliente: ${selectedOrder.customer.name}`, 15, yPos);
            docPdf.text(`OS: ${selectedOrder.internalOS || 'N/A'}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 15;

            // Dados do item
            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('DADOS DO ITEM:', 15, yPos);
            yPos += 8;

            docPdf.setFontSize(10).setFont('helvetica', 'normal');
            docPdf.text(`Código: ${item.code || 'N/A'}`, 15, yPos);
            yPos += 5;
            docPdf.text(`Descrição: ${item.description}`, 15, yPos);
            yPos += 5;
            docPdf.text(`Quantidade: ${item.quantity}`, 15, yPos);
            docPdf.text(`Peso Unit.: ${(Number(item.unitWeight) || 0).toLocaleString('pt-BR')} kg`, pageWidth / 2, yPos);
            yPos += 5;
            
            // Informações de embarque se o item estiver concluído
            if (itemProgress === 100) {
                yPos += 10;
                docPdf.setFontSize(12).setFont('helvetica', 'bold');
                docPdf.text('INFORMAÇÕES DE EMBARQUE:', 15, yPos);
                yPos += 8;
                
                docPdf.setFontSize(10).setFont('helvetica', 'normal');
                docPdf.text(`Lista de Embarque: ${item.shippingList || 'Pendente'}`, 15, yPos);
                yPos += 5;
                docPdf.text(`Nota Fiscal: ${item.invoiceNumber || 'Pendente'}`, 15, yPos);
                yPos += 5;
                docPdf.text(`Data de Embarque: ${item.shippingDate ? format(item.shippingDate, 'dd/MM/yyyy') : 'Pendente'}`, 15, yPos);
                
                // Status de entrega
                if (item.shippingDate && selectedOrder.deliveryDate) {
                    yPos += 5;
                    const isOnTime = item.shippingDate <= selectedOrder.deliveryDate;
                    docPdf.setFont('helvetica', 'bold');
                    docPdf.text(`Status de Entrega: ${isOnTime ? 'NO PRAZO' : 'ATRASADO'}`, 15, yPos);
                    
                    if (!isOnTime) {
                        const daysLate = Math.ceil((item.shippingDate.getTime() - selectedOrder.deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
                        yPos += 5;
                        docPdf.setFont('helvetica', 'normal');
                        docPdf.text(`Atraso: ${daysLate} dia(s)`, 15, yPos);
                    }
                }
                yPos += 10;
            } else {
                yPos += 10;
            }

            // QR Code MELHORADO com dados mais completos incluindo informações de embarque
            const qrData = JSON.stringify({
                type: 'controle_embarque',
                orderId: selectedOrder.id,
                itemId: item.id,
                orderNumber: selectedOrder.quotationNumber,
                itemNumber: item.itemNumber || null, // Número do item no pedido de compra
                itemCode: item.code || 'SEM_CODIGO',
                itemDescription: item.description,
                quantity: item.quantity,
                customer: selectedOrder.customer.name,
                internalOS: selectedOrder.internalOS || '',
                deliveryDate: selectedOrder.deliveryDate ? format(selectedOrder.deliveryDate, 'yyyy-MM-dd') : null,
                shippingDate: item.shippingDate ? format(item.shippingDate, 'yyyy-MM-dd') : null,
                invoiceNumber: item.invoiceNumber || null,
                shippingList: item.shippingList || null,
                isOnTime: item.shippingDate && selectedOrder.deliveryDate ? 
                    item.shippingDate <= selectedOrder.deliveryDate : null,
                timestamp: new Date().toISOString(),
                // URL para acesso direto
                url: `${window.location.origin}/embarque/${selectedOrder.id}/${item.id}`
            });

            try {
                const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
                    width: 120,
                    margin: 2,
                    color: { dark: '#000000', light: '#FFFFFF' },
                    errorCorrectionLevel: 'M'
                });
                
                // Posiciona o QR Code no canto superior direito da seção de dados
                docPdf.addImage(qrCodeDataUrl, 'PNG', pageWidth - 45, yPos - 25, 30, 30);
                
                // Adiciona texto explicativo abaixo do QR Code
                docPdf.setFontSize(7);
                docPdf.text('QR Code para', pageWidth - 45, yPos + 8, { align: 'left' });
                docPdf.text('rastreamento digital', pageWidth - 45, yPos + 12, { align: 'left' });
                
                // Log dos dados para debug
                console.log('QR Code gerado com dados:', qrData);
                
            } catch (e) {
                console.error("Erro ao gerar QR code:", e);
                toast({
                    variant: "destructive",
                    title: "Aviso",
                    description: "QR Code não pôde ser gerado, mas o documento foi criado normalmente.",
                });
            }

            // Tabela de etapas de produção
            if (item.productionPlan && item.productionPlan.length > 0) {
                docPdf.setFontSize(12).setFont('helvetica', 'bold');
                docPdf.text('ETAPAS DE PRODUÇÃO:', 15, yPos + 10);
                yPos += 20;

                const tableBody = item.productionPlan.map((stage: any) => [
                    stage.stageName,
                    stage.startDate ? format(new Date(stage.startDate), 'dd/MM/yy') : '',
                    stage.completedDate ? format(new Date(stage.completedDate), 'dd/MM/yy') : '',
                    stage.status,
                    '', // Coluna para assinatura
                ]);

                autoTable(docPdf, {
                    startY: yPos,
                    head: [['Etapa', 'Início', 'Fim', 'Status', 'Assinatura Responsável']],
                    body: tableBody,
                    styles: { fontSize: 9, cellPadding: 3 },
                    headStyles: { fillColor: [37, 99, 235], fontSize: 10, textColor: 255 },
                    columnStyles: {
                        0: { cellWidth: 60 },
                        1: { cellWidth: 25, halign: 'center' },
                        2: { cellWidth: 25, halign: 'center' },
                        3: { cellWidth: 30, halign: 'center' },
                        4: { cellWidth: 50 },
                    }
                });

                yPos = (docPdf as any).lastAutoTable.finalY + 15;
            }

            // Seção de apontamentos
            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('REGISTRO DE APONTAMENTOS:', 15, yPos);
            yPos += 10;

            // Tabela de apontamentos em branco
            const appointmentRows = Array(8).fill(['', '', '', '', '', '']);
            
            autoTable(docPdf, {
                startY: yPos,
                head: [['Data', 'Hora Início', 'Hora Fim', 'Funcionário', 'Etapa/Atividade', 'Observações']],
                body: appointmentRows,
                styles: { fontSize: 9, cellPadding: 4, minCellHeight: 8 },
                headStyles: { fillColor: [37, 99, 235], fontSize: 10, textColor: 255 },
                columnStyles: {
                    0: { cellWidth: 25, halign: 'center' },
                    1: { cellWidth: 20, halign: 'center' },
                    2: { cellWidth: 20, halign: 'center' },
                    3: { cellWidth: 35 },
                    4: { cellWidth: 35 },
                    5: { cellWidth: 55 },
                }
            });

            // Rodapé
            const finalY = (docPdf as any).lastAutoTable.finalY;
            const pageHeight = docPdf.internal.pageSize.height;
            
            if (finalY + 30 < pageHeight - 20) {
                yPos = finalY + 15;
                docPdf.setFontSize(8).setFont('helvetica', 'italic');
                docPdf.text(
                    `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
                    pageWidth / 2,
                    yPos,
                    { align: 'center' }
                );
            }

            // Salvar o PDF
            const filePrefix = itemProgress === 100 ? 'Controle_Embarque' : 'Apontamento';
            const filename = `${filePrefix}_${selectedOrder.quotationNumber}_${item.code || 'Item'}_${format(new Date(), 'yyyyMMdd')}.pdf`;
            docPdf.save(filename);

            const documentType = itemProgress === 100 ? 'Controle de Embarque' : 'Folha de Apontamento';
            toast({
                title: `${documentType} gerado com sucesso!`,
                description: `Arquivo ${filename} foi baixado. QR Code incluído para rastreamento.`,
            });

        } catch (error) {
            console.error("Error generating timesheet:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar folha",
                description: "Não foi possível gerar a folha de apontamento.",
            });
        }
    };

    const handleGenerateMonthlyReport = async () => {
        if (monthFilter === 'all') {
            toast({
                variant: "destructive",
                title: "Selecione um mês",
                description: "Por favor, selecione um mês específico para gerar o relatório.",
            });
            return;
        }

        if (!monthWeightStats || monthWeightStats.totalOrders === 0) {
            toast({
                variant: "destructive",
                title: "Nenhum dado para exportar",
                description: "Não há pedidos para o mês selecionado.",
            });
            return;
        }

        toast({ title: "Gerando Relatório Mensal...", description: "Por favor, aguarde." });

        try {
            // Buscar dados da empresa
            let companyData: CompanyData = {};
            try {
                const companyRef = doc(db, "companies", "mecald", "settings", "company");
                const docSnap = await getDoc(companyRef);
                companyData = docSnap.exists() ? (docSnap.data() as CompanyData) : {};
            } catch (error) {
                console.warn("Não foi possível carregar dados da empresa:", error);
            }

            // Criar o PDF
            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            const pageHeight = docPdf.internal.pageSize.height;
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
            docPdf.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY, { align: 'left' });
            textY += 6;
            
            docPdf.setFontSize(9).setFont('helvetica', 'normal');
            if (companyData.endereco) {
                const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
                docPdf.text(addressLines, textX, textY);
                textY += addressLines.length * 4;
            }
            if (companyData.cnpj) {
                docPdf.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
                textY += 4;
            }
            if (companyData.email) {
                docPdf.text(`Email: ${companyData.email}`, textX, textY);
                textY += 4;
            }
            if (companyData.celular) {
                docPdf.text(`Telefone: ${companyData.celular}`, textX, textY);
            }

            yPos = 55;

            // Título do documento
            const selectedMonth = availableMonths.find(m => m.value === monthFilter);
            const monthName = selectedMonth ? selectedMonth.label : monthFilter;
            
            docPdf.setFontSize(16).setFont('helvetica', 'bold');
            docPdf.text('RELATÓRIO MENSAL DE PRODUÇÃO', pageWidth / 2, yPos, { align: 'center' });
            yPos += 8;
            
            docPdf.setFontSize(14).setFont('helvetica', 'normal');
            docPdf.setTextColor(37, 99, 235);
            docPdf.text(monthName.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
            docPdf.setTextColor(0, 0, 0);
            yPos += 15;

            const monthOrders = filteredOrders.filter(order => {
                if (!order.deliveryDate) return false;
                const orderMonth = format(order.deliveryDate, 'yyyy-MM');
                return orderMonth === monthFilter;
            });

            // Box com resumo executivo
            const boxX = 15;
            const boxWidth = pageWidth - 30;
            const boxHeight = 35;
            
            docPdf.setFillColor(240, 248, 255);
            docPdf.rect(boxX, yPos, boxWidth, boxHeight, 'F');
            docPdf.setDrawColor(37, 99, 235);
            docPdf.setLineWidth(0.5);
            docPdf.rect(boxX, yPos, boxWidth, boxHeight, 'S');
            
            yPos += 8;
            docPdf.setFontSize(11).setFont('helvetica', 'bold');
            docPdf.text('RESUMO EXECUTIVO', boxX + 5, yPos);
            yPos += 8;
            
            docPdf.setFontSize(9).setFont('helvetica', 'normal');
            
            const col1X = boxX + 5;
            const col2X = boxX + boxWidth / 2;
            
            docPdf.text(`Total de Pedidos: ${monthWeightStats.totalOrders}`, col1X, yPos);
            docPdf.text(`Data de Emissão: ${format(new Date(), "dd/MM/yyyy")}`, col2X, yPos);
            yPos += 5;
            
            docPdf.setFont('helvetica', 'bold');
            docPdf.text(`Peso Total: ${monthWeightStats.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`, col1X, yPos);
            docPdf.setFont('helvetica', 'normal');
            yPos += 5;
            
            docPdf.setTextColor(21, 128, 61);
            docPdf.text(`✓ Concluído: ${monthWeightStats.completedWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`, col1X, yPos);
            docPdf.setTextColor(234, 88, 12);
            docPdf.text(`⧗ Pendente: ${monthWeightStats.pendingWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`, col2X, yPos);
            docPdf.setTextColor(0, 0, 0);
            yPos += 5;
            
            docPdf.setFont('helvetica', 'bold');
            docPdf.text(`Taxa de Conclusão: ${monthWeightStats.completedPercentage.toFixed(1)}%`, col1X, yPos);
            docPdf.setFont('helvetica', 'normal');
            
            yPos += 20;

            // Agrupamento por status
            const ordersByStatus = {
                'Concluído': monthOrders.filter(o => o.status === 'Concluído'),
                'Em Produção': monthOrders.filter(o => o.status === 'Em Produção'),
                'Aguardando Produção': monthOrders.filter(o => o.status === 'Aguardando Produção'),
                'Pronto para Entrega': monthOrders.filter(o => o.status === 'Pronto para Entrega'),
                'Atrasado': monthOrders.filter(o => o.status === 'Atrasado'),
            } as const;

            // Estatísticas por status
            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('DISTRIBUIÇÃO POR STATUS', 15, yPos);
            yPos += 10;

            const totalWeight = monthWeightStats.totalWeight || 0;
            const statusData = Object.entries(ordersByStatus)
                .filter(([_, orders]) => orders.length > 0)
                .map(([status, orders]) => {
                    const weight = orders.reduce((acc, o) => acc + (o.totalWeight || 0), 0);
                    const percentage = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0.0';
                    return [
                        status,
                        orders.length.toString(),
                        `${weight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`,
                        `${percentage}%`
                    ];
                });

            autoTable(docPdf, {
                startY: yPos,
                head: [['Status', 'Qtd. Pedidos', 'Peso Total', '% do Total']],
                body: statusData,
                styles: { fontSize: 9, cellPadding: 3 },
                headStyles: { fillColor: [37, 99, 235], fontSize: 10, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { cellWidth: 35, halign: 'center' },
                    2: { cellWidth: 45, halign: 'right' },
                    3: { cellWidth: 35, halign: 'center' },
                },
                margin: { left: 15, right: 15 }
            });

            yPos = (docPdf as any).lastAutoTable.finalY + 15;

            if (yPos + 60 > pageHeight - 20) {
                docPdf.addPage();
                yPos = 20;
            }

            // Tabela detalhada dos pedidos
            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('DETALHAMENTO DOS PEDIDOS', 15, yPos);
            yPos += 10;

            const tableBody = monthOrders.map(order => (
                [
                    order.quotationNumber || 'N/A',
                    order.customer?.name || 'N/A',
                    order.projectName || '-',
                    order.deliveryDate ? format(order.deliveryDate, 'dd/MM/yy') : 'A definir',
                    order.items.length.toString(),
                    (order.totalWeight || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                    order.status
                ]
            ));

            autoTable(docPdf, {
                startY: yPos,
                head: [['Pedido', 'Cliente', 'Projeto', 'Entrega', 'Itens', 'Peso (kg)', 'Status']],
                body: tableBody,
                styles: { fontSize: 7, cellPadding: 2 },
                headStyles: { 
                    fillColor: [37, 99, 235], 
                    fontSize: 8, 
                    fontStyle: 'bold',
                    halign: 'center'
                },
                columnStyles: {
                    0: { cellWidth: 22, halign: 'center' },
                    1: { cellWidth: 40 },
                    2: { cellWidth: 35 },
                    3: { cellWidth: 20, halign: 'center' },
                    4: { cellWidth: 15, halign: 'center' },
                    5: { cellWidth: 25, halign: 'right' },
                    6: { cellWidth: 28, halign: 'center' },
                },
                margin: { left: 15, right: 15 },
                didParseCell: (data) => {
                    if (data.column.index === 6 && data.section === 'body') {
                        const status = data.cell.raw as string;
                        if (status === 'Concluído') {
                            data.cell.styles.fillColor = [220, 252, 231];
                            data.cell.styles.textColor = [21, 128, 61];
                            data.cell.styles.fontStyle = 'bold';
                        } else if (status === 'Em Produção') {
                            data.cell.styles.fillColor = [219, 234, 254];
                            data.cell.styles.textColor = [37, 99, 235];
                        } else if (status === 'Atrasado') {
                            data.cell.styles.fillColor = [254, 226, 226];
                            data.cell.styles.textColor = [185, 28, 28];
                            data.cell.styles.fontStyle = 'bold';
                        } else if (status === 'Pronto para Entrega') {
                            data.cell.styles.fillColor = [187, 247, 208];
                            data.cell.styles.textColor = [22, 101, 52];
                        }
                    }
                }
            });

            const finalY = (docPdf as any).lastAutoTable.finalY + 10;

            if (finalY + 60 > pageHeight - 20) {
                docPdf.addPage();
                yPos = 20;
            } else {
                yPos = finalY + 5;
            }

            // Análise por cliente
            const ordersByCustomer = new Map<string, { orders: Order[]; totalWeight: number }>();
            monthOrders.forEach(order => {
                const customerName = order.customer?.name || 'Não informado';
                if (!ordersByCustomer.has(customerName)) {
                    ordersByCustomer.set(customerName, { orders: [], totalWeight: 0 });
                }
                const customerData = ordersByCustomer.get(customerName)!;
                customerData.orders.push(order);
                customerData.totalWeight += order.totalWeight || 0;
            });

            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('ANÁLISE POR CLIENTE', 15, yPos);
            yPos += 10;

            const customerData = Array.from(ordersByCustomer.entries())
                .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
                .map(([customer, data]) => {
                    const percentage = totalWeight > 0 ? ((data.totalWeight / totalWeight) * 100).toFixed(1) : '0.0';
                    return [
                        customer,
                        data.orders.length.toString(),
                        `${data.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`,
                        `${percentage}%`
                    ];
                });

            autoTable(docPdf, {
                startY: yPos,
                head: [['Cliente', 'Qtd. Pedidos', 'Peso Total', '% do Total']],
                body: customerData,
                styles: { fontSize: 9, cellPadding: 3 },
                headStyles: { fillColor: [37, 99, 235], fontSize: 10, fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 80 },
                    1: { cellWidth: 35, halign: 'center' },
                    2: { cellWidth: 45, halign: 'right' },
                    3: { cellWidth: 25, halign: 'center' },
                },
                margin: { left: 15, right: 15 }
            });

            const finalTableY = (docPdf as any).lastAutoTable.finalY + 10;
            
            if (finalTableY + 20 < pageHeight - 20) {
                docPdf.setFontSize(8).setFont('helvetica', 'italic');
                docPdf.setTextColor(100, 100, 100);
                docPdf.text(
                    `Relatório gerado automaticamente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
                    pageWidth / 2,
                    finalTableY,
                    { align: 'center' }
                );
                
                docPdf.text(
                    `Total de ${monthWeightStats.totalOrders} pedido(s) | ${monthWeightStats.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`,
                    pageWidth / 2,
                    finalTableY + 5,
                    { align: 'center' }
                );
            }

            const [year, month] = monthFilter.split('-');
            const monthNames = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];
            const monthNameFile = monthNames[parseInt(month, 10) - 1] || month;
            const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
            const filename = `Relatorio_Mensal_${monthNameFile}_${year}_${timestamp}.pdf`;
            
            docPdf.save(filename);
            
            toast({
                title: "✅ Relatório Gerado com Sucesso!",
                description: `O arquivo "${filename}" foi baixado com todas as estatísticas do mês.`,
            });

        } catch (error) {
            console.error("Erro completo ao gerar relatório mensal:", error);
            toast({
                variant: "destructive",
                title: "Erro ao Gerar Relatório",
                description: `Falha na geração: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
            });
        }
    };

    // FUNÇÃO AUXILIAR MELHORADA para debug
    const logProgressState = (context: string, plan: ProductionStage[]) => {
        console.log(`📊 ${context}:`, plan.map(stage => ({
            name: stage.stageName,
            status: stage.status,
            start: stage.startDate ? format(stage.startDate, 'dd/MM/yyyy') : 'null',
            end: stage.completedDate ? format(stage.completedDate, 'dd/MM/yyyy') : 'null',
            duration: stage.durationDays,
            businessDays: stage.useBusinessDays
        })));
    };

    // FUNÇÃO AUXILIAR para criação segura de datas
    const createSafeDate = (dateString: string): Date | null => {
        if (!dateString) return null;
        
        try {
            // Para strings no formato YYYY-MM-DD, cria data local
            if (dateString.includes('-')) {
                const [year, month, day] = dateString.split('-').map(Number);
                const date = new Date(year, month - 1, day); // month - 1 porque Date usa 0-11
                
                if (!isNaN(date.getTime())) {
                    console.log('📅 [createSafeDate] Criada data local:', {
                        input: dateString,
                        output: date,
                        formatted: format(date, 'dd/MM/yyyy')
                    });
                    return date;
                }
            }
            
            // Fallback para outros formatos
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                console.log('📅 [createSafeDate] Criada data fallback:', { input: dateString, output: date });
                return date;
            }
            
            console.warn('📅 [createSafeDate] Data inválida:', dateString);
            return null;
        } catch (error) {
            console.error('📅 [createSafeDate] Erro ao criar data:', { dateString, error });
            return null;
        }
    };

    // CORREÇÃO 1: CÁLCULO CORRETO DE DIAS DE ATRASO
    // CORREÇÃO: Função analyzeItemDelivery com cálculo correto de dias de diferença
    const analyzeItemDelivery = (item: OrderItem, orderDeliveryDate?: Date) => {
      console.log('🔍 Analisando item:', {
        id: item.id,
        description: item.description,
        expectedDate: item.itemDeliveryDate || orderDeliveryDate,
        actualDate: item.shippingDate
      });

      const analysis = {
        itemId: item.id,
        itemNumber: item.itemNumber || 'N/A',
        code: item.code || 'N/A',
        description: item.description,
        quantity: item.quantity,
        
        // Dados de embarque
        hasShippingList: !!(item.shippingList && item.shippingList.trim() && item.shippingList !== 'Não informada'),
        shippingList: item.shippingList && item.shippingList.trim() ? item.shippingList.trim() : 'Não informada',
        hasInvoice: !!(item.invoiceNumber && item.invoiceNumber.trim() && item.invoiceNumber !== 'Não informada'),
        invoiceNumber: item.invoiceNumber && item.invoiceNumber.trim() ? item.invoiceNumber.trim() : 'Não informada',
        hasShippingDate: !!item.shippingDate,
        shippingDate: item.shippingDate,
        
        // Datas para análise
        expectedDate: item.itemDeliveryDate || orderDeliveryDate,
        actualDate: item.shippingDate,
        
        // Status da entrega
        deliveryStatus: 'pending',
        daysDifference: 0,
        isComplete: false,
        
        // Progresso do item
        progress: calculateItemProgress(item),
      };

      analysis.isComplete = analysis.hasShippingList && analysis.hasInvoice && analysis.hasShippingDate;

      // CORREÇÃO PRINCIPAL: Cálculo correto de dias de diferença
      if (analysis.actualDate && analysis.expectedDate) {
        // Normalizar datas para meia-noite para comparação correta
        const expectedDateNormalized = new Date(analysis.expectedDate);
        expectedDateNormalized.setHours(0, 0, 0, 0);
        
        const actualDateNormalized = new Date(analysis.actualDate);
        actualDateNormalized.setHours(0, 0, 0, 0);
        
        // Calcular diferença em milissegundos e converter para dias
        const diffTime = actualDateNormalized.getTime() - expectedDateNormalized.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24); // Não usar Math.round aqui
        
        console.log('📅 Cálculo de diferença CORRIGIDO:', {
          expectedNormalized: expectedDateNormalized.toISOString().split('T')[0],
          actualNormalized: actualDateNormalized.toISOString().split('T')[0],
          diffTime,
          diffDays,
          diffDaysRounded: Math.round(Math.abs(diffDays))
        });
        
        // Armazenar sempre o valor absoluto para exibição
        analysis.daysDifference = Math.round(Math.abs(diffDays));
        
        // Definir status baseado no sinal da diferença
        if (diffDays < 0) {
          analysis.deliveryStatus = 'early'; // Entregue antes do prazo (negativo)
          console.log('✅ Status: ANTECIPADO -', analysis.daysDifference, 'dias');
        } else if (diffDays === 0) {
          analysis.deliveryStatus = 'ontime'; // Entregue no prazo exato
          console.log('✅ Status: NO PRAZO EXATO');
        } else {
          analysis.deliveryStatus = 'late'; // Entregue com atraso (positivo)
          console.log('❌ Status: ATRASADO +', analysis.daysDifference, 'dias');
        }
        
      } else if (analysis.expectedDate && !analysis.actualDate) {
        // Item vencido (sem entrega)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expectedDateOnly = new Date(analysis.expectedDate);
        expectedDateOnly.setHours(0, 0, 0, 0);
        
        if (expectedDateOnly < today) {
          analysis.deliveryStatus = 'overdue';
          const diffTime = today.getTime() - expectedDateOnly.getTime();
          analysis.daysDifference = Math.round(diffTime / (1000 * 60 * 60 * 24));
          console.log('⚠️ Status: VENCIDO -', analysis.daysDifference, 'dias');
        }
      }

      return analysis;
    };

    // FUNÇÃO PARA ANÁLISE DE ENTREGA DO PEDIDO (usando a nova análise de itens)
    const analyzeOrderDelivery = (order: Order) => {
        const itemAnalyses = order.items.map(item => analyzeItemDelivery(item, order.deliveryDate));
        
        const summary = {
            totalItems: order.items.length,
            completedItems: itemAnalyses.filter(item => item.isComplete).length,
            onTimeItems: itemAnalyses.filter(item => item.deliveryStatus === 'ontime').length,
            earlyItems: itemAnalyses.filter(item => item.deliveryStatus === 'early').length,
            lateItems: itemAnalyses.filter(item => item.deliveryStatus === 'late').length,
            pendingItems: itemAnalyses.filter(item => item.deliveryStatus === 'pending').length,
            overdueItems: itemAnalyses.filter(item => item.deliveryStatus === 'overdue').length,
            
            // Taxas percentuais
            onTimeRate: 0,
            earlyRate: 0,
            lateRate: 0,
            completionRate: 0
        };

        // Calcular taxas percentuais
        if (summary.totalItems > 0) {
            summary.onTimeRate = (summary.onTimeItems / summary.totalItems) * 100;
            summary.earlyRate = (summary.earlyItems / summary.totalItems) * 100;
            summary.lateRate = (summary.lateItems / summary.totalItems) * 100;
            summary.completionRate = (summary.completedItems / summary.totalItems) * 100;
        }

        return { summary, itemAnalyses };
    };

    // CORREÇÃO: Componente de visualização das mensagens de entrega no modal
    const DeliveryStatusMessage = ({ item, orderDeliveryDate }: { item: OrderItem, orderDeliveryDate?: Date }) => {
      if (!item.shippingDate) return null;
      
      // Usar a data de entrega específica do item ou a data geral do pedido
      const expectedDate = item.itemDeliveryDate || orderDeliveryDate;
      if (!expectedDate) return null;

      // Normalizar datas para meia-noite
      const shippingDate = new Date(item.shippingDate);
      shippingDate.setHours(0, 0, 0, 0);
      
      const deliveryDate = new Date(expectedDate);
      deliveryDate.setHours(0, 0, 0, 0);
      
      // Calcular diferença em dias (negativo = antecipado, positivo = atrasado)
      const diffTime = shippingDate.getTime() - deliveryDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      console.log('🎨 Renderizando status de entrega:', {
        shipping: format(shippingDate, 'dd/MM/yyyy'),
        expected: format(deliveryDate, 'dd/MM/yyyy'),
        diffDays,
        status: diffDays < 0 ? 'early' : diffDays === 0 ? 'ontime' : 'late'
      });

      if (diffDays < 0) {
        // Entregue antes do prazo (valor negativo)
        const daysEarly = Math.abs(diffDays);
        return (
          <div className="flex items-center gap-2 p-2 bg-blue-100 border border-blue-300 rounded text-sm text-blue-800">
            <TrendingUp className="h-4 w-4" />
            <span className="font-medium">
              Item entregue {daysEarly} dia{daysEarly !== 1 ? 's' : ''} antes do prazo
            </span>
          </div>
        );
      } else if (diffDays === 0) {
        // Entregue no prazo exato
        return (
          <div className="flex items-center gap-2 p-2 bg-green-100 border border-green-300 rounded text-sm text-green-800">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">Item entregue exatamente no prazo</span>
          </div>
        );
      } else {
        // Entregue com atraso (valor positivo)
        return (
          <div className="flex items-center gap-2 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-800">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">
              Item entregue {diffDays} dia{diffDays !== 1 ? 's' : ''} após o prazo
            </span>
          </div>
        );
      }
    };

    // CORREÇÃO: Badge de status para o item
    const DeliveryStatusBadge = ({ item, orderDeliveryDate }: { item: OrderItem, orderDeliveryDate?: Date }) => {
      if (!item.shippingDate || !orderDeliveryDate) return null;

      const analysis = analyzeItemDelivery(item, orderDeliveryDate);
      
      switch (analysis.deliveryStatus) {
        case 'early':
          return (
            <Badge variant="default" className="bg-blue-500 hover:bg-blue-500/90 text-xs">
              <TrendingUp className="mr-1 h-3 w-3" />
              Antecipado ({analysis.daysDifference}d)
            </Badge>
          );
        case 'ontime':
          return (
            <Badge variant="default" className="bg-green-600 hover:bg-green-600/90 text-xs">
              <CheckCircle className="mr-1 h-3 w-3" />
              No Prazo
            </Badge>
          );
        case 'late':
          return (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Atrasado ({analysis.daysDifference}d)
            </Badge>
          );
        default:
          return null;
      }
    };

    // COMPONENTE DO BOTÃO LIMPO (sem debug)
    const DeliveryReportButton = ({ order }: { order: Order }) => {
        const analysis = analyzeOrderDelivery(order);
        const hasDeliveryData = analysis.summary.completedItems > 0;
        
        return (
            <div className="flex items-center gap-2">
                <Button 
                    onClick={() => handleGenerateDeliveryReport(order)} 
                    variant="outline"
                    className="flex items-center gap-2"
                >
                    <FileText className="h-4 w-4" />
                    Relatório de Entrega
                </Button>
                {hasDeliveryData && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle className="h-3 w-3 text-green-600" />
                        <span>{analysis.summary.completedItems} itens com dados</span>
                    </div>
                )}
            </div>
        );
    };

    // PREVIEW LIMPO (sem botões de debug) para o modal
    const DeliveryPreviewCard = ({ selectedOrder }: { selectedOrder: Order }) => {
        const analysis = analyzeOrderDelivery(selectedOrder);
        const hasData = analysis.summary.completedItems > 0;
        
        if (!hasData) {
            return (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Performance de Entrega
                        </CardTitle>
                        <CardDescription>
                            Análise dos dados de embarque e pontualidade das entregas
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-6 text-muted-foreground">
                            <Clock className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm">Nenhum dado de embarque disponível ainda</p>
                        </div>
                    </CardContent>
                </Card>
            );
        }
        
        const overallRate = analysis.summary.totalItems > 0 ? 
            ((analysis.summary.onTimeItems + analysis.summary.earlyItems) / analysis.summary.totalItems) * 100 : 0;
        
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Performance de Entrega
                    </CardTitle>
                    <CardDescription>
                        Análise dos dados de embarque e pontualidade das entregas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Índice de Performance */}
                        <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Índice de Entrega no Prazo</p>
                                <p className="text-2xl font-bold">{overallRate.toFixed(1)}%</p>
                                <p className="text-xs text-muted-foreground">
                                    {analysis.summary.onTimeItems + analysis.summary.earlyItems} de {analysis.summary.totalItems} itens
                                </p>
                            </div>
                            <div className={`p-3 rounded-full ${
                                overallRate >= 80 ? 'bg-green-100 text-green-600' :
                                overallRate >= 60 ? 'bg-yellow-100 text-yellow-600' :
                                'bg-red-100 text-red-600'
                            }`}>
                                {overallRate >= 80 ? <TrendingUp className="h-6 w-6" /> :
                                 overallRate >= 60 ? <Clock className="h-6 w-6" /> :
                                 <TrendingDown className="h-6 w-6" />}
                            </div>
                        </div>
                        
                        {/* Resumo por Status */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                                <div className="flex items-center justify-center mb-1">
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                </div>
                                <p className="font-semibold text-green-800">{analysis.summary.onTimeItems}</p>
                                <p className="text-green-600">No Prazo</p>
                            </div>
                            
                            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="flex items-center justify-center mb-1">
                                    <TrendingUp className="h-4 w-4 text-blue-600" />
                                </div>
                                <p className="font-semibold text-blue-800">{analysis.summary.earlyItems}</p>
                                <p className="text-blue-600">Antecipadas</p>
                            </div>
                            
                            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                                <div className="flex items-center justify-center mb-1">
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                </div>
                                <p className="font-semibold text-red-800">{analysis.summary.lateItems}</p>
                                <p className="text-red-600">Atrasadas</p>
                            </div>
                            
                            <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-center mb-1">
                                    <Clock className="h-4 w-4 text-gray-600" />
                                </div>
                                <p className="font-semibold text-gray-800">{analysis.summary.pendingItems}</p>
                                <p className="text-foreground/70">Pendentes</p>
                            </div>
                        </div>
                        
                        {/* Itens com Problemas */}
                        {(analysis.summary.lateItems > 0 || analysis.summary.overdueItems > 0) && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                    <p className="text-sm font-medium text-red-800">Itens com Atraso</p>
                                </div>
                                <div className="space-y-1">
                                    {analysis.itemAnalyses
                                        .filter(item => item.deliveryStatus === 'late' || item.deliveryStatus === 'overdue')
                                        .slice(0, 3)
                                        .map(item => (
                                            <p key={item.itemId} className="text-xs text-red-700">
                                                • {item.description.substring(0, 40)}... 
                                                ({item.deliveryStatus === 'late' ? `${item.daysDifference}d atrasado` : `${item.daysDifference}d vencido`})
                                            </p>
                                        ))}
                                    {analysis.itemAnalyses.filter(item => 
                                        item.deliveryStatus === 'late' || item.deliveryStatus === 'overdue'
                                    ).length > 3 && (
                                        <p className="text-xs text-red-600">
                                            +{analysis.itemAnalyses.filter(item => 
                                                item.deliveryStatus === 'late' || item.deliveryStatus === 'overdue'
                                            ).length - 3} outros itens com atraso
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };

    // FOOTER DO MODAL ATUALIZADO (sem botões de debug)
    const UpdatedSheetFooter = ({ selectedOrder, selectedItems, handleGeneratePackingSlip, handleExportSchedule, setIsEditing, handleDeleteClick, onDataBookSent, resetPackingSlipQuantities, setIsPackingSlipDialogOpen }) => (
        <SheetFooter className="flex-shrink-0 pt-4 border-t">
            <div className="flex items-center justify-between w-full gap-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                    {selectedItems.size > 0 && (
                        <Button 
                            onClick={() => {
                                resetPackingSlipQuantities();
                                setIsPackingSlipDialogOpen(true);
                            }} 
                            variant="outline"
                        >
                            <ReceiptText className="mr-2 h-4 w-4" />
                            Gerar Romaneio ({selectedItems.size} {selectedItems.size === 1 ? 'item' : 'itens'})
                        </Button>
                    )}
                    <Button onClick={handleExportSchedule} variant="outline">
                        <CalendarClock className="mr-2 h-4 w-4" />
                        Exportar Cronograma
                    </Button>
                    
                    {/* BOTÃO LIMPO SEM DEBUG */}
                    <DeliveryReportButton order={selectedOrder} />
                    
                    {/* Botão Data Book */}
                    {selectedOrder.status === 'Concluído' && !selectedOrder.dataBookSent && (
                        <Button 
                            onClick={onDataBookSent} 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-md hover:shadow-lg transition-all duration-200"
                        >
                            <Send className="mr-2 h-4 w-4" />
                            Marcar Data Book como Enviado
                        </Button>
                    )}
                    
                    {selectedOrder.dataBookSent && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 border-2 border-emerald-400 rounded-lg shadow-sm">
                            <CheckCircle className="h-5 w-5 text-emerald-700" />
                            <span className="text-sm font-bold text-emerald-800">
                                Data Book enviado
                            </span>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                    </Button>
                    <Button variant="destructive" onClick={() => handleDeleteClick(selectedOrder)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                    </Button>
                </div>
            </div>
        </SheetFooter>
    );

    // CORREÇÃO 2: LAYOUT DO RELATÓRIO PDF CORRIGIDO
    const handleGenerateDeliveryReport = async (order: Order) => {
      if (!order) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Dados do pedido não encontrados.",
        });
        return;
      }

      toast({ title: "Gerando Relatório de Entrega...", description: "Por favor, aguarde." });

      try {
        // Analisar dados de entrega
        const analysis = analyzeOrderDelivery(order);
        
        // Buscar dados da empresa
        let companyData: CompanyData = {};
        try {
          const companyRef = doc(db, "companies", "mecald", "settings", "company");
          const docSnap = await getDoc(companyRef);
          companyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
        } catch (error) {
          console.warn("Não foi possível carregar dados da empresa:", error);
        }
        
        // Criar o PDF
        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        const pageHeight = docPdf.internal.pageSize.height;
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
        docPdf.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY, { align: 'left' });
        textY += 6;
        
        docPdf.setFontSize(9).setFont('helvetica', 'normal');
        if (companyData.endereco) {
            const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
            docPdf.text(addressLines, textX, textY);
            textY += (addressLines.length * 4);
        }
        if (companyData.cnpj) {
            docPdf.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
            textY += 4;
        }
        if (companyData.email) {
            docPdf.text(`Email: ${companyData.email}`, textX, textY);
            textY += 4;
        }
        if (companyData.celular) {
            docPdf.text(`Telefone: ${companyData.celular}`, textX, textY);
        }

        yPos = 55;

        // Título do documento
        docPdf.setFontSize(16).setFont('helvetica', 'bold');
        docPdf.text('RELATÓRIO DE ENTREGA E PERFORMANCE', pageWidth / 2, yPos, { align: 'center' });
        yPos += 15;

        // Informações do pedido em duas colunas
        docPdf.setFontSize(11).setFont('helvetica', 'normal');
        
        // Coluna esquerda
        const leftColumnX = 15;
        let leftColumnY = yPos;
        docPdf.setFont('helvetica', 'bold');
        docPdf.text('DADOS DO PEDIDO:', leftColumnX, leftColumnY);
        leftColumnY += 6;
        docPdf.setFont('helvetica', 'normal');
        docPdf.text(`Pedido Nº: ${order.quotationNumber || 'N/A'}`, leftColumnX, leftColumnY);
        leftColumnY += 5;
        docPdf.text(`Cliente: ${order.customer?.name || 'N/A'}`, leftColumnX, leftColumnY);
        leftColumnY += 5;
        if (order.projectName) {
            docPdf.text(`Projeto: ${order.projectName}`, leftColumnX, leftColumnY);
            leftColumnY += 5;
        }
        
        // Coluna direita
        const rightColumnX = pageWidth / 2 + 10;
        let rightColumnY = yPos + 6;
        docPdf.text(`OS Interna: ${order.internalOS || 'N/A'}`, rightColumnX, rightColumnY);
        rightColumnY += 5;
        docPdf.text(`Data de Emissão: ${format(new Date(), "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
        rightColumnY += 5;
        if (order.deliveryDate) {
            docPdf.text(`Data de Entrega Geral: ${format(order.deliveryDate, "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
            rightColumnY += 5;
        }
        docPdf.text(`Status: ${order.status}`, rightColumnX, rightColumnY);
        
        yPos = Math.max(leftColumnY, rightColumnY) + 15;

        // Índice de Performance Geral
        const overallOnTimeRate = analysis.summary.totalItems > 0 ? 
          ((analysis.summary.onTimeItems + analysis.summary.earlyItems) / analysis.summary.totalItems) * 100 : 0;
        
        docPdf.setTextColor(0, 0, 0);
        docPdf.setFontSize(12).setFont('helvetica', 'bold');
        docPdf.text('ÍNDICE GERAL DE PONTUALIDADE:', 15, yPos);
        
        docPdf.setFontSize(20);
        const color = overallOnTimeRate >= 80 ? [34, 197, 94] : overallOnTimeRate >= 60 ? [245, 158, 11] : [239, 68, 68];
        docPdf.setTextColor(color[0], color[1], color[2]);
        docPdf.text(`${overallOnTimeRate.toFixed(1)}%`, pageWidth - 15, yPos + 5, { align: 'right' });
        
        yPos += 25;

        // Cards de performance em linha única para economizar espaço
        docPdf.setTextColor(0, 0, 0);
        docPdf.setFontSize(10).setFont('helvetica', 'bold');
        docPdf.text('RESUMO:', 15, yPos);
        yPos += 8;

        docPdf.setFontSize(9).setFont('helvetica', 'normal');
        const summaryText = `No Prazo: ${analysis.summary.onTimeItems} | Antecipadas: ${analysis.summary.earlyItems} | Atrasadas: ${analysis.summary.lateItems} | Pendentes: ${analysis.summary.pendingItems} | Total: ${analysis.summary.totalItems} itens`;
        docPdf.text(summaryText, 15, yPos);
        yPos += 15;

        // Verificar se precisa de nova página antes da tabela
        if (yPos + 60 > pageHeight - 20) {
          docPdf.addPage();
          yPos = 20;
        }

        // Tabela detalhada dos itens - LAYOUT CORRIGIDO
        docPdf.setTextColor(0, 0, 0);
        docPdf.setFontSize(12).setFont('helvetica', 'bold');
        docPdf.text('DETALHAMENTO POR ITEM', 15, yPos);
        yPos += 10;

        const tableBody = analysis.itemAnalyses.map(item => {
          let statusText = '';
          let deliveryText = '';
          
          switch (item.deliveryStatus) {
            case 'early':
              statusText = `Antecip. ${item.daysDifference}d`;
              deliveryText = item.actualDate ? format(item.actualDate, 'dd/MM/yy') : '';
              break;
            case 'ontime':
              statusText = 'No Prazo';
              deliveryText = item.actualDate ? format(item.actualDate, 'dd/MM/yy') : '';
              break;
            case 'late':
              statusText = `Atraso ${item.daysDifference}d`;
              deliveryText = item.actualDate ? format(item.actualDate, 'dd/MM/yy') : '';
              break;
            case 'overdue':
              statusText = `Vencido ${item.daysDifference}d`;
              deliveryText = 'Não entregue';
              break;
            default:
              statusText = 'Pendente';
              deliveryText = 'Não entregue';
          }

          // Mostrar dados reais de LE e NF
          const leStatus = item.hasShippingList ? 
            (item.shippingList.length > 8 ? item.shippingList.substring(0, 8) + '...' : item.shippingList) : 
            'Pendente';
          
          const nfStatus = item.hasInvoice ? 
            (item.invoiceNumber.length > 8 ? item.invoiceNumber.substring(0, 8) + '...' : item.invoiceNumber) : 
            'Pendente';

          return [
            item.itemNumber || '-',
            item.code || '-',
            item.description.length > 25 ? item.description.substring(0, 25) + '...' : item.description,
            item.expectedDate ? format(item.expectedDate, 'dd/MM/yy') : 'N/A',
            deliveryText,
            statusText,
            leStatus,
            nfStatus,
          ];
        });
        
        // TABELA COM LAYOUT OTIMIZADO
        autoTable(docPdf, {
          startY: yPos,
          head: [['Item', 'Código', 'Descrição', 'Prevista', 'Real', 'Status', 'LE', 'NF']],
          body: tableBody,
          styles: { 
            fontSize: 6,  // Reduzido para 6
            cellPadding: 1.5, // Reduzido padding
            overflow: 'linebreak',
            valign: 'middle'
          },
          headStyles: { 
            fillColor: [37, 99, 235], 
            fontSize: 7, // Cabeçalho um pouco maior
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' }, // Item - reduzido
            1: { cellWidth: 16, halign: 'center' }, // Código - reduzido
            2: { cellWidth: 45, halign: 'left' },   // Descrição - mantido
            3: { cellWidth: 16, halign: 'center' }, // Prevista - reduzido
            4: { cellWidth: 16, halign: 'center' }, // Real - reduzido
            5: { cellWidth: 20, halign: 'center' }, // Status - reduzido
            6: { cellWidth: 16, halign: 'center' }, // LE - reduzido
            7: { cellWidth: 16, halign: 'center' }, // NF - reduzido
          },
          margin: { left: 15, right: 15 },
          didParseCell: (data) => {
            // Colorir células baseado no status
            if (data.column.index === 5 && data.section === 'body') {
              const status = data.cell.raw as string;
              if (status.includes('Antecip')) {
                data.cell.styles.fillColor = [219, 234, 254];
                data.cell.styles.textColor = [37, 99, 235];
              } else if (status === 'No Prazo') {
                data.cell.styles.fillColor = [220, 252, 231];
                data.cell.styles.textColor = [21, 128, 61];
              } else if (status.includes('Atraso') || status.includes('Vencido')) {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [185, 28, 28];
              }
            }
            
            // Destacar LE e NF preenchidas
            if ((data.column.index === 6 || data.column.index === 7) && data.section === 'body') {
              const cellValue = data.cell.raw as string;
              if (cellValue !== 'Pendente' && cellValue !== '-') {
                data.cell.styles.fillColor = [220, 252, 231];
                data.cell.styles.textColor = [21, 128, 61];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        });

        // Rodapé com resumo executivo
        const finalY = (docPdf as any).lastAutoTable.finalY + 10;
        
        if (finalY + 25 < pageHeight - 20) {
          docPdf.setFontSize(9).setFont('helvetica', 'bold');
          docPdf.text('RESUMO EXECUTIVO:', 15, finalY);
          let summaryY = finalY + 6;
          
          docPdf.setFontSize(8).setFont('helvetica', 'normal');
          docPdf.text(`• Total: ${analysis.summary.totalItems} itens | Completos: ${analysis.summary.completedItems} | Taxa no prazo: ${(analysis.summary.onTimeRate + analysis.summary.earlyRate).toFixed(1)}%`, 15, summaryY);
          summaryY += 4;
          
          const itemsWithLE = analysis.itemAnalyses.filter(item => item.hasShippingList).length;
          const itemsWithNF = analysis.itemAnalyses.filter(item => item.hasInvoice).length;
          docPdf.text(`• Lista de Embarque: ${itemsWithLE}/${analysis.summary.totalItems} | Nota Fiscal: ${itemsWithNF}/${analysis.summary.totalItems}`, 15, summaryY);
          
          summaryY += 8;
          docPdf.setFontSize(7).setFont('helvetica', 'italic');
          docPdf.text(
            `Relatório gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
            pageWidth / 2,
            summaryY,
            { align: 'center' }
          );
        }

        // Salvar arquivo
        const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
        const filename = `Relatorio_Entrega_${order.quotationNumber || 'Pedido'}_${timestamp}.pdf`;
        
        docPdf.save(filename);
        
        toast({
          title: "✅ Relatório Gerado com Sucesso!",
          description: `O arquivo "${filename}" foi baixado com cálculo correto de atraso.`,
        });

      } catch (error) {
        console.error("Erro completo ao gerar relatório:", error);
        toast({
          variant: "destructive",
          title: "Erro ao Gerar Relatório",
          description: `Falha na geração: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        });
      }
    };





return (
    <div className="w-full">
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Pedidos de Produção</h1>
                    <div className="flex items-center gap-4">
                        {/* Botões de visualização */}
                        <div className="flex items-center rounded-lg border p-1">
                            <Button
                                size="sm"
                                onClick={() => setViewMode('list')}
                                className={`h-8 font-medium ${viewMode === 'list' 
                                    ? 'bg-primary text-primary-foreground shadow-sm' 
                                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                            >
                                <ListChecks className="mr-2 h-4 w-4" />
                                Lista
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setViewMode('kanban')}
                                className={`h-8 font-medium ${viewMode === 'kanban' 
                                    ? 'bg-primary text-primary-foreground shadow-sm' 
                                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                            >
                                <GanttChart className="mr-2 h-4 w-4" />
                                Kanban
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setViewMode('calendar')}
                                className={`h-8 font-medium ${viewMode === 'calendar' 
                                    ? 'bg-primary text-primary-foreground shadow-sm' 
                                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                            >
                                <CalendarDays className="mr-2 h-4 w-4" />
                                Calendário
                            </Button>
                        </div>
                        
                        {/* Campo de busca */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nº, OS, projeto, cliente..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 w-80"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="Total de Pedidos"
                        value={dashboardStats.totalOrders.toString()}
                        icon={Package}
                        description={`${dashboardStats.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg no total`}
                    />
                    <StatCard
                        title="Pedidos Concluídos"
                        value={dashboardStats.completedOrders.toString()}
                        icon={CheckCircle}
                        description={`${dashboardStats.completedWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg concluídas`}
                    />
                    <StatCard
                        title="Em Andamento"
                        value={dashboardStats.inProgressOrders.toString()}
                        icon={PlayCircle}
                        description={`${dashboardStats.inProgressWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg em produção`}
                    />
                    <StatCard
                        title="Pedidos Atrasados"
                        value={dashboardStats.delayedOrders.toString()}
                        icon={AlertTriangle}
                        description="Pedidos com data de entrega vencida"
                    />
                </div>

                 <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="text-sm font-medium">Filtrar por:</span>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os Status</SelectItem>
                                {uniqueStatuses
                                    .filter(status => status && status.trim() !== '')
                                    .map(status => (
                                        <SelectItem key={status} value={status}>{status}</SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>

                        <Select value={customerFilter} onValueChange={setCustomerFilter}>
                            <SelectTrigger className="w-[240px]">
                                <SelectValue placeholder="Cliente" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os Clientes</SelectItem>
                                {customers
                                    .filter(customer => customer.id && customer.id.trim() !== '')
                                    .map(customer => (
                                        <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>

                        {/* NOVO FILTRO DE MÊS */}
                        <Select value={monthFilter} onValueChange={setMonthFilter}>
                            <SelectTrigger className="w-[240px]">
                                <SelectValue placeholder="Mês de Entrega" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos os Meses</SelectItem>
                                {availableMonths.map(month => (
                                    <SelectItem key={month.value} value={month.value}>
                                        {month.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* NOVO FILTRO PARA DATA BOOK */}
                        <Select value={dataBookFilter} onValueChange={setDataBookFilter}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Data Book" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    Todos ({orders.length})
                                </SelectItem>
                                <SelectItem value="pendente">
                                    Data Book Pendente ({orders.filter(o => o.status === 'Concluído' && !o.dataBookSent).length})
                                </SelectItem>
                                <SelectItem value="enviado">
                                    Data Book Enviado ({orders.filter(o => o.dataBookSent).length})
                                </SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2">
                            <Input
                                type="date"
                                value={dateFilter ? format(dateFilter, "yyyy-MM-dd") : ""}
                                onChange={(e) => {
                                    console.log('🔥 FILTRO DATA ALTERADO:', e.target.value);
                                    if (e.target.value) {
                                        setDateFilter(new Date(e.target.value));
                                    } else {
                                        setDateFilter(undefined);
                                    }
                                }}
                                className="w-[180px]"
                                placeholder="Data de Entrega"
                            />
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setDateFilter(undefined)}
                                className="px-3"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        
                        {hasActiveFilters && (
                            <Button variant="ghost" onClick={clearFilters}>
                                <X className="mr-2 h-4 w-4" />
                                Limpar Filtros
                            </Button>
                        )}

                        {monthFilter !== 'all' && monthWeightStats && (
                            <Button 
                                onClick={handleGenerateMonthlyReport}
                                className="ml-auto bg-green-600 hover:bg-green-700 text-white"
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                Exportar Relatório Mensal
                            </Button>
                        )}
                    </div>
                    
                    {/* CARD DE ESTATÍSTICAS DO MÊS SELECIONADO */}
                    {monthWeightStats && (
                        <div className="mt-4 pt-4 border-t">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="p-2 bg-blue-100 rounded-full">
                                        <Package className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Total de Pedidos</p>
                                        <p className="text-lg font-bold text-blue-700">{monthWeightStats.totalOrders}</p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                    <div className="p-2 bg-purple-100 rounded-full">
                                        <Weight className="h-5 w-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Peso Total</p>
                                        <p className="text-lg font-bold text-purple-700">
                                            {monthWeightStats.totalWeight.toLocaleString('pt-BR', { 
                                                minimumFractionDigits: 2, 
                                                maximumFractionDigits: 2 
                                            })} kg
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="p-2 bg-green-100 rounded-full">
                                        <CheckCircle className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Peso Concluído</p>
                                        <p className="text-lg font-bold text-green-700">
                                            {monthWeightStats.completedWeight.toLocaleString('pt-BR', { 
                                                minimumFractionDigits: 2, 
                                                maximumFractionDigits: 2 
                                            })} kg
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <div className="p-2 bg-orange-100 rounded-full">
                                        <Hourglass className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Peso Pendente</p>
                                        <p className="text-lg font-bold text-orange-700">
                                            {monthWeightStats.pendingWeight.toLocaleString('pt-BR', { 
                                                minimumFractionDigits: 2, 
                                                maximumFractionDigits: 2 
                                            })} kg
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Barra de progresso do mês */}
                            <div className="mt-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">
                                        Progresso de Conclusão do Mês
                                    </span>
                                    <span className="text-sm font-bold text-primary">
                                        {monthWeightStats.completedPercentage.toFixed(1)}%
                                    </span>
                                </div>
                                <Progress value={monthWeightStats.completedPercentage} className="h-3" />
                            </div>

                            <div className="mt-4 flex justify-center">
                                <Button 
                                    onClick={handleGenerateMonthlyReport}
                                    size="lg"
                                    className="bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg transition-all duration-200"
                                >
                                    <FileText className="mr-2 h-5 w-5" />
                                    Exportar Relatório Completo do Mês
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>

                {viewMode === 'list' ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-foreground">Lista de Pedidos</CardTitle>
                            <CardDescription className="text-foreground/80">Acompanhe todos os pedidos de produção aprovados.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : (
                               <OrdersTable orders={filteredOrders} onOrderClick={handleViewOrder} />
                            )}
                        </CardContent>
                    </Card>
                ) : viewMode === 'kanban' ? (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-foreground">Kanban de Pedidos por Mês de Entrega</CardTitle>
                                    <CardDescription className="text-foreground/80">
                                        Visualize os pedidos organizados por mês de entrega com peso total por coluna.
                                        {filteredOrders.length > 0 && (
                                            <span className="ml-2">
                                                {filteredOrders.filter(o => o.deliveryDate || o.status === 'Concluído').length} de {filteredOrders.length} pedidos exibidos
                                            </span>
                                        )}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-green-600"></div>
                                        <span>Concluído</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-blue-500"></div>
                                        <span>Pronto</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-gray-600"></div>
                                        <span>Em Produção</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-orange-500"></div>
                                        <span>Atrasado</span>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex space-x-4 p-4">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="flex-shrink-0 w-80 space-y-4">
                                            <Skeleton className="h-24 w-full" />
                                            <Skeleton className="h-32 w-full" />
                                            <Skeleton className="h-32 w-full" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <KanbanView />
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-foreground">Calendário de Entregas</CardTitle>
                                    <CardDescription className="text-foreground/80">
                                        Visualize os pedidos organizados por data de entrega. 
                                        {filteredOrders.length > 0 && (
                                            <span className="ml-2">
                                                {filteredOrders.filter(o => o.deliveryDate).length} de {filteredOrders.length} pedidos com data definida
                                            </span>
                                        )}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-green-600"></div>
                                        <span>Concluído</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-blue-500"></div>
                                        <span>Pronto</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-gray-600"></div>
                                        <span>Em Produção</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-orange-500"></div>
                                        <span>Atrasado</span>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-40 w-full" />
                                </div>
                            ) : filteredOrders.filter(o => o.deliveryDate).length === 0 ? (
                                <div className="text-center py-12">
                                    <CalendarDays className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                    <h3 className="text-lg font-medium mb-2 text-foreground">Nenhum pedido com data de entrega</h3>
                                    <p className="text-foreground/70">
                                        Os pedidos aparecerão no calendário quando tiverem data de entrega definida.
                                    </p>
                                </div>
                            ) : (
                                <CalendarView />
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            <Sheet open={isSheetOpen} onOpenChange={(open) => { 
  setIsSheetOpen(open); 
  if (!open) { 
    setIsEditing(false); 
    setSelectedItems(new Set()); 
    setProgressClipboard(null);
    
    // Restaurar scrolls quando fechar o modal
    if (viewMode === 'kanban') {
      // Scroll horizontal
      setTimeout(() => {
        if (kanbanScrollRef.current) {
          const savedPosition = scrollPositionRef.current || 
            parseInt(sessionStorage.getItem('kanbanScrollPosition') || '0', 10);
          
          if (savedPosition > 0) {
            kanbanScrollRef.current.scrollLeft = savedPosition;
            console.log('🔄 Restaurando scroll horizontal ao fechar:', savedPosition);
          }
        }
        
        // NOVO: Restaurar scroll vertical das colunas
        const columns = document.querySelectorAll('[data-column-scroll]');
        columns.forEach((column) => {
          const columnId = column.getAttribute('data-column-id');
          if (columnId) {
            const savedScroll = columnScrollPositions.current.get(columnId);
            if (savedScroll !== undefined) {
              column.scrollTop = savedScroll;
              console.log(`🔄 Restaurando scroll da coluna ${columnId}:`, savedScroll);
            }
          }
        });
      }, 100);
    }
  } 
}}>
  <SheetContent className="w-full sm:max-w-4xl flex flex-col h-full">
    {selectedOrder && (
      <>
        {/* Header fixo */}
        <SheetHeader className="flex-shrink-0 pb-4 border-b">
          <SheetTitle className="font-headline text-2xl">Pedido Nº {selectedOrder.quotationNumber}</SheetTitle>
          <SheetDescription>
            Cliente: <span className="font-medium text-foreground">{selectedOrder.customer?.name || 'N/A'}</span>
          </SheetDescription>
        </SheetHeader>

        {/* Conteúdo principal */}
        {isEditing ? (
          // MODO DE EDIÇÃO - COM SCROLL CORRIGIDO
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onOrderSubmit)} className="flex flex-col flex-1 min-h-0">
              {/* Área de conteúdo com scroll */}
              <div className="flex-1 overflow-hidden py-4">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-6">
                    {/* Informações Básicas do Pedido */}
                    <Card className="p-4 bg-secondary/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <FormField control={form.control} name="customer" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cliente</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                const selectedCustomer = customers.find(c => c.id === value);
                                if (selectedCustomer) field.onChange(selectedCustomer);
                              }}
                              value={field.value?.id}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione um cliente" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {customers
                                  .filter(c => c.id && c.id.trim() !== '')
                                  .map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}/>
                        <FormField control={form.control} name="projectName" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Projeto do Cliente</FormLabel>
                            <FormControl><Input placeholder="Ex: Ampliação Planta XPTO" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}/>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="internalOS" render={({ field }) => (
                          <FormItem>
                            <FormLabel>OS Interna</FormLabel>
                            <FormControl><Input placeholder="Ex: OS-2024-123" {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}/>
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status do Pedido</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione um status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Aguardando Produção">Aguardando Produção</SelectItem>
                                  <SelectItem value="Em Produção">Em Produção</SelectItem>
                                  <SelectItem value="Pronto para Entrega">Pronto para Entrega</SelectItem>
                                  <SelectItem value="Concluído">Concluído</SelectItem>
                                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Controle de Data Book */}
                      {form.watch("status") === "Concluído" && (
                        <Card className="mt-4">
                          <CardHeader>
                            <CardTitle>Controle de Data Book</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <FormField 
                              control={form.control} 
                              name="dataBookSent" 
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                  <div className="space-y-0.5">
                                    <FormLabel>Data Book Enviado</FormLabel>
                                    <FormDescription>
                                      Marque quando o Data Book tiver sido enviado ao cliente.
                                    </FormDescription>
                                  </div>
                                  <FormControl>
                                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <FormField control={form.control} name="quotationNumber" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nº Pedido (Compra)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Nº do Pedido de Compra do Cliente" 
                                {...field} 
                                value={field.value ?? ''} 
                                onChange={(e) => {
                                  console.log('📝 [DEBUG] Número do pedido alterado:', e.target.value);
                                  field.onChange(e.target.value);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}/>
                        <FormField control={form.control} name="deliveryDate" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data de Entrega</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                value={field.value ? format(new Date(field.value), "yyyy-MM-dd") : ""}
                                onChange={(e) => {
                                  console.log('🔥 DATA ENTREGA ALTERADA:', e.target.value);
                                  if (e.target.value) {
                                    field.onChange(new Date(e.target.value));
                                  } else {
                                    field.onChange(null);
                                  }
                                }}
                                className="w-full"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}/>
                      </div>
                      <div className="space-y-4 mt-6">
                        <FormField control={form.control} name="driveLink" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Link da Pasta (Google Drive)</FormLabel>
                            <FormControl><Input type="url" placeholder="https://drive.google.com/..." {...field} value={field.value ?? ''} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}/>
                      </div>
                    </Card>

                    {/* Checklist de Documentos */}
                    <Card>
                      <CardHeader><CardTitle>Checklist de Documentos</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <FormField control={form.control} name="documents.drawings" render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Desenhos Técnicos</FormLabel>
                              <FormDescription>Marque se os desenhos foram recebidos e estão na pasta.</FormDescription>
                            </div>
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )}/>
                        <FormField control={form.control} name="documents.inspectionTestPlan" render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Plano de Inspeção e Testes (PIT)</FormLabel>
                              <FormDescription>Marque se o plano de inspeção foi recebido.</FormDescription>
                            </div>
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )}/>
                        <FormField control={form.control} name="documents.paintPlan" render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Plano de Pintura</FormLabel>
                              <FormDescription>Marque se o plano de pintura foi recebido.</FormDescription>
                            </div>
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )}/>
                      </CardContent>
                    </Card>

                    {/* Itens do Pedido - MODO DE EDIÇÃO COM ADICIONAR/REMOVER */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Itens do Pedido (Editável)</span>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Package className="h-4 w-4" />
                              <span>{fields.length} {fields.length === 1 ? 'item' : 'itens'}</span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsAddingItem(true)}
                              className="flex items-center gap-2"
                            >
                              <PlusCircle className="h-4 w-4" />
                              Adicionar Item
                            </Button>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {fields.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Package className="h-8 w-8 mx-auto mb-2" />
                            <p>Nenhum item no pedido</p>
                            <p className="text-xs">Este pedido não possui itens cadastrados.</p>
                            <div className="mt-4">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsAddingItem(true)}
                                className="flex items-center gap-2"
                              >
                                <PlusCircle className="h-4 w-4" />
                                Adicionar Primeiro Item
                              </Button>
                            </div>
                          </div>
                        ) : (
                          fields.map((field, index) => {
                            const itemProgress = calculateItemProgress(watchedItems[index] || {});
                            return (
                              <Card key={field.id} className="p-4 bg-secondary relative">
                                {/* Botão de Exclusão no Canto Superior Direito */}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteItem(index)}
                                  title={`Remover item "${watchedItems[index]?.description || 'este item'}"`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>

                                <div className="space-y-4 pr-10"> {/* Adicionar padding-right para evitar sobreposição com botão */}
                                  {/* Header do Item com Número */}
                                  <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                                    <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                                      {index + 1}
                                    </div>
                                    <h4 className="font-medium text-sm text-muted-foreground">
                                      Item do Pedido {index + 1}
                                      {itemProgress === 100 && (
                                        <Badge variant="default" className="ml-2 bg-green-600 hover:bg-green-600/90">
                                          <CheckCircle className="mr-1 h-3 w-3" />
                                          Concluído
                                        </Badge>
                                      )}
                                    </h4>
                                  </div>

                                  <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Descrição do Item</FormLabel>
                                      <FormControl>
                                        <Textarea 
                                          placeholder="Descrição completa do item" 
                                          {...field} 
                                          className="min-h-[80px]"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}/>

                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <FormField control={form.control} name={`items.${index}.itemNumber`} render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Nº Item PC</FormLabel>
                                        <FormControl>
                                          <Input placeholder="Ex: 001" {...field} value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                        <FormDescription className="text-xs">
                                          Nº do item conforme Pedido de Compra do cliente
                                        </FormDescription>
                                      </FormItem>
                                    )}/>

                                    <FormField control={form.control} name={`items.${index}.code`} render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Código</FormLabel>
                                        <FormControl>
                                          <Input placeholder="Cód. Produto" {...field} value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}/>

                                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Quantidade</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="number" 
                                            placeholder="0" 
                                            {...field} 
                                            value={field.value ?? ''} 
                                            min="0"
                                            step="1"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}/>

                                    <FormField control={form.control} name={`items.${index}.unitWeight`} render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Peso Unit. (kg)</FormLabel>
                                        <FormControl>
                                          <Input 
                                            type="number" 
                                            step="0.01" 
                                            placeholder="0.00" 
                                            {...field} 
                                            value={field.value ?? ''} 
                                            min="0"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}/>

                                    <FormField 
                                      control={form.control} 
                                      name={`items.${index}.itemDeliveryDate`} 
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Entrega do Item</FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              value={
                                                field.value 
                                                  ? (field.value instanceof Date 
                                                      ? format(field.value, "yyyy-MM-dd") 
                                                      : format(new Date(field.value), "yyyy-MM-dd")
                                                    )
                                                  : ""
                                              }
                                              onChange={(e) => {
                                                console.log('📅 [ITEM DELIVERY] Mudança detectada:', e.target.value);
                                                if (e.target.value) {
                                                  // Criar data de forma mais robusta
                                                  const [year, month, day] = e.target.value.split('-').map(Number);
                                                  const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                                                  console.log('📅 [ITEM DELIVERY] Nova data criada:', newDate);
                                                  field.onChange(newDate);
                                                } else {
                                                  console.log('📅 [ITEM DELIVERY] Data limpa');
                                                  field.onChange(null);
                                                }
                                              }}
                                              className="w-full"
                                              placeholder="Selecione a data de entrega"
                                            />
                                          </FormControl>
                                          <FormMessage />
                                          <FormDescription className="text-xs text-muted-foreground">
                                            Data específica de entrega deste item (opcional)
                                          </FormDescription>
                                        </FormItem>
                                      )}
                                    />
                                  </div>

                                  {/* Seção de Embarque para Itens Concluídos */}
                                  {itemProgress === 100 && (
                                    <>
                                      <Separator className="my-3" />
                                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                          <CheckCircle className="h-5 w-5 text-green-600" />
                                          <h5 className="font-semibold text-green-800">Item Concluído - Preencha as Informações de Embarque</h5>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                          <FormField control={form.control} name={`items.${index}.shippingList`} render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Lista de Embarque (LE)</FormLabel>
                                              <FormControl>
                                                <Input placeholder="Nº da LE" {...field} value={field.value ?? ''} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}/>

                                          <FormField control={form.control} name={`items.${index}.invoiceNumber`} render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Nota Fiscal (NF-e) *</FormLabel>
                                              <FormControl>
                                                <Input placeholder="Nº da NF-e" {...field} value={field.value ?? ''} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}/>

                                          <FormField 
                                            control={form.control} 
                                            name={`items.${index}.shippingDate`} 
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel>Data de Embarque *</FormLabel>
                                                <FormControl>
                                                  <Input
                                                    type="date"
                                                    value={
                                                      field.value 
                                                        ? (field.value instanceof Date 
                                                            ? format(field.value, "yyyy-MM-dd") 
                                                            : format(new Date(field.value), "yyyy-MM-dd")
                                                          )
                                                        : ""
                                                    }
                                                    onChange={(e) => {
                                                      console.log('📅 [SHIPPING] Mudança detectada:', e.target.value);
                                                      if (e.target.value) {
                                                        const [year, month, day] = e.target.value.split('-').map(Number);
                                                        const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                                                        console.log('📅 [SHIPPING] Nova data criada:', newDate);
                                                        field.onChange(newDate);
                                                      } else {
                                                        console.log('📅 [SHIPPING] Data limpa');
                                                        field.onChange(null);
                                                      }
                                                    }}
                                                    className="w-full"
                                                  />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                        </div>

                                        {/* Indicador de Atraso/Antecipação */}
                                        {watchedItems[index]?.shippingDate && selectedOrder.deliveryDate && (
                                          <div className="mt-3">
                                            {new Date(watchedItems[index].shippingDate) <= selectedOrder.deliveryDate ? (
                                              <div className="flex items-center gap-2 p-2 bg-green-100 border border-green-300 rounded text-sm text-green-800">
                                                <CheckCircle className="h-4 w-4" />
                                                <span className="font-medium">Item será entregue no prazo</span>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-800">
                                                <AlertTriangle className="h-4 w-4" />
                                                <span className="font-medium">
                                                  Item será entregue {Math.ceil((new Date(watchedItems[index].shippingDate).getTime() - selectedOrder.deliveryDate.getTime()) / (1000 * 60 * 60 * 24))} dia(s) após o prazo
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        <p className="text-xs text-muted-foreground mt-2">
                                          * Campos obrigatórios para finalização do embarque
                                        </p>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </Card>
                            );
                          })
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </div>
              
              {/* Footer fixo com botões */}
              <div className="flex-shrink-0 pt-4 border-t bg-background">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-sm text-muted-foreground">
                    <span>Itens: {fields.length}</span>
                    <span className="mx-2">•</span>
                    <span>Peso Total: <span className="font-semibold">{currentTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting || fields.length === 0}>
                      {form.formState.isSubmitting ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        ) : (
          // MODO DE VISUALIZAÇÃO - MANTÉM ESTRUTURA ORIGINAL
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-hidden py-4">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-6">
                  {/* Informações Gerais */}
                  <Card className="p-6 bg-secondary/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Cliente</Label>
                        <p className="font-medium">{selectedOrder.customer?.name || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Projeto do Cliente</Label>
                        <p className="font-medium">{selectedOrder.projectName || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">OS Interna</Label>
                        <p className="font-medium">{selectedOrder.internalOS || 'N/A'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                        <div>
                          {(() => {
                            const statusProps = getStatusProps(selectedOrder.status);
                            return (
                              <Badge variant={statusProps.variant} className={statusProps.colorClass}>
                                <statusProps.icon className="mr-2 h-4 w-4" />
                                {statusProps.label}
                              </Badge>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Data de Entrega</Label>
                        <p className="font-medium">{selectedOrder.deliveryDate ? format(selectedOrder.deliveryDate, "dd/MM/yyyy") : 'A definir'}</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">Peso Total</Label>
                        <p className="font-medium">{(selectedOrder.totalWeight || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</p>
                      </div>
                    </div>
                    {selectedOrder.driveLink && (
                      <div className="mt-4 pt-4 border-t">
                        <Label className="text-sm font-medium text-muted-foreground">Pasta no Google Drive</Label>
                        <div className="mt-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={selectedOrder.driveLink} target="_blank" rel="noopener noreferrer">
                              <FolderGit2 className="mr-2 h-4 w-4" />
                              Acessar Pasta
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* Documentos */}
                  <Card>
                    <CardHeader><CardTitle>Status dos Documentos</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center space-x-2">
                          <div className={`p-2 rounded-full ${selectedOrder.documents?.drawings ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">Desenhos Técnicos</p>
                            <p className="text-sm text-muted-foreground">{selectedOrder.documents?.drawings ? 'Recebido' : 'Pendente'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={`p-2 rounded-full ${selectedOrder.documents?.inspectionTestPlan ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                            <ClipboardCheck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">Plano de Inspeção</p>
                            <p className="text-sm text-muted-foreground">{selectedOrder.documents?.inspectionTestPlan ? 'Recebido' : 'Pendente'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={`p-2 rounded-full ${selectedOrder.documents?.paintPlan ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                            <Palette className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">Plano de Pintura</p>
                            <p className="text-sm text-muted-foreground">{selectedOrder.documents?.paintPlan ? 'Recebido' : 'Pendente'}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Preview limpo dos dados de entrega */}
                  <DeliveryPreviewCard selectedOrder={selectedOrder} />

                  {/* Lista de Itens */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Itens do Pedido</CardTitle>
                      <div className="flex items-center gap-2">
                        {progressClipboard && (
                          <Button variant="outline" size="sm" onClick={handleCancelCopy}>
                            <X className="mr-2 h-4 w-4" />
                            Cancelar Cópia
                          </Button>
                        )}
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={selectedItems.size === selectedOrder.items.length && selectedOrder.items.length > 0}
                            onCheckedChange={handleSelectAll}
                            aria-label="Selecionar todos os itens"
                          />
                          <span className="text-sm text-muted-foreground">Selecionar todos</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedOrder.items.map((item, index) => {
                        const itemProgress = calculateItemProgress(item);
                        const totalItemWeight = (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0);
                        return (
                          <Card key={item.id} className={`p-4 ${selectedItems.has(item.id!) ? 'ring-2 ring-primary' : ''}`}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center space-x-3">
                                <Checkbox
                                  checked={selectedItems.has(item.id!)}
                                  onCheckedChange={() => handleItemSelection(item.id!)}
                                  aria-label={`Selecionar item ${item.description}`}
                                />
                                <div>
                                  <h4 className="font-medium">{item.description}</h4>
                                  {item.code && <p className="text-sm text-muted-foreground">Código: {item.code}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {progressClipboard && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="outline" size="sm" onClick={() => handlePasteProgress(item)}>
                                          <ClipboardPaste className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Colar progresso de "{progressClipboard.description}"</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleCopyProgress(item)}>
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Copiar progresso deste item</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                <Button variant="outline" size="sm" onClick={() => handleOpenProgressModal(item)}>
                                  <GanttChart className="mr-2 h-4 w-4" />
                                  Progresso
                                </Button>
                                {itemProgress === 100 && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button variant="outline" size="sm" onClick={() => handleGenerateTimesheet(item)}>
                                          <QrCode className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Gerar Folha de Controle de Embarque com QR Code</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Nº Item PC:</span>
                                <p className="font-medium">{item.itemNumber || 'N/A'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Quantidade:</span>
                                <p className="font-medium">{item.quantity}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Peso Unit.:</span>
                                <p className="font-medium">{(Number(item.unitWeight) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Peso Total:</span>
                                <p className="font-medium">{totalItemWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Entrega:</span>
                                <p className="font-medium">{item.itemDeliveryDate ? format(item.itemDeliveryDate, "dd/MM/yyyy") : 'A definir'}</p>
                              </div>
                            </div>
                            <div className="mt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm text-muted-foreground">Progresso:</span>
                                <span className="text-sm font-medium">{Math.round(itemProgress)}%</span>
                              </div>
                              <Progress value={itemProgress} className="h-2" />
                            </div>
                            {itemProgress === 100 && (
                              <>
                                <Separator className="my-3" />
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <h5 className="font-semibold text-green-800">Item Concluído - Informações de Embarque</h5>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">Lista de Embarque:</span>
                                      <p className="font-medium">{item.shippingList || 'Pendente'}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Nota Fiscal:</span>
                                      <p className="font-medium">{item.invoiceNumber || 'Pendente'}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Data de Embarque:</span>
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium">{item.shippingDate ? format(item.shippingDate, "dd/MM/yyyy") : 'Pendente'}</p>
                                        {item.shippingDate && selectedOrder.deliveryDate && (
                                          <>
                                            {item.shippingDate <= selectedOrder.deliveryDate ? (
                                              <Badge variant="default" className="bg-green-600 hover:bg-green-600/90 text-xs">
                                                <CheckCircle className="mr-1 h-3 w-3" />
                                                No Prazo
                                              </Badge>
                                            ) : (
                                              <Badge variant="destructive" className="text-xs">
                                                <AlertTriangle className="mr-1 h-3 w-3" />
                                                Atrasado
                                              </Badge>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {item.shippingDate && selectedOrder.deliveryDate && item.shippingDate > selectedOrder.deliveryDate && (
                                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                      <div className="flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        <span className="font-medium">
                                          Entregue {Math.ceil((item.shippingDate.getTime() - selectedOrder.deliveryDate.getTime()) / (1000 * 60 * 60 * 24))} dia(s) após o prazo
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </Card>
                        );
                      })}

                        {/* Formulário para adicionar novo item */}
                        {isAddingItem && (
                          <Card className="p-4 bg-blue-50 border-blue-200">
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 pb-2 border-b border-blue-300">
                                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                                  +
                                </div>
                                <h4 className="font-medium text-sm text-blue-800">
                                  Novo Item
                                </h4>
                              </div>

                              <div className="space-y-4">
                                <div>
                                  <Label htmlFor="new-description" className="text-blue-800">Descrição do Item *</Label>
                                  <Textarea
                                    id="new-description"
                                    placeholder="Descrição completa do item"
                                    value={newItemForm.description}
                                    onChange={(e) => setNewItemForm(prev => ({ ...prev, description: e.target.value }))}
                                    className="min-h-[80px] border-blue-300 focus:border-blue-500"
                                  />
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <Label htmlFor="new-itemNumber" className="text-blue-800">Nº Item PC</Label>
                                    <Input
                                      id="new-itemNumber"
                                      placeholder="Ex: 001"
                                      value={newItemForm.itemNumber}
                                      onChange={(e) => setNewItemForm(prev => ({ ...prev, itemNumber: e.target.value }))}
                                      className="border-blue-300 focus:border-blue-500"
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="new-code" className="text-blue-800">Código</Label>
                                    <Input
                                      id="new-code"
                                      placeholder="Cód. Produto"
                                      value={newItemForm.code}
                                      onChange={(e) => setNewItemForm(prev => ({ ...prev, code: e.target.value }))}
                                      className="border-blue-300 focus:border-blue-500"
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="new-quantity" className="text-blue-800">Quantidade</Label>
                                    <Input
                                      id="new-quantity"
                                      type="number"
                                      placeholder="1"
                                      value={newItemForm.quantity}
                                      onChange={(e) => setNewItemForm(prev => ({ ...prev, quantity: Number(e.target.value) || 1 }))}
                                      min="1"
                                      step="1"
                                      className="border-blue-300 focus:border-blue-500"
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="new-unitWeight" className="text-blue-800">Peso Unit. (kg)</Label>
                                    <Input
                                      id="new-unitWeight"
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={newItemForm.unitWeight}
                                      onChange={(e) => setNewItemForm(prev => ({ ...prev, unitWeight: Number(e.target.value) || 0 }))}
                                      min="0"
                                      className="border-blue-300 focus:border-blue-500"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                  <Button
                                    type="button"
                                    onClick={handleAddNewItem}
                                    className="bg-blue-600 hover:bg-blue-700"
                                  >
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Adicionar Item
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleCancelAddItem}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        )}
                      </CardContent>
                    </Card>
                </div>
              </ScrollArea>
            </div>
            
            {/* Footer de visualização limpo */}
            <UpdatedSheetFooter 
              selectedOrder={selectedOrder}
              selectedItems={selectedItems}
              handleGeneratePackingSlip={handleGeneratePackingSlip}
              handleExportSchedule={handleExportSchedule}
              setIsEditing={setIsEditing}
              handleDeleteClick={handleDeleteClick}
              onDataBookSent={handleDataBookSent}
              resetPackingSlipQuantities={resetPackingSlipQuantities}
              setIsPackingSlipDialogOpen={setIsPackingSlipDialogOpen}
            />
          </div>
        )}
      </>
    )}
  </SheetContent>
    </Sheet>

    <Dialog open={isProgressModalOpen} onOpenChange={setIsProgressModalOpen}>
      <DialogContent className="sm:max-w-6xl lg:max-w-7xl w-[95vw] h-[95vh] flex flex-col overflow-hidden">
        {/* Header fixo */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Progresso do Item: {itemToTrack?.description}</DialogTitle>
          <DialogDescription>
            Atualize o status e as datas para cada etapa de fabricação. O cronograma será calculado automaticamente considerando apenas dias úteis.
          </DialogDescription>
          
          {/* DEBUG - REMOVER DEPOIS */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-blue-600" />
              <p className="text-sm text-blue-800">
                <strong>Importante:</strong> O sistema considera apenas dias úteis (segunda a sexta-feira), excluindo feriados nacionais brasileiros. Suporta valores decimais (ex: 0.5 para meio dia, 1.5 para 1 dia e meio).
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Barra de progresso no cabeçalho */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Progresso: {editedPlan.filter(s => s.status === 'Concluído').length} de {editedPlan.length} etapas
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round((editedPlan.filter(s => s.status === 'Concluído').length / editedPlan.length) * 100)}%
            </span>
          </div>
          <Progress 
            value={(editedPlan.filter(s => s.status === 'Concluído').length / editedPlan.length) * 100} 
            className="h-2" 
          />
        </div>

        {/* Ações em lote */}
        <div className="px-6 py-3 border-b">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => autoScheduleFromToday()}
              size="sm"
            >
              📅 Agendar a partir de hoje
            </Button>
            <Button 
              variant="outline" 
              onClick={() => markPreviousAsCompleted()}
              size="sm"
            >
              ✅ Marcar anteriores como concluídas
            </Button>
            <Button 
              variant="outline" 
              onClick={() => applyStandardDurations()}
              size="sm"
            >
              ⏱️ Aplicar durações padrão
            </Button>
          </div>
        </div>

        {/* Área de conteúdo com scroll */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[1200px] p-4">
            {isFetchingPlan ? (
              <div className="flex justify-center items-center h-48">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p>Buscando plano de fabricação...</p>
                </div>
              </div>
            ) : (editedPlan && editedPlan.length > 0) ? (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="min-w-[200px]">Etapa</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-32">Início</TableHead>
                      <TableHead className="w-32">Fim</TableHead>
                      <TableHead className="w-24">Duração</TableHead>
                      <TableHead className="w-40">Horário</TableHead>
                      <TableHead className="w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedPlan.map((stage, index) => (
                      <>
                        <TableRow key={`${stage.stageName}-${index}`} className="group">
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(stage.status)}
                              <span className="font-medium">{stage.stageName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={stage.status} 
                              onValueChange={(value) => handlePlanChange(index, 'status', value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Pendente">Pendente</SelectItem>
                                <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                                <SelectItem value="Concluído">Concluído</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {stage.status === 'Concluído' ? (
                              <div className="text-green-700 font-medium">
                                {stage.startDate ? format(stage.startDate, "dd/MM") : '-'}
                              </div>
                            ) : (
                              <Input
                                type="date"
                                value={stage.startDate ? format(stage.startDate, "yyyy-MM-dd") : ""}
                                onChange={(e) => {
                                  const newDate = e.target.value ? createSafeDate(e.target.value) : null;
                                  handlePlanChange(index, 'startDate', newDate);
                                }}
                                className="h-8"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {stage.status === 'Concluído' ? (
                              <div className="text-green-700 font-medium">
                                {stage.completedDate ? format(stage.completedDate, "dd/MM") : '-'}
                              </div>
                            ) : (
                              <Input
                                type="date"
                                value={stage.completedDate ? format(stage.completedDate, "yyyy-MM-dd") : ""}
                                onChange={(e) => {
                                  const newDate = e.target.value ? createSafeDate(e.target.value) : null;
                                  handlePlanChange(index, 'completedDate', newDate);
                                }}
                                className="h-8"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.125"
                              min="0.125"
                              value={stage.durationDays ?? ''}
                              onChange={(e) => handlePlanChange(index, 'durationDays', e.target.value)}
                              className="h-8 w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={stage.workSchedule || "normal"} 
                              onValueChange={(value) => {
                                handlePlanChange(index, 'workSchedule', value);
                                // Automaticamente ajusta useBusinessDays baseado na seleção
                                const useBusinessDays = value === 'normal';
                                handlePlanChange(index, 'useBusinessDays', useBusinessDays);
                              }}
                            >
                              <SelectTrigger className="h-10 w-full">
                                <SelectValue placeholder="Selecionar horário" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="normal">
                                  <div className="flex items-center gap-3 py-1">
                                    <CalendarDays className="h-4 w-4 text-blue-500" />
                                    <div className="text-left">
                                      <div className="font-medium">Normal</div>
                                      <div className="text-xs text-muted-foreground">Dias úteis apenas</div>
                                    </div>
                                  </div>
                                </SelectItem>
                                <SelectItem value="especial">
                                  <div className="flex items-center gap-3 py-1">
                                    <Clock className="h-4 w-4 text-orange-500" />
                                    <div className="text-left">
                                      <div className="font-medium">Especial</div>
                                      <div className="text-xs text-muted-foreground">Incluí fins de semana</div>
                                    </div>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                className="h-8 w-8 p-0"
                                onClick={() => setExpandedRow(expandedRow === index ? null : index)}
                              >
                                {expandedRow === index ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleRemoveStageFromPlan(index)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remover
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <CalendarClock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-lg font-medium">Nenhuma etapa de fabricação definida</p>
                <p className="text-sm">Você pode definir as etapas na tela de Produtos ou adicionar manualmente abaixo.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {editedPlan.length > 0 && (
                <span>
                  {editedPlan.length} etapa{editedPlan.length !== 1 ? 's' : ''} configurada{editedPlan.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsProgressModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveProgress}
                disabled={editedPlan.length === 0}
              >
                <CalendarCheck className="mr-2 h-4 w-4" />
                Salvar Progresso
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Isso excluirá permanentemente o pedido Nº <span className="font-bold">{orderToDelete?.quotationNumber}</span> do sistema.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
            Sim, excluir pedido
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Alert Dialog para Exclusão de Itens */}
    <AlertDialog open={isItemDeleteDialogOpen} onOpenChange={setIsItemDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Item do Pedido</AlertDialogTitle>
          <AlertDialogDescription>
            Você tem certeza que deseja remover este item do pedido?
            {itemToDelete && (
              <div className="mt-2 p-3 bg-muted rounded-lg">
                <p className="font-medium text-foreground">
                  Item {itemToDelete.index + 1}: {itemToDelete.item.description}
                </p>
                {itemToDelete.item.itemNumber && (
                  <p className="text-sm text-muted-foreground">
                    Nº Item PC: {itemToDelete.item.itemNumber}
                  </p>
                )}
                {itemToDelete.item.code && (
                  <p className="text-sm text-muted-foreground">
                    Código: {itemToDelete.item.code}
                  </p>
                )}
              </div>
            )}
            <p className="mt-2 text-sm">
              <strong>Atenção:</strong> Esta ação não pode ser desfeita. O item será removido permanentemente do pedido.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirmDeleteItem} 
            className="bg-destructive hover:bg-destructive/90"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Sim, remover item
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Dialog para selecionar quantidades do romaneio */}
    <Dialog open={isPackingSlipDialogOpen} onOpenChange={setIsPackingSlipDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle>Selecionar Quantidades para o Romaneio</DialogTitle>
                <DialogDescription>
                    Ajuste a quantidade de peças de cada item que será incluída no romaneio. O peso será calculado automaticamente.
                </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
                <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-4">
                        {selectedOrder && selectedOrder.items
                            .filter(item => selectedItems.has(item.id!))
                            .map((item) => {
                                const selectedQty = packingSlipQuantities.get(item.id!) || item.quantity;
                                const itemWeight = (Number(selectedQty) || 0) * (Number(item.unitWeight) || 0);
                                
                                return (
                                    <Card key={item.id} className="p-4">
                                        <div className="space-y-3">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <h4 className="font-medium">{item.description}</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        Código: {item.code || 'N/A'} | Item PC: {item.itemNumber || 'N/A'}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-4 gap-4">
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Qtd. Total</Label>
                                                    <p className="font-medium">{item.quantity}</p>
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Peso Unit.</Label>
                                                    <p className="font-medium">
                                                        {(Number(item.unitWeight) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg
                                                    </p>
                                                </div>
                                                <div>
                                                    <Label htmlFor={`qty-${item.id}`} className="text-xs text-muted-foreground">
                                                        Qtd. Romaneio *
                                                    </Label>
                                                    <Input
                                                        id={`qty-${item.id}`}
                                                        type="number"
                                                        min="1"
                                                        max={item.quantity}
                                                        value={selectedQty}
                                                        onChange={(e) => {
                                                            const newQty = Math.min(
                                                                Math.max(1, Number(e.target.value) || 1),
                                                                item.quantity
                                                            );
                                                            setPackingSlipQuantities(prev => {
                                                                const newMap = new Map(prev);
                                                                newMap.set(item.id!, newQty);
                                                                return newMap;
                                                            });
                                                        }}
                                                        className="h-8"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Peso Total</Label>
                                                    <p className="font-bold text-primary">
                                                        {itemWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            {selectedQty < item.quantity && (
                                                <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    <span>
                                                        Romaneio parcial: {selectedQty} de {item.quantity} peças ({((selectedQty / item.quantity) * 100).toFixed(0)}%)
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                    </div>
                </ScrollArea>
            </div>
            
            <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium">Peso Total do Romaneio:</span>
                    <span className="text-lg font-bold text-primary">
                        {selectedOrder && Array.from(selectedItems).reduce((total, itemId) => {
                            const item = selectedOrder.items.find(i => i.id === itemId);
                            if (!item) return total;
                            const qty = packingSlipQuantities.get(itemId) || item.quantity;
                            return total + (qty * (Number(item.unitWeight) || 0));
                        }, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                    </span>
                </div>
            </div>
            
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPackingSlipDialogOpen(false)}>
                    Cancelar
                </Button>
                <Button onClick={handleGeneratePackingSlip}>
                    <ReceiptText className="mr-2 h-4 w-4" />
                    Gerar Romaneio
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
        </div>
    );
}
