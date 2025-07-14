"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, getDoc, Timestamp, deleteDoc } from "firebase/firestore";
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
import { Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle, Weight, CalendarDays, Edit, X, CalendarIcon, Truck, AlertTriangle, FolderGit2, FileText, File, ClipboardCheck, Palette, ListChecks, GanttChart, Trash2, Copy, ClipboardPaste, ReceiptText, CalendarClock, ClipboardList, PlusCircle, XCircle as XCircleIcon, ArrowDown, CalendarCheck, QrCode } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { getNextBusinessDay, getPreviousBusinessDay } from './utils/businessDays'; // ajuste o caminho conforme necessário

const productionStageSchema = z.object({
    stageName: z.string(),
    status: z.string(),
    startDate: z.date().nullable().optional(),
    completedDate: z.date().nullable().optional(),
    durationDays: z.coerce.number().min(0).optional(),
    useBusinessDays: z.boolean().optional().default(true), // true = dias úteis, false = dias corridos
});

const orderItemSchema = z.object({
    id: z.string().optional(),
    code: z.string().optional(),
    product_code: z.string().optional(),
    description: z.string().min(1, "A descrição é obrigatória."),
    quantity: z.coerce.number().min(0, "A quantidade não pode ser negativa."),
    unitWeight: z.coerce.number().min(0, "O peso não pode ser negativo.").optional(),
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
  items: z.array(orderItemSchema),
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

const getNextBusinessDay = (fromDate) => {
  console.log('🔍 Buscando próximo dia útil a partir de:', fromDate);
  let nextDay = new Date(fromDate);
  do {
    nextDay.setDate(nextDay.getDate() + 1);
    console.log('🔍 Testando dia:', nextDay, 'É dia útil?', isBusinessDay(nextDay));
  } while (!isBusinessDay(nextDay));
  console.log('✅ Próximo dia útil encontrado:', nextDay);
  return nextDay;
};

const getPreviousBusinessDay = (fromDate) => {
  console.log('🔍 Buscando dia útil anterior a partir de:', fromDate);
  let prevDay = new Date(fromDate);
  do {
    prevDay.setDate(prevDay.getDate() - 1);
    console.log('🔍 Testando dia:', prevDay, 'É dia útil?', isBusinessDay(prevDay));
  } while (!isBusinessDay(prevDay));
  console.log('✅ Dia útil anterior encontrado:', prevDay);
  return prevDay;
};

// Componente para exibir informações de dias úteis
interface BusinessDayInfoProps {
  startDate: Date | null;
  endDate: Date | null;
  expectedDuration: number;
}

function BusinessDayInfo({ startDate, endDate, expectedDuration }: BusinessDayInfoProps) {
  if (!startDate || !endDate) return null;
  
  const expectedDurationNum = Number(expectedDuration) || 0;
  const isSameDate = isSameDay(startDate, endDate);
  const isNextDay = !isSameDate && isSameDay(endDate, addDays(startDate, 1));
  
  return (
    <div className="text-xs mt-2 p-2 rounded bg-blue-50 text-blue-700 border border-blue-200">
      <div className="flex items-center gap-2">
        <span className="font-medium">Duração:</span>
        <span>{expectedDurationNum} dia(s)</span>
      </div>
      
      {isSameDate && (
        <p className="text-blue-600 mt-1">
          ✓ Tarefa executada no mesmo dia (acúmulo &lt; 1 dia)
        </p>
      )}
      
      {isNextDay && (
        <p className="text-green-600 mt-1">
          ✓ Tarefa termina no próximo dia (acúmulo excedeu 1 dia)
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
        💡 Tarefas se acumulam no mesmo dia até somar ≥ 1 dia, então a tarefa que exceder termina no próximo dia útil
      </p>
    </div>
  );
}

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
                        <TableCell colSpan={9} className="h-24 text-center">Nenhum pedido encontrado com os filtros atuais.</TableCell>
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
                            <TableCell className="text-right font-medium">
                                {(order.totalWeight || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <Progress value={orderProgress} className="h-2" />
                                    <span className="text-xs font-medium text-muted-foreground">{Math.round(orderProgress)}%</span>
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
    const [isEditing, setIsEditing] = useState(false);
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

    // Progress tracking state
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [itemToTrack, setItemToTrack] = useState<OrderItem | null>(null);
    const [editedPlan, setEditedPlan] = useState<ProductionStage[]>([]);
    const [isFetchingPlan, setIsFetchingPlan] = useState(false);
    const [progressClipboard, setProgressClipboard] = useState<OrderItem | null>(null);
    const [newStageNameForPlan, setNewStageNameForPlan] = useState("");
    
    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [customers, setCustomers] = useState<CustomerInfo[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [customerFilter, setCustomerFilter] = useState<string>("all");
    const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);

    const form = useForm<z.infer<typeof orderSchema>>({
        resolver: zodResolver(orderSchema),
    });

    const { fields } = useFieldArray({
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
                const data = doc.data();
                const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date());
                const deliveryDate = data.deliveryDate?.toDate ? data.deliveryDate.toDate() : undefined;
                
                const enrichedItems = (data.items || []).map((item: any, index: number) => {
                    const itemCode = item.code || item.product_code || '';
                    const enrichedItem = { 
                        ...item, 
                        id: item.id || `${doc.id}-${index}`,
                        code: itemCode,
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
                        startDate: p.startDate?.toDate ? p.startDate.toDate() : null,
                        completedDate: p.completedDate?.toDate ? p.completedDate.toDate() : null,
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
                        itemDeliveryDate: item.itemDeliveryDate?.toDate() || deliveryDate,
                        shippingList: item.shippingList || '',
                        invoiceNumber: item.invoiceNumber || '',
                        shippingDate: item.shippingDate?.toDate() || null,
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
                    totalWeight: calculateTotalWeight(enrichedItems),
                    driveLink: data.driveLink || '',
                    documents: data.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
                } as Order;
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

    // Debug dos componentes para verificar se estão carregados corretamente
    useEffect(() => {
        console.log('🔍 Verificando componentes:', {
            Popover: typeof Popover,
            Calendar: typeof Calendar,
            PopoverTrigger: typeof PopoverTrigger,
            PopoverContent: typeof PopoverContent
        });
    }, []);

    const handleViewOrder = (order: Order) => {
        setSelectedOrder(order);
        form.reset({
            ...order,
            status: order.status as any,
            documents: order.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
        });
        setIsEditing(false);
        setSelectedItems(new Set());
        setIsSheetOpen(true);
    };

    const onOrderSubmit = async (values: z.infer<typeof orderSchema>) => {
        if (!selectedOrder) return;
    
        try {
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            
            const itemsToSave = values.items.map(formItem => {
                const originalItem = selectedOrder.items.find(i => i.id === formItem.id);
                const planToSave = originalItem?.productionPlan?.map(p => ({
                    ...p,
                    startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : p.startDate,
                    completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : p.completedDate,
                })) || [];

                return {
                    ...formItem,
                    itemDeliveryDate: formItem.itemDeliveryDate ? Timestamp.fromDate(new Date(formItem.itemDeliveryDate)) : null,
                    shippingDate: formItem.shippingDate ? Timestamp.fromDate(new Date(formItem.shippingDate)) : null,
                    productionPlan: planToSave,
                };
            });
    
            const totalWeight = calculateTotalWeight(itemsToSave);
            
            const dataToSave = {
                customer: values.customer,
                customerId: values.customer.id,
                customerName: values.customer.name,
                internalOS: values.internalOS,
                projectName: values.projectName,
                quotationNumber: values.quotationNumber,
                deliveryDate: values.deliveryDate ? Timestamp.fromDate(new Date(values.deliveryDate)) : null,
                status: values.status,
                driveLink: values.driveLink,
                documents: values.documents,
                items: itemsToSave,
                totalWeight: totalWeight,
            };
    
            await updateDoc(orderRef, dataToSave);
    
            toast({
                title: "Pedido atualizado!",
                description: "Os dados do pedido foram salvos com sucesso.",
            });

            // Manually update the state for immediate feedback
            const updatedOrderForState: Order = {
                ...selectedOrder,
                quotationNumber: values.quotationNumber!,
                deliveryDate: values.deliveryDate ? new Date(values.deliveryDate) : undefined,
                customer: values.customer,
                projectName: values.projectName,
                internalOS: values.internalOS,
                status: values.status,
                driveLink: values.driveLink,
                documents: values.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
                items: values.items.map(item => ({
                    ...item,
                    itemDeliveryDate: item.itemDeliveryDate ? new Date(item.itemDeliveryDate) : undefined,
                    shippingDate: item.shippingDate ? new Date(item.shippingDate) : undefined,
                    productionPlan: (item.productionPlan || []).map(p => ({
                        ...p,
                        startDate: p.startDate ? new Date(p.startDate) : undefined,
                        completedDate: p.completedDate ? new Date(p.completedDate) : undefined,
                    })) as any
                })),
                totalWeight: totalWeight,
            };

            setOrders(prevOrders => 
                prevOrders.map(o => (o.id === updatedOrderForState.id ? updatedOrderForState : o))
            );
            
            setSelectedOrder(updatedOrderForState);
            
            form.reset({
                ...updatedOrderForState,
                status: updatedOrderForState.status as any,
            });
    
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating order:", error);
            toast({
                variant: "destructive",
                title: "Erro ao salvar",
                description: "Não foi possível atualizar o pedido.",
            });
        }
    };
    
    const uniqueStatuses = useMemo(() => {
        const statuses = new Set(orders.map(order => order.status).filter(Boolean));
        return Array.from(statuses);
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

            return textMatch && statusMatch && customerMatch && dateMatch;
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
    }, [orders, searchQuery, statusFilter, customerFilter, dateFilter]);
    
    const watchedItems = form.watch("items");
    const currentTotalWeight = useMemo(() => calculateTotalWeight(watchedItems || []), [watchedItems]);

    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("all");
        setCustomerFilter("all");
        setDateFilter(undefined);
    };

    const hasActiveFilters = searchQuery || statusFilter !== 'all' || customerFilter !== 'all' || dateFilter;

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



    const handlePlanChange = (stageIndex: number, field: string, value: any) => {
      console.log('🔧 Alterando:', { stageIndex, field, value });
      
      // Cria uma nova instância do array imutável
      const newPlan = [...editedPlan];
      const updatedStage = { ...newPlan[stageIndex] };
      
      // Atualiza o campo específico - SIMPLIFICADO
      if (field === 'startDate' || field === 'completedDate') {
        if (value === null || value === '') {
          updatedStage[field] = null;
        } else {
          // Correção simples para fuso horário
          const inputDate = new Date(value + 'T00:00:00');
          updatedStage[field] = inputDate;
        }
      } else if (field === 'durationDays') {
        const numValue = value === '' ? 0 : parseFloat(value);
        updatedStage[field] = isNaN(numValue) ? 0 : Math.max(0.125, numValue);
      } else {
        updatedStage[field] = value;
      }
      
      // Atualiza o array com a nova instância
      newPlan[stageIndex] = updatedStage;
      
      // RECÁLCULO SIMPLIFICADO - SÓ QUANDO NECESSÁRIO
      if (field === 'durationDays' || field === 'useBusinessDays') {
        console.log('🎯 Recalculando por alteração de duração/tipo');
        recalculateFromFirstStage(newPlan);
      } else if (field === 'startDate' && stageIndex === 0) {
        // APENAS quando alterar data da PRIMEIRA etapa
        console.log('🎯 Recalculando a partir da primeira etapa');
        recalculateFromFirstStage(newPlan);
      }
      
      // Atualiza o estado
      setEditedPlan(newPlan);
    };

    // Função simplificada de recálculo
    const recalculateFromFirstStage = (plan: ProductionStage[]) => {
      console.log('🔄 Recalculando cronograma...');
      
      let currentWorkingDate: Date | null = null;
      let dailyAccumulation = 0;
      
      for (let i = 0; i < plan.length; i++) {
        const stage = plan[i];
        const duration = Math.max(0.125, Number(stage.durationDays) || 1);
        const useBusinessDaysOnly = stage.useBusinessDays !== false;
        
        if (i === 0) {
          // Primeira etapa - usa data definida pelo usuário
          if (stage.startDate) {
            currentWorkingDate = new Date(stage.startDate);
            dailyAccumulation = 0;
          } else {
            // Se não há data na primeira etapa, limpa todas as outras
            for (let j = 1; j < plan.length; j++) {
              plan[j].startDate = null;
              plan[j].completedDate = null;
            }
            return;
          }
        } else {
          // Etapas subsequentes - calcula a partir da anterior
          if (currentWorkingDate) {
            if (!useBusinessDaysOnly) {
              // Dias corridos
              stage.startDate = new Date(currentWorkingDate);
              stage.startDate.setDate(stage.startDate.getDate() + 1);
            } else {
              // Dias úteis
              stage.startDate = getNextBusinessDay(new Date(currentWorkingDate));
            }
          } else {
            stage.startDate = null;
            stage.completedDate = null;
            continue;
          }
        }
        
        // Calcula data de conclusão
        if (stage.startDate) {
          if (!useBusinessDaysOnly) {
            // Dias corridos
            stage.completedDate = new Date(stage.startDate);
            stage.completedDate.setDate(stage.completedDate.getDate() + Math.ceil(duration));
            currentWorkingDate = new Date(stage.completedDate);
            dailyAccumulation = 0;
          } else {
            // Dias úteis com acúmulo
            if (i === 0) {
              dailyAccumulation = duration;
            } else {
              dailyAccumulation += duration;
            }
            
            if (dailyAccumulation >= 1) {
              const daysToAdd = Math.ceil(dailyAccumulation);
              stage.completedDate = addBusinessDays(stage.startDate, daysToAdd);
              currentWorkingDate = new Date(stage.completedDate);
              dailyAccumulation = dailyAccumulation - daysToAdd;
            } else {
              stage.completedDate = new Date(stage.startDate);
              currentWorkingDate = new Date(stage.startDate);
            }
          }
        }
      }
    };

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
    
    const handleGeneratePackingSlip = async () => {
        if (!selectedOrder || selectedItems.size === 0) return;
    
        toast({ title: "Gerando Romaneio...", description: "Por favor, aguarde." });
    
        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const docSnap = await getDoc(companyRef);
            const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
            
            const itemsToInclude = selectedOrder.items.filter(item => selectedItems.has(item.id!));
            const totalWeightOfSelection = calculateTotalWeight(itemsToInclude);
            
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
            
            docPdf.setFontSize(9).setFont('helvetica', 'normal');
            if (companyData.endereco) {
                const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
                docPdf.text(addressLines, textX, textY);
                textY += (addressLines.length * 4);
            }
            if (companyData.cnpj) {
                docPdf.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
            }
            
            yPos = 55;
            docPdf.setFontSize(14).setFont('helvetica', 'bold');
            docPdf.text('ROMANEIO DE ENTREGA', pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;
    
            docPdf.setFontSize(11).setFont('helvetica', 'normal');
            docPdf.text(`Cliente: ${selectedOrder.customer.name}`, 15, yPos);
            docPdf.text(`Data de Emissão: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 7;
            
            docPdf.text(`Pedido Nº: ${selectedOrder.quotationNumber}`, 15, yPos);
            if (selectedOrder.deliveryDate) {
                docPdf.text(`Data de Entrega: ${format(selectedOrder.deliveryDate, "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
            }
            yPos += 7;

            docPdf.text(`OS Interna: ${selectedOrder.internalOS || 'N/A'}`, 15, yPos);
            yPos += 12;
    
            const tableBody = itemsToInclude.map(item => {
                const itemTotalWeight = (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0);
                return [
                    item.code || '-',
                    item.description,
                    item.quantity.toString(),
                    (Number(item.unitWeight) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                    itemTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                ];
            });
            
            autoTable(docPdf, {
                startY: yPos,
                head: [['Cód.', 'Descrição', 'Qtd.', 'Peso Unit. (kg)', 'Peso Total (kg)']],
                body: tableBody,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255, halign: 'center' },
                columnStyles: {
                    0: { cellWidth: 20 },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 20, halign: 'center' },
                    3: { cellWidth: 30, halign: 'center' },
                    4: { cellWidth: 30, halign: 'center' },
                }
            });
    
            let finalY = (docPdf as any).lastAutoTable.finalY;
            const footerStartY = pageHeight - 35;

            if (finalY + 20 > footerStartY) {
                docPdf.addPage();
                finalY = 15;
            }
    
            docPdf.setFontSize(12).setFont('helvetica', 'bold');
            docPdf.text(
                `Peso Total dos Itens: ${totalWeightOfSelection.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`, 
                pageWidth - 15, finalY + 15, { align: 'right' }
            );

            docPdf.setFontSize(10).setFont('helvetica', 'normal');
            docPdf.text('Recebido por:', 15, footerStartY);
            docPdf.line(40, footerStartY, 120, footerStartY);
            docPdf.text('Data:', 15, footerStartY + 10);
            docPdf.line(28, footerStartY + 10, 85, footerStartY + 10);
    
            docPdf.save(`Romaneio_${selectedOrder.quotationNumber}.pdf`);
            
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
            let productTemplateMap = new Map<string, number>();
            if (item.code) {
                const productRef = doc(db, "companies", "mecald", "products", item.code);
                const productSnap = await getDoc(productRef);
                if (productSnap.exists()) {
                    const template = productSnap.data().productionPlanTemplate || [];
                    template.forEach((stage: any) => {
                        productTemplateMap.set(stage.stageName, stage.durationDays || 0);
                    });
                }
            }

            let finalPlan: ProductionStage[];

            if (item.productionPlan && item.productionPlan.length > 0) {
                finalPlan = item.productionPlan.map(stage => ({
                    ...stage,
                    startDate: stage.startDate ? new Date(stage.startDate) : null,
                    completedDate: stage.completedDate ? new Date(stage.completedDate) : null,
                    durationDays: stage.durationDays ?? productTemplateMap.get(stage.stageName) ?? 0,
                    useBusinessDays: stage.useBusinessDays ?? true, // Default para dias úteis se não especificado
                }));
            } else {
                finalPlan = Array.from(productTemplateMap.entries()).map(([stageName, durationDays]) => ({
                    stageName,
                    durationDays,
                    status: "Pendente",
                    startDate: null,
                    completedDate: null,
                    useBusinessDays: true, // Default para dias úteis
                }));
            }
            setEditedPlan(finalPlan);

        } catch(error) {
            console.error("Error preparing production plan:", error);
            toast({ variant: "destructive", title: "Erro ao carregar plano", description: "Não foi possível carregar os dados do plano." });
            setEditedPlan([]);
        } finally {
            setIsFetchingPlan(false);
        }
    };

    const handleSaveProgress = async () => {
        if (!selectedOrder || !itemToTrack) return;
    
        try {
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            const currentOrderSnap = await getDoc(orderRef);
            if (!currentOrderSnap.exists()) {
                throw new Error("Pedido não encontrado no banco de dados.");
            }
            const currentOrderData = currentOrderSnap.data();

            const itemsForFirestore = currentOrderData.items.map((item: any) => {
                let planForFirestore: any[];
    
                if (item.id === itemToTrack.id) {
                    planForFirestore = editedPlan.map(p => ({
                        ...p,
                        startDate: p.startDate ? Timestamp.fromDate(new Date(p.startDate)) : null,
                        completedDate: p.completedDate ? Timestamp.fromDate(new Date(p.completedDate)) : null,
                    }));
                } else {
                    planForFirestore = (item.productionPlan || []).map((p: any) => ({
                        ...p,
                        startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : p.startDate,
                        completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : p.completedDate,
                    }));
                }
                const { id, product_code, ...restOfItem } = item as any;
                return {...restOfItem, id: item.id, productionPlan: planForFirestore };
            });
    
            await updateDoc(orderRef, { items: itemsForFirestore });

            const updatedItemsForCheck = itemsForFirestore.map((item: any) => ({
                ...item,
                productionPlan: (item.productionPlan || []).map((p: any) => ({
                    ...p,
                    startDate: p.startDate?.toDate ? p.startDate.toDate() : p.startDate,
                    completedDate: p.completedDate?.toDate ? p.completedDate.toDate() : p.completedDate,
                }))
            }));
            
            const allItemsCompleted = updatedItemsForCheck.every(
                (item: any) => {
                    if (item.productionPlan && item.productionPlan.length > 0) {
                         return item.productionPlan.every((p: any) => p.status === 'Concluído');
                    }
                    return true;
                }
            );

            if (allItemsCompleted && selectedOrder.status !== 'Concluído') {
                await updateDoc(orderRef, { status: "Concluído" });
                toast({ 
                    title: "Pedido Concluído!", 
                    description: "Todos os itens foram finalizados e o status do pedido foi atualizado automaticamente." 
                });
            } else {
                toast({ title: "Progresso salvo!", description: "As etapas de produção foram atualizadas." });
            }
            
            setIsProgressModalOpen(false);
            setItemToTrack(null);
    
            const allOrders = await fetchOrders();
            const updatedOrderInList = allOrders.find(o => o.id === selectedOrder.id);
            if (updatedOrderInList) {
                setSelectedOrder(updatedOrderInList);
                 form.reset({
                    ...updatedOrderInList,
                    status: updatedOrderInList.status as any,
                });
            }

        } catch (error) {
            console.error("Error saving progress:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o progresso do item." });
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
                }));
                
                return {
                    ...item,
                    productionPlan: planForFirestore,
                    itemDeliveryDate: item.itemDeliveryDate ? Timestamp.fromDate(new Date(item.itemDeliveryDate)) : null,
                    shippingDate: item.shippingDate ? Timestamp.fromDate(new Date(item.shippingDate)) : null,
                };
            });

            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            await updateDoc(orderRef, { items: itemsForFirestore });

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

            // Título
            docPdf.setFontSize(18).setFont('helvetica', 'bold');
            docPdf.text('FOLHA DE APONTAMENTO DE PRODUÇÃO', pageWidth / 2, yPos, { align: 'center' });
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
            yPos += 15;

            // QR Code MELHORADO com dados mais completos
            const qrData = JSON.stringify({
                type: 'apontamento_producao',
                orderId: selectedOrder.id,
                itemId: item.id,
                orderNumber: selectedOrder.quotationNumber,
                itemCode: item.code || 'SEM_CODIGO',
                itemDescription: item.description,
                quantity: item.quantity,
                customer: selectedOrder.customer.name,
                internalOS: selectedOrder.internalOS || '',
                timestamp: new Date().toISOString(),
                // URL para acesso direto (caso você tenha uma página de apontamento)
                url: `${window.location.origin}/apontamento/${selectedOrder.id}/${item.id}`
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
            const filename = `Apontamento_${selectedOrder.quotationNumber}_${item.code || 'Item'}_${format(new Date(), 'yyyyMMdd')}.pdf`;
            docPdf.save(filename);

            toast({
                title: "Folha gerada com sucesso!",
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



    return (
        <div className="w-full">
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Pedidos de Produção</h1>
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
                                {uniqueStatuses.map(status => (
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
                                {customers.map(customer => (
                                    <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                                ))}
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
                    </div>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Pedidos</CardTitle>
                        <CardDescription>Acompanhe todos os pedidos de produção aprovados.</CardDescription>
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
            </div>

            <Sheet open={isSheetOpen} onOpenChange={(open) => { 
  setIsSheetOpen(open); 
  if (!open) { 
    setIsEditing(false); 
    setSelectedItems(new Set()); 
    setProgressClipboard(null); 
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
                                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <FormField control={form.control} name="quotationNumber" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nº Pedido (Compra)</FormLabel>
                            <FormControl><Input placeholder="Nº do Pedido de Compra do Cliente" {...field} value={field.value ?? ''} /></FormControl>
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

                    {/* Itens do Pedido */}
                    <Card>
                      <CardHeader><CardTitle>Itens do Pedido (Editável)</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        {fields.map((field, index) => {
                          const itemProgress = calculateItemProgress(watchedItems[index] || {});
                          return (
                            <Card key={field.id} className="p-4 bg-secondary">
                              <div className="space-y-4">
                                <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Descrição do Item {index + 1}</FormLabel>
                                    <FormControl><Textarea placeholder="Descrição completa do item" {...field} /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}/>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <FormField control={form.control} name={`items.${index}.code`} render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Código</FormLabel>
                                      <FormControl><Input placeholder="Cód. Produto" {...field} value={field.value || ''} /></FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}/>
                                  <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Quantidade</FormLabel>
                                      <FormControl><Input type="number" placeholder="0" {...field} value={field.value ?? ''} /></FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}/>
                                  <FormField control={form.control} name={`items.${index}.unitWeight`} render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Peso Unit. (kg)</FormLabel>
                                      <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}/>
                                                                        <FormField control={form.control} name={`items.${index}.itemDeliveryDate`} render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Entrega do Item</FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              value={field.value ? format(new Date(field.value), "yyyy-MM-dd") : ""}
                                              onChange={(e) => {
                                                console.log('🔥 DATA ENTREGA ITEM ALTERADA:', e.target.value);
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
                                {itemProgress === 100 && (
                                  <>
                                    <Separator className="my-2" />
                                    <h5 className="text-sm font-semibold">Informações de Envio (Item Concluído)</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField control={form.control} name={`items.${index}.shippingList`} render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Lista de Embarque (LE)</FormLabel>
                                          <FormControl><Input placeholder="Nº da LE" {...field} value={field.value ?? ''} /></FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}/>
                                      <FormField control={form.control} name={`items.${index}.invoiceNumber`} render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Nota Fiscal (NF-e)</FormLabel>
                                          <FormControl><Input placeholder="Nº da NF-e" {...field} value={field.value ?? ''} /></FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}/>
                                      <FormField control={form.control} name={`items.${index}.shippingDate`} render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Data de Envio</FormLabel>
                                          <FormControl>
                                            <Input
                                              type="date"
                                              value={field.value ? format(new Date(field.value), "yyyy-MM-dd") : ""}
                                              onChange={(e) => {
                                                console.log('🔥 DATA ENVIO ALTERADA:', e.target.value);
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
                                  </>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </div>
              
              {/* Footer fixo com botões */}
              <div className="flex-shrink-0 pt-4 border-t bg-background">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-sm text-muted-foreground">
                    Peso Total: <span className="font-semibold">{currentTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
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
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                            {itemProgress === 100 && (item.shippingList || item.invoiceNumber || item.shippingDate) && (
                              <>
                                <Separator className="my-3" />
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Lista de Embarque:</span>
                                    <p className="font-medium">{item.shippingList || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Nota Fiscal:</span>
                                    <p className="font-medium">{item.invoiceNumber || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Data de Envio:</span>
                                    <p className="font-medium">{item.shippingDate ? format(item.shippingDate, "dd/MM/yyyy") : 'N/A'}</p>
                                  </div>
                                </div>
                              </>
                            )}
                          </Card>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </div>
            
            {/* Footer de visualização */}
            <SheetFooter className="flex-shrink-0 pt-4 border-t">
              <div className="flex items-center justify-between w-full gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  {selectedItems.size > 0 && (
                    <Button onClick={handleGeneratePackingSlip} variant="outline">
                      <ReceiptText className="mr-2 h-4 w-4" />
                      Gerar Romaneio ({selectedItems.size} {selectedItems.size === 1 ? 'item' : 'itens'})
                    </Button>
                  )}
                  <Button onClick={handleExportSchedule} variant="outline">
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Exportar Cronograma
                  </Button>
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
          </div>
        )}
      </>
    )}
  </SheetContent>
</Sheet>

            <Dialog open={isProgressModalOpen} onOpenChange={setIsProgressModalOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Progresso do Item: {itemToTrack?.description}</DialogTitle>
                      <DialogDescription>
                        Atualize o status e as datas para cada etapa de fabricação. O cronograma será calculado automaticamente considerando apenas dias úteis.
                      </DialogDescription>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-blue-600" />
                          <p className="text-sm text-blue-800">
                            <strong>Importante:</strong> O sistema considera apenas dias úteis (segunda a sexta-feira), excluindo feriados nacionais brasileiros. Suporta valores decimais (ex: 0.5 para meio dia, 1.5 para 1 dia e meio).
                          </p>
                        </div>
                      </div>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                      <div className="space-y-4 p-1 pr-4">
                        {isFetchingPlan ? (
                          <div className="flex justify-center items-center h-48">
                            <div className="text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                              <p>Buscando plano de fabricação...</p>
                            </div>
                          </div>
                        ) : (editedPlan && editedPlan.length > 0) ? (
                          editedPlan.map((stage, index) => {
                            console.log('🎨 RENDERIZANDO ETAPA:', {
                              index,
                              stageName: stage.stageName,
                              startDate: stage.startDate,
                              completedDate: stage.completedDate,
                              status: stage.status
                            });
                            return (
                            <Card key={`${stage.stageName}-${index}`} className="p-4 relative">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveStageFromPlan(index)}
                              >
                                <XCircleIcon className="h-4 w-4" />
                                <span className="sr-only">Remover etapa</span>
                              </Button>
                              <CardTitle className="text-lg mb-4 pr-8 flex items-center gap-2">
                                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                                  {index + 1}
                                </span>
                                {stage.stageName}
                              </CardTitle>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Status</Label>
                                  <Select 
                                    value={stage.status} 
                                    onValueChange={(value) => {
                                      console.log('🔧 Status alterado:', { index, value });
                                      handlePlanChange(index, 'status', value);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecione o status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Pendente">
                                        <div className="flex items-center gap-2">
                                          <Hourglass className="h-4 w-4 text-yellow-500" />
                                          Pendente
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="Em Andamento">
                                        <div className="flex items-center gap-2">
                                          <PlayCircle className="h-4 w-4 text-blue-500" />
                                          Em Andamento
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="Concluído">
                                        <div className="flex items-center gap-2">
                                          <CheckCircle className="h-4 w-4 text-green-500" />
                                          Concluído
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Duração</Label>
                                  <Input
                                    type="number"
                                    step="0.125"
                                    min="0.125"
                                    placeholder="Ex: 1.5 (1 dia e meio)"
                                    value={stage.durationDays ?? ''}
                                    onChange={(e) => handlePlanChange(index, 'durationDays', e.target.value)}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Aceita decimais: 0.5 = meio dia, 1.5 = 1 dia e meio
                                  </p>
                                  {stage.durationDays && stage.durationDays < 1 && (
                                    <p className="text-xs text-blue-600">
                                      ℹ️ Duração menor que 1 dia - será executada no mesmo dia
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Nova seção para tipo de cronograma */}
                              <div className="grid grid-cols-1 gap-4 mt-4">
                                <div className="space-y-2">
                                  <Label>Tipo de Cronograma</Label>
                                  <Select 
                                    value={stage.useBusinessDays === false ? "corridos" : "uteis"} 
                                    onValueChange={(value) => {
                                      const useBusinessDays = value === "uteis";
                                      console.log('📅 Tipo de cronograma alterado:', { index, useBusinessDays });
                                      handlePlanChange(index, 'useBusinessDays', useBusinessDays);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecione o tipo de cronograma" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="uteis">
                                        <div className="flex items-center gap-2">
                                          <CalendarDays className="h-4 w-4 text-blue-500" />
                                          <div>
                                            <div className="font-medium">Dias Úteis</div>
                                            <div className="text-xs text-muted-foreground">Segunda a sexta, exclui feriados</div>
                                          </div>
                                        </div>
                                      </SelectItem>
                                      <SelectItem value="corridos">
                                        <div className="flex items-center gap-2">
                                          <CalendarIcon className="h-4 w-4 text-orange-500" />
                                          <div>
                                            <div className="font-medium">Dias Corridos</div>
                                            <div className="text-xs text-muted-foreground">Todos os dias, incluindo fins de semana</div>
                                          </div>
                                        </div>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <div className={`text-xs p-2 rounded border ${stage.useBusinessDays === false ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                                    {stage.useBusinessDays === false 
                                      ? "⚡ Tarefa urgente - conta todos os dias incluindo fins de semana e feriados"
                                      : "📅 Tarefa normal - conta apenas dias úteis (seg-sex), excluindo feriados"
                                    }
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <div className="space-y-2">
                                  <Label>Data de Início</Label>
                                  {stage.status === 'Concluído' ? (
                                    <div className="w-full p-2 border rounded-md bg-green-50 border-green-200">
                                      <div className="flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 text-green-600" />
                                        <span className="text-green-800 font-medium">
                                          {stage.startDate ? format(stage.startDate, "dd/MM/yyyy") : 'Não definida'}
                                        </span>
                                        <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />
                                      </div>
                                    </div>
                                  ) : (
                                    <Input
                                      type="date"
                                      value={stage.startDate ? format(new Date(stage.startDate), "yyyy-MM-dd") : ""}
                                      onChange={(e) => {
                                        console.log('📅 Alterando data de início:', e.target.value);
                                        handlePlanChange(index, 'startDate', e.target.value || null);
                                      }}
                                      className="w-full"
                                    />
                                  )}
                                  {stage.startDate && !isBusinessDay(stage.startDate) && stage.status !== 'Concluído' && (
                                    <p className="text-xs text-orange-600 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Data será ajustada para próximo dia útil
                                    </p>
                                  )}
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Data de Conclusão</Label>
                                  {stage.status === 'Concluído' ? (
                                    <div className="w-full p-2 border rounded-md bg-green-50 border-green-200">
                                      <div className="flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 text-green-600" />
                                        <span className="text-green-800 font-medium">
                                          {stage.completedDate ? format(stage.completedDate, "dd/MM/yyyy") : 'Não definida'}
                                        </span>
                                        <CheckCircle className="h-4 w-4 text-green-600 ml-auto" />
                                      </div>
                                    </div>
                                  ) : (
                                    <Input
                                      type="date"
                                      value={stage.completedDate ? format(new Date(stage.completedDate), "yyyy-MM-dd") : ""}
                                      onChange={(e) => {
                                        console.log('📅 Alterando data de conclusão:', e.target.value);
                                        handlePlanChange(index, 'completedDate', e.target.value || null);
                                      }}
                                      className="w-full"
                                    />
                                  )}
                                  {stage.completedDate && !isBusinessDay(stage.completedDate) && stage.status !== 'Concluído' && (
                                    <p className="text-xs text-orange-600 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Data será ajustada para dia útil anterior
                                    </p>
                                  )}
                                </div>
                              </div>
                              {stage.startDate && stage.completedDate && (
                                <BusinessDayInfo 
                                  startDate={stage.startDate} 
                                  endDate={stage.completedDate} 
                                  expectedDuration={Number(stage.durationDays) || 1} 
                                />
                              )}
                              {index < editedPlan.length - 1 && (
                                <div className="flex justify-center mt-4">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <div className="w-4 h-0.5 bg-border"></div>
                                    <ArrowDown className="h-4 w-4" />
                                    <div className="w-4 h-0.5 bg-border"></div>
                                  </div>
                                </div>
                              )}
                            </Card>
                          );
                          })
                        ) : (
                          <div className="text-center text-muted-foreground py-8">
                            <CalendarClock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                            <p className="text-lg font-medium">Nenhuma etapa de fabricação definida</p>
                            <p className="text-sm">Você pode definir as etapas na tela de Produtos ou adicionar manualmente abaixo.</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    <div className="pt-4 border-t">
                      <Label className="text-sm font-medium">Adicionar Nova Etapa</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          placeholder="Nome da nova etapa"
                          value={newStageNameForPlan}
                          onChange={(e) => setNewStageNameForPlan(e.target.value)}
                        />
                        <Button 
                          type="button" 
                          variant="secondary" 
                          onClick={handleAddStageToPlan}
                          disabled={!newStageNameForPlan.trim()}
                        >
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Adicionar
                        </Button>
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
        </div>
    );
}
