
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, getDoc, Timestamp, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isSameDay, addDays } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
import { Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle, Weight, CalendarDays, Edit, X, CalendarIcon, Truck, AlertTriangle, Scale, FolderGit2, FileText, File, ClipboardCheck, Palette, ListChecks, GanttChart, Trash2, Copy } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const productionStageSchema = z.object({
    stageName: z.string(),
    status: z.string(),
    startDate: z.date().nullable().optional(),
    completedDate: z.date().nullable().optional(),
    durationDays: z.coerce.number().min(0).optional(),
});

const orderItemSchema = z.object({
    id: z.string().optional(),
    code: z.string().optional(),
    product_code: z.string().optional(),
    description: z.string().min(1, "A descrição é obrigatória."),
    quantity: z.coerce.number().min(0, "A quantidade não pode ser negativa."),
    unitWeight: z.coerce.number().min(0, "O peso não pode ser negativo.").optional(),
    productionPlan: z.array(productionStageSchema).optional(),
});

const orderSchema = z.object({
  id: z.string(),
  internalOS: z.string().optional(),
  projectName: z.string().optional(),
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
    quotationNumber: number;
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


const calculateTotalWeight = (items: OrderItem[]): number => {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((acc, item) => {
        const quantity = Number(item.quantity) || 0;
        const unitWeight = Number(item.unitWeight) || 0;
        return acc + (quantity * unitWeight);
    }, 0);
};

const calculateItemProgress = (item: OrderItem): number => {
    if (!item.productionPlan || item.productionPlan.length === 0) {
        return 0;
    }
    const completedStages = item.productionPlan.filter(p => p.status === 'Concluído').length;
    return (completedStages / item.productionPlan.length) * 100;
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
    const [isCopyProgressModalOpen, setIsCopyProgressModalOpen] = useState(false);
    const [sourceItemId, setSourceItemId] = useState<string | null>(null);
    
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
            const productsMap = new Map<string, { unitWeight: number }>();
            productsSnapshot.forEach(doc => {
                const productCode = (doc.id || '').trim().toUpperCase();
                if (productCode) {
                    productsMap.set(productCode, { unitWeight: doc.data().unitWeight || 0 });
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

                    if (enrichedItem.unitWeight === 0) {
                        const productCodeToSearch = (itemCode).trim().toUpperCase();
                        if (productCodeToSearch) {
                            const productData = productsMap.get(productCodeToSearch);
                            if (productData && productData.unitWeight) {
                                enrichedItem.unitWeight = Number(productData.unitWeight) || 0;
                            }
                        }
                    }

                    enrichedItem.productionPlan = (item.productionPlan || []).map((p: any) => ({
                        ...p,
                        startDate: p.startDate?.toDate ? p.startDate.toDate() : null,
                        completedDate: p.completedDate?.toDate ? p.completedDate.toDate() : null,
                    }));

                    return enrichedItem;
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

                const orderNum = data.orderNumber || data.quotationNumber || 0;

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
            }).sort((a, b) => (b.quotationNumber || 0) - (a.quotationNumber || 0));
            
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

    const handleViewOrder = (order: Order) => {
        setSelectedOrder(order);
        form.reset({
            ...order,
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
            
            const updatedItems = values.items.map((item, index) => {
                const itemCode = item.code || item.product_code || '';
                const cleanItem = { ...item, code: itemCode };
                delete (cleanItem as any).product_code;
    
                return {
                    ...cleanItem,
                    unitWeight: Number(item.unitWeight) || 0,
                    quantity: Number(item.quantity) || 0,
                    // Preserve existing production plan
                    productionPlan: selectedOrder.items[index]?.productionPlan || []
                };
            });
    
            const totalWeight = calculateTotalWeight(updatedItems);
            
            const dataToSave = {
                items: updatedItems,
                totalWeight: totalWeight,
                internalOS: values.internalOS,
                projectName: values.projectName,
                driveLink: values.driveLink,
                documents: values.documents,
            };
    
            await updateDoc(orderRef, dataToSave);
    
            toast({
                title: "Pedido atualizado!",
                description: "Os dados do pedido foram salvos com sucesso.",
            });
    
            const updatedOrderInState = {
                ...selectedOrder,
                ...dataToSave,
            };
            setSelectedOrder(updatedOrderInState);
            form.reset(updatedOrderInState);
    
            setIsEditing(false);
            await fetchOrders();
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

    const filteredOrders = useMemo(() => orders.filter(order => {
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
    }), [orders, searchQuery, statusFilter, customerFilter, dateFilter]);
    
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

    const dashboardStats = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const ordersThisYear = orders.filter(order => order.createdAt.getFullYear() === currentYear);

        const totalYearWeight = ordersThisYear.reduce((acc, order) => acc + (order.totalWeight || 0), 0);
        const inProductionWeight = ordersThisYear
            .filter(order => order.status === 'Em Produção')
            .reduce((acc, order) => acc + (order.totalWeight || 0), 0);
        const completedWeight = ordersThisYear
            .filter(order => order.status === 'Concluído')
            .reduce((acc, order) => acc + (order.totalWeight || 0), 0);
        const delayedWeight = ordersThisYear
            .filter(order => order.status === 'Atrasado')
            .reduce((acc, order) => acc + (order.totalWeight || 0), 0);

        return { totalYearWeight, inProductionWeight, completedWeight, delayedWeight };
    }, [orders]);

    const formatWeight = (weight: number) => {
        return `${weight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
    };

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
            docPdf.setFontSize(18).setFont(undefined, 'bold');
            docPdf.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY, { align: 'left' });
            textY += 6;
            
            docPdf.setFontSize(9).setFont(undefined, 'normal');
            if (companyData.endereco) {
                const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
                docPdf.text(addressLines, textX, textY);
                textY += (addressLines.length * 4);
            }
            if (companyData.cnpj) {
                docPdf.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
            }
            
            yPos = 55;
            docPdf.setFontSize(14).setFont(undefined, 'bold');
            docPdf.text('ROMANEIO DE ENTREGA', pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;
    
            docPdf.setFontSize(11).setFont(undefined, 'normal');
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
                    2: { halign: 'center', cellWidth: 20 },
                    3: { halign: 'center', cellWidth: 30 },
                    4: { halign: 'center', cellWidth: 30 },
                }
            });
    
            let finalY = (docPdf as any).lastAutoTable.finalY;
            const footerStartY = pageHeight - 35;

            if (finalY + 20 > footerStartY) {
                docPdf.addPage();
                finalY = 15;
            }
    
            docPdf.setFontSize(12).setFont(undefined, 'bold');
            docPdf.text(
                `Peso Total dos Itens: ${totalWeightOfSelection.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`, 
                pageWidth - 15, finalY + 15, { align: 'right' }
            );

            docPdf.setFontSize(10).setFont(undefined, 'normal');
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
                }));
            } else {
                finalPlan = Array.from(productTemplateMap.entries()).map(([stageName, durationDays]) => ({
                    stageName,
                    durationDays,
                    status: "Pendente",
                    startDate: null,
                    completedDate: null,
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

    const handlePlanChange = (stageIndex: number, field: 'startDate' | 'completedDate' | 'durationDays', value: any) => {
        let newPlan = JSON.parse(JSON.stringify(editedPlan));

        const currentStage = newPlan[stageIndex];
        
        if (field === 'startDate' || field === 'completedDate') {
            currentStage[field] = value ? new Date(value) : null;
        } else if (field === 'durationDays') {
            currentStage[field] = value === '' ? undefined : Number(value);
        }
        
        if ((field === 'startDate' && currentStage.startDate) || field === 'durationDays') {
            let lastCompletionDate: Date | null = currentStage.startDate ? addDays(new Date(currentStage.startDate), -1) : null;
            
            for (let i = stageIndex; i < newPlan.length; i++) {
                const stage = newPlan[i];
                
                if (i > stageIndex) {
                    stage.startDate = lastCompletionDate ? addDays(new Date(lastCompletionDate), 1) : null;
                }
                
                if (stage.startDate) {
                    const duration = Math.max(0, Number(stage.durationDays) || 0);
                    const daysToAdd = Math.ceil(duration) > 0 ? Math.ceil(duration) - 1 : 0;
                    stage.completedDate = addDays(new Date(stage.startDate), daysToAdd);
                } else {
                    stage.completedDate = null;
                }
                
                lastCompletionDate = stage.completedDate;
            }
        }
        
        if (field === 'completedDate') {
            let lastCompletionDate = currentStage.completedDate;
            for (let i = stageIndex + 1; i < newPlan.length; i++) {
                const stage = newPlan[i];
                stage.startDate = lastCompletionDate ? addDays(new Date(lastCompletionDate), 1) : null;
                if (stage.startDate) {
                    const duration = Math.max(0, Number(stage.durationDays) || 0);
                    const daysToAdd = Math.ceil(duration) > 0 ? Math.ceil(duration) - 1 : 0;
                    stage.completedDate = addDays(new Date(stage.startDate), daysToAdd);
                } else {
                    stage.completedDate = null;
                }
                lastCompletionDate = stage.completedDate;
            }
        }
        
        if (field === 'startDate' && !value) {
            for (let i = stageIndex; i < newPlan.length; i++) {
                newPlan[i].startDate = null;
                newPlan[i].completedDate = null;
            }
        }

        const finalPlan = newPlan.map((p: any) => ({
            ...p,
            startDate: p.startDate ? new Date(p.startDate) : null,
            completedDate: p.completedDate ? new Date(p.completedDate) : null,
        }));
        
        setEditedPlan(finalPlan);
    };

    const handleSaveProgress = async () => {
        if (!selectedOrder || !itemToTrack) return;
    
        try {
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            const itemsForFirestore = selectedOrder.items.map(item => {
                let planForFirestore: any[];
    
                if (item.id === itemToTrack.id) {
                    planForFirestore = editedPlan.map(p => ({
                        ...p,
                        startDate: p.startDate ? Timestamp.fromDate(new Date(p.startDate)) : null,
                        completedDate: p.completedDate ? Timestamp.fromDate(new Date(p.completedDate)) : null,
                    }));
                } else {
                    planForFirestore = (item.productionPlan || []).map(p => ({
                        ...p,
                        startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : p.startDate,
                        completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : p.completedDate,
                    }));
                }
                return {...item, productionPlan: planForFirestore };
            });
    
            await updateDoc(orderRef, { items: itemsForFirestore });
            toast({ title: "Progresso salvo!", description: "As etapas de produção foram atualizadas." });
            setIsProgressModalOpen(false);
            setItemToTrack(null);

            const allOrders = await fetchOrders();
            const updatedOrder = allOrders.find(o => o.id === selectedOrder.id);
            if (updatedOrder) {
                setSelectedOrder(updatedOrder);
            }
        } catch (error) {
            console.error("Error saving progress:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o progresso do item." });
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
            const pageHeight = docPdf.internal.pageSize.height;
            let yPos = 15;
    
            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
                } catch (e) { console.error("Error adding logo to PDF:", e); }
            }
            
            const rightColX = pageWidth - 15;
            let companyInfoY = yPos + 5;
            docPdf.setFontSize(16).setFont(undefined, 'bold');
            docPdf.text(companyData.nomeFantasia || 'Sua Empresa', rightColX, companyInfoY, { align: 'right' });
            
            companyInfoY += 6;
            docPdf.setFontSize(9).setFont(undefined, 'normal');
            if (companyData.endereco) {
                const addressLines = docPdf.splitTextToSize(companyData.endereco, 80);
                docPdf.text(addressLines, rightColX, companyInfoY, { align: 'right' });
                companyInfoY += (addressLines.length * 4);
            }
            if (companyData.cnpj) {
                docPdf.text(`CNPJ: ${companyData.cnpj}`, rightColX, companyInfoY, { align: 'right' });
                companyInfoY += 4;
            }
            if (companyData.email) {
                docPdf.text(`Email: ${companyData.email}`, rightColX, companyInfoY, { align: 'right' });
            }

            yPos = 55;
            docPdf.setFontSize(14).setFont(undefined, 'bold');
            docPdf.text('CRONOGRAMA DE PRODUÇÃO', pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;
    
            docPdf.setFontSize(11).setFont(undefined, 'normal');
            docPdf.text(`Cliente: ${selectedOrder.customer.name}`, 15, yPos);
            docPdf.text(`Pedido Nº: ${selectedOrder.quotationNumber}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 7;
            docPdf.text(`OS Interna: ${selectedOrder.internalOS || 'N/A'}`, 15, yPos);
            docPdf.text(`Data de Emissão: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 7;
            docPdf.text(`Projeto do Cliente: ${selectedOrder.projectName || 'N/A'}`, 15, yPos);
            const overallProgress = calculateOrderProgress(selectedOrder);
            docPdf.text(`Progresso Geral: ${Math.round(overallProgress)}%`, pageWidth - 15, yPos, { align: 'right' });
            yPos += 12;
    
            const tableBody: any[] = [];
            selectedOrder.items.forEach(item => {
                const itemProgress = calculateItemProgress(item);
                const itemHeaderText = `${item.description} (Qtd: ${item.quantity}, Cód: ${item.code || 'N/A'}) - Progresso: ${Math.round(itemProgress)}%`;
                tableBody.push([
                    { 
                        content: itemHeaderText, 
                        colSpan: 5, 
                        styles: { 
                            halign: 'left', 
                            fontStyle: 'bold', 
                            fillColor: [240, 248, 255], 
                            textColor: [51, 51, 51],
                            cellPadding: 3,
                        }
                    }
                ]);

                if (item.productionPlan && item.productionPlan.length > 0) {
                    item.productionPlan.forEach((stage) => {
                        tableBody.push([
                            `    • ${stage.stageName}`,
                            stage.status,
                            stage.startDate ? format(new Date(stage.startDate), 'dd/MM/yy') : 'Pendente',
                            stage.completedDate ? format(new Date(stage.completedDate), 'dd/MM/yy') : 'Pendente',
                            stage.durationDays ? `${stage.durationDays} dia(s)` : '-'
                        ]);
                    });
                } else {
                     tableBody.push([
                        { 
                            content: '   Nenhuma etapa de fabricação definida para este item.', 
                            colSpan: 5,
                            styles: {
                                halign: 'left',
                                fontStyle: 'italic',
                                textColor: [150, 150, 150]
                            }
                        }
                     ]);
                }
            });
    
            autoTable(docPdf, {
                startY: yPos,
                head: [['Etapa de Fabricação', 'Status', 'Início Previsto', 'Término Previsto', 'Duração']],
                body: tableBody,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
                headStyles: { 
                    fillColor: [51, 122, 183], 
                    fontSize: 9, 
                    textColor: 255, 
                    fontStyle: 'bold' 
                },
                columnStyles: {
                    0: { cellWidth: 125 },
                    1: { cellWidth: 35, halign: 'center' },
                    2: { cellWidth: 25, halign: 'center' },
                    3: { cellWidth: 25, halign: 'center' },
                    4: { cellWidth: 20, halign: 'center' },
                }
            });
            
            const pageCount = (docPdf as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                docPdf.setPage(i);
                docPdf.setFontSize(8).setTextColor(150);
                docPdf.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
            }
    
            docPdf.save(`Cronograma_${selectedOrder.quotationNumber}.pdf`);
    
        } catch (error) {
            console.error("Error exporting schedule:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar cronograma",
                description: "Não foi possível gerar o arquivo PDF.",
            });
        }
    };

    const handleOpenCopyProgressModal = () => {
      if (!selectedOrder || selectedItems.size < 2) {
        toast({
          variant: "destructive",
          title: "Seleção inválida",
          description: "Selecione pelo menos dois itens (um para copiar e um para colar).",
        });
        return;
      }
      setSourceItemId(null); // Reset source selection
      setIsCopyProgressModalOpen(true);
    };
    
    const handleConfirmCopyProgress = async () => {
        if (!selectedOrder || !sourceItemId || selectedItems.size < 2) {
            return;
        }
    
        try {
            const sourceItem = selectedOrder.items.find(item => item.id === sourceItemId);
            if (!sourceItem) {
                throw new Error("Item de origem não encontrado.");
            }
    
            const sourceProductionPlan = sourceItem.productionPlan || [];
    
            const updatedItems = selectedOrder.items.map(item => {
                if (selectedItems.has(item.id!) && item.id !== sourceItemId) {
                    // Deep copy the plan to avoid reference issues
                    return { ...item, productionPlan: JSON.parse(JSON.stringify(sourceProductionPlan)) };
                }
                return item;
            });
    
            const itemsForFirestore = updatedItems.map(item => {
                const planForFirestore = (item.productionPlan || []).map(p => ({
                    ...p,
                    startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : p.startDate,
                    completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : p.completedDate,
                }));
                const cleanItem = { ...item };
                // @ts-ignore
                delete cleanItem.product_code; 
                return { ...cleanItem, productionPlan: planForFirestore };
            });
    
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            await updateDoc(orderRef, { items: itemsForFirestore });
    
            toast({ title: "Progresso copiado!", description: `As etapas foram copiadas para ${selectedItems.size - 1} item(ns).` });
            setIsCopyProgressModalOpen(false);
            
            const allOrders = await fetchOrders();
            const updatedOrder = allOrders.find(o => o.id === selectedOrder.id);
            if (updatedOrder) {
                setSelectedOrder(updatedOrder);
                form.reset(updatedOrder);
            }
    
        } catch (error) {
            console.error("Error copying progress:", error);
            toast({ variant: "destructive", title: "Erro ao copiar", description: "Não foi possível copiar o progresso dos itens." });
        }
    };


    return (
        <>
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
                        title="Peso Total (Ano)"
                        value={formatWeight(dashboardStats.totalYearWeight)}
                        icon={Scale}
                        description={`Total de todos os pedidos em ${new Date().getFullYear()}`}
                    />
                    <StatCard
                        title="Peso em Produção"
                        value={formatWeight(dashboardStats.inProductionWeight)}
                        icon={PlayCircle}
                        description="Soma do peso de pedidos 'Em Produção'"
                    />
                    <StatCard
                        title="Peso Concluído"
                        value={formatWeight(dashboardStats.completedWeight)}
                        icon={CheckCircle}
                        description="Soma do peso de pedidos 'Concluído'"
                    />
                    <StatCard
                        title="Peso Atrasado"
                        value={formatWeight(dashboardStats.delayedWeight)}
                        icon={AlertTriangle}
                        description="Soma do peso de pedidos 'Atrasado'"
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

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-[240px] justify-start text-left font-normal", !dateFilter && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateFilter ? format(dateFilter, "dd/MM/yyyy") : <span>Data de Entrega</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={dateFilter} onSelect={setDateFilter} initialFocus />
                            </PopoverContent>
                        </Popover>
                        
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
                                <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
                            </div>
                        ) : (
                           <OrdersTable orders={filteredOrders} onOrderClick={handleViewOrder} />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Sheet open={isSheetOpen} onOpenChange={(open) => { setIsSheetOpen(open); if (!open) { setIsEditing(false); setSelectedItems(new Set()); } }}>
                <SheetContent className="w-full sm:max-w-3xl">
                    {selectedOrder && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="font-headline text-2xl">Pedido Nº {selectedOrder.quotationNumber}</SheetTitle>
                                <SheetDescription>
                                    Cliente: <span className="font-medium text-foreground">{selectedOrder.customer?.name || 'N/A'}</span>
                                </SheetDescription>
                            </SheetHeader>
                            
                            {isEditing ? (
                                // EDIT VIEW
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onOrderSubmit)} className="flex flex-col h-[calc(100%-4rem)]">
                                        <ScrollArea className="flex-1 pr-6 -mr-6 py-6">
                                            <div className="space-y-6">
                                                <Card className="p-4 bg-secondary/50">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <FormField control={form.control} name="internalOS" render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>OS Interna</FormLabel>
                                                                <FormControl><Input placeholder="Ex: OS-2024-123" {...field} value={field.value ?? ''} /></FormControl>
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
                                                    <div className="space-y-4 mt-4">
                                                        <FormField control={form.control} name="driveLink" render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Link da Pasta (Google Drive)</FormLabel>
                                                                <FormControl><Input type="url" placeholder="https://drive.google.com/..." {...field} value={field.value ?? ''} /></FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}/>
                                                    </div>
                                                </Card>

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

                                                <Card>
                                                    <CardHeader><CardTitle>Itens do Pedido (Editável)</CardTitle></CardHeader>
                                                    <CardContent className="space-y-4">
                                                        {fields.map((field, index) => (
                                                            <Card key={field.id} className="p-4 bg-secondary">
                                                                <div className="space-y-4">
                                                                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Descrição do Item {index + 1}</FormLabel>
                                                                            <FormControl><Textarea placeholder="Descrição completa do item" {...field} /></FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}/>
                                                                    <div className="grid grid-cols-3 gap-4">
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
                                                                                <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )}/>
                                                                         <FormField control={form.control} name={`items.${index}.unitWeight`} render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel>Peso Unit. (kg)</FormLabel>
                                                                                <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )}/>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        ))}
                                                    </CardContent>
                                                </Card>
                                            </div>
                                        </ScrollArea>
                                        <SheetFooter className="py-4 border-t">
                                            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancelar</Button>
                                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                                {form.formState.isSubmitting ? "Salvando..." : "Salvar Alterações"}
                                            </Button>
                                        </SheetFooter>
                                    </form>
                                </Form>
                            ) : (
                                // READ-ONLY VIEW
                                <>
                                    <ScrollArea className="h-[calc(100vh-12rem)]">
                                        <div className="space-y-6 py-6 pr-6">
                                            <Card>
                                                <CardHeader><CardTitle>Detalhes do Pedido</CardTitle></CardHeader>
                                                <CardContent className="space-y-3 text-sm">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground">OS Interna</span>
                                                        <span className="font-semibold text-primary">{selectedOrder.internalOS || 'Não definida'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground">Projeto Cliente</span>
                                                        <span className="font-semibold">{selectedOrder.projectName || 'Não definido'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground">Status</span>
                                                        {(() => {
                                                            const statusProps = getStatusProps(selectedOrder.status);
                                                            return <Badge variant={statusProps.variant} className={statusProps.colorClass}><statusProps.icon className="mr-2 h-4 w-4" />{statusProps.label}</Badge>;
                                                        })()}
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground flex items-center"><CalendarDays className="mr-2 h-4 w-4" />Data do Pedido</span>
                                                        <span>{selectedOrder.createdAt ? format(selectedOrder.createdAt, 'dd/MM/yyyy') : 'N/A'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground flex items-center"><CalendarDays className="mr-2 h-4 w-4" />Data de Entrega</span>
                                                        <span>{selectedOrder.deliveryDate ? format(selectedOrder.deliveryDate, 'dd/MM/yyyy') : 'A definir'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground flex items-center"><FolderGit2 className="mr-2 h-4 w-4" />Pasta no Drive</span>
                                                        {selectedOrder.driveLink ? (
                                                            <Button variant="link" asChild className="p-0 h-auto text-base">
                                                                <a href={selectedOrder.driveLink} target="_blank" rel="noopener noreferrer">
                                                                    Abrir Link
                                                                </a>
                                                            </Button>
                                                        ) : (
                                                            <span className="text-muted-foreground">Não definido</span>
                                                        )}
                                                    </div>
                                                    <Separator className="my-3" />
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground flex items-center"><ListChecks className="mr-2 h-4 w-4" />Progresso Geral</span>
                                                        <div className="flex items-center gap-2 w-1/2">
                                                            <Progress value={calculateOrderProgress(selectedOrder)} className="h-2" />
                                                            <span className="font-semibold">{Math.round(calculateOrderProgress(selectedOrder))}%</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center font-bold text-lg pt-2">
                                                        <span className="font-medium text-muted-foreground flex items-center"><Weight className="mr-2 h-5 w-5"/>Peso Total</span>
                                                        <span className="text-primary">{selectedOrder.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader><CardTitle>Checklist de Documentos</CardTitle></CardHeader>
                                                <CardContent className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <Label htmlFor="drawings-view" className="flex items-center gap-2 text-sm font-normal"><File className="h-4 w-4" />Desenhos Técnicos</Label>
                                                        <Checkbox id="drawings-view" checked={selectedOrder.documents?.drawings} disabled />
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <Label htmlFor="inspection-view" className="flex items-center gap-2 text-sm font-normal"><ClipboardCheck className="h-4 w-4" />Plano de Inspeção e Testes (PIT)</Label>
                                                        <Checkbox id="inspection-view" checked={selectedOrder.documents?.inspectionTestPlan} disabled />
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <Label htmlFor="paint-view" className="flex items-center gap-2 text-sm font-normal"><Palette className="h-4 w-4" />Plano de Pintura</Label>
                                                        <Checkbox id="paint-view" checked={selectedOrder.documents?.paintPlan} disabled />
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader><CardTitle>Itens do Pedido</CardTitle></CardHeader>
                                                <CardContent>
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-12">
                                                                    <Checkbox
                                                                        checked={
                                                                            selectedItems.size > 0 &&
                                                                            (selectedOrder.items.length === selectedItems.size
                                                                                ? true
                                                                                : 'indeterminate')
                                                                        }
                                                                        onCheckedChange={handleSelectAll}
                                                                    />
                                                                </TableHead>
                                                                <TableHead>Descrição</TableHead>
                                                                <TableHead className="text-center w-[80px]">Qtd.</TableHead>
                                                                <TableHead className="text-center w-[150px]">Progresso</TableHead>
                                                                <TableHead className="text-right w-[150px]">Peso Total</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {selectedOrder.items.map((item) => {
                                                                const itemProgress = calculateItemProgress(item);
                                                                return (
                                                                <TableRow key={item.id!}>
                                                                    <TableCell>
                                                                        <Checkbox
                                                                            checked={selectedItems.has(item.id!)}
                                                                            onCheckedChange={() => handleItemSelection(item.id!)}
                                                                            aria-label={`Select item ${item.description}`}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell className="font-medium">
                                                                        {item.description}
                                                                        {(item.code || item.product_code) && <span className="block text-xs text-muted-foreground">Cód: {item.code || item.product_code}</span>}
                                                                    </TableCell>
                                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                                    <TableCell className="text-center">
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            <span className="text-sm font-medium w-8">{Math.round(itemProgress)}%</span>
                                                                            <TooltipProvider>
                                                                                <Tooltip>
                                                                                    <TooltipTrigger asChild>
                                                                                        <Button variant="outline" size="icon" onClick={() => handleOpenProgressModal(item)}>
                                                                                            <ListChecks className="h-4 w-4" />
                                                                                        </Button>
                                                                                    </TooltipTrigger>
                                                                                    <TooltipContent>
                                                                                        <p>Editar Progresso</p>
                                                                                    </TooltipContent>
                                                                                </Tooltip>
                                                                            </TooltipProvider>
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-semibold">{( (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0) ).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</TableCell>
                                                                </TableRow>
                                                            )})}
                                                        </TableBody>
                                                    </Table>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </ScrollArea>
                                    <SheetFooter className="pt-4 pr-6 border-t flex flex-wrap gap-2 sm:justify-between items-center">
                                        <div className="flex gap-2 flex-wrap">
                                            <Button 
                                                onClick={handleGeneratePackingSlip} 
                                                disabled={selectedItems.size === 0}
                                            >
                                                <FileText className="mr-2 h-4 w-4" />
                                                Emitir Romaneio ({selectedItems.size})
                                            </Button>
                                             <Button 
                                                onClick={handleExportSchedule}
                                                variant="outline"
                                            >
                                                <GanttChart className="mr-2 h-4 w-4" />
                                                Exportar Cronograma
                                            </Button>
                                            <Button
                                              onClick={handleOpenCopyProgressModal}
                                              disabled={selectedItems.size < 2}
                                              variant="outline"
                                            >
                                              <Copy className="mr-2 h-4 w-4" />
                                              Copiar Progresso
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button onClick={() => setIsEditing(true)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Editar Pedido
                                            </Button>
                                            <Button variant="destructive" onClick={() => selectedOrder && handleDeleteClick(selectedOrder)}>
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Excluir
                                            </Button>
                                        </div>
                                    </SheetFooter>
                                </>
                            )}
                        </>
                    )}
                </SheetContent>
            </Sheet>

            <Dialog open={isProgressModalOpen} onOpenChange={setIsProgressModalOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Progresso do Item: {itemToTrack?.description}</DialogTitle>
                        <DialogDescription>
                            Atualize o status e as datas para cada etapa de fabricação. O cronograma será calculado automaticamente.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="space-y-4 p-1 pr-4">
                            {isFetchingPlan ? (
                                <div className="flex justify-center items-center h-48">
                                    <p>Buscando plano de fabricação...</p>
                                </div>
                            ) : (editedPlan && editedPlan.length > 0) ? (
                                editedPlan.map((stage, index) => (
                                    <Card key={index} className="p-4">
                                        <CardTitle className="text-lg mb-4">{stage.stageName}</CardTitle>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                             <div className="space-y-2">
                                                <Label>Status</Label>
                                                <Select 
                                                    value={stage.status} 
                                                    onValueChange={(value) => {
                                                        const newPlan = [...editedPlan];
                                                        newPlan[index] = { ...newPlan[index], status: value };
                                                        setEditedPlan(newPlan);
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione o status" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Pendente">Pendente</SelectItem>
                                                        <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                                                        <SelectItem value="Concluído">Concluído</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Duração (dias)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.1"
                                                    placeholder="Ex: 1.5"
                                                    value={stage.durationDays ?? ''}
                                                    onChange={(e) => handlePlanChange(index, 'durationDays', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                            <div className="space-y-2">
                                                <Label>Data de Início</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !stage.startDate && "text-muted-foreground")}>
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {stage.startDate ? format(stage.startDate, "dd/MM/yyyy") : <span>Escolha a data</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar mode="single" selected={stage.startDate ?? undefined} onSelect={(date) => handlePlanChange(index, 'startDate', date)} initialFocus />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                             <div className="space-y-2">
                                                <Label>Data de Conclusão</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !stage.completedDate && "text-muted-foreground")}>
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {stage.completedDate ? format(stage.completedDate, "dd/MM/yyyy") : <span>Escolha a data</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar mode="single" selected={stage.completedDate ?? undefined} onSelect={(date) => handlePlanChange(index, 'completedDate', date)} initialFocus />
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            ) : (
                                <div className="text-center text-muted-foreground py-8">
                                    <p>Nenhuma etapa de fabricação definida para este item.</p>
                                    <p className="text-sm">Você pode definir as etapas na tela de Produtos.</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsProgressModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveProgress}>Salvar Progresso</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isCopyProgressModalOpen} onOpenChange={setIsCopyProgressModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Copiar Progresso de Fabricação</DialogTitle>
                        <DialogDescription>
                            Selecione o item de ORIGEM. O progresso dele será copiado para todos os outros itens selecionados.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="py-4 pr-4">
                            <RadioGroup value={sourceItemId ?? undefined} onValueChange={setSourceItemId} className="space-y-2">
                                {selectedOrder && Array.from(selectedItems).map(itemId => {
                                    const item = selectedOrder.items.find(i => i.id === itemId);
                                    if (!item) return null;
                                    return (
                                        <Label key={item.id} htmlFor={`r-${item.id}`} className="flex items-center space-x-3 border p-3 rounded-md has-[:checked]:bg-secondary cursor-pointer">
                                            <RadioGroupItem value={item.id!} id={`r-${item.id}`} />
                                            <div className="flex-1">
                                                <p className="font-medium">{item.description}</p>
                                                <p className="text-xs text-muted-foreground">Cód: {item.code || 'N/A'}</p>
                                            </div>
                                        </Label>
                                    );
                                })}
                            </RadioGroup>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCopyProgressModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleConfirmCopyProgress} disabled={!sourceItemId}>
                            Confirmar Cópia
                        </Button>
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
        </>
    );
}


    
