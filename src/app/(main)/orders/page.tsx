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
import { Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle, Weight, CalendarDays, Edit, X, CalendarIcon, Truck, AlertTriangle, FolderGit2, FileText, File, ClipboardCheck, Palette, ListChecks, GanttChart, Trash2, Copy, ClipboardPaste, ReceiptText, CalendarClock, ClipboardList, PlusCircle, XCircle as XCircleIcon, ArrowDown, CalendarCheck, QrCode, TrendingUp, TrendingDown, Clock, MoreHorizontal, ChevronUp, ChevronDown, Send, DollarSign, Download } from "lucide-react";
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

type OrdersViewMode = 'list' | 'calendar' | 'kanban' | 'occupation';
const ORDERS_VIEW_MODE_KEY = 'sistema-orbit:orders:last-view-mode';
const VALID_ORDERS_VIEW_MODES: OrdersViewMode[] = ['list', 'calendar', 'kanban', 'occupation'];

const productionStageSchema = z.object({
    stageName: z.string(),
    status: z.string(),
    startDate: z.date().nullable().optional(),
    completedDate: z.date().nullable().optional(),
    durationDays: z.coerce.number().min(0).optional(),
    useBusinessDays: z.boolean().optional().default(true), // true = dias Ãºteis, false = dias corridos
    workSchedule: z.enum(['normal', 'especial']).default('normal'),
});

const orderItemSchema = z.object({
    id: z.string().optional(),
    code: z.string().optional(),
    product_code: z.string().optional(),
    description: z.string().min(1, "A descriÃ§Ã£o Ã© obrigatÃ³ria."),
    quantity: z.coerce.number().min(0, "A quantidade nÃ£o pode ser negativa."),
    unitWeight: z.coerce.number().min(0, "O peso nÃ£o pode ser negativo.").optional(),
    itemNumber: z.string().optional(), // NÃºmero do item no pedido de compra
    productionPlan: z.array(productionStageSchema).optional(),
    itemDeliveryDate: z.date().nullable().optional(),
    shippingList: z.string().optional(),
    invoiceNumber: z.string().optional(),
    shippingDate: z.date().nullable().optional(),
});

const orderStatusEnum = z.enum([
    "Aguardando ProduÃ§Ã£o",
    "Em ProduÃ§Ã£o",
    "Pronto para Entrega",
    "ConcluÃ­do",
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
  driveLink: z.string().url({ message: "Por favor, insira uma URL vÃ¡lida." }).optional().or(z.literal('')),
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

type OrderCostAnalysisItem = {
    itemId: string;
    code: string;
    description: string;
    quantity: number;
    hasSavedPricing: boolean;
    unitCost: number;
    totalCost: number;
    materialCost: number;
    productionCost: number;
    machiningCost: number;
    consumablesCost: number;
};

type OrderCostAnalysis = {
    items: OrderCostAnalysisItem[];
    materialTotal: number;
    productionTotal: number;
    machiningTotal: number;
    consumablesTotal: number;
    grandTotal: number;
    pricedItems: number;
    unpricedItems: number;
};

// Feriados nacionais brasileiros para 2024-2025
const brazilianHolidays = [
  // 2024
  new Date(2024, 0, 1),   // Ano Novo
  new Date(2024, 1, 12),  // Carnaval (Segunda-feira)
  new Date(2024, 1, 13),  // Carnaval (TerÃ§a-feira)  
  new Date(2024, 2, 29),  // Sexta-feira Santa
  new Date(2024, 3, 21),  // Tiradentes
  new Date(2024, 4, 1),   // Dia do Trabalho
  new Date(2024, 4, 30),  // Corpus Christi
  new Date(2024, 8, 7),   // IndependÃªncia do Brasil
  new Date(2024, 9, 12),  // Nossa Senhora Aparecida
  new Date(2024, 10, 2),  // Finados
  new Date(2024, 10, 15), // ProclamaÃ§Ã£o da RepÃºblica
  new Date(2024, 11, 25), // Natal
  // 2025
  new Date(2025, 0, 1),   // Ano Novo
  new Date(2025, 2, 3),   // Carnaval (Segunda-feira)
  new Date(2025, 2, 4),   // Carnaval (TerÃ§a-feira)
  new Date(2025, 3, 18),  // Sexta-feira Santa
  new Date(2025, 3, 21),  // Tiradentes
  new Date(2025, 4, 1),   // Dia do Trabalho
  new Date(2025, 5, 19),  // Corpus Christi
  new Date(2025, 8, 7),   // IndependÃªncia do Brasil
  new Date(2025, 9, 12),  // Nossa Senhora Aparecida
  new Date(2025, 10, 2),  // Finados
  new Date(2025, 10, 15), // ProclamaÃ§Ã£o da RepÃºblica
  new Date(2025, 11, 25), // Natal
];

// FunÃ§Ãµes utilitÃ¡rias para cÃ¡lculo de dias Ãºteis
const isHoliday = (date: Date): boolean => {
  return brazilianHolidays.some(holiday => isSameDay(holiday, date));
};

const isBusinessDay = (date: Date): boolean => {
  return !isWeekend(date) && !isHoliday(date);
};

// 3. FUNÃ‡ÃƒO AUXILIAR CORRIGIDA - Adicionar dias Ãºteis (corrigida para nÃ£o pular um dia extra)
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

// FunÃ§Ã£o para obter o prÃ³ximo dia Ãºtil
const getNextBusinessDay = (date: Date): Date => {
  let nextDay = addDays(date, 1);
  while (!isBusinessDay(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
};

// FunÃ§Ã£o para obter o dia Ãºtil anterior
const getPreviousBusinessDay = (date: Date): Date => {
  let prevDay = addDays(date, -1);
  while (!isBusinessDay(prevDay)) {
    prevDay = addDays(prevDay, -1);
  }
  return prevDay;
};

// Componente para exibir informaÃ§Ãµes de dias Ãºteis
interface BusinessDayInfoProps {
  startDate: Date | null;
  endDate: Date | null;
  expectedDuration: number;
}

// 4. COMPONENTE ATUALIZADO - InformaÃ§Ãµes de dias Ãºteis com lÃ³gica corrigida
const BusinessDayInfo = ({ startDate, endDate, expectedDuration }: BusinessDayInfoProps) => {
  if (!startDate || !endDate) return null;
  
  const expectedDurationNum = Number(expectedDuration) || 0;
  const isSameDate = isSameDay(startDate, endDate);
  
  // CORREÃ‡ÃƒO: Para duraÃ§Ã£o maior que 1, a tarefa deve terminar apÃ³s os dias especificados
  const actualDaysDifference = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  return (
    <div className="text-xs mt-2 p-2 rounded bg-blue-50 text-blue-700 border border-blue-200">
      <div className="flex items-center gap-2">
        <span className="font-medium">DuraÃ§Ã£o:</span>
        <span>{expectedDurationNum} dia(s)</span>
      </div>
      
      {isSameDate && expectedDurationNum <= 1 && (
        <p className="text-blue-600 mt-1">
          âœ“ Tarefa executada no mesmo dia (duraÃ§Ã£o â‰¤ 1 dia)
        </p>
      )}
      
      {!isSameDate && expectedDurationNum > 1 && (
        <p className="text-green-600 mt-1">
          âœ“ Cronograma sequencial: prÃ³xima tarefa inicia em {format(endDate, 'dd/MM/yyyy')}
        </p>
      )}
      
      {!isBusinessDay(startDate) && (
        <p className="text-orange-600 mt-1">
          âš ï¸ Data de inÃ­cio serÃ¡ ajustada para prÃ³ximo dia Ãºtil
        </p>
      )}
      
      {!isBusinessDay(endDate) && (
        <p className="text-orange-600 mt-1">
          âš ï¸ Data de fim serÃ¡ ajustada para dia Ãºtil
        </p>
      )}
      
      <p className="text-blue-600 mt-1 text-xs">
        ðŸ’¡ Tarefas sÃ£o executadas sequencialmente: a prÃ³xima sempre inicia no mesmo dia que a anterior termina
      </p>
    </div>
  );
};

interface ScheduleDateInputProps {
  date: Date | null | undefined;
  onCommit: (date: Date | null) => void;
  className?: string;
}

// Campo de data confirmado somente ao sair: evita recalcular o cronograma
// enquanto o usuÃ¡rio ainda estÃ¡ preenchendo os quatro dÃ­gitos do ano.
const ScheduleDateInput = ({ date, onCommit, className }: ScheduleDateInputProps) => {
  const formattedDate = date instanceof Date && !isNaN(date.getTime())
    ? format(date, "yyyy-MM-dd")
    : "";

  const commitDate = (input: HTMLInputElement) => {
    const value = input.value;

    if (!value) {
      onCommit(null);
      return;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      input.value = formattedDate;
      return;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsedDate = new Date(year, month - 1, day);
    const isValidDate = year >= 2000 && year <= 2100 &&
      parsedDate.getFullYear() === year &&
      parsedDate.getMonth() === month - 1 &&
      parsedDate.getDate() === day;

    if (!isValidDate) {
      // NÃ£o propaga anos parciais como 1906 para as tarefas sucessoras.
      input.value = formattedDate;
      return;
    }

    onCommit(parsedDate);
  };

  return (
    <Input
      type="date"
      defaultValue={formattedDate}
      min="2000-01-01"
      max="2100-12-31"
      onBlur={(event) => commitDate(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.currentTarget.value = formattedDate;
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
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
        const completedStages = item.productionPlan.filter(p => p.status === 'ConcluÃ­do').length;
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
    if (!status) return "NÃ£o definido";
    const lowerStatus = status.toLowerCase().trim();
    
    const statusMap: { [key: string]: string } = {
        'in production': 'Em ProduÃ§Ã£o',
        'em produÃ§Ã£o': 'Em ProduÃ§Ã£o',
        'in progress': 'Em ProduÃ§Ã£o',
        'in-progress': 'Em ProduÃ§Ã£o',
        'em progresso': 'Em ProduÃ§Ã£o',
        'awaiting production': 'Aguardando ProduÃ§Ã£o',
        'aguardando produÃ§Ã£o': 'Aguardando ProduÃ§Ã£o',
        'pending': 'Aguardando ProduÃ§Ã£o',
        'completed': 'ConcluÃ­do',
        'concluÃ­do': 'ConcluÃ­do',
        'finished': 'ConcluÃ­do',
        'cancelled': 'Cancelado',
        'cancelado': 'Cancelado',
        'ready': 'Pronto para Entrega',
        'pronto para entrega': 'Pronto para Entrega'
    };

    return statusMap[lowerStatus] || status;
};

const getStatusProps = (status: string): { variant: "default" | "secondary" | "destructive" | "outline", icon: React.ElementType, label: string, colorClass: string } => {
    switch (status) {
        case "Em ProduÃ§Ã£o":
            return { variant: "default", icon: PlayCircle, label: "Em ProduÃ§Ã£o", colorClass: "" };
        case "Aguardando ProduÃ§Ã£o":
            return { variant: "secondary", icon: Hourglass, label: "Aguardando ProduÃ§Ã£o", colorClass: "" };
        case "ConcluÃ­do":
            return { variant: "default", icon: CheckCircle, label: "ConcluÃ­do", colorClass: "bg-green-600 hover:bg-green-600/90" };
        case "Pronto para Entrega":
            return { variant: "default", icon: Truck, label: "Pronto para Entrega", colorClass: "bg-blue-500 hover:bg-blue-500/90" };
        case "Cancelado":
            return { variant: "destructive", icon: XCircle, label: "Cancelado", colorClass: "" };
        case "Atrasado":
            return { variant: "destructive", icon: AlertTriangle, label: "Atrasado", colorClass: "bg-orange-500 hover:bg-orange-500/90 border-transparent text-destructive-foreground" };
        default:
            return { variant: "outline", icon: Package, label: status || "NÃ£o definido", colorClass: "" };
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
                        <p>Plano de InspeÃ§Ã£o {documents.inspectionTestPlan ? '(OK)' : '(Pendente)'}</p>
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
                    <TableHead className="w-[100px]">NÂº Pedido</TableHead>
                    <TableHead className="w-[120px]">OS Interna</TableHead>
                    <TableHead>Projeto Cliente</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-[100px] text-center">Docs</TableHead>
                    <TableHead className="w-[120px]">Data Entrega</TableHead>
                    <TableHead className="w-[120px]">Data ConclusÃ£o</TableHead>
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
                            <TableCell>{order.customer?.name || 'Cliente nÃ£o informado'}</TableCell>
                            <TableCell>
                                <DocumentStatusIcons documents={order.documents} />
                            </TableCell>
                            <TableCell>{order.deliveryDate ? format(order.deliveryDate, "dd/MM/yyyy") : 'A definir'}</TableCell>
                            <TableCell>
                                {order.completedAt ? format(order.completedAt, "dd/MM/yyyy") : '-'}
                            </TableCell>
                            <TableCell>
                                {order.status === 'ConcluÃ­do' ? (
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
                                        // Verifica se hÃ¡ itens concluÃ­dos com atraso no embarque
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
                                                            <p>HÃ¡ itens com atraso no embarque</p>
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
    const [isCostAnalysisOpen, setIsCostAnalysisOpen] = useState(false);
    const [isLoadingCostAnalysis, setIsLoadingCostAnalysis] = useState(false);
    const [costAnalysis, setCostAnalysis] = useState<OrderCostAnalysis | null>(null);
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
    
    // Modos de visualizaÃ§Ã£o, incluindo a anÃ¡lise de ocupaÃ§Ã£o por setor
    const [viewMode, setViewMode] = useState<OrdersViewMode>('list');
    const [isViewModeRestored, setIsViewModeRestored] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());

    // Recupera apÃ³s F5 a Ãºltima visualizaÃ§Ã£o somente no navegador, evitando conflito
    // com a renderizaÃ§Ã£o inicial do Next.js.
    useEffect(() => {
        try {
            const savedViewMode = window.localStorage.getItem(ORDERS_VIEW_MODE_KEY);
            if (savedViewMode && VALID_ORDERS_VIEW_MODES.includes(savedViewMode as OrdersViewMode)) {
                setViewMode(savedViewMode as OrdersViewMode);
            }
        } catch (error) {
            console.warn('NÃ£o foi possÃ­vel recuperar a Ãºltima visualizaÃ§Ã£o de pedidos:', error);
        } finally {
            setIsViewModeRestored(true);
        }
    }, []);

    // Salva cada mudanÃ§a feita pelo usuÃ¡rio. A trava impede que o valor salvo
    // seja substituÃ­do por "list" antes de a restauraÃ§Ã£o inicial terminar.
    useEffect(() => {
        if (!isViewModeRestored) return;

        try {
            window.localStorage.setItem(ORDERS_VIEW_MODE_KEY, viewMode);
        } catch (error) {
            console.warn('NÃ£o foi possÃ­vel salvar a visualizaÃ§Ã£o de pedidos:', error);
        }
    }, [viewMode, isViewModeRestored]);

    // Estados para controlar posiÃ§Ã£o do scroll no Kanban
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
    
    // FunÃ§Ã£o helper para converter timestamps do Firestore de forma segura
    const safeToDate = (timestamp: any): Date | null => {
        if (!timestamp) return null;
        
        // Se jÃ¡ Ã© uma data JavaScript vÃ¡lida
        if (timestamp instanceof Date) {
            return isNaN(timestamp.getTime()) ? null : timestamp;
        }
        
        // Se Ã© um timestamp do Firestore com mÃ©todo toDate
        if (timestamp && typeof timestamp.toDate === 'function') {
            try {
                const date = timestamp.toDate();
                return (date instanceof Date && !isNaN(date.getTime())) ? date : null;
            } catch (error) {
                console.warn("Erro ao converter timestamp do Firestore:", error);
                return null;
            }
        }
        
        // Se Ã© um objeto com propriedades seconds e nanoseconds (formato Firestore)
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
        
        console.warn("Tipo de timestamp nÃ£o reconhecido:", typeof timestamp, timestamp);
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

                    // LOG TEMPORÃRIO - REMOVER DEPOIS
                    console.log('ðŸ“‹ DOC:', doc.id, '| quotationNumber:', data.quotationNumber, '| items tipo:', typeof data.items, '| isArray:', Array.isArray(data.items));
                    const createdAtDate = safeToDate(data.createdAt) || new Date();
                    const deliveryDate = safeToDate(data.deliveryDate);
                
                const rawItems = data.items;
                let itemsArray: any[] = [];

                if (Array.isArray(rawItems)) {
                    itemsArray = rawItems;
                } else if (rawItems && typeof rawItems === 'object') {
                    // ReconstrÃ³i preservando todos os campos aninhados
                    itemsArray = Object.keys(rawItems)
                        .sort((a, b) => Number(a) - Number(b)) // mantÃ©m ordem original
                        .map(key => {
                            const item = rawItems[key];
                            // Garante que Ã© um objeto vÃ¡lido com campos esperados
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
                        itemNumber: item.itemNumber || '', // Preserva o nÃºmero do item no pedido de compra
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

                if (deliveryDate && deliveryDate < today && !['ConcluÃ­do', 'Cancelado'].includes(finalStatus)) {
                    finalStatus = 'Atrasado';
                }
                
                let customerInfo: CustomerInfo = { id: '', name: 'Cliente nÃ£o informado' };
                if (data.customer && typeof data.customer === 'object' && data.customer.name) {
                    customerInfo = { id: data.customer.id || '', name: data.customer.name };
                } else if (typeof data.customerName === 'string') {
                    customerInfo = { id: data.customerId || '', name: data.customerName };
                } else if (typeof data.customer === 'string') { 
                    customerInfo = { id: '', name: data.customer };
                }

                const orderNum = (data.orderNumber || data.quotationNumber || 'N/A').toString();
                
                console.log('ðŸ“Š [DEBUG] Processando pedido:', {
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
                    // Retorna um pedido com dados mÃ­nimos em caso de erro
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

    // Efeito para limpar estados quando mudar de modo de visualizaÃ§Ã£o
    useEffect(() => {
        if (viewMode !== 'kanban') {
            scrollPositionRef.current = 0;
            sessionStorage.removeItem('kanbanScrollPosition');
        }
    }, [viewMode]);

    // Debug dos componentes para verificar se estÃ£o carregados corretamente
    useEffect(() => {
        console.log('ðŸ” Verificando componentes:', {
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

      // Sincronizar valor do input com o valor do formulÃ¡rio
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
        console.log('ðŸ“… [CUSTOM] Valor do input:', newValue);
        
        setInputValue(newValue);
        
        if (newValue) {
          try {
            const [year, month, day] = newValue.split('-').map(Number);
            const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);
            
            if (!isNaN(newDate.getTime())) {
              console.log('ðŸ“… [CUSTOM] Data vÃ¡lida criada:', newDate);
              form.setValue(`items.${index}.itemDeliveryDate`, newDate);
            } else {
              console.warn('ðŸ“… [CUSTOM] Data invÃ¡lida:', newValue);
            }
          } catch (error) {
            console.error('ðŸ“… [CUSTOM] Erro ao processar data:', error);
          }
        } else {
          console.log('ðŸ“… [CUSTOM] Data limpa');
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
            Data especÃ­fica de entrega deste item (opcional)
          </FormDescription>
        </FormItem>
      );
    };

    const handleViewOrder = (order: Order) => {
        // Salvar posiÃ§Ã£o do scroll horizontal do Kanban
        if (viewMode === 'kanban' && kanbanScrollRef.current) {
            scrollPositionRef.current = kanbanScrollRef.current.scrollLeft;
            sessionStorage.setItem('kanbanScrollPosition', scrollPositionRef.current.toString());
            console.log('ðŸ’¾ Salvando posiÃ§Ã£o horizontal:', scrollPositionRef.current);
        }
        
        // NOVO: Salvar posiÃ§Ã£o do scroll vertical de cada coluna
        if (viewMode === 'kanban') {
            const columns = document.querySelectorAll('[data-column-scroll]');
            columns.forEach((column) => {
                const columnId = column.getAttribute('data-column-id');
                if (columnId) {
                    const scrollTop = column.scrollTop;
                    columnScrollPositions.current.set(columnId, scrollTop);
                    console.log(`ðŸ’¾ Salvando scroll da coluna ${columnId}:`, scrollTop);
                }
            });
        }
        
        console.log('ðŸ” [DEBUG] Inicializando formulÃ¡rio com:', {
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

        // FunÃ§Ã£o helper para remover campos undefined (Firestore nÃ£o aceita undefined)
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
            console.error('âŒ [DEBUG] selectedOrder nÃ£o encontrado');
            return;
        }

        console.log('ðŸš€ [DEBUG] Iniciando salvamento robusto:', {
            orderId: selectedOrder.id,
            quotationNumberAntigo: selectedOrder.quotationNumber,
            quotationNumberNovo: values.quotationNumber
        });

        console.log('ðŸ” [DEBUG] Iniciando salvamento:', {
            orderId: selectedOrder.id,
            quotationNumber: values.quotationNumber,
            originalQuotationNumber: selectedOrder.quotationNumber
        });

        console.log('ðŸ’¾ [SUBMIT] Valores do formulÃ¡rio:', values);

        try {
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            
            // Primeiro, verificar se o documento existe
            const currentDoc = await getDoc(orderRef);
            if (!currentDoc.exists()) {
                throw new Error(`Documento ${selectedOrder.id} nÃ£o encontrado no Firestore`);
            }
            
            console.log('âœ… [DEBUG] Documento encontrado, dados atuais:', {
                quotationNumber: currentDoc.data().quotationNumber
            });
            
            // CORREÃ‡ÃƒO: Processamento mais cuidadoso das datas dos itens
            const itemsToSave = values.items.map((formItem, itemIndex) => {
              console.log(`ðŸ’¾ [SUBMIT] Processando item ${itemIndex + 1}:`, formItem);
              
              const originalItem = selectedOrder.items.find(i => i.id === formItem.id);
              const planToSave = originalItem?.productionPlan?.map(p => ({
                ...p,
                startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : (p.startDate || null),
                completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : (p.completedDate || null),
                status: p.status || 'Pendente',
                stageName: p.stageName || '',
                durationDays: p.durationDays || 0,
              })) || [];

              // CORREÃ‡ÃƒO: ConversÃ£o cuidadosa das datas do item
              let itemDeliveryTimestamp = null;
              let shippingTimestamp = null;

              if (formItem.itemDeliveryDate) {
                try {
                  const deliveryDate = formItem.itemDeliveryDate instanceof Date 
                    ? formItem.itemDeliveryDate 
                    : new Date(formItem.itemDeliveryDate);
                  
                  if (!isNaN(deliveryDate.getTime())) {
                    itemDeliveryTimestamp = Timestamp.fromDate(deliveryDate);
                    console.log('âœ… [SUBMIT] Data de entrega convertida:', deliveryDate.toISOString());
                  }
                } catch (error) {
                  console.warn('âš ï¸ [SUBMIT] Erro ao converter data de entrega:', error);
                }
              }

              if (formItem.shippingDate) {
                try {
                  const shippingDate = formItem.shippingDate instanceof Date 
                    ? formItem.shippingDate 
                    : new Date(formItem.shippingDate);
                  
                  if (!isNaN(shippingDate.getTime())) {
                    shippingTimestamp = Timestamp.fromDate(shippingDate);
                    console.log('âœ… [SUBMIT] Data de embarque convertida:', shippingDate.toISOString());
                  }
                } catch (error) {
                  console.warn('âš ï¸ [SUBMIT] Erro ao converter data de embarque:', error);
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

            console.log('ðŸ’¾ [SUBMIT] Itens processados para salvamento:', itemsToSave);

            const totalWeight = calculateTotalWeight(itemsToSave);
            
            // Preparar apenas os campos que realmente mudaram
            const updateData: any = {};
            
            if (values.quotationNumber !== selectedOrder.quotationNumber) {
                updateData.quotationNumber = values.quotationNumber || null;
                console.log('ðŸ“ [DEBUG] Atualizando quotationNumber:', values.quotationNumber);
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
            
            console.log('ðŸ“¦ [DEBUG] Dados que serÃ£o enviados para o Firestore:', updateData);
            
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

            console.log('ðŸ’¾ [SUBMIT] Dados finais para Firestore:', dataToSave);

            // Remove campos undefined antes de enviar para o Firestore
            const cleanedData = removeUndefinedFields(dataToSave);

            // Salvar no Firestore usando updateData (mais eficiente)
            await updateDoc(orderRef, updateData);
            console.log('âœ… [DEBUG] updateDoc executado com sucesso');

            // Verificar se foi salvo corretamente
            const verificationDoc = await getDoc(orderRef);
            if (verificationDoc.exists()) {
                const savedData = verificationDoc.data();
                console.log('ðŸ” [DEBUG] VerificaÃ§Ã£o - dados salvos:', {
                    quotationNumber: savedData.quotationNumber,
                    lastUpdate: savedData.lastUpdate
                });
                
                if (savedData.quotationNumber === values.quotationNumber) {
                    console.log('âœ… [DEBUG] Confirmado: quotationNumber foi salvo corretamente');
                } else {
                    console.error('âŒ [DEBUG] Erro: quotationNumber nÃ£o foi salvo corretamente', {
                        esperado: values.quotationNumber,
                        salvo: savedData.quotationNumber
                    });
                }
            }
    
            toast({
                title: "Pedido atualizado!",
                description: "Os dados do pedido foram salvos com sucesso.",
            });

            console.log('ðŸ”„ [DEBUG] Recarregando dados do servidor...');

            // Aguardar um pouco para garantir que o Firestore processou
            await new Promise(resolve => setTimeout(resolve, 500));

            // Buscar dados atualizados
            const updatedOrderDoc = await getDoc(orderRef);
            if (updatedOrderDoc.exists()) {
                const updatedData = updatedOrderDoc.data();
                console.log('âœ… [DEBUG] Dados atualizados do servidor:', {
                    quotationNumber: updatedData.quotationNumber,
                    orderId: updatedOrderDoc.id
                });
                
                // Recarregar lista completa
                const allOrders = await fetchOrders();
                const updatedOrderInList = allOrders.find(o => o.id === selectedOrder.id);
                
                if (updatedOrderInList) {
                    console.log('âœ… [DEBUG] Pedido encontrado na lista atualizada:', {
                        quotationNumber: updatedOrderInList.quotationNumber
                    });
                    
                    setSelectedOrder(updatedOrderInList);
                    form.reset({
                        ...updatedOrderInList,
                        status: updatedOrderInList.status as any,
                    });
                } else {
                    console.warn('âš ï¸ [DEBUG] Pedido nÃ£o encontrado na lista apÃ³s recarregamento');
                }
            } else {
                console.error('âŒ [DEBUG] Documento nÃ£o encontrado apÃ³s salvamento');
            }

            setIsEditing(false);
        } catch (error) {
            console.error("âŒ [DEBUG] Erro detalhado no salvamento:", {
                error: error.message,
                stack: error.stack,
                orderId: selectedOrder.id
            });
            
            toast({
                variant: "destructive",
                title: "Erro ao salvar",
                description: `NÃ£o foi possÃ­vel atualizar o pedido: ${error.message}`,
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

    // Adicione esta funÃ§Ã£o para gerar lista de meses disponÃ­veis
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
            
            // NOVO FILTRO DE MÃŠS
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
                dataBookMatch = order.status === 'ConcluÃ­do' && !order.dataBookSent;
            } else if (dataBookFilter === 'enviado') {
                dataBookMatch = order.dataBookSent === true;
            }

            return textMatch && statusMatch && customerMatch && dateMatch && monthMatch && dataBookMatch;
        });

        return filtered.sort((a, b) => {
            const aIsCompleted = a.status === 'ConcluÃ­do';
            const bIsCompleted = b.status === 'ConcluÃ­do';

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
    
    // Adicione esta funÃ§Ã£o para calcular o peso total do mÃªs filtrado
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

    // Carga atual de fabricaÃ§Ã£o: cada item Ã© contabilizado integralmente no
    // setor cuja etapa estÃ¡ marcada como "Em Andamento".
    const occupationStats = useMemo(() => {
        type OccupationItem = {
            orderId: string;
            orderLabel: string;
            itemDescription: string;
            stageName: string;
            weight: number;
        };

        const itemsInProduction: OccupationItem[] = [];
        let waitingWeight = 0;
        let waitingItems = 0;

        filteredOrders.forEach(order => {
            if (order.status === 'ConcluÃ­do' || order.status === 'Cancelado') return;

            order.items.forEach(item => {
                const weight = (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0);
                if (weight <= 0) return;

                const plan = item.productionPlan || [];
                const activeStage = plan.find(stage => stage.status === 'Em Andamento');

                if (!activeStage) {
                    const isFinished = plan.length > 0 && plan.every(stage => stage.status === 'ConcluÃ­do');
                    if (!isFinished) {
                        waitingWeight += weight;
                        waitingItems += 1;
                    }
                    return;
                }

                itemsInProduction.push({
                    orderId: order.id,
                    orderLabel: order.internalOS || `Pedido ${order.id}`,
                    itemDescription: item.description,
                    stageName: activeStage.stageName?.trim() || 'Etapa nÃ£o identificada',
                    weight,
                });
            });
        });

        const sectorMap = new Map<string, {
            stageName: string;
            weight: number;
            itemCount: number;
            orderIds: Set<string>;
            items: OccupationItem[];
        }>();

        itemsInProduction.forEach(item => {
            const key = item.stageName.toLocaleLowerCase('pt-BR');
            const current = sectorMap.get(key) || {
                stageName: item.stageName,
                weight: 0,
                itemCount: 0,
                orderIds: new Set<string>(),
                items: [],
            };
            current.weight += item.weight;
            current.itemCount += 1;
            current.orderIds.add(item.orderId);
            current.items.push(item);
            sectorMap.set(key, current);
        });

        const totalInProduction = itemsInProduction.reduce((sum, item) => sum + item.weight, 0);
        const sectors = Array.from(sectorMap.values())
            .map(sector => ({
                ...sector,
                orderCount: sector.orderIds.size,
                percentage: totalInProduction > 0 ? (sector.weight / totalInProduction) * 100 : 0,
            }))
            .sort((a, b) => b.weight - a.weight);

        return {
            sectors,
            totalInProduction,
            totalItems: itemsInProduction.length,
            totalOrders: new Set(itemsInProduction.map(item => item.orderId)).size,
            waitingWeight,
            waitingItems,
        };
    }, [filteredOrders]);

    // MÃ©dia fixa dos Ãºltimos 12 meses. Um item entra no mÃªs em que sua Ãºltima
    // etapa foi concluÃ­da; para dados antigos, usa a conclusÃ£o do pedido.
    const monthlyProductionStats = useMemo(() => {
        const now = new Date();
        const firstMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const months = Array.from({ length: 12 }, (_, index) => {
            const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
            return {
                key: format(date, 'yyyy-MM'),
                label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                weight: 0,
            };
        });
        const monthMap = new Map(months.map(month => [month.key, month]));

        orders.forEach(order => {
            order.items.forEach(item => {
                if (calculateItemProgress(item) < 100) return;

                const completedDates = (item.productionPlan || [])
                    .map(stage => stage.completedDate)
                    .filter((date): date is Date => date instanceof Date && !isNaN(date.getTime()));
                const itemCompletedAt = completedDates.length > 0
                    ? new Date(Math.max(...completedDates.map(date => date.getTime())))
                    : order.completedAt;

                if (!(itemCompletedAt instanceof Date) || isNaN(itemCompletedAt.getTime())) return;
                const month = monthMap.get(format(itemCompletedAt, 'yyyy-MM'));
                if (!month) return;

                month.weight += (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0);
            });
        });

        const total = months.reduce((sum, month) => sum + month.weight, 0);
        return {
            months,
            total,
            average: total / 12,
            bestMonth: months.reduce((best, month) => month.weight > best.weight ? month : best, months[0]),
        };
    }, [orders]);
    
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

    // Organiza os pedidos por data de entrega para visualizaÃ§Ã£o em calendÃ¡rio
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

    // Organiza os pedidos por mÃªs para visualizaÃ§Ã£o Kanban - CORRIGIDO
    const ordersByMonth = useMemo(() => {
        const grouped = new Map<string, {
            orders: Order[];
            totalWeight: number;
            itemsByOrder: Map<string, OrderItem[]>;
        }>();
        
        // NOVO: Agrupar concluÃ­dos por ano
        const completedByYear = new Map<string, {
            orders: Order[];
            totalWeight: number;
        }>();

        filteredOrders.forEach(order => {
            if (order.status === 'ConcluÃ­do') {
                let completionYear: string;
                
                if (order.completedAt) {
                    // Prioridade 1: Data de conclusÃ£o oficial
                    completionYear = format(new Date(order.completedAt), 'yyyy');
                    console.log('ðŸ“… Usando completedAt:', order.quotationNumber, completionYear);
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
                        console.log('ðŸ“¦ Usando shippingDate:', order.quotationNumber, completionYear);
                    } else if (order.createdAt) {
                        // Prioridade 3: Data de criaÃ§Ã£o do pedido
                        completionYear = format(new Date(order.createdAt), 'yyyy');
                        console.log('ðŸ“ Usando createdAt:', order.quotationNumber, completionYear);
                    } else {
                        completionYear = 'Sem Data';
                        console.log('âŒ Sem data:', order.quotationNumber);
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

            // CORREÃ‡ÃƒO: Usar apenas a data de entrega do pedido, nÃ£o dos itens
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

    // Gera os dias do mÃªs atual para o calendÃ¡rio
    const generateCalendarDays = (date: Date): { days: Date[], firstDay: Date, lastDay: Date } => {
        const year = date.getFullYear();
        const month = date.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay()); // ComeÃ§a no domingo
        
        const days: Date[] = [];
        const current = new Date(startDate);
        
        // Gera 42 dias (6 semanas) para preencher o calendÃ¡rio
        for (let i = 0; i < 42; i++) {
            days.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        
        return { days, firstDay, lastDay };
    };

    const { days: calendarDays, firstDay, lastDay } = generateCalendarDays(calendarDate);

    // Componente Kanban - SEÃ‡ÃƒO CORRIGIDA
    const KanbanView = () => {
        const allColumns = [
            ...ordersByMonth.monthColumns,
            // NOVO: Adicionar colunas de anos concluÃ­dos
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
                                console.log('ðŸ”„ PosiÃ§Ã£o horizontal restaurada:', savedPosition);
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
                                console.log(`ðŸ”„ Scroll da coluna ${columnId} restaurado:`, savedScroll);
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
                        Os pedidos aparecerÃ£o aqui quando tiverem data de entrega definida ou estiverem concluÃ­dos.
                        {hasActiveFilters && (
                            <span className="block mt-2 text-sm">
                                Verifique se os filtros aplicados nÃ£o estÃ£o ocultando os pedidos.
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
                            
                            // CORREÃ‡ÃƒO PRINCIPAL: FormataÃ§Ã£o correta do nome do mÃªs
                            let monthLabel = '';
                            if (isCompletedYear) {
                                const year = monthKey.replace('completed-', '');
                                monthLabel = `ConcluÃ­dos ${year}`;
                            } else {
                                // Criar uma data vÃ¡lida a partir da chave YYYY-MM
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
                                                    Peso dos itens com entrega neste mÃªs
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

                                            // CORREÃ‡ÃƒO: Sempre mostrar peso total e todos os itens do pedido
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

                                                        {/* InformaÃ§Ãµes do projeto e OS */}
                                                        {(order.projectName || order.internalOS) && (
                                                            <div className="space-y-1">
                                                                {order.projectName && (
                                                                    <p className="text-xs text-muted-foreground truncate">
                                                                        ðŸ“‹ {order.projectName}
                                                                    </p>
                                                                )}
                                                                {order.internalOS && (
                                                                    <p className="text-xs text-muted-foreground">
                                                                        ðŸ·ï¸ OS: {order.internalOS}
                                                                    </p>
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

    // Componente de calendÃ¡rio
    const CalendarView = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return (
            <div className="bg-white rounded-lg border">
                {/* Header do calendÃ¡rio */}
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
                            â†
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
                            â†’
                        </Button>
                    </div>
                </div>

                {/* Dias da semana */}
                <div className="grid grid-cols-7 border-b">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'SÃ¡b'].map(day => (
                        <div key={day} className="p-2 text-center text-sm font-medium text-gray-700 border-r last:border-r-0">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Grid do calendÃ¡rio */}
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
            toast({ title: "Pedido excluÃ­do!", description: "O pedido foi removido do sistema." });
            setOrderToDelete(null);
            setIsDeleteDialogOpen(false);
            setIsSheetOpen(false);
            await fetchOrders();
        } catch (error) {
            console.error("Error deleting order: ", error);
            toast({
                variant: "destructive",
                title: "Erro ao excluir pedido",
                description: "NÃ£o foi possÃ­vel remover o pedido. Tente novamente.",
            });
        }
    };

    // FUNÃ‡ÃƒO PARA DELETAR UM ITEM
    const handleDeleteItem = (index: number) => {
      const currentItems = form.getValues("items");
      const itemToRemove = currentItems[index];
      
      setItemToDelete({ index, item: itemToRemove });
      setIsItemDeleteDialogOpen(true);
    };

    // FUNÃ‡ÃƒO PARA CONFIRMAR A EXCLUSÃƒO
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

    // FunÃ§Ã£o para adicionar novo item
    const handleAddNewItem = () => {
      if (!newItemForm.description.trim()) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "A descriÃ§Ã£o do item Ã© obrigatÃ³ria.",
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
      
      // Limpar formulÃ¡rio
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

    // FunÃ§Ã£o para cancelar adiÃ§Ã£o de item
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

    // Cronograma bidirecional: converte o intervalo manual na mesma unidade usada pelo
    // cronograma: contagem inclusiva de dias Ãºteis ou de dias corridos.
    const calculateDurationFromDates = (
      startDate: Date,
      endDate: Date,
      useBusinessDays: boolean
    ): number => {
      const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

      if (normalizedEnd.getTime() < normalizedStart.getTime()) return 0;

      if (useBusinessDays) {
        return countBusinessDaysBetween(normalizedStart, normalizedEnd);
      }

      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      return Math.floor((normalizedEnd.getTime() - normalizedStart.getTime()) / millisecondsPerDay) + 1;
    };

    const handlePlanChange = (stageIndex: number, field: string, value: any) => {
      const newPlan = [...editedPlan];
      const updatedStage = { ...newPlan[stageIndex] };
      let preserveManualEndDate = false;
      
      if (field === 'workSchedule') {
        updatedStage[field] = value;
        // Automaticamente define useBusinessDays baseado no horÃ¡rio
        updatedStage.useBusinessDays = value === 'normal';
      } else if (field === 'startDate' || field === 'completedDate') {
        // CÃ³digo existente para datas
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
      } else if (field === 'status' && value === 'ConcluÃ­do') {
        updatedStage[field] = value;
        if (!updatedStage.completedDate) {
          updatedStage.completedDate = new Date();
        }
      } else {
        updatedStage[field] = value;
      }
      
      newPlan[stageIndex] = updatedStage;

      // CÃ¡lculo inverso: ao informar o fim manualmente, atualizar a duraÃ§Ã£o.
      if (field === 'completedDate' && updatedStage.startDate && updatedStage.completedDate) {
        const calculatedDuration = calculateDurationFromDates(
          updatedStage.startDate,
          updatedStage.completedDate,
          updatedStage.useBusinessDays !== false
        );

        if (calculatedDuration <= 0) {
          updatedStage.completedDate = new Date(updatedStage.startDate);
          updatedStage.durationDays = 1;
          toast({
            variant: "destructive",
            title: "Data final invÃ¡lida",
            description: "A data final nÃ£o pode ser anterior Ã  data inicial.",
          });
        } else {
          updatedStage.durationDays = calculatedDuration;
        }

        newPlan[stageIndex] = updatedStage;
        preserveManualEndDate = true;
      }
      
      // Manter lÃ³gica sequencial existente
      if (field === 'startDate' || field === 'durationDays' || field === 'workSchedule') {
        recalculateSequentialTasks(newPlan, stageIndex);
      } else if (field === 'completedDate' && preserveManualEndDate) {
        // Preserva o fim digitado, mas atualiza todas as etapas posteriores.
        recalculateSequentialTasks(newPlan, stageIndex, true);
      }
      
      setEditedPlan(newPlan);
    };

    // NOVA FUNÃ‡ÃƒO SIMPLES PARA RECÃLCULO SEQUENCIAL
    const recalculateSequentialTasks = (
      plan: ProductionStage[],
      fromIndex: number,
      preserveCurrentEndDate: boolean = false
    ) => {
      console.log('ðŸ”„ Recalculando tarefas sequenciais a partir do Ã­ndice:', fromIndex);
      
      // Primeiro, calcular a data de conclusÃ£o da tarefa atual
      const currentStage = plan[fromIndex];
      if (!preserveCurrentEndDate && currentStage.startDate && currentStage.durationDays) {
        const duration = Math.max(0.125, Number(currentStage.durationDays));
        const useBusinessDays = currentStage.useBusinessDays !== false;
        
        if (duration <= 1) {
          // Tarefas de 1 dia ou menos: terminam no mesmo dia
          currentStage.completedDate = new Date(currentStage.startDate);
        } else {
          // Tarefas de mais de 1 dia
          if (useBusinessDays) {
            // Dias Ãºteis: adicionar dias Ãºteis
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
          // CORREÃ‡ÃƒO PRINCIPAL: A prÃ³xima tarefa SEMPRE inicia no mesmo dia que a anterior termina
          currentStage.startDate = new Date(previousStage.completedDate);
          
          // Calcular data de conclusÃ£o
          const duration = Math.max(0.125, Number(currentStage.durationDays) || 1);
          const useBusinessDays = currentStage.useBusinessDays !== false;

          // Uma tarefa em horÃ¡rio normal nunca pode comeÃ§ar em fim de semana
          // ou feriado, inclusive apÃ³s um tÃ©rmino digitado manualmente.
          if (useBusinessDays && !isBusinessDay(currentStage.startDate)) {
            currentStage.startDate = getNextBusinessDay(currentStage.startDate);
          }
          
          if (duration <= 1) {
            // Tarefas de 1 dia ou menos: terminam no mesmo dia
            currentStage.completedDate = new Date(currentStage.startDate);
          } else {
            // Tarefas de mais de 1 dia
            if (useBusinessDays) {
              currentStage.completedDate = addBusinessDaysSimple(currentStage.startDate, Math.ceil(duration) - 1);
            } else {
              // Dias corridos
              currentStage.completedDate = new Date(currentStage.startDate);
              currentStage.completedDate.setDate(currentStage.completedDate.getDate() + Math.ceil(duration) - 1);
            }
          }
          
          console.log(`âœ… Etapa ${i + 1}: ${currentStage.stageName} | InÃ­cio: ${currentStage.startDate.toLocaleDateString()} | Fim: ${currentStage.completedDate.toLocaleDateString()}`);
        } else {
          // Se a etapa anterior nÃ£o tem data de conclusÃ£o, limpar as datas desta etapa
          currentStage.startDate = null;
          currentStage.completedDate = null;
        }
      }
      
      // DEBUG: Mostrar anÃ¡lise detalhada do acÃºmulo
      if (fromIndex === 0) {
        console.log('\nðŸ“Š EXECUTANDO DEBUG DETALHADO DO CRONOGRAMA:');
        debugTaskAccumulation(plan);
      }
    };

    // FUNÃ‡ÃƒO AUXILIAR SIMPLES PARA ADICIONAR DIAS ÃšTEIS
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

    // VERSÃƒO SIMPLIFICADA - Recalcular a partir de uma etapa especÃ­fica
    const recalculateFromStage = (plan: ProductionStage[], fromIndex: number) => {
      recalculateSequentialTasks(plan, fromIndex);
    };

    // VERSÃƒO SIMPLIFICADA - Recalcular cronograma completo
    const recalculateFromFirstStage = (plan: ProductionStage[]) => {
      // SÃ³ recalcular se a primeira etapa tem data de inÃ­cio
      if (plan[0] && plan[0].startDate) {
        recalculateSequentialTasks(plan, 0);
      }
    };

    // FUNÃ‡ÃƒO AUXILIAR PARA FORMATAÃ‡ÃƒO DE DATAS
    const formatDate = (date: Date | null): string => {
      if (!date) return 'N/A';
      return date.toLocaleDateString('pt-BR', { 
        weekday: 'short', 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
    };

    // FUNÃ‡ÃƒO PARA MARCAR DATA BOOK COMO ENVIADO
    const handleDataBookSent = async () => {
        if (!selectedOrder || selectedOrder.status !== 'ConcluÃ­do') {
            toast({
                variant: "destructive",
                title: "Erro",
                description: "SÃ³ Ã© possÃ­vel marcar Data Book para pedidos concluÃ­dos.",
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
                description: "A informaÃ§Ã£o foi salva com sucesso.",
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
                description: "NÃ£o foi possÃ­vel marcar o Data Book como enviado.",
            });
        }
    };

    // FUNÃ‡ÃƒO AUXILIAR PARA ADICIONAR APENAS DIAS ÃšTEIS
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

    // FUNÃ‡ÃƒO DE DEBUG PARA MOSTRAR O CÃLCULO PASSO A PASSO
    const debugTaskAccumulation = (plan: ProductionStage[]) => {
      console.group('ðŸ” DEBUG - Sistema de AcÃºmulo de Tarefas');
      
      if (plan.length === 0) {
        console.log('âŒ Nenhuma tarefa para processar');
        console.groupEnd();
        return;
      }
      
      console.log('ðŸ“‹ Processando', plan.length, 'tarefas...');
      
      // Primeira tarefa
      const firstStage = plan[0];
      if (!firstStage.startDate) {
        console.log('âŒ Primeira tarefa sem data de inÃ­cio');
        console.groupEnd();
        return;
      }
      
      console.log(`\n1ï¸âƒ£ TAREFA 1: ${firstStage.stageName}`);
      console.log(`   InÃ­cio: ${formatDate(firstStage.startDate)}`);
      console.log(`   DuraÃ§Ã£o: ${firstStage.durationDays} dias`);
      console.log(`   Fim: ${formatDate(firstStage.completedDate)}`);
      
      // VariÃ¡veis de controle
      let currentWorkingDate = new Date(firstStage.completedDate || firstStage.startDate);
      let dailyAccumulator = 0;
      
      console.log(`   ðŸ“ Data de trabalho atual: ${formatDate(currentWorkingDate)}`);
      console.log(`   ðŸ“Š Acumulador inicial: ${dailyAccumulator}`);
      
      // Processar tarefas seguintes
      for (let i = 1; i < plan.length; i++) {
        const stage = plan[i];
        const duration = Number(stage.durationDays) || 0;
        
        console.log(`\n${i + 1}ï¸âƒ£ TAREFA ${i + 1}: ${stage.stageName}`);
        console.log(`   DuraÃ§Ã£o: ${duration} dias`);
        console.log(`   Acumulador antes: ${dailyAccumulator}`);
        
        dailyAccumulator += duration;
        console.log(`   Acumulador depois: ${dailyAccumulator}`);
        console.log(`   Inicia em: ${formatDate(currentWorkingDate)}`);
        
        if (dailyAccumulator <= 1) {
          console.log(`   âœ… Acumulador â‰¤ 1 â†’ Termina no mesmo dia`);
          console.log(`   Fim: ${formatDate(currentWorkingDate)}`);
        } else {
          const daysNeeded = Math.ceil(dailyAccumulator) - 1;
          const newEndDate = addBusinessDaysOnly(currentWorkingDate, daysNeeded);
          
          console.log(`   ðŸš€ Acumulador > 1 â†’ AvanÃ§a ${daysNeeded} dias Ãºteis`);
          console.log(`   Fim: ${formatDate(newEndDate)}`);
          
          currentWorkingDate = new Date(newEndDate);
          dailyAccumulator = dailyAccumulator - Math.ceil(dailyAccumulator);
          
          console.log(`   ðŸ“ Nova data de trabalho: ${formatDate(currentWorkingDate)}`);
          console.log(`   ðŸ“Š Acumulador resetado: ${dailyAccumulator}`);
        }
      }
      
      console.groupEnd();
    };

    // EXEMPLO DE USO DO DEBUG EM OUTRAS FUNÃ‡Ã•ES:
    // 
    // Para usar no handleSaveProgress, adicione esta linha logo antes de salvar:
    // debugTaskAccumulation(editedPlan);
    //
    // Para usar em qualquer lugar do cÃ³digo:
    // console.log('ðŸ” ANÃLISE DO CRONOGRAMA:');
    // debugTaskAccumulation(planArray);
    //
    // Exemplos de saÃ­da do debug:
    // ðŸ” DEBUG - Sistema de AcÃºmulo de Tarefas
    // ðŸ“‹ Processando 4 tarefas...
    // 1ï¸âƒ£ TAREFA 1: PreparaÃ§Ã£o
    //    InÃ­cio: seg., 24/07/2024
    //    DuraÃ§Ã£o: 1 dias
    //    Fim: seg., 24/07/2024
    // 2ï¸âƒ£ TAREFA 2: Corte
    //    DuraÃ§Ã£o: 0.5 dias
    //    Acumulador antes: 0
    //    Acumulador depois: 0.5
    //    âœ… Acumulador â‰¤ 1 â†’ Termina no mesmo dia

    const dashboardStats = useMemo(() => {
        const totalOrders = orders.length;
        const totalWeight = orders.reduce((acc, order) => acc + (order.totalWeight || 0), 0);
        
        const completedOrdersList = orders.filter(order => order.status === 'ConcluÃ­do');
        const completedOrders = completedOrdersList.length;
        const completedWeight = completedOrdersList.reduce((acc, order) => acc + (order.totalWeight || 0), 0);

        const inProgressOrdersList = orders.filter(order => ['Em ProduÃ§Ã£o', 'Aguardando ProduÃ§Ã£o'].includes(order.status));
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

    // FunÃ§Ã£o para gerar e salvar nÃºmero sequencial do romaneio
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
                // Se o documento nÃ£o existe, criar
                if (error.code === 'not-found') {
                    await setDoc(counterRef, {
                        packingSlipNumber: currentNumber,
                        lastPackingSlipDate: Timestamp.now()
                    });
                }
            });
            
            // Formatar com zeros Ã  esquerda (ex: 000001)
            return currentNumber.toString().padStart(6, '0');
        } catch (error) {
            console.error("Erro ao gerar nÃºmero do romaneio:", error);
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
            
            // Gerar nÃºmero sequencial do romaneio
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

            // NÃºmero do Romaneio centralizado e destacado
            docPdf.setFontSize(10).setFont('helvetica', 'bold');
            docPdf.setTextColor(37, 99, 235); // Cor azul
            docPdf.text(`Romaneio NÂº ${packingSlipNumber}`, pageWidth / 2, yPos, { align: 'center' });
            docPdf.setTextColor(0, 0, 0); // Voltar para preto
            yPos += 15;

            // InformaÃ§Ãµes do pedido em grid
            docPdf.setFontSize(10).setFont('helvetica', 'normal');

            // Linha 1: Pedido e Data de EmissÃ£o
            docPdf.text(`Pedido: ${selectedOrder.quotationNumber}`, 15, yPos);
            docPdf.text(`Data EmissÃ£o: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
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
                head: [['NÂº Item', 'CÃ³d.', 'DescriÃ§Ã£o', 'Qtd.', 'Peso Unit. (kg)', 'Peso Total (kg)']],
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
                description: `Romaneio NÂº ${packingSlipNumber} foi criado e baixado.`,
            });
            
            // Fechar o dialog apÃ³s gerar
            setIsPackingSlipDialogOpen(false);
            
        } catch (error) {
            console.error("Error generating packing slip:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar romaneio",
                description: "NÃ£o foi possÃ­vel gerar o arquivo PDF.",
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

            // Header com logo e informaÃ§Ãµes da empresa
            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
                } catch (e) {
                    console.error("Error adding logo to PDF:", e);
                }
            }

            // InformaÃ§Ãµes da empresa ao lado da logo
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

            // TÃ­tulo do documento
            docPdf.setFontSize(16).setFont('helvetica', 'bold');
            docPdf.text('CRONOGRAMA DE PRODUÃ‡ÃƒO', pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;

            // InformaÃ§Ãµes do pedido em duas colunas
            docPdf.setFontSize(10).setFont('helvetica', 'normal');
            
            // Coluna esquerda
            const leftColumnX = 15;
            let leftColumnY = yPos;
            docPdf.setFont('helvetica', 'bold');
            docPdf.text('DADOS DO PEDIDO:', leftColumnX, leftColumnY);
            leftColumnY += 6;
            docPdf.setFont('helvetica', 'normal');
            docPdf.text(`Pedido NÂº: ${selectedOrder.quotationNumber}`, leftColumnX, leftColumnY);
            leftColumnY += 5;
            docPdf.text(`Cliente: ${selectedOrder.customer.name}`, leftColumnX, leftColumnY);
            leftColumnY += 5;
            if (selectedOrder.projectName) {
                docPdf.text(`Projeto: ${selectedOrder.projectName}`, leftColumnX, leftColumnY);
                leftColumnY += 5;
            }
            
            // Coluna direita
            const rightColumnX = pageWidth / 2 + 10;
            let rightColumnY = yPos + 6; // Alinha com o inÃ­cio dos dados
            docPdf.text(`OS Interna: ${selectedOrder.internalOS || 'N/A'}`, rightColumnX, rightColumnY);
            rightColumnY += 5;
            docPdf.text(`Data de EmissÃ£o: ${format(new Date(), "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
            rightColumnY += 5;
            if (selectedOrder.deliveryDate) {
                docPdf.text(`Data de Entrega: ${format(selectedOrder.deliveryDate, "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
                rightColumnY += 5;
            }
            docPdf.text(`Status: ${selectedOrder.status}`, rightColumnX, rightColumnY);
            
            yPos = Math.max(leftColumnY, rightColumnY) + 10;

            // Progresso geral do pedido
            const orderProgress = calculateOrderProgress(selectedOrder);
            
            // TÃ­tulo do progresso geral
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
                    // CabeÃ§alho do item com cÃ³digo, descriÃ§Ã£o e quantidade na mesma linha
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
                            `  â€¢ ${stage.stageName}`,
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
                head: [['Etapa', 'InÃ­cio Previsto', 'Fim Previsto', 'DuraÃ§Ã£o', 'Status']],
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
                    1: { cellWidth: 25, halign: 'center' }, // InÃ­cio
                    2: { cellWidth: 25, halign: 'center' }, // Fim
                    3: { cellWidth: 20, halign: 'center' }, // DuraÃ§Ã£o
                    4: { cellWidth: 25, halign: 'center' }, // Status
                },
                didParseCell: (data) => {
                    if (data.cell.raw && (data.cell.raw as any).colSpan) {
                        data.cell.styles.halign = 'left';
                    }
                },
                didDrawCell: (data) => {
                    // Verifica se Ã© uma linha de progresso do item
                    if (data.cell.raw && typeof data.cell.raw === 'string' && data.cell.raw.startsWith('Progresso:')) {
                        const progressText = data.cell.raw as string;
                        const progressMatch = progressText.match(/(\d+\.?\d*)%/);
                        
                        if (progressMatch) {
                            const progress = parseFloat(progressMatch[1]);
                            
                            // PosiÃ§Ã£o e dimensÃµes da barra (ajustada para melhor posicionamento)
                            const barX = data.cell.x + 80; // PosiÃ§Ã£o apÃ³s o texto "Progresso: XX.X%"
                            const barY = data.cell.y + 3;
                            const barWidth = 70;
                            const barHeight = 5;
                            
                            // Fundo da barra (cinza claro)
                            docPdf.setFillColor(230, 230, 230);
                            docPdf.rect(barX, barY, barWidth, barHeight, 'F');
                            
                            // Barra de progresso colorida baseada na porcentagem
                            const fillWidth = (progress / 100) * barWidth;
                            if (fillWidth > 0) { // SÃ³ desenha se houver progresso
                                if (progress < 30) {
                                    docPdf.setFillColor(239, 68, 68); // Vermelho para progresso baixo
                                } else if (progress < 70) {
                                    docPdf.setFillColor(245, 158, 11); // Amarelo para progresso mÃ©dio
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

            // RodapÃ© com informaÃ§Ãµes adicionais
            const finalY = (docPdf as any).lastAutoTable.finalY;
            const pageHeight = docPdf.internal.pageSize.height;
            
            if (finalY + 30 < pageHeight - 20) {
                yPos = finalY + 15;
                docPdf.setFontSize(8).setFont('helvetica', 'italic');
                docPdf.text(
                    `Documento gerado automaticamente em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}`,
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
                description: "NÃ£o foi possÃ­vel gerar o arquivo PDF.",
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
            console.error("Erro ao preparar plano de produÃ§Ã£o:", error);
            setEditedPlan([]);
        } finally {
            setIsFetchingPlan(false);
        }
    };

    // ==========================================
    // CORREÃ‡ÃƒO DEFINITIVA DO SALVAMENTO NO FIRESTORE
    // ==========================================

    // 1. FUNÃ‡ÃƒO PARA VERIFICAR E CORRIGIR ESTRUTURA DOS DADOS
    const validateAndCleanItemData = (item: any) => {
        console.log('ðŸ§¹ [validateAndCleanItemData] Limpando item:', item.id);
        
        // Remove campos undefined, null vazios e problemÃ¡ticos
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
        
        console.log('ðŸ§¹ [validateAndCleanItemData] Item limpo:', {
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



    // 2. FUNÃ‡ÃƒO CORRIGIDA DE SALVAMENTO QUE PRESERVA TODOS OS DADOS
    const handleSaveProgress = async () => {
        if (!selectedOrder || !itemToTrack) {
            console.error('âŒ [handleSaveProgress] Dados obrigatÃ³rios ausentes');
            return;
        }

        console.log('ðŸ’¾ [handleSaveProgress] =================================');
        console.log('ðŸ’¾ [handleSaveProgress] INICIANDO SALVAMENTO COMPLETO');
        console.log('ðŸ’¾ [handleSaveProgress] =================================');
        console.log('ðŸ’¾ [handleSaveProgress] Order ID:', selectedOrder.id);
        console.log('ðŸ’¾ [handleSaveProgress] Item ID:', itemToTrack.id);
        console.log('ðŸ’¾ [handleSaveProgress] Plano editado:', editedPlan.map(s => ({
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
                throw new Error("Pedido nÃ£o encontrado no banco de dados.");
            }
            
            const currentOrderData = currentOrderSnap.data();
            console.log('ðŸ’¾ [handleSaveProgress] Dados atuais carregados, itens:', currentOrderData.items?.length || 0);

            // 2. Converter plano editado para formato Firestore com validaÃ§Ã£o
            const convertedProductionPlan = editedPlan
                .filter(stage => stage.stageName && stage.stageName.trim()) // Remove etapas vazias
                .map((stage, index) => {
                    console.log(`ðŸ’¾ [handleSaveProgress] Convertendo etapa ${index + 1}: ${stage.stageName}`);
                    
                    let startTimestamp = null;
                    let endTimestamp = null;
                    
                    // ConversÃ£o de data de inÃ­cio
                    if (stage.startDate) {
                        if (stage.startDate instanceof Date && !isNaN(stage.startDate.getTime())) {
                            startTimestamp = Timestamp.fromDate(stage.startDate);
                            console.log(`ðŸ’¾ [handleSaveProgress] âœ“ Data inÃ­cio convertida: ${stage.startDate.toISOString()}`);
                        } else {
                            console.warn(`ðŸ’¾ [handleSaveProgress] âš ï¸ Data inÃ­cio invÃ¡lida ignorada:`, stage.startDate);
                        }
                    }
                    
                    // ConversÃ£o de data de conclusÃ£o
                    if (stage.completedDate) {
                        if (stage.completedDate instanceof Date && !isNaN(stage.completedDate.getTime())) {
                            endTimestamp = Timestamp.fromDate(stage.completedDate);
                            console.log(`ðŸ’¾ [handleSaveProgress] âœ“ Data fim convertida: ${stage.completedDate.toISOString()}`);
                        } else {
                            console.warn(`ðŸ’¾ [handleSaveProgress] âš ï¸ Data fim invÃ¡lida ignorada:`, stage.completedDate);
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
                    
                    console.log(`ðŸ’¾ [handleSaveProgress] âœ“ Etapa ${index + 1} convertida:`, {
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

            console.log('ðŸ’¾ [handleSaveProgress] Plano convertido completo:', convertedProductionPlan.length, 'etapas');

            // 3. Atualizar APENAS o item especÃ­fico preservando TODOS os outros dados
            const updatedItems = currentOrderData.items.map((item: any) => {
                if (item.id === itemToTrack.id) {
                    console.log('ðŸ’¾ [handleSaveProgress] âœ“ Atualizando item alvo:', item.id);
                    
                    // Limpar e validar dados do item
                    const cleanedItem = validateAndCleanItemData(item);
                    
                    // Substituir APENAS o productionPlan
                    cleanedItem.productionPlan = convertedProductionPlan;
                    cleanedItem.lastProgressUpdate = Timestamp.now();
                    
                    console.log('ðŸ’¾ [handleSaveProgress] âœ“ Item atualizado com novo plano');
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

            console.log('ðŸ’¾ [handleSaveProgress] Total de itens processados:', updatedItems.length);

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

            console.log('ðŸ’¾ [handleSaveProgress] Dados finais preparados para salvamento');

            // 5. SALVAR NO FIRESTORE COM MERGE
            await updateDoc(orderRef, updateData);
            console.log('ðŸ’¾ [handleSaveProgress] âœ… DADOS SALVOS NO FIRESTORE COM SUCESSO!');

            // 6. VERIFICAÃ‡ÃƒO IMEDIATA DOS DADOS SALVOS
            console.log('ðŸ” [handleSaveProgress] Verificando dados salvos...');
            const verificationSnap = await getDoc(orderRef);
            if (verificationSnap.exists()) {
                const savedData = verificationSnap.data();
                const savedItem = savedData.items.find((item: any) => item.id === itemToTrack.id);
                
                if (savedItem && savedItem.productionPlan) {
                    console.log('âœ… [handleSaveProgress] VERIFICAÃ‡ÃƒO: Dados salvos corretamente:', {
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
                    console.error('âŒ [handleSaveProgress] VERIFICAÃ‡ÃƒO FALHOU: Item nÃ£o encontrado ou sem plano');
                }
            } else {
                console.error('âŒ [handleSaveProgress] VERIFICAÃ‡ÃƒO FALHOU: Documento nÃ£o existe');
            }

            // 7. Verificar status geral
            const allItemsCompleted = updatedItems.every((item: any) => {
                if (item.productionPlan && item.productionPlan.length > 0) {
                    return item.productionPlan.every((p: any) => p.status === 'ConcluÃ­do');
                }
                return true;
            });

            if (allItemsCompleted && currentOrderData.status !== 'ConcluÃ­do') {
                await updateDoc(orderRef, { 
                    status: "ConcluÃ­do",
                    completedAt: Timestamp.now(),
                    lastUpdate: Timestamp.now()
                });
                
                toast({ 
                    title: "ðŸŽ‰ Pedido ConcluÃ­do!", 
                    description: "Todos os itens foram finalizados. Status atualizado automaticamente." 
                });
            } else {
                toast({ 
                    title: "âœ… Progresso Salvo!", 
                    description: "As etapas foram salvas e estarÃ£o disponÃ­veis em todos os dispositivos." 
                });
            }

            // 8. Fechar modal
            setIsProgressModalOpen(false);
            setItemToTrack(null);

            // 9. RECARREGAR DADOS LOCAIS
            console.log('ðŸ”„ [handleSaveProgress] Recarregando dados locais...');
            
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
                console.log('âœ… [handleSaveProgress] Estado local atualizado com sucesso');
            } else {
                console.warn('âš ï¸ [handleSaveProgress] Pedido nÃ£o encontrado apÃ³s recarregamento');
            }

            console.log('ðŸ’¾ [handleSaveProgress] =================================');
            console.log('ðŸ’¾ [handleSaveProgress] SALVAMENTO CONCLUÃDO COM SUCESSO');
            console.log('ðŸ’¾ [handleSaveProgress] =================================');

        } catch (error) {
            console.error("âŒ [handleSaveProgress] ERRO CRÃTICO:", error);
            console.error("âŒ [handleSaveProgress] Stack:", error.stack);
            
            toast({ 
                variant: "destructive", 
                title: "Erro CrÃ­tico no Salvamento", 
                description: `Falha ao salvar: ${error instanceof Error ? error.message : 'Erro desconhecido'}. Tente novamente.` 
            });
        }
    };

    // FunÃ§Ãµes de auto-preenchimento inteligente
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
            title: "Agendamento automÃ¡tico aplicado",
            description: "Primeira etapa agendada para hoje e marcada como 'Em Andamento'"
        });
    };

    const markPreviousAsCompleted = () => {
        const updatedPlan = editedPlan.map((stage, index) => {
            const currentIndex = editedPlan.findIndex(s => s.status === 'Em Andamento');
            if (index < currentIndex && stage.status !== 'ConcluÃ­do') {
                return {
                    ...stage,
                    status: 'ConcluÃ­do',
                    completedDate: stage.startDate || new Date()
                };
            }
            return stage;
        });
        setEditedPlan(updatedPlan);
        toast({
            title: "Etapas anteriores marcadas como concluÃ­das",
            description: "Todas as etapas anteriores Ã  atual foram finalizadas"
        });
    };

    const applyStandardDurations = () => {
        const standardDurations = {
            'PreparaÃ§Ã£o': 1,
            'Corte': 2,
            'Soldagem': 3,
            'Usinagem': 2,
            'Montagem': 2,
            'Pintura': 1,
            'InspeÃ§Ã£o': 0.5,
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
            title: "DuraÃ§Ãµes padrÃ£o aplicadas",
            description: "DuraÃ§Ãµes padrÃ£o foram aplicadas a todas as etapas"
        });
    };

    // FunÃ§Ã£o para Ã­cones de status
    const getStatusIcon = (status: string) => {
        switch(status) {
            case 'ConcluÃ­do': 
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
            toast({ variant: "destructive", title: "Erro", description: "Nenhum progresso na Ã¡rea de transferÃªncia." });
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
            toast({ variant: "destructive", title: "Erro ao colar", description: "NÃ£o foi possÃ­vel colar o progresso." });
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
            title: "Nome da etapa invÃ¡lido",
            description: "O nome da etapa nÃ£o pode estar em branco.",
        });
        return;
        }
        const newStage: ProductionStage = {
            stageName: trimmedName,
            status: "Pendente",
            startDate: null,
            completedDate: null,
            durationDays: 0,
            useBusinessDays: true, // Default para dias Ãºteis
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

            // Header com logo e informaÃ§Ãµes da empresa
            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
                } catch (e) {
                    console.error("Error adding logo to PDF:", e);
                }
            }

            // InformaÃ§Ãµes da empresa
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

            // TÃ­tulo - ajusta baseado no progresso do item
            const itemProgress = calculateItemProgress(item);
            docPdf.setFontSize(18).setFont('helvetica', 'bold');
            if (itemProgress === 100) {
                docPdf.text('CONTROLE DE EMBARQUE E ENTREGA', pageWidth / 2, yPos, { align: 'center' });
            } else {
                docPdf.text('FOLHA DE APONTAMENTO DE PRODUÃ‡ÃƒO', pageWidth / 2, yPos, { align: 'center' });
            }
            yPos += 15;

            // InformaÃ§Ãµes do pedido
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
            docPdf.text(`CÃ³digo: ${item.code || 'N/A'}`, 15, yPos);
            yPos += 5;
            docPdf.text(`DescriÃ§Ã£o: ${item.description}`, 15, yPos);
            yPos += 5;
            docPdf.text(`Quantidade: ${item.quantity}`, 15, yPos);
            docPdf.text(`Peso Unit.: ${(Number(item.unitWeight) || 0).toLocaleString('pt-BR')} kg`, pageWidth / 2, yPos);
            yPos += 5;
            
            // InformaÃ§Ãµes de embarque se o item estiver concluÃ­do
            if (itemProgress === 100) {
                yPos += 10;
                docPdf.setFontSize(12).setFont('helvetica', 'bold');
                docPdf.text('INFORMAÃ‡Ã•ES DE EMBARQUE:', 15, yPos);
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

            // QR Code MELHORADO com dados mais completos incluindo informaÃ§Ãµes de embarque
            const qrData = JSON.stringify({
                type: 'controle_embarque',
                orderId: selectedOrder.id,
                itemId: item.id,
                orderNumber: selectedOrder.quotationNumber,
                itemNumber: item.itemNumber || null, // NÃºmero do item no pedido de compra
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
                
                // Posiciona o QR Code no canto superior direito da seÃ§Ã£o de dados
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
                    description: "QR Code nÃ£o pÃ´de ser gerado, mas o documento foi criado normalmente.",
                });
            }

            // Tabela de etapas de produÃ§Ã£o
            if (item.productionPlan && item.productionPlan.length > 0) {
                docPdf.setFontSize(12).setFont('helvetica', 'bold');
                docPdf.text('ETAPAS DE PRODUÃ‡ÃƒO:', 15, yPos + 10);
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
                    head: [['Etapa', 'InÃ­cio', 'Fim', 'Status', 'Assinatura ResponsÃ¡vel']],
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

            // SeÃ§Ã£o de apontamentos
            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('REGISTRO DE APONTAMENTOS:', 15, yPos);
            yPos += 10;

            // Tabela de apontamentos em branco
            const appointmentRows = Array(8).fill(['', '', '', '', '', '']);
            
            autoTable(docPdf, {
                startY: yPos,
                head: [['Data', 'Hora InÃ­cio', 'Hora Fim', 'FuncionÃ¡rio', 'Etapa/Atividade', 'ObservaÃ§Ãµes']],
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

            // RodapÃ©
            const finalY = (docPdf as any).lastAutoTable.finalY;
            const pageHeight = docPdf.internal.pageSize.height;
            
            if (finalY + 30 < pageHeight - 20) {
                yPos = finalY + 15;
                docPdf.setFontSize(8).setFont('helvetica', 'italic');
                docPdf.text(
                    `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}`,
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
                description: `Arquivo ${filename} foi baixado. QR Code incluÃ­do para rastreamento.`,
            });

        } catch (error) {
            console.error("Error generating timesheet:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar folha",
                description: "NÃ£o foi possÃ­vel gerar a folha de apontamento.",
            });
        }
    };

    const handleGenerateMonthlyReport = async () => {
        if (monthFilter === 'all') {
            toast({
                variant: "destructive",
                title: "Selecione um mÃªs",
                description: "Por favor, selecione um mÃªs especÃ­fico para gerar o relatÃ³rio.",
            });
            return;
        }

        if (!monthWeightStats || monthWeightStats.totalOrders === 0) {
            toast({
                variant: "destructive",
                title: "Nenhum dado para exportar",
                description: "NÃ£o hÃ¡ pedidos para o mÃªs selecionado.",
            });
            return;
        }

        toast({ title: "Gerando RelatÃ³rio Mensal...", description: "Por favor, aguarde." });

        try {
            // Buscar dados da empresa
            let companyData: CompanyData = {};
            try {
                const companyRef = doc(db, "companies", "mecald", "settings", "company");
                const docSnap = await getDoc(companyRef);
                companyData = docSnap.exists() ? (docSnap.data() as CompanyData) : {};
            } catch (error) {
                console.warn("NÃ£o foi possÃ­vel carregar dados da empresa:", error);
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

            // TÃ­tulo do documento
            const selectedMonth = availableMonths.find(m => m.value === monthFilter);
            const monthName = selectedMonth ? selectedMonth.label : monthFilter;
            
            docPdf.setFontSize(16).setFont('helvetica', 'bold');
            docPdf.text('RELATÃ“RIO MENSAL DE PRODUÃ‡ÃƒO', pageWidth / 2, yPos, { align: 'center' });
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
            docPdf.text(`Data de EmissÃ£o: ${format(new Date(), "dd/MM/yyyy")}`, col2X, yPos);
            yPos += 5;
            
            docPdf.setFont('helvetica', 'bold');
            docPdf.text(`Peso Total: ${monthWeightStats.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`, col1X, yPos);
            docPdf.setFont('helvetica', 'normal');
            yPos += 5;
            
            docPdf.setTextColor(21, 128, 61);
            docPdf.text(`âœ“ ConcluÃ­do: ${monthWeightStats.completedWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`, col1X, yPos);
            docPdf.setTextColor(234, 88, 12);
            docPdf.text(`â§— Pendente: ${monthWeightStats.pendingWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg`, col2X, yPos);
            docPdf.setTextColor(0, 0, 0);
            yPos += 5;
            
            docPdf.setFont('helvetica', 'bold');
            docPdf.text(`Taxa de ConclusÃ£o: ${monthWeightStats.completedPercentage.toFixed(1)}%`, col1X, yPos);
            docPdf.setFont('helvetica', 'normal');
            
            yPos += 20;

            // Agrupamento por status
            const ordersByStatus = {
                'ConcluÃ­do': monthOrders.filter(o => o.status === 'ConcluÃ­do'),
                'Em ProduÃ§Ã£o': monthOrders.filter(o => o.status === 'Em ProduÃ§Ã£o'),
                'Aguardando ProduÃ§Ã£o': monthOrders.filter(o => o.status === 'Aguardando ProduÃ§Ã£o'),
                'Pronto para Entrega': monthOrders.filter(o => o.status === 'Pronto para Entrega'),
                'Atrasado': monthOrders.filter(o => o.status === 'Atrasado'),
            } as const;

            // EstatÃ­sticas por status
            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('DISTRIBUIÃ‡ÃƒO POR STATUS', 15, yPos);
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
                        if (status === 'ConcluÃ­do') {
                            data.cell.styles.fillColor = [220, 252, 231];
                            data.cell.styles.textColor = [21, 128, 61];
                            data.cell.styles.fontStyle = 'bold';
                        } else if (status === 'Em ProduÃ§Ã£o') {
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

            // AnÃ¡lise por cliente
            const ordersByCustomer = new Map<string, { orders: Order[]; totalWeight: number }>();
            monthOrders.forEach(order => {
                const customerName = order.customer?.name || 'NÃ£o informado';
                if (!ordersByCustomer.has(customerName)) {
                    ordersByCustomer.set(customerName, { orders: [], totalWeight: 0 });
                }
                const customerData = ordersByCustomer.get(customerName)!;
                customerData.orders.push(order);
                customerData.totalWeight += order.totalWeight || 0;
            });

            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text('ANÃLISE POR CLIENTE', 15, yPos);
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
                    `RelatÃ³rio gerado automaticamente em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}`,
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
                'Janeiro', 'Fevereiro', 'MarÃ§o', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];
            const monthNameFile = monthNames[parseInt(month, 10) - 1] || month;
            const timestamp = format(new Date(), 'yyyyMMdd_HHmm');
            const filename = `Relatorio_Mensal_${monthNameFile}_${year}_${timestamp}.pdf`;
            
            docPdf.save(filename);
            
            toast({
                title: "âœ… RelatÃ³rio Gerado com Sucesso!",
                description: `O arquivo "${filename}" foi baixado com todas as estatÃ­sticas do mÃªs.`,
            });

        } catch (error) {
            console.error("Erro completo ao gerar relatÃ³rio mensal:", error);
            toast({
                variant: "destructive",
                title: "Erro ao Gerar RelatÃ³rio",
                description: `Falha na geraÃ§Ã£o: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
            });
        }
    };

    // FUNÃ‡ÃƒO AUXILIAR MELHORADA para debug
    const logProgressState = (context: string, plan: ProductionStage[]) => {
        console.log(`ðŸ“Š ${context}:`, plan.map(stage => ({
            name: stage.stageName,
            status: stage.status,
            start: stage.startDate ? format(stage.startDate, 'dd/MM/yyyy') : 'null',
            end: stage.completedDate ? format(stage.completedDate, 'dd/MM/yyyy') : 'null',
            duration: stage.durationDays,
            businessDays: stage.useBusinessDays
        })));
    };

    // CORREÃ‡ÃƒO 1: CÃLCULO CORRETO DE DIAS DE ATRASO
    // CORREÃ‡ÃƒO: FunÃ§Ã£o analyzeItemDelivery com cÃ¡lculo correto de dias de diferenÃ§a
    const analyzeItemDelivery = (item: OrderItem, orderDeliveryDate?: Date) => {
      console.log('ðŸ” Analisando item:', {
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
        hasShippingList: !!(item.shippingList && item.shippingList.trim() && item.shippingList !== 'NÃ£o informada'),
        shippingList: item.shippingList && item.shippingList.trim() ? item.shippingList.trim() : 'NÃ£o informada',
        hasInvoice: !!(item.invoiceNumber && item.invoiceNumber.trim() && item.invoiceNumber !== 'NÃ£o informada'),
        invoiceNumber: item.invoiceNumber && item.invoiceNumber.trim() ? item.invoiceNumber.trim() : 'NÃ£o informada',
        hasShippingDate: !!item.shippingDate,
        shippingDate: item.shippingDate,
        
        // Datas para anÃ¡lise
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

      // CORREÃ‡ÃƒO PRINCIPAL: CÃ¡lculo correto de dias de diferenÃ§a
      if (analysis.actualDate && analysis.expectedDate) {
        // Normalizar datas para meia-noite para comparaÃ§Ã£o correta
        const expectedDateNormalized = new Date(analysis.expectedDate);
        expectedDateNormalized.setHours(0, 0, 0, 0);
        
        const actualDateNormalized = new Date(analysis.actualDate);
        actualDateNormalized.setHours(0, 0, 0, 0);
        
        // Calcular diferenÃ§a em milissegundos e converter para dias
        const diffTime = actualDateNormalized.getTime() - expectedDateNormalized.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24); // NÃ£o usar Math.round aqui
        
        console.log('ðŸ“… CÃ¡lculo de diferenÃ§a CORRIGIDO:', {
          expectedNormalized: expectedDateNormalized.toISOString().split('T')[0],
          actualNormalized: actualDateNormalized.toISOString().split('T')[0],
          diffTime,
          diffDays,
          diffDaysRounded: Math.round(Math.abs(diffDays))
        });
        
        // Armazenar sempre o valor absoluto para exibiÃ§Ã£o
        analysis.daysDifference = Math.round(Math.abs(diffDays));
        
        // Definir status baseado no sinal da diferenÃ§a
        if (diffDays < 0) {
          analysis.deliveryStatus = 'early'; // Entregue antes do prazo (negativo)
          console.log('âœ… Status: ANTECIPADO -', analysis.daysDifference, 'dias');
        } else if (diffDays === 0) {
          analysis.deliveryStatus = 'ontime'; // Entregue no prazo exato
          console.log('âœ… Status: NO PRAZO EXATO');
        } else {
          analysis.deliveryStatus = 'late'; // Entregue com atraso (positivo)
          console.log('âŒ Status: ATRASADO +', analysis.daysDifference, 'dias');
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
          console.log('âš ï¸ Status: VENCIDO -', analysis.daysDifference, 'dias');
        }
      }

      return analysis;
    };

    // FUNÃ‡ÃƒO PARA ANÃLISE DE ENTREGA DO PEDIDO (usando a nova anÃ¡lise de itens)
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

    // CORREÃ‡ÃƒO: Componente de visualizaÃ§Ã£o das mensagens de entrega no modal
    const DeliveryStatusMessage = ({ item, orderDeliveryDate }: { item: OrderItem, orderDeliveryDate?: Date }) => {
      if (!item.shippingDate) return null;
      
      // Usar a data de entrega especÃ­fica do item ou a data geral do pedido
      const expectedDate = item.itemDeliveryDate || orderDeliveryDate;
      if (!expectedDate) return null;

      // Normalizar datas para meia-noite
      const shippingDate = new Date(item.shippingDate);
      shippingDate.setHours(0, 0, 0, 0);
      
      const deliveryDate = new Date(expectedDate);
      deliveryDate.setHours(0, 0, 0, 0);
      
      // Calcular diferenÃ§a em dias (negativo = antecipado, positivo = atrasado)
      const diffTime = shippingDate.getTime() - deliveryDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      console.log('ðŸŽ¨ Renderizando status de entrega:', {
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
              Item entregue {diffDays} dia{diffDays !== 1 ? 's' : ''} apÃ³s o prazo
            </span>
          </div>
        );
      }
    };

    // CORREÃ‡ÃƒO: Badge de status para o item
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

    // COMPONENTE DO BOTÃƒO LIMPO (sem debug)
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
                    RelatÃ³rio de Entrega
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

    // PREVIEW LIMPO (sem botÃµes de debug) para o modal
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
                            AnÃ¡lise dos dados de embarque e pontualidade das entregas
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-6 text-muted-foreground">
                            <Clock className="h-8 w-8 mx-auto mb-2" />
                            <p className="text-sm">Nenhum dado de embarque disponÃ­vel ainda</p>
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
                        AnÃ¡lise dos dados de embarque e pontualidade das entregas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Ãndice de Performance */}
                        <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Ãndice de Entrega no Prazo</p>
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
                                                â€¢ {item.description.substring(0, 40)}... 
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

    const formatCurrency = (value: number) => value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

    const handleOpenCostAnalysis = async (order: Order) => {
        setIsCostAnalysisOpen(true);
        setIsLoadingCostAnalysis(true);
        setCostAnalysis(null);

        try {
            // A coleÃ§Ã£o usa o cÃ³digo do produto como ID. A normalizaÃ§Ã£o tambÃ©m
            // atende documentos antigos salvos com diferenÃ§a de caixa/espaÃ§os.
            const pricingSnapshot = await getDocs(collection(db, "companies", "mecald", "pricingCalculations"));
            const pricingByCode = new Map<string, any>();
            pricingSnapshot.docs.forEach(pricingDoc => {
                const data = pricingDoc.data();
                const keys = [pricingDoc.id, data.productCode]
                    .filter(Boolean)
                    .map(value => String(value).trim().toUpperCase());
                keys.forEach(key => pricingByCode.set(key, data));
            });

            const items: OrderCostAnalysisItem[] = order.items.map((item, index) => {
                const code = String(item.code || item.product_code || '').trim();
                const pricing = code ? pricingByCode.get(code.toUpperCase()) : undefined;
                const quantity = Math.max(0, Number(item.quantity) || 0);

                const materialUnit = pricing
                    ? (pricing.materialCosts || pricing.materialComposition || [])
                        .reduce((sum: number, material: any) => sum + (Number(material.totalCost) || 0), 0)
                    : 0;
                const productionUnit = pricing
                    ? (pricing.stageCosts || [])
                        .reduce((sum: number, stage: any) => sum + (Number(stage.totalCost) || 0), 0)
                    : 0;
                const machiningUnit = pricing ? Number(pricing.machiningCost) || 0 : 0;
                const consumablesUnit = pricing ? Number(pricing.consumablesCost) || 0 : 0;

                // totalCost Ã© o custo de fabricaÃ§Ã£o salvo, sem lucro, IRPJ ou CSLL.
                const calculatedUnitCost = materialUnit + productionUnit + machiningUnit + consumablesUnit;
                const unitCost = pricing
                    ? (Number.isFinite(Number(pricing.totalCost)) ? Number(pricing.totalCost) : calculatedUnitCost)
                    : 0;

                return {
                    itemId: item.id || `${order.id}-${index}`,
                    code: code || 'Sem cÃ³digo',
                    description: item.description || 'Item sem descriÃ§Ã£o',
                    quantity,
                    hasSavedPricing: Boolean(pricing),
                    unitCost,
                    totalCost: unitCost * quantity,
                    materialCost: materialUnit * quantity,
                    productionCost: productionUnit * quantity,
                    machiningCost: machiningUnit * quantity,
                    consumablesCost: consumablesUnit * quantity,
                };
            });

            setCostAnalysis({
                items,
                materialTotal: items.reduce((sum, item) => sum + item.materialCost, 0),
                productionTotal: items.reduce((sum, item) => sum + item.productionCost, 0),
                machiningTotal: items.reduce((sum, item) => sum + item.machiningCost, 0),
                consumablesTotal: items.reduce((sum, item) => sum + item.consumablesCost, 0),
                grandTotal: items.reduce((sum, item) => sum + item.totalCost, 0),
                pricedItems: items.filter(item => item.hasSavedPricing).length,
                unpricedItems: items.filter(item => !item.hasSavedPricing).length,
            });
        } catch (error) {
            console.error('Erro ao calcular custos do pedido:', error);
            toast({
                variant: 'destructive',
                title: 'Erro ao analisar custos',
                description: 'NÃ£o foi possÃ­vel carregar as precificaÃ§Ãµes dos produtos.',
            });
            setIsCostAnalysisOpen(false);
        } finally {
            setIsLoadingCostAnalysis(false);
        }
    };

    const handleExportCostAnalysis = () => {
        if (!selectedOrder || !costAnalysis) return;

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const generatedAt = format(new Date(), 'dd/MM/yyyy HH:mm');

        pdf.setFontSize(16);
        pdf.text('ANÃLISE DE CUSTOS DE FABRICAÃ‡ÃƒO', 14, 16);
        pdf.setFontSize(10);
        pdf.text(`Pedido: ${selectedOrder.quotationNumber}`, 14, 24);
        pdf.text(`OS: ${selectedOrder.internalOS || 'N/A'}`, 105, 24);
        pdf.text(`Cliente: ${selectedOrder.customer?.name || 'N/A'}`, 14, 30);
        pdf.text(`Emitido em: ${generatedAt}`, 283, 30, { align: 'right' });

        autoTable(pdf, {
            startY: 36,
            head: [['Item', 'CÃ³digo', 'DescriÃ§Ã£o', 'Qtd.', 'Custo unitÃ¡rio', 'Custo total', 'SituaÃ§Ã£o']],
            body: costAnalysis.items.map((item, index) => [
                String(index + 1),
                item.code,
                item.description,
                item.quantity.toLocaleString('pt-BR'),
                formatCurrency(item.unitCost),
                formatCurrency(item.totalCost),
                item.hasSavedPricing ? 'PrecificaÃ§Ã£o salva' : 'Sem precificaÃ§Ã£o (R$ 0,00)',
            ]),
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235] },
            columnStyles: {
                0: { cellWidth: 12 },
                1: { cellWidth: 28 },
                2: { cellWidth: 92 },
                3: { cellWidth: 18, halign: 'right' },
                4: { cellWidth: 34, halign: 'right' },
                5: { cellWidth: 34, halign: 'right' },
                6: { cellWidth: 50 },
            },
        });

        const finalY = (pdf as any).lastAutoTable?.finalY || 80;
        autoTable(pdf, {
            startY: finalY + 8,
            head: [['Resumo da OS', 'Valor']],
            body: [
                ['Materiais', formatCurrency(costAnalysis.materialTotal)],
                ['ProduÃ§Ã£o / mÃ£o de obra', formatCurrency(costAnalysis.productionTotal)],
                ['Usinagem', formatCurrency(costAnalysis.machiningTotal)],
                ['Insumos e consumÃ­veis', formatCurrency(costAnalysis.consumablesTotal)],
                ['CUSTO TOTAL DE FABRICAÃ‡ÃƒO', formatCurrency(costAnalysis.grandTotal)],
            ],
            theme: 'grid',
            tableWidth: 105,
            margin: { left: 178 },
            styles: { fontSize: 9 },
            headStyles: { fillColor: [31, 41, 55] },
            columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        });

        const safeOrderNumber = String(selectedOrder.quotationNumber || 'pedido').replace(/[^a-zA-Z0-9_-]/g, '-');
        const safeOS = String(selectedOrder.internalOS || 'sem-os').replace(/[^a-zA-Z0-9_-]/g, '-');
        pdf.save(`analise-custos-${safeOS}-${safeOrderNumber}.pdf`);
    };

    // FOOTER DO MODAL ATUALIZADO (sem botÃµes de debug)
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

                    <Button
                        onClick={() => handleOpenCostAnalysis(selectedOrder)}
                        variant="outline"
                        disabled={isLoadingCostAnalysis}
                    >
                        <DollarSign className="mr-2 h-4 w-4" />
                        AnÃ¡lise de Custos
                    </Button>
                    
                    {/* BOTÃƒO LIMPO SEM DEBUG */}
                    <DeliveryReportButton order={selectedOrder} />
                    
                    {/* BotÃ£o Data Book */}
                    {selectedOrder.status === 'ConcluÃ­do' && !selectedOrder.dataBookSent && (
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

    // CORREÃ‡ÃƒO 2: LAYOUT DO RELATÃ“RIO PDF CORRIGIDO
    const handleGenerateDeliveryReport = async (order: Order) => {
      if (!order) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Dados do pedido nÃ£o encontrados.",
        });
        return;
      }

      toast({ title: "Gerando RelatÃ³rio de Entrega...", description: "Por favor, aguarde." });

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
          console.warn("NÃ£o foi possÃ­vel carregar dados da empresa:", error);
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

        // TÃ­tulo do documento
        docPdf.setFontSize(16).setFont('helvetica', 'bold');
        docPdf.text('RELATÃ“RIO DE ENTREGA E PERFORMANCE', pageWidth / 2, yPos, { align: 'center' });
        yPos += 15;

        // InformaÃ§Ãµes do pedido em duas colunas
        docPdf.setFontSize(11).setFont('helvetica', 'normal');
        
        // Coluna esquerda
        const leftColumnX = 15;
        let leftColumnY = yPos;
        docPdf.setFont('helvetica', 'bold');
        docPdf.text('DADOS DO PEDIDO:', leftColumnX, leftColumnY);
        leftColumnY += 6;
        docPdf.setFont('helvetica', 'normal');
        docPdf.text(`Pedido NÂº: ${order.quotationNumber || 'N/A'}`, leftColumnX, leftColumnY);
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
        docPdf.text(`Data de EmissÃ£o: ${format(new Date(), "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
        rightColumnY += 5;
        if (order.deliveryDate) {
            docPdf.text(`Data de Entrega Geral: ${format(order.deliveryDate, "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
            rightColumnY += 5;
        }
        docPdf.text(`Status: ${order.status}`, rightColumnX, rightColumnY);
        
        yPos = Math.max(leftColumnY, rightColumnY) + 15;

        // Ãndice de Performance Geral
        const overallOnTimeRate = analysis.summary.totalItems > 0 ? 
          ((analysis.summary.onTimeItems + analysis.summary.earlyItems) / analysis.summary.totalItems) * 100 : 0;
        
        docPdf.setTextColor(0, 0, 0);
        docPdf.setFontSize(12).setFont('helvetica', 'bold');
        docPdf.text('ÃNDICE GERAL DE PONTUALIDADE:', 15, yPos);
        
        docPdf.setFontSize(20);
        const color = overallOnTimeRate >= 80 ? [34, 197, 94] : overallOnTimeRate >= 60 ? [245, 158, 11] : [239, 68, 68];
        docPdf.setTextColor(color[0], color[1], color[2]);
        docPdf.text(`${overallOnTimeRate.toFixed(1)}%`, pageWidth - 15, yPos + 5, { align: 'right' });
        
        yPos += 25;

        // Cards de performance em linha Ãºnica para economizar espaÃ§o
        docPdf.setTextColor(0, 0, 0);
        docPdf.setFontSize(10).setFont('helvetica', 'bold');
        docPdf.text('RESUMO:', 15, yPos);
        yPos += 8;

        docPdf.setFontSize(9).setFont('helvetica', 'normal');
        const summaryText = `No Prazo: ${analysis.summary.onTimeItems} | Antecipadas: ${analysis.summary.earlyItems} | Atrasadas: ${analysis.summary.lateItems} | Pendentes: ${analysis.summary.pendingItems} | Total: ${analysis.summary.totalItems} itens`;
        docPdf.text(summaryText, 15, yPos);
        yPos += 15;

        // Verificar se precisa de nova pÃ¡gina antes da tabela
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
              deliveryText = 'NÃ£o entregue';
              break;
            default:
              statusText = 'Pendente';
              deliveryText = 'NÃ£o entregue';
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
          head: [['Item', 'CÃ³digo', 'DescriÃ§Ã£o', 'Prevista', 'Real', 'Status', 'LE', 'NF']],
          body: tableBody,
          styles: { 
            fontSize: 6,  // Reduzido para 6
            cellPadding: 1.5, // Reduzido padding
            overflow: 'linebreak',
            valign: 'middle'
          },
          headStyles: { 
            fillColor: [37, 99, 235], 
            fontSize: 7, // CabeÃ§alho um pouco maior
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' }, // Item - reduzido
            1: { cellWidth: 16, halign: 'center' }, // CÃ³digo - reduzido
            2: { cellWidth: 45, halign: 'left' },   // DescriÃ§Ã£o - mantido
            3: { cellWidth: 16, halign: 'center' }, // Prevista - reduzido
            4: { cellWidth: 16, halign: 'center' }, // Real - reduzido
            5: { cellWidth: 20, halign: 'center' }, // Status - reduzido
            6: { cellWidth: 16, halign: 'center' }, // LE - reduzido
            7: { cellWidth: 16, halign: 'center' }, // NF - reduzido
          },
          margin: { left: 15, right: 15 },
          didParseCell: (data) => {
            // Colorir cÃ©lulas baseado no status
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

        // RodapÃ© com resumo executivo
        const finalY = (docPdf as any).lastAutoTable.finalY + 10;
        
        if (finalY + 25 < pageHeight - 20) {
          docPdf.setFontSize(9).setFont('helvetica', 'bold');
          docPdf.text('RESUMO EXECUTIVO:', 15, finalY);
          let summaryY = finalY + 6;
          
          docPdf.setFontSize(8).setFont('helvetica', 'normal');
          docPdf.text(`â€¢ Total: ${analysis.summary.totalItems} itens | Completos: ${analysis.summary.completedItems} | Taxa no prazo: ${(analysis.summary.onTimeRate + analysis.summary.earlyRate).toFixed(1)}%`, 15, summaryY);
          summaryY += 4;
          
          const itemsWithLE = analysis.itemAnalyses.filter(item => item.hasShippingList).length;
          const itemsWithNF = analysis.itemAnalyses.filter(item => item.hasInvoice).length;
          docPdf.text(`â€¢ Lista de Embarque: ${itemsWithLE}/${analysis.summary.totalItems} | Nota Fiscal: ${itemsWithNF}/${analysis.summary.totalItems}`, 15, summaryY);
          
          summaryY += 8;
          docPdf.setFontSize(7).setFont('helvetica', 'italic');
          docPdf.text(
            `RelatÃ³rio gerado em ${format(new Date(), "dd/MM/yyyy 'Ã s' HH:mm")}`,
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
          title: "âœ… RelatÃ³rio Gerado com Sucesso!",
          description: `O arquivo "${filename}" foi baixado com cÃ¡lculo correto de atraso.`,
        });

      } catch (error) {
        console.error("Erro completo ao gerar relatÃ³rio:", error);
        toast({
          variant: "destructive",
          title: "Erro ao Gerar RelatÃ³rio",
          description: `Falha na geraÃ§Ã£o: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        });
      }
    };





return (
    <div className="w-full">
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Pedidos de ProduÃ§Ã£o</h1>
                    <div className="flex items-center gap-4">
                        {/* BotÃµes de visualizaÃ§Ã£o */}
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
                                CalendÃ¡rio
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setViewMode('occupation')}
                                className={`h-8 font-medium ${viewMode === 'occupation'
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                            >
                                <Weight className="mr-2 h-4 w-4" />
                                OcupaÃ§Ã£o
                            </Button>
                        </div>
                        
                        {/* Campo de busca */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nÂº, OS, projeto, cliente..."
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
                        title="Pedidos ConcluÃ­dos"
                        value={dashboardStats.completedOrders.toString()}
                        icon={CheckCircle}
                        description={`${dashboardStats.completedWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg concluÃ­das`}
                    />
                    <StatCard
                        title="Em Andamento"
                        value={dashboardStats.inProgressOrders.toString()}
                        icon={PlayCircle}
                        description={`${dashboardStats.inProgressWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg em produÃ§Ã£o`}
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

                        {/* NOVO FILTRO DE MÃŠS */}
                        <Select value={monthFilter} onValueChange={setMonthFilter}>
                            <SelectTrigger className="w-[240px]">
                                <SelectValue placeholder="MÃªs de Entrega" />
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
                                    Data Book Pendente ({orders.filter(o => o.status === 'ConcluÃ­do' && !o.dataBookSent).length})
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
                                    console.log('ðŸ”¥ FILTRO DATA ALTERADO:', e.target.value);
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
                                Exportar RelatÃ³rio Mensal
                            </Button>
                        )}
                    </div>
                    
                    {/* CARD DE ESTATÃSTICAS DO MÃŠS SELECIONADO */}
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
                                        <p className="text-xs text-muted-foreground">Peso ConcluÃ­do</p>
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
                            
                            {/* Barra de progresso do mÃªs */}
                            <div className="mt-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-muted-foreground">
                                        Progresso de ConclusÃ£o do MÃªs
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
                                    Exportar RelatÃ³rio Completo do MÃªs
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>

                {viewMode === 'list' ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-foreground">Lista de Pedidos</CardTitle>
                            <CardDescription className="text-foreground/80">Acompanhe todos os pedidos de produÃ§Ã£o aprovados.</CardDescription>
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
                                    <CardTitle className="text-foreground">Kanban de Pedidos por MÃªs de Entrega</CardTitle>
                                    <CardDescription className="text-foreground/80">
                                        Visualize os pedidos organizados por mÃªs de entrega com peso total por coluna.
                                        {filteredOrders.length > 0 && (
                                            <span className="ml-2">
                                                {filteredOrders.filter(o => o.deliveryDate || o.status === 'ConcluÃ­do').length} de {filteredOrders.length} pedidos exibidos
                                            </span>
                                        )}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-green-600"></div>
                                        <span>ConcluÃ­do</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-blue-500"></div>
                                        <span>Pronto</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-gray-600"></div>
                                        <span>Em ProduÃ§Ã£o</span>
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
                ) : viewMode === 'occupation' ? (
                    <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>Peso em fabricaÃ§Ã£o</CardDescription>
                                    <CardTitle className="text-2xl text-primary">
                                        {occupationStats.totalInProduction.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">
                                    {occupationStats.totalItems} itens de {occupationStats.totalOrders} pedidos
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>Setores ocupados</CardDescription>
                                    <CardTitle className="text-2xl">{occupationStats.sectors.length}</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">
                                    Etapas atualmente em andamento
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>Aguardando inÃ­cio de etapa</CardDescription>
                                    <CardTitle className="text-2xl text-orange-500">
                                        {occupationStats.waitingWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">
                                    {occupationStats.waitingItems} itens sem etapa em andamento
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>FabricaÃ§Ã£o mÃ©dia mensal</CardDescription>
                                    <CardTitle className="text-2xl text-green-500">
                                        {monthlyProductionStats.average.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg/mÃªs
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground">
                                    MÃ©dia dos Ãºltimos 12 meses
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-3">
                            <Card className="xl:col-span-2">
                                <CardHeader>
                                    <CardTitle>Carga atual por setor</CardTitle>
                                    <CardDescription>
                                        O peso integral de cada item Ã© atribuÃ­do Ã  etapa marcada como Em Andamento.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {occupationStats.sectors.length === 0 ? (
                                        <div className="py-12 text-center text-muted-foreground">
                                            <Weight className="mx-auto mb-3 h-10 w-10" />
                                            Nenhum item possui etapa em andamento nos pedidos exibidos.
                                        </div>
                                    ) : (
                                        <div className="space-y-5">
                                            {occupationStats.sectors.map(sector => (
                                                <div key={sector.stageName} className="space-y-2">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                            <p className="font-semibold text-foreground">{sector.stageName}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {sector.itemCount} itens Â· {sector.orderCount} pedidos
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-semibold">
                                                                {sector.weight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">{sector.percentage.toFixed(1)}% da carga em fabricaÃ§Ã£o</p>
                                                        </div>
                                                    </div>
                                                    <Progress value={sector.percentage} className="h-3" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>ProduÃ§Ã£o concluÃ­da</CardTitle>
                                    <CardDescription>HistÃ³rico mensal em kg dos Ãºltimos 12 meses.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {monthlyProductionStats.months.map(month => {
                                            const maxWeight = Math.max(...monthlyProductionStats.months.map(item => item.weight), 1);
                                            const percentage = (month.weight / maxWeight) * 100;
                                            return (
                                                <div key={month.key} className="grid grid-cols-[70px_1fr_100px] items-center gap-2 text-sm">
                                                    <span className="capitalize text-muted-foreground">{month.label}</span>
                                                    <Progress value={percentage} className="h-2" />
                                                    <span className="text-right font-medium">
                                                        {month.weight.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <Separator className="my-4" />
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Total no perÃ­odo</span>
                                        <span className="font-semibold">
                                            {monthlyProductionStats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Itens por setor</CardTitle>
                                <CardDescription>
                                    Selecione um setor para visualizar os itens que compÃµem sua carga atual.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {occupationStats.sectors.length === 0 ? (
                                    <div className="py-10 text-center text-muted-foreground">
                                        Nenhum item em fabricaÃ§Ã£o.
                                    </div>
                                ) : (
                                    <div className="space-y-3" aria-label="Setores de fabricaÃ§Ã£o">
                                        {occupationStats.sectors.map(sector => (
                                            <details
                                                key={sector.stageName}
                                                className="group overflow-hidden rounded-lg border bg-card"
                                            >
                                                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-semibold text-foreground">{sector.stageName}</p>
                                                            <p className="text-sm text-muted-foreground">
                                                                {sector.itemCount} {sector.itemCount === 1 ? 'item' : 'itens'} Â· {sector.orderCount} {sector.orderCount === 1 ? 'pedido' : 'pedidos'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <p className="font-semibold text-foreground">
                                                            {sector.weight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {sector.percentage.toFixed(1)}% da carga
                                                        </p>
                                                    </div>
                                                </summary>

                                                <div className="border-t bg-muted/10 p-2 md:p-4">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Pedido / OS</TableHead>
                                                                <TableHead>Item</TableHead>
                                                                <TableHead className="text-right">Peso</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {sector.items.map((item, itemIndex) => (
                                                                <TableRow key={`${item.orderId}-${item.itemDescription}-${itemIndex}`}>
                                                                    <TableCell className="font-medium">{item.orderLabel}</TableCell>
                                                                    <TableCell>{item.itemDescription}</TableCell>
                                                                    <TableCell className="text-right font-medium">
                                                                        {item.weight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-foreground">CalendÃ¡rio de Entregas</CardTitle>
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
                                        <span>ConcluÃ­do</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-blue-500"></div>
                                        <span>Pronto</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded bg-gray-600"></div>
                                        <span>Em ProduÃ§Ã£o</span>
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
                                        Os pedidos aparecerÃ£o no calendÃ¡rio quando tiverem data de entrega definida.
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
            console.log('ðŸ”„ Restaurando scroll horizontal ao fechar:', savedPosition);
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
              console.log(`ðŸ”„ Restaurando scroll da coluna ${columnId}:`, savedScroll);
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
          <SheetTitle className="font-headline text-2xl">Pedido NÂº {selectedOrder.quotationNumber}</SheetTitle>
          <SheetDescription>
            Cliente: <span className="font-medium text-foreground">{selectedOrder.customer?.name || 'N/A'}</span>
          </SheetDescription>
        </SheetHeader>

        {/* ConteÃºdo principal */}
        {isEditing ? (
          // MODO DE EDIÃ‡ÃƒO - COM SCROLL CORRIGIDO
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onOrderSubmit)} className="flex flex-col flex-1 min-h-0">
              {/* Ãrea de conteÃºdo com scroll */}
              <div className="flex-1 overflow-hidden py-4">
                <ScrollArea className="h-full pr-4">
                  <div className="space-y-6">
                    {/* InformaÃ§Ãµes BÃ¡sicas do Pedido */}
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
                            <FormControl><Input placeholder="Ex: AmpliaÃ§Ã£o Planta XPTO" {...field} value={field.value ?? ''} /></FormControl>
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
                                  <SelectItem value="Aguardando ProduÃ§Ã£o">Aguardando ProduÃ§Ã£o</SelectItem>
                                  <SelectItem value="Em ProduÃ§Ã£o">Em ProduÃ§Ã£o</SelectItem>
                                  <SelectItem value="Pronto para Entrega">Pronto para Entrega</SelectItem>
                                  <SelectItem value="ConcluÃ­do">ConcluÃ­do</SelectItem>
                                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Controle de Data Book */}
                      {form.watch("status") === "ConcluÃ­do" && (
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
                            <FormLabel>NÂº Pedido (Compra)</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="NÂº do Pedido de Compra do Cliente" 
                                {...field} 
                                value={field.value ?? ''} 
                                onChange={(e) => {
                                  console.log('ðŸ“ [DEBUG] NÃºmero do pedido alterado:', e.target.value);
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
                                  console.log('ðŸ”¥ DATA ENTREGA ALTERADA:', e.target.value);
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
                              <FormLabel>Desenhos TÃ©cnicos</FormLabel>
                              <FormDescription>Marque se os desenhos foram recebidos e estÃ£o na pasta.</FormDescription>
                            </div>
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          </FormItem>
                        )}/>
                        <FormField control={form.control} name="documents.inspectionTestPlan" render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                              <FormLabel>Plano de InspeÃ§Ã£o e Testes (PIT)</FormLabel>
                              <FormDescription>Marque se o plano de inspeÃ§Ã£o foi recebido.</FormDescription>
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

                    {/* Itens do Pedido - MODO DE EDIÃ‡ÃƒO COM ADICIONAR/REMOVER */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Itens do Pedido (EditÃ¡vel)</span>
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
                            <p className="text-xs">Este pedido nÃ£o possui itens cadastrados.</p>
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
                                {/* BotÃ£o de ExclusÃ£o no Canto Superior Direito */}
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

                                <div className="space-y-4 pr-10"> {/* Adicionar padding-right para evitar sobreposiÃ§Ã£o com botÃ£o */}
                                  {/* Header do Item com NÃºmero */}
                                  <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                                    <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                                      {index + 1}
                                    </div>
                                    <h4 className="font-medium text-sm text-muted-foreground">
                                      Item do Pedido {index + 1}
                                      {itemProgress === 100 && (
                                        <Badge variant="default" className="ml-2 bg-green-600 hover:bg-green-600/90">
                                          <CheckCircle className="mr-1 h-3 w-3" />
                                          ConcluÃ­do
                                        </Badge>
                                      )}
                                    </h4>
                                  </div>

                                  <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>DescriÃ§Ã£o do Item</FormLabel>
                                      <FormControl>
                                        <Textarea 
                                          placeholder="DescriÃ§Ã£o completa do item" 
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
                                        <FormLabel>NÂº Item PC</FormLabel>
                                        <FormControl>
                                          <Input placeholder="Ex: 001" {...field} value={field.value || ''} />
                                        </FormControl>
                                        <FormMessage />
                                        <FormDescription className="text-xs">
                                          NÂº do item conforme Pedido de Compra do cliente
                                        </FormDescription>
                                      </FormItem>
                                    )}/>

                                    <FormField control={form.control} name={`items.${index}.code`} render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>CÃ³digo</FormLabel>
                                        <FormControl>
                                          <Input placeholder="CÃ³d. Produto" {...field} value={field.value || ''} />
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
                                                console.log('ðŸ“… [ITEM DELIVERY] MudanÃ§a detectada:', e.target.value);
                                                if (e.target.value) {
                                                  // Criar data de forma mais robusta
                                                  const [year, month, day] = e.target.value.split('-').map(Number);
                                                  const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                                                  console.log('ðŸ“… [ITEM DELIVERY] Nova data criada:', newDate);
                                                  field.onChange(newDate);
                                                } else {
                                                  console.log('ðŸ“… [ITEM DELIVERY] Data limpa');
                                                  field.onChange(null);
                                                }
                                              }}
                                              className="w-full"
                                              placeholder="Selecione a data de entrega"
                                            />
                                          </FormControl>
                                          <FormMessage />
                                          <FormDescription className="text-xs text-muted-foreground">
                                            Data especÃ­fica de entrega deste item (opcional)
                                          </FormDescription>
                                        </FormItem>
                                      )}
                                    />
                                  </div>

                                  {/* SeÃ§Ã£o de Embarque para Itens ConcluÃ­dos */}
                                  {itemProgress === 100 && (
                                    <>
                                      <Separator className="my-3" />
                                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                          <CheckCircle className="h-5 w-5 text-green-600" />
                                          <h5 className="font-semibold text-green-800">Item ConcluÃ­do - Preencha as InformaÃ§Ãµes de Embarque</h5>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                          <FormField control={form.control} name={`items.${index}.shippingList`} render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Lista de Embarque (LE)</FormLabel>
                                              <FormControl>
                                                <Input placeholder="NÂº da LE" {...field} value={field.value ?? ''} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}/>

                                          <FormField control={form.control} name={`items.${index}.invoiceNumber`} render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Nota Fiscal (NF-e) *</FormLabel>
                                              <FormControl>
                                                <Input placeholder="NÂº da NF-e" {...field} value={field.value ?? ''} />
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
                                                      console.log('ðŸ“… [SHIPPING] MudanÃ§a detectada:', e.target.value);
                                                      if (e.target.value) {
                                                        const [year, month, day] = e.target.value.split('-').map(Number);
                                                        const newDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                                                        console.log('ðŸ“… [SHIPPING] Nova data criada:', newDate);
                                                        field.onChange(newDate);
                                                      } else {
                                                        console.log('ðŸ“… [SHIPPING] Data limpa');
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

                                        {/* Indicador de Atraso/AntecipaÃ§Ã£o */}
                                        {watchedItems[index]?.shippingDate && selectedOrder.deliveryDate && (
                                          <div className="mt-3">
                                            {new Date(watchedItems[index].shippingDate) <= selectedOrder.deliveryDate ? (
                                              <div className="flex items-center gap-2 p-2 bg-green-100 border border-green-300 rounded text-sm text-green-800">
                                                <CheckCircle className="h-4 w-4" />
                                                <span className="font-medium">Item serÃ¡ entregue no prazo</span>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2 p-2 bg-red-100 border border-red-300 rounded text-sm text-red-800">
                                                <AlertTriangle className="h-4 w-4" />
                                                <span className="font-medium">
                                                  Item serÃ¡ entregue {Math.ceil((new Date(watchedItems[index].shippingDate).getTime() - selectedOrder.deliveryDate.getTime()) / (1000 * 60 * 60 * 24))} dia(s) apÃ³s o prazo
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        <p className="text-xs text-muted-foreground mt-2">
                                          * Campos obrigatÃ³rios para finalizaÃ§Ã£o do embarque
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
              
              {/* Footer fixo com botÃµes */}
              <div className="flex-shrink-0 pt-4 border-t bg-background">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-sm text-muted-foreground">
                    <span>Itens: {fields.length}</span>
                    <span className="mx-2">â€¢</span>
                    <span>Peso Total: <span className="font-semibold">{currentTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting || fields.length === 0}>
                      {form.formState.isSubmitting ? "Salvando..." : "Salvar AlteraÃ§Ãµes"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        ) : (
          // MODO DE VISUALIZAÃ‡ÃƒO - MANTÃ‰M ESTRUTURA ORIGINAL
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-hidden py-4">
              <ScrollArea className="h-full pr-4">
                <div className="space-y-6">
                  {/* InformaÃ§Ãµes Gerais */}
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
                            <p className="font-medium">Desenhos TÃ©cnicos</p>
                            <p className="text-sm text-muted-foreground">{selectedOrder.documents?.drawings ? 'Recebido' : 'Pendente'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className={`p-2 rounded-full ${selectedOrder.documents?.inspectionTestPlan ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                            <ClipboardCheck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">Plano de InspeÃ§Ã£o</p>
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
                            Cancelar CÃ³pia
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
                                  {item.code && <p className="text-sm text-muted-foreground">CÃ³digo: {item.code}</p>}
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
                                <span className="text-muted-foreground">NÂº Item PC:</span>
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
                                    <h5 className="font-semibold text-green-800">Item ConcluÃ­do - InformaÃ§Ãµes de Embarque</h5>
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
                                          Entregue {Math.ceil((item.shippingDate.getTime() - selectedOrder.deliveryDate.getTime()) / (1000 * 60 * 60 * 24))} dia(s) apÃ³s o prazo
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

                        {/* FormulÃ¡rio para adicionar novo item */}
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
                                  <Label htmlFor="new-description" className="text-blue-800">DescriÃ§Ã£o do Item *</Label>
                                  <Textarea
                                    id="new-description"
                                    placeholder="DescriÃ§Ã£o completa do item"
                                    value={newItemForm.description}
                                    onChange={(e) => setNewItemForm(prev => ({ ...prev, description: e.target.value }))}
                                    className="min-h-[80px] border-blue-300 focus:border-blue-500"
                                  />
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div>
                                    <Label htmlFor="new-itemNumber" className="text-blue-800">NÂº Item PC</Label>
                                    <Input
                                      id="new-itemNumber"
                                      placeholder="Ex: 001"
                                      value={newItemForm.itemNumber}
                                      onChange={(e) => setNewItemForm(prev => ({ ...prev, itemNumber: e.target.value }))}
                                      className="border-blue-300 focus:border-blue-500"
                                    />
                                  </div>

                                  <div>
                                    <Label htmlFor="new-code" className="text-blue-800">CÃ³digo</Label>
                                    <Input
                                      id="new-code"
                                      placeholder="CÃ³d. Produto"
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
            
            {/* Footer de visualizaÃ§Ã£o limpo */}
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

    <Dialog open={isCostAnalysisOpen} onOpenChange={setIsCostAnalysisOpen}>
      <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            AnÃ¡lise de Custos da OS {selectedOrder?.internalOS || 'N/A'}
          </DialogTitle>
          <DialogDescription>
            Pedido {selectedOrder?.quotationNumber || 'N/A'} â€” {selectedOrder?.customer?.name || 'Cliente nÃ£o informado'}.
            Os valores representam custos de fabricaÃ§Ã£o salvos na calculadora de preÃ§os, multiplicados pela quantidade do pedido.
          </DialogDescription>
        </DialogHeader>

        {isLoadingCostAnalysis ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        ) : costAnalysis ? (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Itens do pedido</p>
                <p className="text-2xl font-bold">{costAnalysis.items.length}</p>
              </Card>
              <Card className="p-4 border-green-600/40">
                <p className="text-xs text-muted-foreground">Com precificaÃ§Ã£o</p>
                <p className="text-2xl font-bold text-green-600">{costAnalysis.pricedItems}</p>
              </Card>
              <Card className="p-4 border-amber-600/40">
                <p className="text-xs text-muted-foreground">Sem precificaÃ§Ã£o</p>
                <p className="text-2xl font-bold text-amber-600">{costAnalysis.unpricedItems}</p>
              </Card>
              <Card className="p-4 border-primary/50 bg-primary/5">
                <p className="text-xs text-muted-foreground">Custo total da OS</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(costAnalysis.grandTotal)}</p>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Custos por item</CardTitle>
                <CardDescription>Itens sem precificaÃ§Ã£o salva sÃ£o apresentados com custo zero.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CÃ³digo</TableHead>
                        <TableHead>DescriÃ§Ã£o</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">Custo unitÃ¡rio</TableHead>
                        <TableHead className="text-right">Custo total</TableHead>
                        <TableHead>SituaÃ§Ã£o</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costAnalysis.items.map(item => (
                        <TableRow key={item.itemId}>
                          <TableCell className="font-mono text-xs">{item.code}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-right">{item.quantity.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(item.unitCost)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{formatCurrency(item.totalCost)}</TableCell>
                          <TableCell>
                            <Badge variant={item.hasSavedPricing ? 'default' : 'secondary'} className={item.hasSavedPricing ? 'bg-green-600' : 'text-amber-700'}>
                              {item.hasSavedPricing ? 'PrecificaÃ§Ã£o salva' : 'Sem precificaÃ§Ã£o'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex justify-between"><span>Materiais</span><strong>{formatCurrency(costAnalysis.materialTotal)}</strong></div>
                <div className="flex justify-between"><span>ProduÃ§Ã£o / mÃ£o de obra</span><strong>{formatCurrency(costAnalysis.productionTotal)}</strong></div>
                <div className="flex justify-between"><span>Usinagem</span><strong>{formatCurrency(costAnalysis.machiningTotal)}</strong></div>
                <div className="flex justify-between"><span>Insumos e consumÃ­veis</span><strong>{formatCurrency(costAnalysis.consumablesTotal)}</strong></div>
              </div>
              <Separator className="my-4" />
              <div className="flex justify-between items-center text-lg">
                <span className="font-semibold">Custo total de fabricaÃ§Ã£o da OS</span>
                <span className="font-bold text-primary">{formatCurrency(costAnalysis.grandTotal)}</span>
              </div>
            </Card>
          </div>
        ) : null}

        <DialogFooter className="flex-shrink-0 pt-3 border-t">
          <Button variant="outline" onClick={() => setIsCostAnalysisOpen(false)}>Fechar</Button>
          <Button onClick={handleExportCostAnalysis} disabled={!costAnalysis || isLoadingCostAnalysis}>
            <Download className="mr-2 h-4 w-4" />
            Exportar anÃ¡lise em PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={isProgressModalOpen} onOpenChange={setIsProgressModalOpen}>
      <DialogContent className="sm:max-w-6xl lg:max-w-7xl w-[95vw] h-[95vh] flex flex-col overflow-hidden">
        {/* Header fixo */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Progresso do Item: {itemToTrack?.description}</DialogTitle>
          <DialogDescription>
            Atualize o status e as datas para cada etapa de fabricaÃ§Ã£o. O cronograma serÃ¡ calculado automaticamente considerando apenas dias Ãºteis.
          </DialogDescription>
          
          {/* DEBUG - REMOVER DEPOIS */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-blue-600" />
              <p className="text-sm text-blue-800">
                <strong>Importante:</strong> O sistema considera apenas dias Ãºteis (segunda a sexta-feira), excluindo feriados nacionais brasileiros. Suporta valores decimais (ex: 0.5 para meio dia, 1.5 para 1 dia e meio).
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Barra de progresso no cabeÃ§alho */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Progresso: {editedPlan.filter(s => s.status === 'ConcluÃ­do').length} de {editedPlan.length} etapas
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round((editedPlan.filter(s => s.status === 'ConcluÃ­do').length / editedPlan.length) * 100)}%
            </span>
          </div>
          <Progress 
            value={(editedPlan.filter(s => s.status === 'ConcluÃ­do').length / editedPlan.length) * 100} 
            className="h-2" 
          />
        </div>

        {/* AÃ§Ãµes em lote */}
        <div className="px-6 py-3 border-b">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => autoScheduleFromToday()}
              size="sm"
            >
              ðŸ“… Agendar a partir de hoje
            </Button>
            <Button 
              variant="outline" 
              onClick={() => markPreviousAsCompleted()}
              size="sm"
            >
              âœ… Marcar anteriores como concluÃ­das
            </Button>
            <Button 
              variant="outline" 
              onClick={() => applyStandardDurations()}
              size="sm"
            >
              â±ï¸ Aplicar duraÃ§Ãµes padrÃ£o
            </Button>
          </div>
        </div>

        {/* Ãrea de conteÃºdo com scroll */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[1200px] p-4">
            {isFetchingPlan ? (
              <div className="flex justify-center items-center h-48">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p>Buscando plano de fabricaÃ§Ã£o...</p>
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
                      <TableHead className="w-32">InÃ­cio</TableHead>
                      <TableHead className="w-32">Fim</TableHead>
                      <TableHead className="w-24">DuraÃ§Ã£o</TableHead>
                      <TableHead className="w-40">HorÃ¡rio</TableHead>
                      <TableHead className="w-20">AÃ§Ãµes</TableHead>
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
                                <SelectItem value="ConcluÃ­do">ConcluÃ­do</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {stage.status === 'ConcluÃ­do' ? (
                              <div className="text-green-700 font-medium">
                                {stage.startDate ? format(stage.startDate, "dd/MM") : '-'}
                              </div>
                            ) : (
                              <ScheduleDateInput
                                key={`start-${index}-${stage.startDate ? format(stage.startDate, "yyyy-MM-dd") : 'empty'}`}
                                date={stage.startDate}
                                onCommit={(newDate) => handlePlanChange(index, 'startDate', newDate)}
                                className="h-8"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {stage.status === 'ConcluÃ­do' ? (
                              <div className="text-green-700 font-medium">
                                {stage.completedDate ? format(stage.completedDate, "dd/MM") : '-'}
                              </div>
                            ) : (
                              <ScheduleDateInput
                                key={`end-${index}-${stage.completedDate ? format(stage.completedDate, "yyyy-MM-dd") : 'empty'}`}
                                date={stage.completedDate}
                                onCommit={(newDate) => handlePlanChange(index, 'completedDate', newDate)}
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
                                // Automaticamente ajusta useBusinessDays baseado na seleÃ§Ã£o
                                const useBusinessDays = value === 'normal';
                                handlePlanChange(index, 'useBusinessDays', useBusinessDays);
                              }}
                            >
                              <SelectTrigger className="h-10 w-full">
                                <SelectValue placeholder="Selecionar horÃ¡rio" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="normal">
                                  <div className="flex items-center gap-3 py-1">
                                    <CalendarDays className="h-4 w-4 text-blue-500" />
                                    <div className="text-left">
                                      <div className="font-medium">Normal</div>
                                      <div className="text-xs text-muted-foreground">Dias Ãºteis apenas</div>
                                    </div>
                                  </div>
                                </SelectItem>
                                <SelectItem value="especial">
                                  <div className="flex items-center gap-3 py-1">
                                    <Clock className="h-4 w-4 text-orange-500" />
                                    <div className="text-left">
                                      <div className="font-medium">Especial</div>
                                      <div className="text-xs text-muted-foreground">IncluÃ­ fins de semana</div>
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
                <p className="text-lg font-medium">Nenhuma etapa de fabricaÃ§Ã£o definida</p>
                <p className="text-sm">VocÃª pode definir as etapas na tela de Produtos ou adicionar manualmente abaixo.</p>
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
          <AlertDialogTitle>VocÃª tem certeza?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta aÃ§Ã£o nÃ£o pode ser desfeita. Isso excluirÃ¡ permanentemente o pedido NÂº <span className="font-bold">{orderToDelete?.quotationNumber}</span> do sistema.
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

    {/* Alert Dialog para ExclusÃ£o de Itens */}
    <AlertDialog open={isItemDeleteDialogOpen} onOpenChange={setIsItemDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Item do Pedido</AlertDialogTitle>
          <AlertDialogDescription>
            VocÃª tem certeza que deseja remover este item do pedido?
            {itemToDelete && (
              <div className="mt-2 p-3 bg-muted rounded-lg">
                <p className="font-medium text-foreground">
                  Item {itemToDelete.index + 1}: {itemToDelete.item.description}
                </p>
                {itemToDelete.item.itemNumber && (
                  <p className="text-sm text-muted-foreground">
                    NÂº Item PC: {itemToDelete.item.itemNumber}
                  </p>
                )}
                {itemToDelete.item.code && (
                  <p className="text-sm text-muted-foreground">
                    CÃ³digo: {itemToDelete.item.code}
                  </p>
                )}
              </div>
            )}
            <p className="mt-2 text-sm">
              <strong>AtenÃ§Ã£o:</strong> Esta aÃ§Ã£o nÃ£o pode ser desfeita. O item serÃ¡ removido permanentemente do pedido.
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
                    Ajuste a quantidade de peÃ§as de cada item que serÃ¡ incluÃ­da no romaneio. O peso serÃ¡ calculado automaticamente.
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
                                                        CÃ³digo: {item.code || 'N/A'} | Item PC: {item.itemNumber || 'N/A'}
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
                                                        Romaneio parcial: {selectedQty} de {item.quantity} peÃ§as ({((selectedQty / item.quantity) * 100).toFixed(0)}%)
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
