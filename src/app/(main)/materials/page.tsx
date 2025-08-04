
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, setDoc, addDoc, Timestamp, getDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isPast, endOfDay } from "date-fns";
import { ptBR } from 'date-fns/locale';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Imports from shadcn/ui and lucide-react
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Trash2, FileSignature, Search, CalendarIcon, Copy, FileClock, Hourglass, CheckCircle, PackageCheck, Ban, FileUp, History, Pencil, FileDown, AlertTriangle, GanttChart, BrainCircuit, X, XCircle, Folder, FolderOpen, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/dashboard/stat-card";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

// Função utilitária para limpar dados do Firestore
const cleanFirestoreData = (obj: any): any => {
    if (obj === null || obj === undefined) {
        return null;
    }
    
    if (typeof obj !== 'object') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(cleanFirestoreData).filter(item => item !== null && item !== undefined);
    }
    
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            const cleanedValue = cleanFirestoreData(value);
            if (cleanedValue !== undefined) {
                cleaned[key] = cleanedValue;
            }
        }
    }
    return cleaned;
};

// Função para preparar um item da requisição para o Firestore
const prepareRequisitionItem = (item: RequisitionItem): any => {
    const cleanItem: any = {
        id: item.id,
        description: item.description,
        quantityRequested: Number(item.quantityRequested) || 0,
        unit: item.unit,
        status: item.status || "Pendente",
        quantityFulfilled: Number(item.quantityFulfilled) || 0,
        inspectionStatus: item.inspectionStatus || "Pendente"
    };
    
    // Adicionar campos opcionais apenas se tiverem valores válidos
    if (item.code && item.code.trim()) cleanItem.code = item.code.trim();
    if (item.material && item.material.trim()) cleanItem.material = item.material.trim();
    if (item.dimensao && item.dimensao.trim()) cleanItem.dimensao = item.dimensao.trim();
    if (item.notes && item.notes.trim()) cleanItem.notes = item.notes.trim();
    
    // Campos numéricos
    if (item.pesoUnitario !== undefined && item.pesoUnitario !== null && !isNaN(Number(item.pesoUnitario))) {
        cleanItem.pesoUnitario = Number(item.pesoUnitario);
    }
    if (item.invoiceItemValue !== undefined && item.invoiceItemValue !== null && !isNaN(Number(item.invoiceItemValue))) {
        cleanItem.invoiceItemValue = Number(item.invoiceItemValue);
    }
    
    // Campos de data
    if (item.deliveryDate && item.deliveryDate instanceof Date) {
        cleanItem.deliveryDate = Timestamp.fromDate(item.deliveryDate);
    }
    if (item.deliveryReceiptDate && item.deliveryReceiptDate instanceof Date) {
        cleanItem.deliveryReceiptDate = Timestamp.fromDate(item.deliveryReceiptDate);
    }
    
    // Campos do centro de custos
    if (item.supplierName && item.supplierName.trim()) cleanItem.supplierName = item.supplierName.trim();
    if (item.invoiceNumber && item.invoiceNumber.trim()) cleanItem.invoiceNumber = item.invoiceNumber.trim();
    if (item.certificateNumber && item.certificateNumber.trim()) cleanItem.certificateNumber = item.certificateNumber.trim();
    if (item.storageLocation && item.storageLocation.trim()) cleanItem.storageLocation = item.storageLocation.trim();
    
    // Campos adicionais que podem existir
    if (item.weight !== undefined && item.weight !== null && !isNaN(Number(item.weight))) {
        cleanItem.weight = Number(item.weight);
    }
    if (item.weightUnit && item.weightUnit.trim()) cleanItem.weightUnit = item.weightUnit.trim();
    
    return cleanItem;
};

// Schemas & Constants
const itemStatuses = ["Pendente", "Estoque", "Recebido (Aguardando Inspeção)", "Inspecionado e Aprovado", "Inspecionado e Rejeitado"] as const;
const inspectionStatuses = ["Pendente", "Aprovado", "Aprovado com ressalvas", "Rejeitado"] as const;

const requisitionItemSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  material: z.string().optional(),
  dimensao: z.string().optional(),
  pesoUnitario: z.coerce.number().min(0).optional(),
  description: z.string().min(3, "Descrição obrigatória."),
  quantityRequested: z.coerce.number().min(0.1, "Qtd. deve ser maior que 0."),
  quantityFulfilled: z.coerce.number().min(0).optional().default(0),
  unit: z.string().min(1, "Unidade obrigatória (ex: m, kg, pç)."),
  deliveryDate: z.date().optional().nullable(),
  notes: z.string().optional(),
  status: z.string().optional().default("Pendente"),
  
  // New fields for cost center
  supplierName: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceItemValue: z.coerce.number().optional(),
  certificateNumber: z.string().optional(),
  storageLocation: z.string().optional(),
  deliveryReceiptDate: z.date().optional().nullable(),
  inspectionStatus: z.enum(inspectionStatuses).optional().default("Pendente"),
});

const requisitionSchema = z.object({
  id: z.string().optional(),
  requisitionNumber: z.string().optional(),
  date: z.date(),
  status: z.enum(["Pendente", "Estoque", "Atendida Parcialmente", "Atendida Totalmente"]),
  requestedBy: z.string().min(1, "Selecione o responsável"),
  department: z.string().optional(),
  orderId: z.string().optional(),
  customer: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).optional(),
  items: z.array(requisitionItemSchema).min(1, "A requisição deve ter pelo menos um item."),
  approval: z.object({
    approvedBy: z.string().optional(),
    approvalDate: z.date().optional().nullable(),
    justification: z.string().optional(),
  }).optional(),
  generalNotes: z.string().optional(),
  history: z.array(z.object({
    timestamp: z.date(),
    user: z.string(),
    action: z.string(),
    details: z.string().optional(),
  })).optional(),
});

type Requisition = z.infer<typeof requisitionSchema>;
type RequisitionItem = z.infer<typeof requisitionItemSchema>;

const RequisitionStatus: Requisition['status'][] = ["Pendente", "Estoque", "Atendida Parcialmente", "Atendida Totalmente"];

const cuttingPlanItemSchema = z.object({
    id: z.string().optional(),
    code: z.string().optional(),
    description: z.string().min(1, "Descrição é obrigatória"),
    length: z.coerce.number().min(1, "Comprimento deve ser > 0"),
    quantity: z.coerce.number().min(1, "Quantidade deve ser > 0"),
});

const standaloneCuttingPlanSchema = z.object({
  id: z.string().optional(),
  planNumber: z.string().optional(),
  createdAt: z.date(),
  orderId: z.string().optional(),
  customer: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).optional(),
  materialDescription: z.string().optional(),
  stockLength: z.coerce.number().min(1, "Comprimento da barra é obrigatório."),
  kerf: z.coerce.number().min(0, "Espessura do corte não pode ser negativa.").default(0),
  items: z.array(cuttingPlanItemSchema).min(1, "Adicione pelo menos um item para cortar."),
  patterns: z.array(z.any()).optional(),
  summary: z.object({
    totalBars: z.number(),
    totalScrapPercentage: z.number(),
    totalYieldPercentage: z.number(),
    totalScrapLength: z.number(),
  }).optional(),
  deliveryDate: z.date().optional().nullable(),
});

type CuttingPlan = z.infer<typeof standaloneCuttingPlanSchema>;
type CuttingPlanItem = z.infer<typeof cuttingPlanItemSchema>;

type OrderInfo = { id: string; internalOS: string; customerName: string; customerId: string, deliveryDate?: Date; status?: string; };
type TeamMember = { id: string; name: string };
type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
};

interface PlanResult {
  patterns: {
      patternId: number;
      patternString: string;
      pieces: number[];
      barUsage: number;
      leftover: number;
      yieldPercentage: number;
      barsNeeded: number;
  }[];
  summary: {
      totalBars: number;
      totalYieldPercentage: number;
      totalScrapPercentage: number;
      totalScrapLength: number;
  };
}

// Main Component
export default function MaterialsPage() {
    const [activeTab, setActiveTab] = useState("requisitions");
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [cuttingPlansList, setCuttingPlansList] = useState<CuttingPlan[]>([]);
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isRequisitionFormOpen, setIsRequisitionFormOpen] = useState(false);
    const [isCuttingPlanFormOpen, setIsCuttingPlanFormOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);
    const [requisitionToDelete, setRequisitionToDelete] = useState<Requisition | null>(null);
    const [selectedCuttingPlan, setSelectedCuttingPlan] = useState<CuttingPlan | null>(null);
    const [cuttingPlanToDelete, setCuttingPlanToDelete] = useState<CuttingPlan | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchOS, setSearchOS] = useState("");
    
    // New state for folder navigation
    const [selectedOrderFolder, setSelectedOrderFolder] = useState<string | null>(null);
    
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();

    // State for the temporary item form
    const emptyRequisitionItem: RequisitionItem = { id: Date.now().toString(), description: "", quantityRequested: 1, unit: "", material: "", dimensao: "", pesoUnitario: 0, status: "Pendente", code: '', notes: '', deliveryDate: null, inspectionStatus: "Pendente" };
    const [currentItem, setCurrentItem] = useState<RequisitionItem>(emptyRequisitionItem);
    const [editItemIndex, setEditItemIndex] = useState<number | null>(null);

    // State for the temporary cut item form
    const emptyCutItem: CuttingPlanItem = { id: Date.now().toString(), description: "", length: 0, quantity: 1, code: '' };
    const [currentCutItem, setCurrentCutItem] = useState<CuttingPlanItem>(emptyCutItem);
    const [editCutIndex, setEditCutIndex] = useState<number | null>(null);

    const requisitionForm = useForm<Requisition>({
        resolver: zodResolver(requisitionSchema),
        defaultValues: { date: new Date(), status: "Pendente", items: [], history: [], },
    });

    const cuttingPlanForm = useForm<CuttingPlan>({
        resolver: zodResolver(standaloneCuttingPlanSchema),
        defaultValues: { planNumber: "", createdAt: new Date(), stockLength: 6000, kerf: 3, items: [] },
    });
    
    // Destructure setValue to use as a stable dependency
    const { setValue: setCuttingPlanValue } = cuttingPlanForm;

    const { fields: reqItems, append: appendReqItem, remove: removeReqItem, update: updateReqItem } = useFieldArray({ control: requisitionForm.control, name: "items" });
    const { fields: cutItems, append: appendCutItem, remove: removeCutItem, update: updateCutItem } = useFieldArray({ control: cuttingPlanForm.control, name: "items" });
    const watchedCutPlanOrderId = cuttingPlanForm.watch("orderId");

    const filteredOrders = useMemo(() => {
        if (!searchOS.trim()) return orders;
        
        const query = searchOS.toLowerCase();
        return orders.filter(order => 
            order.internalOS.toLowerCase().includes(query) ||
            order.customerName.toLowerCase().includes(query) ||
            (order.status && order.status.toLowerCase().includes(query))
        );
    }, [orders, searchOS]);

    const fetchRequisitions = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setIsLoadingData(true);
        try {
            const [reqsSnapshot, ordersSnapshot, teamSnapshot, cutPlansSnapshot] = await Promise.all([
                getDocs(collection(db, "companies", "mecald", "materialRequisitions")),
                getDocs(collection(db, "companies", "mecald", "orders")),
                getDoc(doc(db, "companies", "mecald", "settings", "team")),
                getDocs(collection(db, "companies", "mecald", "cuttingPlans")),
            ]);

            const ordersDataList = ordersSnapshot.docs
              .map(doc => {
                  const data = doc.data();
                  if (!data.internalOS) return null; // Remove o filtro de status, mantém apenas a verificação de internalOS
                  let deliveryDate: Date | undefined = undefined;
                    if (data.deliveryDate) {
                        if (typeof data.deliveryDate.toDate === 'function') {
                            deliveryDate = data.deliveryDate.toDate();
                        } else if (data.deliveryDate && !isNaN(new Date(data.deliveryDate).getTime())) {
                            deliveryDate = new Date(data.deliveryDate);
                        }
                    }
                  return { 
                      id: doc.id, 
                      internalOS: data.internalOS.toString(), 
                      customerName: data.customer?.name || data.customerName || 'N/A', 
                      customerId: data.customer?.id || data.customerId || '', 
                      deliveryDate: deliveryDate,
                      status: data.status || 'N/A' // Adicionar status para exibição
                  };
              }).filter((order): order is OrderInfo => order !== null);
            setOrders(ordersDataList);

            if (teamSnapshot.exists()) {
                const teamData = teamSnapshot.data();
                if (teamData && Array.isArray(teamData.members)) {
                     const membersList = teamData.members.filter((m: any) => m && m.name).map((m: any) => ({ id: m.id?.toString() || m.name, name: m.name, }));
                    setTeam(membersList);
                }
            }
            
            const reqsList = reqsSnapshot.docs.map(d => {
                const data = d.data();
                
                // Função para conversão segura de timestamps
                const safeToDate = (timestamp: any): Date | null => {
                    if (!timestamp) return null;
                    if (timestamp instanceof Date) return timestamp;
                    if (typeof timestamp.toDate === 'function') {
                        try {
                            return timestamp.toDate();
                        } catch (error) {
                            console.warn("Erro ao converter timestamp:", error);
                            return null;
                        }
                    }
                    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
                        try {
                            const date = new Date(timestamp);
                            return isNaN(date.getTime()) ? null : date;
                        } catch (error) {
                            console.warn("Erro ao converter data:", error);
                            return null;
                        }
                    }
                    return null;
                };
                
                return { 
                    ...data, 
                    id: d.id, 
                    date: safeToDate(data.date) || new Date(), // Fallback para data atual se conversão falhar
                    customer: data.customer || undefined, 
                    approval: data.approval ? { 
                        ...data.approval, 
                        approvalDate: safeToDate(data.approval.approvalDate) || null,
                    } : {}, 
                    items: (data.items || []).map((item: any, index: number) => ({ 
                        id: item.id || `${d.id}-${index}`, 
                        ...item, 
                        deliveryDate: safeToDate(item.deliveryDate) || null,
                        deliveryReceiptDate: safeToDate(item.deliveryReceiptDate) || null
                    })), 
                    history: (data.history || []).map((h: any) => ({
                        ...h, 
                        timestamp: safeToDate(h.timestamp) || new Date()
                    })), 
                } as Requisition;
            });
            setRequisitions(reqsList.sort((a, b) => b.date.getTime() - a.date.getTime()));

            const plansList = cutPlansSnapshot.docs.map(d => {
                const data = d.data();
                
                // Função para conversão segura de timestamps (similar à usada para requisições)
                const safeToDate = (timestamp: any): Date | null => {
                    if (!timestamp) return null;
                    if (timestamp instanceof Date) return timestamp;
                    if (typeof timestamp.toDate === 'function') {
                        try {
                            return timestamp.toDate();
                        } catch (error) {
                            console.warn("Erro ao converter timestamp:", error);
                            return null;
                        }
                    }
                    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
                        try {
                            const date = new Date(timestamp);
                            return isNaN(date.getTime()) ? null : date;
                        } catch (error) {
                            console.warn("Erro ao converter data:", error);
                            return null;
                        }
                    }
                    return null;
                };
                
                return { 
                    ...data, 
                    id: d.id, 
                    createdAt: safeToDate(data.createdAt) || new Date(), // Fallback para data atual se conversão falhar
                    deliveryDate: safeToDate(data.deliveryDate) || null // Fallback para null se conversão falhar
                } as CuttingPlan;
            });
            setCuttingPlansList(plansList.sort((a, b) => (parseInt(b.planNumber || "0") || 0) - (parseInt(a.planNumber || "0") || 0)));
            
        } catch (error: any) {
            console.error("Error fetching data:", error);
            let description = "Não foi possível buscar os dados do sistema.";
            if (error.code === 'permission-denied') { description = "Permissão negada. Verifique as regras de segurança do seu Firestore."; }
            toast({ variant: "destructive", title: "Erro ao Carregar Dados", description, duration: 8000 });
        } finally {
            setIsLoading(false);
            setIsLoadingData(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (user && !authLoading) { fetchRequisitions(); }
    }, [user, authLoading, fetchRequisitions]);

    // Clear search when switching tabs or changing folder
    useEffect(() => {
        setSearchQuery("");
    }, [activeTab, selectedOrderFolder]);

    // Clear OS search when requisition form closes
    useEffect(() => {
        if (!isRequisitionFormOpen) {
            setSearchOS("");
        }
    }, [isRequisitionFormOpen]);
    
    // Corrected useEffect for customer linking
    useEffect(() => {
        // Find the selected order based on the watched order ID
        if (watchedCutPlanOrderId) {
            const selectedOrder = orders.find(o => o.id === watchedCutPlanOrderId);
            // If an order is found, update the customer details in the form
            if (selectedOrder) {
                setCuttingPlanValue('customer', {
                    id: selectedOrder.customerId,
                    name: selectedOrder.customerName,
                });
            }
        // If no order ID is selected, clear the customer details.
        } else {
             setCuttingPlanValue('customer', undefined);
        }
    }, [watchedCutPlanOrderId, orders, setCuttingPlanValue]);

    // Handlers
    const handleOpenRequisitionForm = (requisition: Requisition | null = null) => {
        setSelectedRequisition(requisition);
        setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() });
        setEditItemIndex(null);
        if (requisition) { requisitionForm.reset(requisition); } 
        else { requisitionForm.reset({ date: new Date(), status: "Pendente", items: [], history: [], requestedBy: user?.displayName || user?.email || undefined, }); }
        setIsRequisitionFormOpen(true);
    };

    const handleOpenCuttingPlanForm = (plan: CuttingPlan | null = null) => {
        setSelectedCuttingPlan(plan);
        setCurrentCutItem({ ...emptyCutItem, id: Date.now().toString() });
        setEditCutIndex(null);
        if (plan) { 
            cuttingPlanForm.reset(plan); 
        } else { 
            // If we have a selected order folder, pre-populate the form with that order
            const initialValues: any = { 
                planNumber: "", 
                createdAt: new Date(), 
                stockLength: 6000, 
                kerf: 3, 
                items: [] 
            };
            
            if (selectedOrderFolder && selectedOrderFolder !== 'no-order') {
                initialValues.orderId = selectedOrderFolder;
            }
            
            cuttingPlanForm.reset(initialValues); 
        }
        setIsCuttingPlanFormOpen(true);
    };

    const handleDeleteRequisition = (requisition: Requisition) => { setRequisitionToDelete(requisition); setIsDeleting(true); };
    const handleDeleteCuttingPlan = (plan: CuttingPlan) => { setCuttingPlanToDelete(plan); setIsDeleting(true); };

    const confirmDelete = async () => {
        try {
            if (requisitionToDelete?.id) {
                await deleteDoc(doc(db, "companies", "mecald", "materialRequisitions", requisitionToDelete.id));
                toast({ title: "Requisição excluída!", description: "A requisição foi removida." });
            } else if (cuttingPlanToDelete?.id) {
                await deleteDoc(doc(db, "companies", "mecald", "cuttingPlans", cuttingPlanToDelete.id));
                toast({ title: "Plano de Corte excluído!", description: "O plano foi removido." });
            }
            await fetchRequisitions();
        } catch (error) {
            toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível remover o item." });
        } finally {
            setIsDeleting(false);
            setRequisitionToDelete(null);
            setCuttingPlanToDelete(null);
        }
    };
    
    const onRequisitionSubmit = async (data: Requisition) => {
        try {
            const newHistoryEntry = { 
                timestamp: new Date(), 
                user: user?.email || "Sistema", 
                action: selectedRequisition ? "Edição" : "Criação", 
                details: `Requisição ${selectedRequisition ? 'editada' : 'criada'}.` 
            };
            const finalHistory = [...(data.history || []), newHistoryEntry];
            
            // Preservar dados existentes dos itens (especialmente peso e dados de precificação)
            let mergedItems = data.items;
            
            if (selectedRequisition) {
                // Se estamos editando, precisamos preservar dados que podem ter sido adicionados em outras telas
                const existingReq = requisitions.find(r => r.id === selectedRequisition.id);
                if (existingReq) {
                    mergedItems = data.items.map(editedItem => {
                        const existingItem = existingReq.items.find(ei => ei.id === editedItem.id);
                        if (existingItem) {
                            // Preservar campos importantes que podem ter sido preenchidos em costs/page.tsx
                            return {
                                ...editedItem,
                                // Preservar dados de precificação e recebimento se já existirem
                                weight: existingItem.weight !== undefined ? existingItem.weight : editedItem.weight,
                                weightUnit: existingItem.weightUnit || editedItem.weightUnit,
                                supplierName: existingItem.supplierName || editedItem.supplierName,
                                invoiceNumber: existingItem.invoiceNumber || editedItem.invoiceNumber,
                                invoiceItemValue: existingItem.invoiceItemValue !== undefined ? existingItem.invoiceItemValue : editedItem.invoiceItemValue,
                                certificateNumber: existingItem.certificateNumber || editedItem.certificateNumber,
                                storageLocation: existingItem.storageLocation || editedItem.storageLocation,
                                deliveryReceiptDate: existingItem.deliveryReceiptDate || editedItem.deliveryReceiptDate,
                                inspectionStatus: existingItem.inspectionStatus || editedItem.inspectionStatus,
                            };
                        }
                        return editedItem;
                    });
                }
            }
            
            // Preparar dados base
            const baseData: any = {
                date: Timestamp.fromDate(data.date),
                status: data.status,
                requestedBy: data.requestedBy,
                history: finalHistory.map(h => ({ 
                    timestamp: Timestamp.fromDate(h.timestamp),
                    user: h.user || "Sistema",
                    action: h.action || "Ação",
                    details: h.details || null
                })),
                items: mergedItems.map(item => prepareRequisitionItem(item))
            };
            
            // Adicionar campos opcionais apenas se tiverem valores
            if (data.department && data.department.trim()) {
                baseData.department = data.department.trim();
            }
            if (data.orderId && data.orderId.trim()) {
                baseData.orderId = data.orderId.trim();
            }
            if (data.generalNotes && data.generalNotes.trim()) {
                baseData.generalNotes = data.generalNotes.trim();
            }
            
            // Handle customer field
            if (data.customer && data.customer.id && data.customer.name) {
                baseData.customer = {
                    id: data.customer.id,
                    name: data.customer.name
                };
            }
            
            // Handle approval field
            if (data.approval && data.approval.approvedBy && data.approval.approvedBy.trim()) {
                baseData.approval = {
                    approvedBy: data.approval.approvedBy.trim(),
                    approvalDate: data.approval.approvalDate ? Timestamp.fromDate(new Date(data.approval.approvalDate)) : null,
                    justification: (data.approval.justification && data.approval.justification.trim()) ? data.approval.justification.trim() : null
                };
            }
            
            // Limpeza final para remover qualquer undefined restante
            const finalData = cleanFirestoreData(baseData);
            
            // Debug logging
            console.log("Final data being sent to Firestore:", JSON.stringify(finalData, null, 2));
            
            if (selectedRequisition && selectedRequisition.id) {
                await updateDoc(doc(db, "companies", "mecald", "materialRequisitions", selectedRequisition.id), finalData);
            } else {
                const reqNumbers = requisitions.map(r => parseInt(r.requisitionNumber || "0", 10)).filter(n => !isNaN(n));
                const highestNumber = reqNumbers.length > 0 ? Math.max(...reqNumbers) : 0;
                finalData.requisitionNumber = (highestNumber + 1).toString().padStart(5, '0');
                await addDoc(collection(db, "companies", "mecald", "materialRequisitions"), finalData);
            }
            
            toast({ title: selectedRequisition ? "Requisição atualizada!" : "Requisição criada!" });
            setIsRequisitionFormOpen(false);
            await fetchRequisitions();
        } catch (error) {
            console.error("Error saving requisition:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Ocorreu um erro ao salvar a requisição." });
        }
    };

    const onCuttingPlanSubmit = async (data: CuttingPlan) => {
        try {
            const dataToSave: any = { 
                createdAt: Timestamp.fromDate(data.createdAt),
                stockLength: Number(data.stockLength),
                kerf: Number(data.kerf),
                items: data.items.map(item => ({
                    id: item.id,
                    description: item.description,
                    length: Number(item.length),
                    quantity: Number(item.quantity),
                    ...(item.code && item.code.trim() && { code: item.code.trim() })
                }))
            };
            
            // Adicionar campos opcionais apenas se tiverem valores
            if (data.materialDescription && data.materialDescription.trim()) {
                dataToSave.materialDescription = data.materialDescription.trim();
            }
            if (data.orderId && data.orderId.trim()) {
                dataToSave.orderId = data.orderId.trim();
            }
            if (data.deliveryDate) {
                dataToSave.deliveryDate = Timestamp.fromDate(new Date(data.deliveryDate));
            }
            if (data.patterns) {
                dataToSave.patterns = data.patterns;
            }
            if (data.summary) {
                dataToSave.summary = data.summary;
            }
            
            // Handle customer field properly
            if (data.customer && data.customer.id && data.customer.name) {
                dataToSave.customer = {
                    id: data.customer.id,
                    name: data.customer.name
                };
            }
            
            // Limpeza final
            const cleanedDataToSave = cleanFirestoreData(dataToSave);
            
            if (selectedCuttingPlan && selectedCuttingPlan.id) {
                await updateDoc(doc(db, "companies", "mecald", "cuttingPlans", selectedCuttingPlan.id), cleanedDataToSave);
            } else {
                const planNumbers = cuttingPlansList.map(p => parseInt(p.planNumber || "0", 10)).filter(n => !isNaN(n));
                const highestNumber = planNumbers.length > 0 ? Math.max(...planNumbers) : 0;
                cleanedDataToSave.planNumber = (highestNumber + 1).toString().padStart(5, '0');
                await addDoc(collection(db, "companies", "mecald", "cuttingPlans"), cleanedDataToSave);
            }
            
            toast({ title: selectedCuttingPlan ? "Plano atualizado!" : "Plano de Corte criado!" });
            setIsCuttingPlanFormOpen(false);
            await fetchRequisitions();
        } catch (error) {
            console.error("Error saving cutting plan:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Ocorreu um erro ao salvar o plano de corte." });
        }
    };

    const handleExportPDF = async (requisitionToExport: Requisition) => {
        toast({ title: "Gerando PDF...", description: "Aguarde enquanto o arquivo é preparado." });
        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const companySnap = await getDoc(companyRef);
            const companyData: CompanyData = companySnap.exists() ? companySnap.data() as CompanyData : {};
            const orderInfo = orders.find(o => o.id === requisitionToExport.orderId);
            const docPdf = new jsPDF({ orientation: "landscape" });
            const pageWidth = docPdf.internal.pageSize.width;

            if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, 12, 40, 15); } catch (e) { console.error("Error adding logo to PDF:", e); } }
            docPdf.setFontSize(18);
            docPdf.text(`Requisição de Material Nº: ${requisitionToExport.requisitionNumber}`, pageWidth / 2, 20, { align: 'center' });
            
            docPdf.setFontSize(10);
            const subheaderY = 35;
            docPdf.text(`Data: ${(() => {
                try {
                    // Se for um Timestamp do Firestore
                    if (requisitionToExport.date && typeof requisitionToExport.date.toDate === 'function') {
                        return format(requisitionToExport.date.toDate(), 'dd/MM/yyyy');
                    }
                    // Se for uma string ou número
                    if (typeof requisitionToExport.date === 'string' || typeof requisitionToExport.date === 'number') {
                        const parsedDate = new Date(requisitionToExport.date);
                        if (!isNaN(parsedDate.getTime())) {
                            return format(parsedDate, 'dd/MM/yyyy');
                        }
                    }
                    // Se já for um objeto Date
                    if (requisitionToExport.date instanceof Date && !isNaN(requisitionToExport.date.getTime())) {
                        return format(requisitionToExport.date, 'dd/MM/yyyy');
                    }
                    return 'N/A';
                } catch (error) {
                    console.warn('Erro ao formatar data da requisição:', error);
                    return 'N/A';
                }
            })()}`, 15, subheaderY);
            docPdf.text(`Solicitante: ${requisitionToExport.requestedBy}`, 15, subheaderY + 5);
            docPdf.text(`Status: ${requisitionToExport.status}`, 15, subheaderY + 10);
            const os = orderInfo?.internalOS || 'N/A';
            const customerName = orderInfo?.customerName || 'N/A';
            const orderDeliveryDate = (() => {
                if (!orderInfo?.deliveryDate) return 'N/A';
                try {
                    // Se for um Timestamp do Firestore
                    if (orderInfo.deliveryDate && typeof orderInfo.deliveryDate.toDate === 'function') {
                        return format(orderInfo.deliveryDate.toDate(), 'dd/MM/yyyy');
                    }
                    // Se for uma string ou número
                    if (typeof orderInfo.deliveryDate === 'string' || typeof orderInfo.deliveryDate === 'number') {
                        const parsedDate = new Date(orderInfo.deliveryDate);
                        if (!isNaN(parsedDate.getTime())) {
                            return format(parsedDate, 'dd/MM/yyyy');
                        }
                    }
                    // Se já for um objeto Date
                    if (orderInfo.deliveryDate instanceof Date && !isNaN(orderInfo.deliveryDate.getTime())) {
                        return format(orderInfo.deliveryDate, 'dd/MM/yyyy');
                    }
                    return 'N/A';
                } catch (error) {
                    console.warn('Erro ao formatar data de entrega do pedido:', error);
                    return 'N/A';
                }
            })();
            docPdf.text(`OS Vinculada: ${os}`, pageWidth - 15, subheaderY, { align: 'right' });
            docPdf.text(`Cliente: ${customerName}`, pageWidth - 15, subheaderY + 5, { align: 'right' });
            docPdf.text(`Entrega do Pedido: ${orderDeliveryDate}`, pageWidth - 15, subheaderY + 10, { align: 'right' });

            const head = [['Cód.', 'Descrição', 'Dimensão', 'Material', 'Qtd.', 'Peso Unit. (kg)', 'Entrega Prev.', 'Status']];
            const body = requisitionToExport.items.map(item => {
                // Função para conversão segura de data
                const formatDeliveryDate = (date: any) => {
                    if (!date) return 'N/A';
                    try {
                        // Se for um Timestamp do Firestore
                        if (date && typeof date.toDate === 'function') {
                            return format(date.toDate(), 'dd/MM/yyyy');
                        }
                        // Se for uma string ou número
                        if (typeof date === 'string' || typeof date === 'number') {
                            const parsedDate = new Date(date);
                            if (!isNaN(parsedDate.getTime())) {
                                return format(parsedDate, 'dd/MM/yyyy');
                            }
                        }
                        // Se já for um objeto Date
                        if (date instanceof Date && !isNaN(date.getTime())) {
                            return format(date, 'dd/MM/yyyy');
                        }
                        return 'N/A';
                    } catch (error) {
                        console.warn('Erro ao formatar data de entrega:', error);
                        return 'N/A';
                    }
                };
                
                return [
                    item.code || '-', 
                    item.description, 
                    item.dimensao || '-', 
                    item.material || '-', 
                    item.quantityRequested.toString(), 
                    (item.pesoUnitario || 0).toFixed(2), 
                    formatDeliveryDate(item.deliveryDate), 
                    item.status || 'Pendente'
                ];
            });
            autoTable(docPdf, { startY: 55, head, body, styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 40] }, columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 40 }, 3: { cellWidth: 30 }, 4: { cellWidth: 20, halign: 'center' }, 5: { cellWidth: 25, halign: 'center' }, 6: { cellWidth: 25, halign: 'center' }, 7: { cellWidth: 40 }, } });

            let finalY = (docPdf as any).lastAutoTable.finalY + 10;
            if (requisitionToExport.generalNotes) {
                docPdf.setFontSize(10).setFont(undefined, 'bold');
                docPdf.text('Observações Gerais:', 15, finalY);
                finalY += 5;
                docPdf.setFontSize(9).setFont(undefined, 'normal');
                const splitNotes = docPdf.splitTextToSize(requisitionToExport.generalNotes, pageWidth - 30);
                docPdf.text(splitNotes, 15, finalY);
            }
            docPdf.save(`Requisicao_${requisitionToExport.requisitionNumber}.pdf`);
        } catch (error) {
            console.error("Error exporting PDF:", error);
            toast({ variant: "destructive", title: "Erro ao exportar", description: "Não foi possível gerar o PDF." });
        }
    }
    
    const handleExportCutPlanPDF = async (plan: CuttingPlan) => {
        if (!plan || !plan.items || plan.items.length === 0 || !plan.summary) {
            toast({ variant: 'destructive', title: 'Nenhum plano gerado', description: 'Gere um plano de corte antes de exportar.' });
            return;
        }
        toast({ title: "Gerando PDF do Plano de Corte..." });
        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const companySnap = await getDoc(companyRef);
            const companyData: CompanyData = companySnap.exists() ? companySnap.data() as CompanyData : {};
            const orderInfo = orders.find(o => o.id === plan.orderId);
            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            let y = 15;

            if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15); } catch (e) { console.error("Error adding logo to PDF:", e); } }
            docPdf.setFontSize(16).setFont(undefined, 'bold');
            docPdf.text(`Plano de Corte Nº ${plan.planNumber}`, pageWidth / 2, y + 5, { align: 'center' });
            y += 5;
            docPdf.setFontSize(9).setFont(undefined, 'normal');
            const customerName = plan.customer?.name || orderInfo?.customerName || 'N/A';
            docPdf.text(`OS: ${orderInfo?.internalOS || 'N/A'} | Cliente: ${customerName}`, pageWidth / 2, y + 5, { align: 'center' });
            y = 50;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Parâmetros de Entrada', 15, y); y += 6;
            autoTable(docPdf, { 
                startY: y, 
                theme: 'plain', 
                styles: { fontSize: 9 }, 
                body: [ 
                    ['Material da Barra:', plan.materialDescription || 'Não especificado'], 
                    ['Comprimento da Barra:', `${plan.stockLength} mm`], 
                    ['Espessura do Corte (Kerf):', `${plan.kerf} mm`], 
                    ['Entrega Prevista do Corte:', (() => {
                        if (!plan.deliveryDate) return 'N/A';
                        try {
                            // Se for um Timestamp do Firestore
                            if (plan.deliveryDate && typeof plan.deliveryDate.toDate === 'function') {
                                return format(plan.deliveryDate.toDate(), 'dd/MM/yyyy');
                            }
                            // Se for uma string ou número
                            if (typeof plan.deliveryDate === 'string' || typeof plan.deliveryDate === 'number') {
                                const parsedDate = new Date(plan.deliveryDate);
                                if (!isNaN(parsedDate.getTime())) {
                                    return format(parsedDate, 'dd/MM/yyyy');
                                }
                            }
                            // Se já for um objeto Date
                            if (plan.deliveryDate instanceof Date && !isNaN(plan.deliveryDate.getTime())) {
                                return format(plan.deliveryDate, 'dd/MM/yyyy');
                            }
                            return 'N/A';
                        } catch (error) {
                            console.warn('Erro ao formatar data de entrega do plano:', error);
                            return 'N/A';
                        }
                    })()], 
                ], 
            });
            y = (docPdf as any).lastAutoTable.finalY + 10;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Itens a Cortar', 15, y); y += 6;
            autoTable(docPdf, { startY: y, head: [['Código', 'Descrição', 'Comprimento (mm)', 'Quantidade']], body: plan.items.map(item => [item.code || '-', item.description, item.length, item.quantity]), headStyles: { fillColor: [40, 40, 40] } });
            y = (docPdf as any).lastAutoTable.finalY + 10;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Padrões de Corte Otimizados', 15, y); y += 6;
            autoTable(docPdf, { startY: y, head: [['#', 'Padrão de Corte (Peças x Comp.)', 'Sobra (mm)', 'Nº de Barras', 'Rendimento', 'Exec. [ ]']], body: plan.patterns!.map((p: any) => [ p.patternId, p.patternString, (Number(p.leftover) || 0).toFixed(2), p.barsNeeded, `${(Number(p.yieldPercentage) || 0).toFixed(1)}%`, '' ]), headStyles: { fillColor: [40, 40, 40] }, didDrawCell: function (data) { if (data.section === 'body' && data.column.index === 5) { const x = data.cell.x + (data.cell.width / 2) - 2; const y = data.cell.y + (data.cell.height / 2) - 2; docPdf.rect(x, y, 4, 4); } } });
            y = (docPdf as any).lastAutoTable.finalY + 10;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Resumo do Plano', 15, y); y += 6;
            autoTable(docPdf, { startY: y, theme: 'plain', styles: { fontSize: 9 }, body: [ ['Total de Barras Necessárias:', plan.summary!.totalBars.toString()], ['Rendimento Total:', `${plan.summary!.totalYieldPercentage.toFixed(2)}%`], ['Sucata Total:', `${plan.summary!.totalScrapPercentage.toFixed(2)}%`], ], });
    
            docPdf.save(`PlanoCorte_${plan.planNumber}.pdf`);
        } catch (error) {
            console.error("Error exporting cut plan PDF:", error);
            toast({ variant: "destructive", title: "Erro ao exportar", description: "Não foi possível gerar o PDF do plano de corte." });
        }
    };
    
    // Filters & Memoized values
    const filteredRequisitions = useMemo(() => requisitions.filter(r => searchQuery === "" || r.requisitionNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || r.requestedBy?.toLowerCase().includes(searchQuery.toLowerCase()) || r.status.toLowerCase().includes(searchQuery.toLowerCase()) || r.items.some(i => i.description.toLowerCase().includes(searchQuery.toLowerCase()))), [requisitions, searchQuery]);
    
    const filteredCuttingPlans = useMemo(() => {
        let filtered = cuttingPlansList;
        
        // Filter by selected order folder if one is selected
        if (selectedOrderFolder) {
            if (selectedOrderFolder === 'no-order') {
                filtered = filtered.filter(p => !p.orderId);
            } else {
                filtered = filtered.filter(p => p.orderId === selectedOrderFolder);
            }
        }
        
        // Apply search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(p => {
                const order = orders.find(o => o.id === p.orderId);
                return (
                    p.planNumber?.toLowerCase().includes(query) ||
                    order?.internalOS?.toLowerCase().includes(query) ||
                    p.materialDescription?.toLowerCase().includes(query) ||
                    p.customer?.name?.toLowerCase().includes(query)
                );
            });
        }
        
        return filtered;
    }, [cuttingPlansList, searchQuery, orders, selectedOrderFolder]);

    // Group cutting plans by order for folder view
    const cuttingPlanFolders = useMemo(() => {
        const folders = new Map<string, { order: OrderInfo; plansCount: number }>();
        
        cuttingPlansList.forEach(plan => {
            if (plan.orderId) {
                const order = orders.find(o => o.id === plan.orderId);
                if (order) {
                    const existing = folders.get(plan.orderId);
                    folders.set(plan.orderId, {
                        order,
                        plansCount: existing ? existing.plansCount + 1 : 1
                    });
                }
            }
        });
        
        // Also include plans without order in a special folder
        const plansWithoutOrder = cuttingPlansList.filter(p => !p.orderId);
        if (plansWithoutOrder.length > 0) {
            folders.set('no-order', {
                order: { id: 'no-order', internalOS: 'Sem OS', customerName: 'Não vinculado', customerId: '' },
                plansCount: plansWithoutOrder.length
            });
        }
        
        return Array.from(folders.entries()).map(([orderId, data]) => ({
            orderId,
            ...data
        }));
    }, [cuttingPlansList, orders]);

    const overdueItems = useMemo(() => {
        return requisitions.flatMap(req => 
            req.items
                .filter(item => item.deliveryDate && isPast(endOfDay(item.deliveryDate)) && !["Inspecionado e Aprovado", "Inspecionado e Rejeitado"].includes(item.status))
                .map(item => ({
                    ...item,
                    fullId: `${req.id}-${item.id}`,
                    requisitionNumber: req.requisitionNumber,
                }))
        );
    }, [requisitions]);
    
    const getStatusVariant = (status: Requisition['status']) => { 
        switch (status) { 
            case "Pendente": return "secondary"; 
            case "Estoque": return "outline";
            case "Atendida Parcialmente": return "outline"; 
            case "Atendida Totalmente": return "default"; 
            default: return "outline"; 
        } 
    }

    const dashboardStats = useMemo(() => ({ 
        pending: requisitions.filter(r => r.status === 'Pendente').length, 
        inStock: requisitions.filter(r => r.status === 'Estoque').length, 
        total: requisitions.length, 
    }), [requisitions]);

    const generateCuttingPlan = () => {
        const cuttingPlanValues = cuttingPlanForm.getValues();
        const { stockLength, kerf, items } = cuttingPlanValues;
        if (!stockLength || !items || items.length === 0) { toast({ variant: 'destructive', title: 'Entrada Inválida', description: 'Forneça o comprimento da barra e pelo menos um item para cortar.' }); return; }
        const stockLengthNum = Number(stockLength);
        const kerfNum = Number(kerf || 0);
        const allPieces: { code?: string; description: string; length: number }[] = (items || []).flatMap(item => { const quantityNum = Math.floor(Number(item.quantity) || 0); const lengthNum = Number(item.length) || 0; if (quantityNum > 0 && lengthNum > 0) { return Array.from({ length: quantityNum }, () => ({ code: item.code || '', description: item.description, length: lengthNum })); } return []; });
        if (allPieces.length === 0) { toast({ variant: 'destructive', title: 'Nenhum item válido', description: 'Verifique as quantidades e comprimentos dos itens.' }); return; }
        allPieces.sort((a, b) => b.length - a.length);
        const bins: { pieces: number[]; remaining: number }[] = [];
        for (const piece of allPieces) {
            if (piece.length > stockLengthNum) continue;
            let placed = false;
            for (const bin of bins) { const spaceNeeded = bin.pieces.length > 0 ? piece.length + kerfNum : piece.length; if (bin.remaining >= spaceNeeded) { bin.pieces.push(piece.length); bin.remaining -= spaceNeeded; placed = true; break; } }
            if (!placed) { bins.push({ pieces: [piece.length], remaining: stockLengthNum - piece.length, }); }
        }
        let patternId = 1; let totalScrap = 0; const finalPatterns: PlanResult['patterns'] = [];
        bins.forEach(bin => {
            const piecesUsedSum = bin.pieces.reduce((sum, p) => sum + p, 0); const kerfTotal = Math.max(0, bin.pieces.length - 1) * kerfNum; const barUsage = piecesUsedSum + kerfTotal; const leftover = stockLengthNum - barUsage;
            const pieceCounts = new Map<number, number>(); bin.pieces.forEach(p => { pieceCounts.set(p, (pieceCounts.get(p) || 0) + 1); });
            const sortedPieces = Array.from(pieceCounts.entries()).sort(([a], [b]) => b - a); const patternString = sortedPieces.map(([length, count]) => `${count} x ${length}mm`).join(' + ');
            finalPatterns.push({ patternId: patternId++, patternString, pieces: bin.pieces, barUsage: Number(barUsage) || 0, leftover: Number(leftover) || 0, yieldPercentage: Number((piecesUsedSum / stockLengthNum) * 100) || 0, barsNeeded: 1, });
        });
        const totalBars = finalPatterns.length; const totalMaterialLength = totalBars * stockLengthNum; totalScrap = finalPatterns.reduce((sum, p) => sum + p.leftover, 0); const totalYield = totalMaterialLength > 0 ? ((totalMaterialLength - totalScrap) / totalMaterialLength) * 100 : 0;
        const results: PlanResult = { patterns: finalPatterns, summary: { totalBars: totalBars, totalYieldPercentage: totalYield, totalScrapPercentage: 100 - totalYield, totalScrapLength: totalScrap, }, };
        
        cuttingPlanForm.setValue('patterns', results.patterns);
        cuttingPlanForm.setValue('summary', results.summary);
        toast({ title: "Plano de Corte Gerado!", description: "Os resultados foram calculados e exibidos." });
    };

    // Form item handlers
    const handleCurrentCutItemChange = (field: keyof CuttingPlanItem, value: any) => setCurrentCutItem(prev => ({...prev, [field]: value}));
    const handleAddCutItem = () => { const result = cuttingPlanItemSchema.safeParse(currentCutItem); if (!result.success) { const firstError = result.error.errors[0]; toast({ variant: 'destructive', title: `Erro de validação: ${firstError.path[0]}`, description: firstError.message }); return; } appendCutItem(result.data); setCurrentCutItem({ ...emptyCutItem, id: Date.now().toString() }); };
    const handleUpdateCutItem = () => { if (editCutIndex === null) return; const result = cuttingPlanItemSchema.safeParse(currentCutItem); if (!result.success) { const firstError = result.error.errors[0]; toast({ variant: 'destructive', title: `Erro de validação: ${firstError.path[0]}`, description: firstError.message }); return; } updateCutItem(editCutIndex, result.data); setCurrentCutItem({ ...emptyCutItem, id: Date.now().toString() }); setEditCutIndex(null); };
    const handleEditCutItem = (index: number) => { setEditCutIndex(index); setCurrentCutItem(cuttingPlanForm.getValues(`items.${index}`)); };
    const handleCancelEditCutItem = () => { setCurrentCutItem({ ...emptyCutItem, id: Date.now().toString() }); setEditCutIndex(null); }
    const handleCurrentItemChange = (field: keyof RequisitionItem, value: any) => { if (field === 'deliveryDate') { setCurrentItem(prev => ({...prev, [field]: value ? new Date(value) : null})); } else { setCurrentItem(prev => ({...prev, [field]: value})); } };
    const handleAddItem = () => { const dataToValidate = { ...currentItem, id: currentItem.id || Date.now().toString(), quantityRequested: Number(currentItem.quantityRequested) || 0, pesoUnitario: Number(currentItem.pesoUnitario) || 0, }; const result = requisitionItemSchema.safeParse(dataToValidate); if (!result.success) { const firstError = result.error.errors[0]; toast({ variant: 'destructive', title: `Erro de validação: ${firstError.path[0]}`, description: firstError.message }); return; } appendReqItem(result.data); setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() }); };
    const handleUpdateItem = () => { if (editItemIndex === null) return; const dataToValidate = { ...currentItem, quantityRequested: Number(currentItem.quantityRequested) || 0, pesoUnitario: Number(currentItem.pesoUnitario) || 0, }; const result = requisitionItemSchema.safeParse(dataToValidate); if (!result.success) { const firstError = result.error.errors[0]; toast({ variant: 'destructive', title: `Erro de validação: ${firstError.path[0]}`, description: firstError.message }); return; } updateReqItem(editItemIndex, result.data); setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() }); setEditItemIndex(null); };
    const handleEditItem = (index: number) => { setEditItemIndex(index); setCurrentItem(requisitionForm.getValues(`items.${index}`)); };
    const handleCancelEditItem = () => { setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() }); setEditItemIndex(null); };
return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Requisição e Planos de Corte</h1>
                     <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder={
                                    activeTab === 'cuttingPlans' && selectedOrderFolder 
                                        ? `Buscar na OS ${cuttingPlanFolders.find(f => f.orderId === selectedOrderFolder)?.order.internalOS || 'N/A'}...`
                                        : "Buscar..."
                                } 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="pl-9 w-64"
                            />
                        </div>
                        {activeTab === 'requisitions' ? (
                            <Button onClick={() => handleOpenRequisitionForm()} disabled={isLoadingData}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Nova Requisição
                            </Button>
                        ) : (
                            <Button onClick={() => handleOpenCuttingPlanForm()} disabled={isLoadingData}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Novo Plano de Corte
                            </Button>
                        )}
                     </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="requisitions">Requisições de Materiais</TabsTrigger>
                        <TabsTrigger value="cuttingPlans">Planos de Corte</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="requisitions">
                        {overdueItems.length > 0 && (
                            <Card className="mb-4 border-destructive bg-destructive/5">
                                <CardHeader>
                                <CardTitle className="text-destructive flex items-center gap-2">
                                    <AlertTriangle />
                                    Alertas de Itens Atrasados
                                </CardTitle>
                                <CardDescription className="text-destructive/80">
                                    Os seguintes itens têm data de entrega prevista vencida e não foram marcados como recebidos/aprovados.
                                </CardDescription>
                                </CardHeader>
                                <CardContent>
                                <Table>
                                    <TableHeader>
                                    <TableRow>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Requisição Nº</TableHead>
                                        <TableHead>Data Prevista</TableHead>
                                    </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                    {overdueItems.map(item => (
                                        <TableRow key={item.fullId}>
                                        <TableCell>{item.description}</TableCell>
                                        <TableCell>{item.requisitionNumber}</TableCell>
                                        <TableCell>{(() => {
                                            if (!item.deliveryDate) return 'N/A';
                                            try {
                                                // Se for um Timestamp do Firestore
                                                if (item.deliveryDate && typeof item.deliveryDate.toDate === 'function') {
                                                    return format(item.deliveryDate.toDate(), 'dd/MM/yyyy');
                                                }
                                                // Se for uma string ou número
                                                if (typeof item.deliveryDate === 'string' || typeof item.deliveryDate === 'number') {
                                                    const parsedDate = new Date(item.deliveryDate);
                                                    if (!isNaN(parsedDate.getTime())) {
                                                        return format(parsedDate, 'dd/MM/yyyy');
                                                    }
                                                }
                                                // Se já for um objeto Date
                                                if (item.deliveryDate instanceof Date && !isNaN(item.deliveryDate.getTime())) {
                                                    return format(item.deliveryDate, 'dd/MM/yyyy');
                                                }
                                                return 'N/A';
                                            } catch (error) {
                                                console.warn('Erro ao formatar data de entrega do item atrasado:', error);
                                                return 'N/A';
                                            }
                                        })()}</TableCell>
                                        </TableRow>
                                    ))}
                                    </TableBody>
                                </Table>
                                </CardContent>
                            </Card>
                        )}
                        <div className="grid gap-4 md:grid-cols-3">
                            <StatCard title="Requisições Pendentes" value={dashboardStats.pending.toString()} icon={Hourglass} description="Aguardando atendimento" />
                            <StatCard title="Itens em Estoque" value={dashboardStats.inStock.toString()} icon={PackageCheck} description="Requisições atendidas pelo estoque" />
                            <StatCard title="Total de Requisições" value={dashboardStats.total.toString()} icon={FileSignature} description="Total de requisições no sistema" />
                        </div>
                        <Card className="mt-4">
                            <CardHeader>
                                <CardTitle>Histórico de Requisições</CardTitle>
                                <CardDescription>Gerencie todas as solicitações de materiais para produção e outros setores.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? <Skeleton className="h-64 w-full" /> : (
                                     <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Nº</TableHead>
                                                <TableHead>Data</TableHead>
                                                <TableHead>Solicitante</TableHead>
                                                <TableHead>OS Vinculada</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredRequisitions.length > 0 ? (
                                                filteredRequisitions.map(req => (
                                                    <TableRow key={req.id}>
                                                        <TableCell className="font-medium">{req.requisitionNumber || req.id}</TableCell>
                                                        <TableCell>{format(req.date, 'dd/MM/yyyy')}</TableCell>
                                                        <TableCell>{req.requestedBy}</TableCell>
                                                        <TableCell>{orders.find(o => o.id === req.orderId)?.internalOS || 'N/A'}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={getStatusVariant(req.status)} className={cn(req.status === 'Atendida Totalmente' && 'bg-green-600')}>
                                                                {req.status}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={() => handleExportPDF(req)}
                                                                title="Exportar PDF"
                                                            >
                                                                <FileDown className="h-4 w-4" />
                                                            </Button>
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={() => handleOpenRequisitionForm(req)}
                                                                title="Editar"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="text-destructive" 
                                                                onClick={() => handleDeleteRequisition(req)}
                                                                title="Excluir"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : ( 
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">
                                                        Nenhuma requisição encontrada.
                                                    </TableCell>
                                                </TableRow> 
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="cuttingPlans">
                        <Card>
                             <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>
                                        {selectedOrderFolder ? (
                                            <div className="flex items-center gap-2">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => setSelectedOrderFolder(null)}
                                                    className="mr-2"
                                                >
                                                    <ArrowLeft className="h-4 w-4" />
                                                </Button>
                                                Planos de Corte - OS {cuttingPlanFolders.find(f => f.orderId === selectedOrderFolder)?.order.internalOS || 'N/A'}
                                            </div>
                                        ) : (
                                            "Planos de Corte por OS"
                                        )}
                                    </CardTitle>
                                    <CardDescription>
                                        {selectedOrderFolder 
                                            ? "Planos de corte para esta ordem de serviço"
                                            : "Selecione uma OS para visualizar os planos de corte"
                                        }
                                    </CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? <Skeleton className="h-64 w-full" /> : (
                                    <>
                                        {!selectedOrderFolder ? (
                                            // Folder view - show OS folders
                                            <>
                                                {/* Statistics */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                                    <StatCard 
                                                        title="OS's com Planos" 
                                                        value={cuttingPlanFolders.length.toString()} 
                                                        icon={Folder} 
                                                        description="Ordens de serviço com planos de corte" 
                                                    />
                                                    <StatCard 
                                                        title="Total de Planos" 
                                                        value={cuttingPlansList.length.toString()} 
                                                        icon={GanttChart} 
                                                        description="Planos de corte no sistema" 
                                                    />
                                                    <StatCard 
                                                        title="Planos Sem OS" 
                                                        value={cuttingPlansList.filter(p => !p.orderId).length.toString()} 
                                                        icon={AlertTriangle} 
                                                        description="Planos não vinculados a OS" 
                                                    />
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {cuttingPlanFolders.map(folder => (
                                                        <Card 
                                                            key={folder.orderId}
                                                            className="cursor-pointer hover:shadow-md transition-shadow"
                                                            onClick={() => setSelectedOrderFolder(folder.orderId)}
                                                        >
                                                            <CardContent className="flex items-center p-6">
                                                                <div className="flex items-center space-x-4 w-full">
                                                                    <div className="flex-shrink-0">
                                                                        <Folder className="h-8 w-8 text-blue-500" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <h3 className="font-medium text-sm text-gray-100 truncate">
                                                                            OS {folder.order.internalOS}
                                                                        </h3>
                                                                        <p className="text-sm text-gray-500 truncate">
                                                                            {folder.order.customerName}
                                                                        </p>
                                                                        <div className="flex items-center mt-1">
                                                                            <Badge variant="secondary" className="text-xs">
                                                                                {folder.plansCount} plano{folder.plansCount !== 1 ? 's' : ''}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ))}
                                                    {cuttingPlanFolders.length === 0 && (
                                                        <div className="col-span-full text-center py-8">
                                                            <p className="text-gray-500">Nenhuma OS com planos de corte encontrada.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            // Plan view - show plans in selected folder
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Nº do Plano</TableHead>
                                                        <TableHead>Material</TableHead>
                                                        <TableHead>Data Criação</TableHead>
                                                        <TableHead>Entrega Prevista</TableHead>
                                                        <TableHead className="text-right">Ações</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredCuttingPlans.length > 0 ? (
                                                        filteredCuttingPlans.map(plan => (
                                                            <TableRow key={plan.id}>
                                                                <TableCell className="font-medium">{plan.planNumber}</TableCell>
                                                                <TableCell>{plan.materialDescription || 'N/A'}</TableCell>
                                                                <TableCell>{format(plan.createdAt, 'dd/MM/yyyy')}</TableCell>
                                                                <TableCell>{(() => {
                                                                    if (!plan.deliveryDate) return 'N/A';
                                                                    try {
                                                                        // Se for um Timestamp do Firestore
                                                                        if (plan.deliveryDate && typeof plan.deliveryDate.toDate === 'function') {
                                                                            return format(plan.deliveryDate.toDate(), 'dd/MM/yyyy');
                                                                        }
                                                                        // Se for uma string ou número
                                                                        if (typeof plan.deliveryDate === 'string' || typeof plan.deliveryDate === 'number') {
                                                                            const parsedDate = new Date(plan.deliveryDate);
                                                                            if (!isNaN(parsedDate.getTime())) {
                                                                                return format(parsedDate, 'dd/MM/yyyy');
                                                                            }
                                                                        }
                                                                        // Se já for um objeto Date
                                                                        if (plan.deliveryDate instanceof Date && !isNaN(plan.deliveryDate.getTime())) {
                                                                            return format(plan.deliveryDate, 'dd/MM/yyyy');
                                                                        }
                                                                        return 'N/A';
                                                                    } catch (error) {
                                                                        console.warn('Erro ao formatar data de entrega do plano:', error);
                                                                        return 'N/A';
                                                                    }
                                                                })()}</TableCell>
                                                                <TableCell className="text-right">
                                                                  <Button variant="ghost" size="icon" onClick={() => handleExportCutPlanPDF(plan)} title="Exportar PDF">
                                                                    <FileDown className="h-4 w-4" />
                                                                  </Button>
                                                                  <Button variant="ghost" size="icon" onClick={() => handleOpenCuttingPlanForm(plan)} title="Editar">
                                                                    <Pencil className="h-4 w-4" />
                                                                  </Button>
                                                                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteCuttingPlan(plan)} title="Excluir">
                                                                    <Trash2 className="h-4 w-4" />
                                                                  </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    ) : (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="h-24 text-center">
                                                                Nenhum plano de corte encontrado para esta OS.
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            <Dialog open={isRequisitionFormOpen} onOpenChange={setIsRequisitionFormOpen}>
                <DialogContent className="max-w-4xl h-[95vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{selectedRequisition ? `Editar Requisição Nº ${selectedRequisition.requisitionNumber}` : "Nova Requisição de Material"}</DialogTitle>
                        <DialogDescription>{selectedRequisition ? "Altere os dados da requisição." : "Preencha as informações para solicitar materiais."}</DialogDescription>
                    </DialogHeader>
                    <Form {...requisitionForm}>
                        <form onSubmit={requisitionForm.handleSubmit(onRequisitionSubmit)} className="flex-grow flex flex-col min-h-0">
                            <Tabs defaultValue="details" className="flex-grow flex flex-col min-h-0">
                                <TabsList>
                                    <TabsTrigger value="details">Detalhes da Requisição</TabsTrigger>
                                    <TabsTrigger value="items">Lista de Materiais</TabsTrigger>
                                </TabsList>
                                <div className="flex-grow mt-4 overflow-hidden">
                                <ScrollArea className="h-full pr-6">
                                <TabsContent value="details" className="space-y-6">
                                  <Card><CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
                                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <FormField control={requisitionForm.control} name="date" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                                        <FormField control={requisitionForm.control} name="status" render={({ field }) => ( <FormItem><FormLabel>Status</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{RequisitionStatus.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                                        <FormField control={requisitionForm.control} name="requestedBy" render={({ field }) => ( <FormItem><FormLabel>Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um responsável"/></SelectTrigger></FormControl><SelectContent>{team.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                                        <FormField control={requisitionForm.control} name="department" render={({ field }) => ( <FormItem><FormLabel>Departamento</FormLabel><FormControl><Input placeholder="Ex: Produção" {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem> )} />
                                        <FormField control={requisitionForm.control} name="orderId" render={({ field }) => ( 
                                            <FormItem>
                                                <FormLabel>OS Vinculada</FormLabel>
                                                <div className="space-y-2">
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            placeholder="Buscar OS..."
                                                            value={searchOS}
                                                            onChange={(e) => setSearchOS(e.target.value)}
                                                            className="pl-9"
                                                        />
                                                    </div>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Selecione uma OS"/>
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="max-h-60">
                                                            {filteredOrders.map(o => (
                                                                <SelectItem key={o.id} value={o.id}>
                                                                    <div className="flex flex-col">
                                                                        <span>OS: {o.internalOS}</span>
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {o.customerName} • Status: {o.status}
                                                                        </span>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <FormMessage />
                                            </FormItem> 
                                        )}/>
                                         <FormItem><FormLabel>Cliente Vinculado</FormLabel><Input value={requisitionForm.watch('customer.name') || 'Selecione uma OS'} disabled /></FormItem>
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardHeader><CardTitle>Comentários</CardTitle></CardHeader>
                                    <CardContent> <FormField control={requisitionForm.control} name="generalNotes" render={({ field }) => ( <FormItem><FormLabel>Observações Gerais</FormLabel><FormControl><Textarea placeholder="Qualquer informação adicional..." {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem> )} /></CardContent>
                                  </Card>
                                </TabsContent>
                                <TabsContent value="items" className="space-y-4">
                                    <Card><CardHeader><CardTitle>Item da Requisição</CardTitle><CardDescription>{editItemIndex !== null ? 'Edite os dados do item.' : 'Preencha e adicione um novo item.'}</CardDescription></CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-4">
                                                <div><Label>Descrição</Label><Input placeholder="Ex: Chapa de Aço 1/4" value={currentItem.description} onChange={e => handleCurrentItemChange('description', e.target.value)} /></div>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div><Label>Código</Label><Input placeholder="Opcional" value={currentItem.code || ''} onChange={e => handleCurrentItemChange('code', e.target.value)} /></div>
                                                    <div><Label>Material</Label><Input placeholder="Ex: Aço 1020" value={currentItem.material || ''} onChange={e => handleCurrentItemChange('material', e.target.value)} /></div>
                                                    <div><Label>Dimensão</Label><Input placeholder="Ex: 1/2'' x 1.2m" value={currentItem.dimensao || ''} onChange={e => handleCurrentItemChange('dimensao', e.target.value)} /></div>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                    <div><Label>Quantidade</Label><Input type="number" step="0.01" placeholder="1" value={currentItem.quantityRequested || ''} onChange={e => handleCurrentItemChange('quantityRequested', e.target.value)} /></div>
                                                    <div><Label>Unidade</Label><Input placeholder="kg, m, pç" value={currentItem.unit} onChange={e => handleCurrentItemChange('unit', e.target.value)} /></div>
                                                    <div><Label>Peso Unit. (kg)</Label><Input type="number" step="0.01" value={currentItem.pesoUnitario || ''} onChange={e => handleCurrentItemChange('pesoUnitario', e.target.value)} /></div>
                                                    <div className="flex flex-col space-y-2"><Label>Entrega Prevista</Label><Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !currentItem.deliveryDate && "text-muted-foreground")}>{currentItem.deliveryDate ? (() => {
                                                        try {
                                                            // Se for um Timestamp do Firestore
                                                            if (currentItem.deliveryDate && typeof currentItem.deliveryDate.toDate === 'function') {
                                                                return format(currentItem.deliveryDate.toDate(), "dd/MM/yyyy");
                                                            }
                                                            // Se for uma string ou número
                                                            if (typeof currentItem.deliveryDate === 'string' || typeof currentItem.deliveryDate === 'number') {
                                                                const parsedDate = new Date(currentItem.deliveryDate);
                                                                if (!isNaN(parsedDate.getTime())) {
                                                                    return format(parsedDate, "dd/MM/yyyy");
                                                                }
                                                            }
                                                            // Se já for um objeto Date
                                                            if (currentItem.deliveryDate instanceof Date && !isNaN(currentItem.deliveryDate.getTime())) {
                                                                return format(currentItem.deliveryDate, "dd/MM/yyyy");
                                                            }
                                                            return 'Data inválida';
                                                        } catch (error) {
                                                            console.warn('Erro ao formatar data de entrega do item:', error);
                                                            return 'Data inválida';
                                                        }
                                                    })() : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={currentItem.deliveryDate || undefined} onSelect={date => handleCurrentItemChange('deliveryDate', date)} /></PopoverContent></Popover></div>
                                                    <div><Label>Status</Label><Select value={currentItem.status || "Pendente"} onValueChange={value => handleCurrentItemChange('status', value)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{itemStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
                                                </div>
                                                <div><Label>Observações</Label><Input placeholder="Ex: Certificado de qualidade" value={currentItem.notes || ''} onChange={e => handleCurrentItemChange('notes', e.target.value)} /></div>
                                            </div>
                                             <div className="flex justify-end gap-2">{editItemIndex !== null && ( <Button type="button" variant="outline" onClick={handleCancelEditItem}>Cancelar Edição</Button> )}<Button type="button" onClick={editItemIndex !== null ? handleUpdateItem : handleAddItem}><PlusCircle className="mr-2 h-4 w-4" />{editItemIndex !== null ? 'Atualizar Item' : 'Adicionar Item'}</Button></div>
                                        </CardContent>
                                    </Card>
                                    {reqItems.length > 0 && (
                                        <Card><CardHeader><CardTitle>Itens Adicionados</CardTitle></CardHeader>
                                            <CardContent>
                                                <div className="overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Descrição</TableHead>
                                                                <TableHead>Dimensão</TableHead>
                                                                <TableHead>Qtd.</TableHead>
                                                                <TableHead>Unid.</TableHead>
                                                                <TableHead>Peso Unit. (kg)</TableHead>
                                                                <TableHead>Entrega Prev.</TableHead>
                                                                <TableHead>Status</TableHead>
                                                                <TableHead className="text-right">Ações</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {reqItems.map((item, index) => ( 
                                                                <TableRow key={item.id} className={cn(editItemIndex === index && "bg-secondary")}>
                                                                    <TableCell className="font-medium">{item.description}</TableCell>
                                                                    <TableCell>{item.dimensao || '-'}</TableCell>
                                                                    <TableCell>{item.quantityRequested}</TableCell>
                                                                    <TableCell>{item.unit}</TableCell>
                                                                    <TableCell>{item.pesoUnitario ? item.pesoUnitario.toFixed(2) : '-'}</TableCell>
                                                                    <TableCell>
                                                                        {(() => {
                                                                            if (!item.deliveryDate) return '-';
                                                                            try {
                                                                                // Se for um Timestamp do Firestore
                                                                                if (item.deliveryDate && typeof item.deliveryDate.toDate === 'function') {
                                                                                    return format(item.deliveryDate.toDate(), 'dd/MM/yyyy');
                                                                                }
                                                                                // Se for uma string ou número
                                                                                if (typeof item.deliveryDate === 'string' || typeof item.deliveryDate === 'number') {
                                                                                    const parsedDate = new Date(item.deliveryDate);
                                                                                    if (!isNaN(parsedDate.getTime())) {
                                                                                        return format(parsedDate, 'dd/MM/yyyy');
                                                                                    }
                                                                                }
                                                                                // Se já for um objeto Date
                                                                                if (item.deliveryDate instanceof Date && !isNaN(item.deliveryDate.getTime())) {
                                                                                    return format(item.deliveryDate, 'dd/MM/yyyy');
                                                                                }
                                                                                return '-';
                                                                            } catch (error) {
                                                                                console.warn('Erro ao formatar data de entrega do item na tabela:', error);
                                                                                return '-';
                                                                            }
                                                                        })()}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant={
                                                                            item.status === 'Pendente' ? 'secondary' :
                                                                            item.status === 'Estoque' ? 'outline' :
                                                                            item.status === 'Inspecionado e Aprovado' ? 'default' :
                                                                            'outline'
                                                                        }>
                                                                            {item.status}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleEditItem(index)}>
                                                                            <Pencil className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeReqItem(index)}>
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                </TableRow> 
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </TabsContent>
                                </ScrollArea>
                                </div>
                            </Tabs>
                            <DialogFooter className="pt-6 border-t mt-4 flex-shrink-0">
                                <Button type="button" variant="outline" onClick={() => setIsRequisitionFormOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={requisitionForm.formState.isSubmitting}>{requisitionForm.formState.isSubmitting ? "Salvando..." : (selectedRequisition ? "Salvar Alterações" : "Criar Requisição")}</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Dialog open={isCuttingPlanFormOpen} onOpenChange={setIsCuttingPlanFormOpen}>
                <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{selectedCuttingPlan ? `Editar Plano de Corte Nº ${selectedCuttingPlan.planNumber}` : "Novo Plano de Corte"}</DialogTitle>
                        <DialogDescription>{selectedCuttingPlan ? "Altere os dados do plano." : "Crie um novo plano de otimização de corte."}</DialogDescription>
                    </DialogHeader>
                     <Form {...cuttingPlanForm}>
                        <form onSubmit={cuttingPlanForm.handleSubmit(onCuttingPlanSubmit)} className="flex-grow flex flex-col min-h-0 space-y-4">
                            <ScrollArea className="flex-1 pr-6 -mr-6">
                                <div className="space-y-6">
                                    <Card>
                                        <CardHeader><CardTitle>Informações Gerais</CardTitle></CardHeader>
                                        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            <FormField control={cuttingPlanForm.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>OS Vinculada (Opcional)</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione uma OS"/></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>OS: {o.internalOS}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                                            <FormItem><FormLabel>Cliente Vinculado</FormLabel><Input value={cuttingPlanForm.watch('customer.name') || 'Selecione uma OS'} disabled /></FormItem>
                                        </CardContent>
                                    </Card>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <Card><CardHeader><CardTitle>Parâmetros de Entrada</CardTitle></CardHeader>
                                                <CardContent className="space-y-4">
                                                    <FormField control={cuttingPlanForm.control} name="materialDescription" render={({ field }) => ( <FormItem><FormLabel>Descrição do Material da Barra</FormLabel><FormControl><Input placeholder="Ex: Cantoneira 2 x 3/16" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                    <FormField control={cuttingPlanForm.control} name="stockLength" render={({ field }) => ( <FormItem><FormLabel>Comprimento da Barra (mm)</FormLabel><FormControl><Input type="number" placeholder="6000" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                    <FormField control={cuttingPlanForm.control} name="kerf" render={({ field }) => ( <FormItem><FormLabel>Espessura do Corte / Kerf (mm)</FormLabel><FormControl><Input type="number" placeholder="3" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                     <FormField control={cuttingPlanForm.control} name="deliveryDate" render={({ field }) => ( <FormItem><FormLabel>Entrega Prevista</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left", !field.value && "text-muted-foreground")}>{field.value ? (() => {
                                                         try {
                                                             // Se for um Timestamp do Firestore
                                                             if (field.value && typeof field.value.toDate === 'function') {
                                                                 return format(field.value.toDate(), "dd/MM/yyyy");
                                                             }
                                                             // Se for uma string ou número
                                                             if (typeof field.value === 'string' || typeof field.value === 'number') {
                                                                 const parsedDate = new Date(field.value);
                                                                 if (!isNaN(parsedDate.getTime())) {
                                                                     return format(parsedDate, "dd/MM/yyyy");
                                                                 }
                                                             }
                                                             // Se já for um objeto Date
                                                             if (field.value instanceof Date && !isNaN(field.value.getTime())) {
                                                                 return format(field.value, "dd/MM/yyyy");
                                                             }
                                                             return 'Data inválida';
                                                         } catch (error) {
                                                             console.warn('Erro ao formatar data do campo:', error);
                                                             return 'Data inválida';
                                                         }
                                                     })() : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                                                </CardContent>
                                            </Card>
                                            <Card><CardHeader><CardTitle>Item do Plano de Corte</CardTitle><CardDescription>{editCutIndex !== null ? 'Edite os dados.' : 'Preencha e adicione.'}</CardDescription></CardHeader>
                                                <CardContent className="space-y-4">
                                                    <div><Label>Descrição</Label><Input placeholder={`Peça ${cutItems.length + 1}`} value={currentCutItem.description} onChange={e => handleCurrentCutItemChange('description', e.target.value)} /></div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div><Label>Código</Label><Input placeholder="Opcional" value={currentCutItem.code || ''} onChange={e => handleCurrentCutItemChange('code', e.target.value)} /></div>
                                                        <div><Label>Comprimento (mm)</Label><Input type="number" value={currentCutItem.length} onChange={e => handleCurrentCutItemChange('length', e.target.value)} /></div>
                                                        <div><Label>Quantidade</Label><Input type="number" value={currentCutItem.quantity} onChange={e => handleCurrentCutItemChange('quantity', e.target.value)} /></div>
                                                    </div>
                                                    <div className="flex justify-end gap-2">{editCutIndex !== null && (<Button type="button" variant="outline" onClick={handleCancelEditCutItem}>Cancelar</Button>)}<Button type="button" onClick={editCutIndex !== null ? handleUpdateCutItem : handleAddCutItem}><PlusCircle className="mr-2 h-4 w-4" />{editCutIndex !== null ? 'Atualizar' : 'Adicionar'}</Button></div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                        <div className="space-y-6">
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle>Resultados do Plano</CardTitle>
                                                    <CardDescription>Padrões otimizados para o corte.</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    {cuttingPlanForm.getValues('summary') ? (
                                                        <>
                                                            <Table><TableHeader><TableRow><TableHead>Padrão</TableHead><TableHead>Uso/Sobra</TableHead><TableHead>Nº</TableHead><TableHead>Rend.</TableHead></TableRow></TableHeader>
                                                                <TableBody>{(cuttingPlanForm.getValues('patterns') || []).map((p: any) => ( <TableRow key={p.patternId}><TableCell className="text-xs">{p.patternString}</TableCell><TableCell>{(p.barUsage || 0).toFixed(0)}mm/<span className="text-destructive">{(p.leftover || 0).toFixed(0)}mm</span></TableCell><TableCell>{p.barsNeeded}</TableCell><TableCell>{(p.yieldPercentage || 0).toFixed(1)}%</TableCell></TableRow> ))}</TableBody>
                                                            </Table>
                                                            <Separator className="my-4" />
                                                            <div className="text-sm space-y-2">
                                                                <div className="flex justify-between font-medium"><span className="text-muted-foreground">Total de Barras:</span> <span>{cuttingPlanForm.getValues('summary.totalBars')}</span></div>
                                                                <div className="flex justify-between font-medium"><span className="text-muted-foreground">Rendimento Total:</span> <span>{(cuttingPlanForm.getValues('summary.totalYieldPercentage') || 0).toFixed(2)}%</span></div>
                                                                <div className="flex justify-between font-medium"><span className="text-muted-foreground">Sucata Total (%):</span> <span className="text-destructive">{(cuttingPlanForm.getValues('summary.totalScrapPercentage') || 0).toFixed(2)}%</span></div>
                                                            </div>
                                                        </>
                                                    ) : ( <div className="text-center text-muted-foreground py-10"><p>Gere um plano para ver os resultados.</p></div> )}
                                                </CardContent>
                                            </Card>
                                            {cutItems.length > 0 && (
                                                <Card><CardHeader><CardTitle>Itens a Cortar</CardTitle></CardHeader>
                                                    <CardContent><Table><TableHeader><TableRow><TableHead>Cód</TableHead><TableHead>Descrição</TableHead><TableHead>Comp.</TableHead><TableHead>Qtd.</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                                            <TableBody>{cutItems.map((item, index) => ( <TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell>{item.description}</TableCell><TableCell>{item.length}</TableCell><TableCell>{item.quantity}</TableCell><TableCell className="text-right"><Button type="button" variant="ghost" size="icon" onClick={() => handleEditCutItem(index)}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeCutItem(index)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow> ))}</TableBody>
                                                        </Table></CardContent>
                                                </Card>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </ScrollArea>
                            <DialogFooter className="pt-4 border-t gap-2 flex-shrink-0">
                                <Button type="button" className="w-full sm:w-auto" onClick={generateCuttingPlan}><BrainCircuit className="mr-2 h-4 w-4" /> Gerar Plano de Corte</Button>
                                <div className="flex-grow"></div>
                                <Button type="button" variant="outline" onClick={() => setIsCuttingPlanFormOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={cuttingPlanForm.formState.isSubmitting}>{cuttingPlanForm.formState.isSubmitting ? "Salvando..." : "Salvar Plano de Corte"}</Button>
                            </DialogFooter>
                        </form>
                     </Form>
                </DialogContent>
            </Dialog>

             <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente o item selecionado.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Sim, excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
