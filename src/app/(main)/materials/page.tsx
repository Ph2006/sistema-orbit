
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
import { PlusCircle, Trash2, FileSignature, Search, CalendarIcon, Copy, FileClock, Hourglass, CheckCircle, PackageCheck, Ban, FileUp, History, Pencil, FileDown, AlertTriangle, GanttChart, BrainCircuit, X } from "lucide-react";
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

// Schemas & Constants
const itemStatuses = ["Pendente", "Estoque", "Recebido (Aguardando Inspeção)", "Inspecionado e Aprovado", "Inspecionado e Rejeitado"] as const;

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
});

const cuttingPlanItemSchema = z.object({
    code: z.string().optional(),
    description: z.string().min(1, "Descrição é obrigatória"),
    length: z.coerce.number().min(1, "Comprimento deve ser > 0"),
    quantity: z.coerce.number().min(1, "Quantidade deve ser > 0"),
});

type CuttingPlanItem = z.infer<typeof cuttingPlanItemSchema>;

const cuttingPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
  materialDescription: z.string().optional(),
  stockLength: z.coerce.number().min(1, "Comprimento da barra é obrigatório."),
  kerf: z.coerce.number().min(0, "Espessura do corte não pode ser negativa.").default(0),
  leftoverThreshold: z.coerce.number().min(0).optional(),
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

const requisitionSchema = z.object({
  id: z.string().optional(),
  requisitionNumber: z.string().optional(),
  date: z.date(),
  status: z.enum(["Pendente", "Aprovada", "Reprovada", "Atendida Parcialmente", "Atendida Totalmente", "Cancelada"]),
  requestedBy: z.string().min(1, "Selecione o responsável"),
  department: z.string().optional(),
  orderId: z.string().optional(),
  customer: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).optional(),
  items: z.array(requisitionItemSchema).min(1, "A requisição deve ter pelo menos um item."),
  cuttingPlans: z.array(cuttingPlanSchema).optional(),
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
type CuttingPlan = z.infer<typeof cuttingPlanSchema>;
type OrderInfo = { id: string; internalOS: string; customerName: string; customerId: string, deliveryDate?: Date; };
type TeamMember = { id: string; name: string };
type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
};

const RequisitionStatus: Requisition['status'][] = ["Pendente", "Aprovada", "Reprovada", "Atendida Parcialmente", "Atendida Totalmente", "Cancelada"];

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
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [team, setTeam] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedRequisition, setSelectedRequisition] = useState<Requisition | null>(null);
    const [requisitionToDelete, setRequisitionToDelete] = useState<Requisition | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();

    // State for the temporary item form
    const emptyRequisitionItem: RequisitionItem = { id: Date.now().toString(), description: "", quantityRequested: 1, unit: "", material: "", dimensao: "", pesoUnitario: 0, status: "Pendente", code: '', notes: '', deliveryDate: null };
    const [currentItem, setCurrentItem] = useState<RequisitionItem>(emptyRequisitionItem);
    const [editItemIndex, setEditItemIndex] = useState<number | null>(null);

    // State for the temporary cut item form
    const emptyCutItem: CuttingPlanItem = { description: "", length: 0, quantity: 1, code: '' };
    const [currentCutItem, setCurrentCutItem] = useState<CuttingPlanItem>(emptyCutItem);
    const [editCutIndex, setEditCutIndex] = useState<number | null>(null);
    const [activeCutPlanIndex, setActiveCutPlanIndex] = useState(0);


    const form = useForm<Requisition>({
        resolver: zodResolver(requisitionSchema),
        defaultValues: {
            date: new Date(),
            status: "Pendente",
            items: [],
            history: [],
            cuttingPlans: [],
        },
    });

    const { fields, append, remove, update } = useFieldArray({ control: form.control, name: "items" });
    const { fields: cuttingPlanArray, append: appendCuttingPlan, remove: removeCuttingPlan } = useFieldArray({ control: form.control, name: "cuttingPlans" });
    const { fields: cutItems, append: appendCutItem, remove: removeCutItem, update: updateCutItem } = useFieldArray({ control: form.control, name: `cuttingPlans.${activeCutPlanIndex}.items` });
    const watchedCuttingPlans = form.watch("cuttingPlans");
    const watchedActivePlan = form.watch(`cuttingPlans.${activeCutPlanIndex}`);
    const watchedOrderId = form.watch("orderId");


    const fetchData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setIsLoadingData(true);
        try {
            const [reqsSnapshot, ordersSnapshot, teamSnapshot] = await Promise.all([
                getDocs(collection(db, "companies", "mecald", "materialRequisitions")),
                getDocs(collection(db, "companies", "mecald", "orders")),
                getDoc(doc(db, "companies", "mecald", "settings", "team")),
            ]);
    
            const ordersDataList = ordersSnapshot.docs
              .map(doc => {
                  const data = doc.data();
                  if (['Concluído', 'Cancelado'].includes(data.status) || !data.internalOS) return null;
                  
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
                    deliveryDate: deliveryDate
                  };
              })
              .filter((order): order is OrderInfo => order !== null);
            setOrders(ordersDataList);
    
            if (teamSnapshot.exists()) {
                const teamData = teamSnapshot.data();
                if (teamData && Array.isArray(teamData.members)) {
                     const membersList = teamData.members
                        .filter((m: any) => m && m.name)
                        .map((m: any) => ({ id: m.id?.toString() || m.name, name: m.name, }));
                    setTeam(membersList);
                }
            }
            
            const reqsListPromises = reqsSnapshot.docs.map(async (d) => {
                const data = d.data();
                const reqId = d.id;
    
                try {
                    const cuttingPlansSnap = await getDocs(collection(db, "companies", "mecald", "materialRequisitions", reqId, "cuttingPlans"));
                    const cuttingPlansData = cuttingPlansSnap.docs.map(planDoc => {
                        const planData = planDoc.data();
                        console.log('Carregando plano:', planDoc.id, planData); // Para debug
                        
                        return {
                            id: planDoc.id,
                            name: planData.name || `Plano de Corte`,
                            materialDescription: planData.materialDescription || '',
                            stockLength: Number(planData.stockLength) || 0,
                            kerf: Number(planData.kerf) || 0,
                            leftoverThreshold: Number(planData.leftoverThreshold) || 0,
                            createdAt: planData.createdAt?.toDate() || new Date(),
                            deliveryDate: planData.deliveryDate?.toDate() || null,
                            items: (planData.items || []).map((item: any) => ({
                                code: item.code || '',
                                description: item.description || '',
                                length: Number(item.length) || 0,
                                quantity: Number(item.quantity) || 0,
                            })),
                            patterns: planData.patterns || [],
                            summary: planData.summary || null,
                        };
                    });
                    
                    return {
                        ...data,
                        id: d.id,
                        date: data.date.toDate(),
                        customer: data.customer || undefined,
                        approval: data.approval ? {
                            ...data.approval,
                            approvalDate: data.approval.approvalDate?.toDate() || null,
                        } : {},
                        items: (data.items || []).map((item: any, index: number) => ({
                            id: item.id || `${d.id}-${index}`,
                            description: item.description || '',
                            quantityRequested: item.quantityRequested || 0,
                            unit: item.unit || '',
                            code: item.code || '',
                            material: item.material || '',
                            dimensao: item.dimensao || '',
                            pesoUnitario: item.pesoUnitario || 0,
                            notes: item.notes || '',
                            deliveryDate: item.deliveryDate?.toDate() || null,
                            status: item.status || "Pendente",
                            quantityFulfilled: item.quantityFulfilled || 0,
                        })),
                        history: (data.history || []).map((h: any) => ({...h, timestamp: h.timestamp.toDate()})),
                        cuttingPlans: cuttingPlansData,
                    } as Requisition
                } catch (planError) {
                    console.error('Erro ao carregar planos de corte para requisição', reqId, planError);
                    // Retorna requisição sem planos em caso de erro
                    return {
                        ...data,
                        id: d.id,
                        date: data.date.toDate(),
                        customer: data.customer || undefined,
                        approval: data.approval ? {
                            ...data.approval,
                            approvalDate: data.approval.approvalDate?.toDate() || null,
                        } : {},
                        items: (data.items || []).map((item: any, index: number) => ({
                            id: item.id || `${d.id}-${index}`,
                            description: item.description || '',
                            quantityRequested: item.quantityRequested || 0,
                            unit: item.unit || '',
                            code: item.code || '',
                            material: item.material || '',
                            dimensao: item.dimensao || '',
                            pesoUnitario: item.pesoUnitario || 0,
                            notes: item.notes || '',
                            deliveryDate: item.deliveryDate?.toDate() || null,
                            status: item.status || "Pendente",
                            quantityFulfilled: item.quantityFulfilled || 0,
                        })),
                        history: (data.history || []).map((h: any) => ({...h, timestamp: h.timestamp.toDate()})),
                        cuttingPlans: [],
                    } as Requisition
                }
            });
    
            const reqsList = await Promise.all(reqsListPromises);
            setRequisitions(reqsList.sort((a, b) => b.date.getTime() - a.date.getTime()));
            
        } catch (error: any) {
            console.error("Error fetching data:", error);
            let description = "Não foi possível buscar os dados do sistema.";
            if (error.code === 'permission-denied') {
                description = "Permissão negada. Verifique as regras de segurança do seu Firestore.";
            }
            toast({ variant: "destructive", title: "Erro ao Carregar Dados", description, duration: 8000 });
        } finally {
            setIsLoading(false);
            setIsLoadingData(false);
        }
    }, [user, toast]);
    
    useEffect(() => {
        if (user && !authLoading) {
            fetchData();
        }
    }, [user, authLoading, fetchData]);

    useEffect(() => {
        if (watchedOrderId) {
            const selectedOrder = orders.find(o => o.id === watchedOrderId);
            if (selectedOrder) {
                form.setValue('customer', {
                    id: selectedOrder.customerId,
                    name: selectedOrder.customerName,
                });
            }
        }
    }, [watchedOrderId, orders, form]);

    const handleOpenForm = (requisition: Requisition | null = null) => {
        setSelectedRequisition(requisition);
        setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() });
        setEditItemIndex(null);
        setCurrentCutItem(emptyCutItem);
        setEditCutIndex(null);

        if (requisition) {
            const plans = (requisition.cuttingPlans && requisition.cuttingPlans.length > 0)
                ? requisition.cuttingPlans
                : [{
                    id: Date.now().toString(),
                    name: 'Plano de Corte 1',
                    createdAt: new Date(),
                    stockLength: 6000,
                    kerf: 3,
                    items: [],
                    deliveryDate: null,
                    materialDescription: ''
                }];
            form.reset({
                ...requisition,
                cuttingPlans: plans,
            });
            setActiveCutPlanIndex(0);
        } else {
            form.reset({
                date: new Date(),
                status: "Pendente",
                items: [],
                history: [],
                requestedBy: user?.displayName || user?.email || undefined,
                cuttingPlans: [{
                    id: Date.now().toString(),
                    name: 'Plano de Corte 1',
                    createdAt: new Date(),
                    stockLength: 6000,
                    kerf: 3,
                    items: [],
                    deliveryDate: null,
                    materialDescription: ''
                }]
            });
            setActiveCutPlanIndex(0);
        }
        setIsFormOpen(true);
    };

    const handleDelete = (requisition: Requisition) => {
        setRequisitionToDelete(requisition);
        setIsDeleting(true);
    };

    const confirmDelete = async () => {
        if (!requisitionToDelete?.id) return;
        const reqId = requisitionToDelete.id;
        try {
            const plansCollectionRef = collection(db, "companies", "mecald", "materialRequisitions", reqId, "cuttingPlans");
            const plansSnapshot = await getDocs(plansCollectionRef);
            const batch = writeBatch(db);
            plansSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            await deleteDoc(doc(db, "companies", "mecald", "materialRequisitions", reqId));

            toast({ title: "Requisição excluída!", description: "A requisição e seus planos de corte foram removidos." });
            await fetchData();
        } catch (error) {
            toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível remover a requisição." });
        } finally {
            setIsDeleting(false);
            setRequisitionToDelete(null);
        }
    };

    const onSubmit = async (data: Requisition) => {
        const formValues = form.getValues();
        const { cuttingPlans, ...requisitionCoreData } = formValues;
    
        try {
            const newHistoryEntry = {
                timestamp: new Date(),
                user: user?.email || "Sistema",
                action: selectedRequisition ? "Edição" : "Criação",
                details: `Requisição ${selectedRequisition ? 'editada' : 'criada'}.`
            };
            const finalHistory = [...(requisitionCoreData.history || []), newHistoryEntry];
    
            const mainDataToSave: any = {
                date: Timestamp.fromDate(requisitionCoreData.date),
                status: requisitionCoreData.status,
                requestedBy: requisitionCoreData.requestedBy,
                department: requisitionCoreData.department || null,
                orderId: requisitionCoreData.orderId || null,
                customer: requisitionCoreData.customer || null,
                generalNotes: requisitionCoreData.generalNotes || null,
                history: finalHistory.map(h => ({ ...h, timestamp: Timestamp.fromDate(h.timestamp) })),
                requisitionNumber: requisitionCoreData.requisitionNumber || null,
            };
            
            mainDataToSave.items = (requisitionCoreData.items || []).map(item => ({
                id: item.id || Date.now().toString(),
                code: item.code || '',
                material: item.material || '',
                dimensao: item.dimensao || '',
                pesoUnitario: item.pesoUnitario || 0,
                description: item.description,
                quantityRequested: item.quantityRequested,
                quantityFulfilled: item.quantityFulfilled || 0,
                unit: item.unit,
                notes: item.notes || '',
                deliveryDate: item.deliveryDate ? Timestamp.fromDate(new Date(item.deliveryDate)) : null,
                status: item.status || 'Pendente',
            }));
    
            if (requisitionCoreData.approval) {
              mainDataToSave.approval = {
                  approvedBy: requisitionCoreData.approval.approvedBy || null,
                  approvalDate: requisitionCoreData.approval.approvalDate ? Timestamp.fromDate(new Date(requisitionCoreData.approval.approvalDate)) : null,
                  justification: requisitionCoreData.approval.justification || null,
              }
            } else {
              mainDataToSave.approval = null;
            }
    
            let requisitionId: string;
            let isNewRequisition = !selectedRequisition?.id;
    
            if (isNewRequisition) {
                const reqNumbers = requisitions.map(r => parseInt(r.requisitionNumber || "0", 10)).filter(n => !isNaN(n));
                const highestNumber = reqNumbers.length > 0 ? Math.max(...reqNumbers) : 0;
                const newRequisitionData = { ...mainDataToSave, requisitionNumber: (highestNumber + 1).toString().padStart(5, '0') };
                const newDocRef = await addDoc(collection(db, "companies", "mecald", "materialRequisitions"), newRequisitionData);
                requisitionId = newDocRef.id;
            } else {
                requisitionId = selectedRequisition!.id;
                await updateDoc(doc(db, "companies", "mecald", "materialRequisitions", requisitionId), mainDataToSave);
            }
    
            if (cuttingPlans && cuttingPlans.length > 0) {
                const batch = writeBatch(db);
                const plansSubcollectionRef = collection(db, "companies", "mecald", "materialRequisitions", requisitionId, "cuttingPlans");
    
                if (!isNewRequisition) {
                    const existingPlansSnapshot = await getDocs(plansSubcollectionRef);
                    const existingPlanIds = new Set(existingPlansSnapshot.docs.map(doc => doc.id));
                    const currentPlanIds = new Set(cuttingPlans.map(p => p.id));
                    
                    existingPlanIds.forEach(id => {
                        if (!currentPlanIds.has(id)) {
                            batch.delete(doc(plansSubcollectionRef, id));
                        }
                    });
                }
                
                cuttingPlans.forEach(plan => {
                    const { id: planId, ...planData } = plan;
                    const planDocRef = doc(plansSubcollectionRef, planId);
                    
                    const planDataForFirestore = {
                        name: planData.name || 'Plano de Corte',
                        materialDescription: planData.materialDescription || '',
                        stockLength: Number(planData.stockLength) || 0,
                        kerf: Number(planData.kerf) || 0,
                        leftoverThreshold: Number(planData.leftoverThreshold) || 0,
                        createdAt: planData.createdAt ? Timestamp.fromDate(new Date(planData.createdAt)) : Timestamp.now(),
                        deliveryDate: planData.deliveryDate ? Timestamp.fromDate(new Date(planData.deliveryDate)) : null,
                        items: (planData.items || []).map(item => ({
                            code: item.code || '',
                            description: item.description || '',
                            length: Number(item.length) || 0,
                            quantity: Number(item.quantity) || 0,
                        })),
                        patterns: planData.patterns || [],
                        summary: planData.summary || null,
                    };
                    
                    console.log('Salvando plano:', planId, planDataForFirestore);
                    batch.set(planDocRef, planDataForFirestore, { merge: true });
                });
    
                await batch.commit();
                console.log('Planos de corte salvos com sucesso!');
            }
    
            toast({ title: selectedRequisition ? "Requisição atualizada!" : "Requisição criada!" });
            setIsFormOpen(false);
            await fetchData();
        } catch (error) {
            console.error("Error saving requisition:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Ocorreu um erro ao salvar a requisição. Verifique o console para mais detalhes." });
        }
    };

    const handleExportPDF = async () => {
        const requisitionToExport = form.getValues();
        if (!requisitionToExport) return;

        toast({ title: "Gerando PDF...", description: "Aguarde enquanto o arquivo é preparado." });

        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const companySnap = await getDoc(companyRef);
            const companyData: CompanyData = companySnap.exists() ? companySnap.data() as CompanyData : {};
            const orderInfo = orders.find(o => o.id === requisitionToExport.orderId);

            const docPdf = new jsPDF({ orientation: "landscape" });
            const pageWidth = docPdf.internal.pageSize.width;

            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, 12, 40, 15);
                } catch (e) { console.error("Error adding logo to PDF:", e); }
            }
            docPdf.setFontSize(18);
            docPdf.text(`Requisição de Material Nº: ${requisitionToExport.requisitionNumber}`, pageWidth / 2, 20, { align: 'center' });
            
            docPdf.setFontSize(10);
            const subheaderY = 35;
            docPdf.text(`Data: ${format(new Date(requisitionToExport.date), 'dd/MM/yyyy')}`, 15, subheaderY);
            docPdf.text(`Solicitante: ${requisitionToExport.requestedBy}`, 15, subheaderY + 5);
            docPdf.text(`Status: ${requisitionToExport.status}`, 15, subheaderY + 10);

            const os = orderInfo?.internalOS || 'N/A';
            const customerName = orderInfo?.customerName || 'N/A';
            const orderDeliveryDate = orderInfo?.deliveryDate ? format(new Date(orderInfo.deliveryDate), 'dd/MM/yyyy') : 'N/A';
            
            docPdf.text(`OS Vinculada: ${os}`, pageWidth - 15, subheaderY, { align: 'right' });
            docPdf.text(`Cliente: ${customerName}`, pageWidth - 15, subheaderY + 5, { align: 'right' });
            docPdf.text(`Entrega do Pedido: ${orderDeliveryDate}`, pageWidth - 15, subheaderY + 10, { align: 'right' });


            const head = [['Cód.', 'Descrição', 'Dimensão', 'Material', 'Qtd.', 'Peso Unit. (kg)', 'Entrega Prev.', 'Status']];
            const body = requisitionToExport.items.map(item => [
                item.code || '-',
                item.description,
                item.dimensao || '-',
                item.material || '-',
                item.quantityRequested.toString(),
                (item.pesoUnitario || 0).toFixed(2),
                item.deliveryDate ? format(new Date(item.deliveryDate), 'dd/MM/yyyy') : 'N/A',
                item.status || 'Pendente',
            ]);

            autoTable(docPdf, {
                startY: 55,
                head,
                body,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [40, 40, 40] },
                columnStyles: {
                    0: { cellWidth: 20 },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 40 },
                    3: { cellWidth: 30 },
                    4: { cellWidth: 20, halign: 'center' },
                    5: { cellWidth: 25, halign: 'center' },
                    6: { cellWidth: 25, halign: 'center' },
                    7: { cellWidth: 40 },
                }
            });

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
    
    const handleExportCutPlanPDF = async () => {
        const formValues = form.getValues();
        const plan = formValues.cuttingPlans?.[activeCutPlanIndex];
    
        if (!plan || !plan.items || plan.items.length === 0 || !plan.summary) {
            toast({ variant: 'destructive', title: 'Nenhum plano gerado', description: 'Adicione itens e gere um plano de corte antes de exportar.' });
            return;
        }
    
        toast({ title: "Gerando PDF do Plano de Corte..." });
    
        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const companySnap = await getDoc(companyRef);
            const companyData: CompanyData = companySnap.exists() ? companySnap.data() as CompanyData : {};
            const orderInfo = orders.find(o => o.id === formValues.orderId);
    
            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            let y = 15;
    
            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15);
                } catch (e) {
                    console.error("Error adding logo to PDF:", e);
                }
            }
    
            docPdf.setFontSize(16).setFont(undefined, 'bold');
            docPdf.text('Plano de Corte', pageWidth / 2, y + 5, { align: 'center' });
            y += 7;
            docPdf.setFontSize(10).setFont(undefined, 'normal');
            const reqNumber = formValues.requisitionNumber || 'NOVO';
            docPdf.text(`Requisição Nº: ${reqNumber} - ${plan.name}`, pageWidth / 2, y + 5, { align: 'center' });
            y += 5;
            docPdf.setFontSize(9).setFont(undefined, 'normal');
            const customerName = formValues.customer?.name || orderInfo?.customerName || 'N/A';
            docPdf.text(`OS: ${orderInfo?.internalOS || 'N/A'} | Cliente: ${customerName}`, pageWidth / 2, y + 5, { align: 'center' });

            y = 50;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Parâmetros de Entrada', 15, y);
            y += 6;
            autoTable(docPdf, {
                startY: y,
                theme: 'plain',
                styles: { fontSize: 9 },
                body: [
                    ['Material da Barra:', plan.materialDescription || 'Não especificado'],
                    ['Comprimento da Barra:', `${plan.stockLength} mm`],
                    ['Espessura do Corte (Kerf):', `${plan.kerf} mm`],
                    ['Entrega Prevista do Corte:', plan.deliveryDate ? format(new Date(plan.deliveryDate), 'dd/MM/yyyy') : 'N/A'],
                ],
            });
            y = (docPdf as any).lastAutoTable.finalY + 10;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Itens a Cortar', 15, y);
            y += 6;
            autoTable(docPdf, {
                startY: y,
                head: [['Código', 'Descrição', 'Comprimento (mm)', 'Quantidade']],
                body: plan.items.map(item => [item.code || '-', item.description, item.length, item.quantity]),
                headStyles: { fillColor: [40, 40, 40] }
            });
            y = (docPdf as any).lastAutoTable.finalY + 10;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Padrões de Corte Otimizados', 15, y);
            y += 6;
            autoTable(docPdf, {
                startY: y,
                head: [['#', 'Padrão de Corte (Peças x Comp.)', 'Sobra (mm)', 'Nº de Barras', 'Rendimento', 'Exec. [ ]']],
                body: plan.patterns!.map((p: any) => [
                    p.patternId,
                    p.patternString,
                    (Number(p.leftover) || 0).toFixed(2),
                    p.barsNeeded,
                    `${(Number(p.yieldPercentage) || 0).toFixed(1)}%`,
                    ''
                ]),
                headStyles: { fillColor: [40, 40, 40] },
                didDrawCell: function (data) {
                    if (data.section === 'body' && data.column.index === 5) {
                        const x = data.cell.x + (data.cell.width / 2) - 2;
                        const y = data.cell.y + (data.cell.height / 2) - 2;
                        docPdf.rect(x, y, 4, 4);
                    }
                }
            });
            y = (docPdf as any).lastAutoTable.finalY + 10;
    
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('Resumo do Plano', 15, y);
            y += 6;
            autoTable(docPdf, {
                startY: y,
                theme: 'plain',
                styles: { fontSize: 9 },
                body: [
                    ['Total de Barras Necessárias:', plan.summary!.totalBars.toString()],
                    ['Rendimento Total:', `${plan.summary!.totalYieldPercentage.toFixed(2)}%`],
                    ['Sucata Total:', `${plan.summary!.totalScrapPercentage.toFixed(2)}%`],
                ],
            });
    
            docPdf.save(`PlanoCorte_Req_${reqNumber}_${plan.name.replace(/\s+/g, '_')}.pdf`);
    
        } catch (error) {
            console.error("Error exporting cut plan PDF:", error);
            toast({ variant: "destructive", title: "Erro ao exportar", description: "Não foi possível gerar o PDF do plano de corte." });
        }
    };
    

    const filteredRequisitions = useMemo(() => {
        return requisitions.filter(r => {
            const query = searchQuery.toLowerCase();
            return (
                r.requisitionNumber?.toLowerCase().includes(query) ||
                r.requestedBy?.toLowerCase().includes(query) ||
                r.status.toLowerCase().includes(query) ||
                r.items.some(i => i.description.toLowerCase().includes(query))
            )
        });
    }, [requisitions, searchQuery]);

    const getStatusVariant = (status: Requisition['status']) => {
        switch (status) {
            case "Pendente": return "secondary";
            case "Aprovada": return "default";
            case "Reprovada": return "destructive";
            case "Cancelada": return "destructive";
            case "Atendida Parcialmente": return "outline";
            case "Atendida Totalmente": return "default";
            default: return "outline";
        }
    }

    const dashboardStats = useMemo(() => {
        return {
            pending: requisitions.filter(r => r.status === 'Pendente').length,
            approved: requisitions.filter(r => r.status === 'Aprovada').length,
            total: requisitions.length,
        }
    }, [requisitions]);

    const generateCuttingPlan = () => {
        const cuttingPlanValues = form.getValues(`cuttingPlans.${activeCutPlanIndex}`);
        console.log('Gerando plano para:', cuttingPlanValues); // Para debug
    
        if (!cuttingPlanValues) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Plano de corte não inicializado.' });
            return;
        }
    
        const { stockLength, kerf, items } = cuttingPlanValues;
    
        if (!stockLength || !items || items.length === 0) {
            toast({ variant: 'destructive', title: 'Entrada Inválida', description: 'Forneça o comprimento da barra e pelo menos um item para cortar.' });
            return;
        }
    
        const stockLengthNum = Number(stockLength);
        const kerfNum = Number(kerf || 0);
    
        const allPieces: { code?: string; description: string; length: number }[] = (items || []).flatMap(item => {
            const quantityNum = Math.floor(Number(item.quantity) || 0);
            const lengthNum = Number(item.length) || 0;
            if (quantityNum > 0 && lengthNum > 0) {
                return Array.from({ length: quantityNum }, () => ({
                    code: item.code || '',
                    description: item.description,
                    length: lengthNum
                }));
            }
            return [];
        });
        
        if (allPieces.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum item válido', description: 'Verifique as quantidades e comprimentos dos itens.' });
            return;
        }
    
        allPieces.sort((a, b) => b.length - a.length);
    
        const bins: { pieces: number[]; remaining: number }[] = [];
        for (const piece of allPieces) {
             if (piece.length > stockLengthNum) continue;
    
            let placed = false;
            for (const bin of bins) {
                const spaceNeeded = bin.pieces.length > 0 ? piece.length + kerfNum : piece.length;
                if (bin.remaining >= spaceNeeded) {
                    bin.pieces.push(piece.length);
                    bin.remaining -= spaceNeeded;
                    placed = true;
                    break;
                }
            }
    
            if (!placed) {
                bins.push({
                    pieces: [piece.length],
                    remaining: stockLengthNum - piece.length,
                });
            }
        }
        
        let patternId = 1;
        let totalScrap = 0;
        const finalPatterns: PlanResult['patterns'] = [];
    
        bins.forEach(bin => {
            const piecesUsedSum = bin.pieces.reduce((sum, p) => sum + p, 0);
            const kerfTotal = Math.max(0, bin.pieces.length - 1) * kerfNum;
            const barUsage = piecesUsedSum + kerfTotal;
            const leftover = stockLengthNum - barUsage;
    
            const pieceCounts = new Map<number, number>();
            bin.pieces.forEach(p => {
                pieceCounts.set(p, (pieceCounts.get(p) || 0) + 1);
            });
            const sortedPieces = Array.from(pieceCounts.entries()).sort(([a], [b]) => b - a);
            const patternString = sortedPieces
                .map(([length, count]) => `${count} x ${length}mm`)
                .join(' + ');
    
            finalPatterns.push({
                patternId: patternId++,
                patternString,
                pieces: bin.pieces,
                barUsage: Number(barUsage) || 0,
                leftover: Number(leftover) || 0,
                yieldPercentage: Number((piecesUsedSum / stockLengthNum) * 100) || 0,
                barsNeeded: 1, 
            });
        });
        
        const totalBars = finalPatterns.length;
        const totalMaterialLength = totalBars * stockLengthNum;
        totalScrap = finalPatterns.reduce((sum, p) => sum + p.leftover, 0);
        const totalYield = totalMaterialLength > 0 ? ((totalMaterialLength - totalScrap) / totalMaterialLength) * 100 : 0;
    
        const results: PlanResult = {
            patterns: finalPatterns,
            summary: {
                totalBars: totalBars,
                totalYieldPercentage: totalYield,
                totalScrapPercentage: 100 - totalYield,
                totalScrapLength: totalScrap,
            },
        };

        form.setValue(`cuttingPlans.${activeCutPlanIndex}.patterns`, results.patterns);
        form.setValue(`cuttingPlans.${activeCutPlanIndex}.summary`, results.summary);
        
        console.log('Plano gerado:', results);
        console.log('Form values após gerar plano:', form.getValues(`cuttingPlans.${activeCutPlanIndex}`));
        
        toast({ title: "Plano de Corte Gerado!", description: "Os resultados foram calculados e exibidos." });
    };

    const handleCurrentCutItemChange = (field: keyof CuttingPlanItem, value: any) => {
        setCurrentCutItem(prev => ({...prev, [field]: value}));
    };

    const handleAddCutItem = () => {
        const result = cuttingPlanItemSchema.safeParse(currentCutItem);
        if (!result.success) {
            const firstError = result.error.errors[0];
            toast({
                variant: 'destructive',
                title: `Erro de validação: ${firstError.path[0]}`,
                description: firstError.message
            });
            return;
        }
        appendCutItem(result.data);
        setCurrentCutItem(emptyCutItem);
    };

    const handleUpdateCutItem = () => {
        if (editCutIndex === null) return;
        const result = cuttingPlanItemSchema.safeParse(currentCutItem);
        if (!result.success) {
            const firstError = result.error.errors[0];
            toast({
                variant: 'destructive',
                title: `Erro de validação: ${firstError.path[0]}`,
                description: firstError.message
            });
            return;
        }
        updateCutItem(editCutIndex, result.data);
        setCurrentCutItem(emptyCutItem);
        setEditCutIndex(null);
    };

    const handleEditCutItem = (index: number) => {
        setEditCutIndex(index);
        setCurrentCutItem(form.getValues(`cuttingPlans.${activeCutPlanIndex}.items.${index}`));
    };
    
    const handleCancelEditCutItem = () => {
        setCurrentCutItem(emptyCutItem);
        setEditCutIndex(null);
    }
    
    const handleCurrentItemChange = (field: keyof RequisitionItem, value: any) => {
        if (field === 'deliveryDate') {
            setCurrentItem(prev => ({...prev, [field]: value ? new Date(value) : null}));
        } else {
            setCurrentItem(prev => ({...prev, [field]: value}));
        }
    };

    const handleAddItem = () => {
        const dataToValidate = {
            id: currentItem.id || Date.now().toString(),
            description: currentItem.description,
            quantityRequested: Number(currentItem.quantityRequested) || 0,
            unit: currentItem.unit,
            code: currentItem.code || '',
            material: currentItem.material || '',
            dimensao: currentItem.dimensao || '',
            pesoUnitario: Number(currentItem.pesoUnitario) || 0,
            notes: currentItem.notes || '',
            deliveryDate: currentItem.deliveryDate,
            status: currentItem.status,
            quantityFulfilled: currentItem.quantityFulfilled
        };

        const result = requisitionItemSchema.safeParse(dataToValidate);
        if (!result.success) {
            const firstError = result.error.errors[0];
            toast({
                variant: 'destructive',
                title: `Erro de validação: ${firstError.path[0]}`,
                description: firstError.message
            });
            return;
        }
        append(result.data);
        setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() });
    };

    const handleUpdateItem = () => {
        if (editItemIndex === null) return;

        const dataToValidate = {
            id: currentItem.id,
            description: currentItem.description,
            quantityRequested: Number(currentItem.quantityRequested) || 0,
            unit: currentItem.unit,
            code: currentItem.code || '',
            material: currentItem.material || '',
            dimensao: currentItem.dimensao || '',
            pesoUnitario: Number(currentItem.pesoUnitario) || 0,
            notes: currentItem.notes || '',
            deliveryDate: currentItem.deliveryDate,
            status: currentItem.status,
            quantityFulfilled: currentItem.quantityFulfilled
        };

        const result = requisitionItemSchema.safeParse(dataToValidate);
        if (!result.success) {
            const firstError = result.error.errors[0];
            toast({
                variant: 'destructive',
                title: `Erro de validação: ${firstError.path[0]}`,
                description: firstError.message
            });
            return;
        }
        update(editItemIndex, result.data);
        setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() });
        setEditItemIndex(null);
    };

    const handleEditItem = (index: number) => {
        setEditItemIndex(index);
        setCurrentItem(form.getValues(`items.${index}`));
    };
    
    const handleCancelEditItem = () => {
        setCurrentItem({ ...emptyRequisitionItem, id: Date.now().toString() });
        setEditItemIndex(null);
    };

    const handleAddNewCutPlan = () => {
        const newPlan = {
            id: Date.now().toString(),
            name: `Plano de Corte ${watchedCuttingPlans.length + 1}`,
            createdAt: new Date(),
            stockLength: 6000,
            kerf: 3,
            items: [],
            deliveryDate: null,
            materialDescription: ''
        };
        appendCuttingPlan(newPlan as any);
        setActiveCutPlanIndex(watchedCuttingPlans.length);
    };

    const handleRemoveCutPlan = (index: number) => {
        removeCuttingPlan(index);
        if (activeCutPlanIndex >= index && activeCutPlanIndex > 0) {
            setActiveCutPlanIndex(activeCutPlanIndex - 1);
        } else {
            setActiveCutPlanIndex(0);
        }
    };


    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Requisição de Materiais</h1>
                     <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por nº, solicitante, status..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 w-64"/>
                        </div>
                        <Button onClick={() => handleOpenForm()} disabled={isLoadingData}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Nova Requisição
                        </Button>
                     </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <StatCard title="Requisições Pendentes" value={dashboardStats.pending.toString()} icon={Hourglass} description="Aguardando aprovação do gestor" />
                    <StatCard title="Requisições Aprovadas" value={dashboardStats.approved.toString()} icon={CheckCircle} description="Liberadas para compras ou estoque" />
                    <StatCard title="Total de Requisições" value={dashboardStats.total.toString()} icon={FileSignature} description="Total de requisições no sistema" />
                </div>
                
                <Card>
                    <CardHeader>
                        <CardTitle>Histórico de Requisições</CardTitle>
                        <CardDescription>
                            Gerencie todas as solicitações de materiais para produção e outros setores.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-64 w-full" />
                        ) : (
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">Alerta</TableHead>
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
                                                <TableCell>
                                                    {(() => {
                                                        const overdueItems = req.items.filter(item => 
                                                            item.deliveryDate && isPast(endOfDay(item.deliveryDate)) && item.status !== 'Inspecionado e Aprovado'
                                                        );
                                                        if (overdueItems.length > 0) {
                                                            return (
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                                                                <AlertTriangle className="h-5 w-5" />
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>
                                                                            <p className="font-bold">{overdueItems.length} item(s) com entrega atrasada:</p>
                                                                            <ul className="list-disc pl-5 mt-1">
                                                                                {overdueItems.map((it, idx) => <li key={idx}>{it.description}</li>)}
                                                                            </ul>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            )
                                                        }
                                                        return null;
                                                    })()}
                                                </TableCell>
                                                <TableCell className="font-medium">{req.requisitionNumber || req.id}</TableCell>
                                                <TableCell>{format(req.date, 'dd/MM/yyyy')}</TableCell>
                                                <TableCell>{req.requestedBy}</TableCell>
                                                <TableCell>{orders.find(o => o.id === req.orderId)?.internalOS || 'N/A'}</TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusVariant(req.status)} className={cn(req.status === 'Aprovada' && 'bg-green-600')}>{req.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenForm(req)}><Pencil className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(req)}><Trash2 className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-24 text-center">Nenhuma requisição encontrada.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>
                            {selectedRequisition ? `Editar Requisição Nº ${selectedRequisition.requisitionNumber}` : "Nova Requisição de Material"}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedRequisition ? "Altere os dados da requisição." : "Preencha as informações para solicitar materiais."}
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col min-h-0">
                            <Tabs defaultValue="details" className="flex-grow flex flex-col min-h-0">
                                <TabsList>
                                    <TabsTrigger value="details">Detalhes da Requisição</TabsTrigger>
                                    <TabsTrigger value="items">Lista de Materiais</TabsTrigger>
                                    <TabsTrigger value="cuttingPlan">Plano de Corte</TabsTrigger>
                                    <TabsTrigger value="approval">Aprovação</TabsTrigger>
                                    <TabsTrigger value="history">Histórico</TabsTrigger>
                                </TabsList>
                                <div className="flex-grow mt-4 overflow-hidden">
                                <ScrollArea className="h-full pr-6">
                                <TabsContent value="details" className="space-y-6">
                                  <Card>
                                    <CardHeader><CardTitle>Identificação da Requisição</CardTitle></CardHeader>
                                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <FormField control={form.control} name="date" render={({ field }) => (
                                            <FormItem className="flex flex-col"><FormLabel>Data da Requisição</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild><FormControl>
                                                        <Button variant={"outline"} className={cn("pl-3 text-left", !field.value && "text-muted-foreground")}>
                                                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl></PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent>
                                                </Popover><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="status" render={({ field }) => (
                                            <FormItem><FormLabel>Status</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                                <SelectContent>{RequisitionStatus.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                            </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="requestedBy" render={({ field }) => (
                                            <FormItem><FormLabel>Responsável</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione um responsável"/></SelectTrigger></FormControl>
                                                <SelectContent>{team.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                                            </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="department" render={({ field }) => (
                                            <FormItem><FormLabel>Departamento</FormLabel><FormControl><Input placeholder="Ex: Produção, Manutenção" {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem>
                                        )} />
                                        <FormField control={form.control} name="orderId" render={({ field }) => (
                                            <FormItem><FormLabel>OS de Produção Vinculada</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma OS (Opcional)"/></SelectTrigger></FormControl>
                                                <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>OS: {o.internalOS}</SelectItem>)}</SelectContent>
                                            </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                         <FormItem>
                                            <FormLabel>Cliente Vinculado</FormLabel>
                                            <Input
                                                value={form.watch('customer.name') || 'Selecione uma OS para vincular'}
                                                disabled
                                                className="cursor-default"
                                            />
                                        </FormItem>
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardHeader><CardTitle>Comentários e Anexos</CardTitle></CardHeader>
                                    <CardContent className="space-y-4">
                                        <FormField control={form.control} name="generalNotes" render={({ field }) => (
                                            <FormItem><FormLabel>Observações Gerais</FormLabel><FormControl><Textarea placeholder="Qualquer informação adicional sobre a requisição..." {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem>
                                        )} />
                                        <div>
                                            <FormLabel>Anexos</FormLabel>
                                            <div className="mt-2 flex items-center gap-4 p-4 border border-dashed rounded-md">
                                                <FileUp className="h-8 w-8 text-muted-foreground" />
                                                <div className="text-sm">
                                                    <p className="text-muted-foreground">Arraste arquivos ou clique para fazer upload.</p>
                                                    <Button type="button" variant="outline" size="sm" className="mt-2">Selecionar Arquivos</Button>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                  </Card>
                                </TabsContent>
                                <TabsContent value="items" className="space-y-4">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Item da Requisição</CardTitle>
                                            <CardDescription>
                                                 {editItemIndex !== null ? 'Edite os dados do item selecionado.' : 'Preencha os dados e adicione um novo item.'}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-4">
                                                <div>
                                                    <Label>Descrição do Item</Label>
                                                    <Input placeholder="Ex: Chapa de Aço 1/4" value={currentItem.description} onChange={e => handleCurrentItemChange('description', e.target.value)} />
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div><Label>Código</Label><Input placeholder="Opcional" value={currentItem.code || ''} onChange={e => handleCurrentItemChange('code', e.target.value)} /></div>
                                                    <div><Label>Material</Label><Input placeholder="Ex: Aço 1020" value={currentItem.material || ''} onChange={e => handleCurrentItemChange('material', e.target.value)} /></div>
                                                    <div><Label>Dimensão</Label><Input placeholder="Ex: 1/2'' x 1.200 x 3.000mm" value={currentItem.dimensao || ''} onChange={e => handleCurrentItemChange('dimensao', e.target.value)} /></div>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div><Label>Qtd. Solicitada</Label><Input type="number" value={currentItem.quantityRequested} onChange={e => handleCurrentItemChange('quantityRequested', e.target.value)} /></div>
                                                    <div><Label>Unidade</Label><Input placeholder="kg, m, pç" value={currentItem.unit} onChange={e => handleCurrentItemChange('unit', e.target.value)} /></div>
                                                    <div><Label>Peso Unit. (kg)</Label><Input type="number" step="0.01" value={currentItem.pesoUnitario || ''} onChange={e => handleCurrentItemChange('pesoUnitario', e.target.value)} /></div>
                                                    <div className="flex flex-col space-y-2"><Label>Data de Entrega Prevista</Label>
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !currentItem.deliveryDate && "text-muted-foreground")}>
                                                                    {currentItem.deliveryDate ? format(currentItem.deliveryDate, "dd/MM/yyyy") : <span>Escolha a data</span>}
                                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={currentItem.deliveryDate || undefined} onSelect={date => handleCurrentItemChange('deliveryDate', date)} /></PopoverContent>
                                                        </Popover>
                                                    </div>
                                                </div>
                                                {selectedRequisition && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div><Label>Qtd. Atendida</Label><Input type="number" value={currentItem.quantityFulfilled || 0} onChange={e => handleCurrentItemChange('quantityFulfilled', e.target.value)} /></div>
                                                        <div><Label>Status do Item</Label>
                                                            <Select value={currentItem.status} onValueChange={value => handleCurrentItemChange('status', value)}>
                                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                                <SelectContent>{itemStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )}
                                                <div><Label>Observações do Item</Label><Input placeholder="Ex: Certificado de qualidade, norma específica" value={currentItem.notes || ''} onChange={e => handleCurrentItemChange('notes', e.target.value)} /></div>
                                            </div>
                                             <div className="flex justify-end gap-2">
                                                {editItemIndex !== null && (
                                                    <Button type="button" variant="outline" onClick={handleCancelEditItem}>Cancelar Edição</Button>
                                                )}
                                                <Button type="button" onClick={editItemIndex !== null ? handleUpdateItem : handleAddItem}>
                                                    <PlusCircle className="mr-2 h-4 w-4" />
                                                    {editItemIndex !== null ? 'Atualizar Item' : 'Adicionar Item'}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {fields.length > 0 && (
                                        <Card>
                                            <CardHeader><CardTitle>Itens Adicionados</CardTitle></CardHeader>
                                            <CardContent>
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Descrição</TableHead>
                                                            <TableHead>Qtd.</TableHead>
                                                            <TableHead>Unid.</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead className="text-right">Ações</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {fields.map((item, index) => (
                                                            <TableRow key={item.id} className={cn(editItemIndex === index && "bg-secondary")}>
                                                                <TableCell className="font-medium">{item.description}</TableCell>
                                                                <TableCell>{item.quantityRequested}</TableCell>
                                                                <TableCell>{item.unit}</TableCell>
                                                                <TableCell>{item.status}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleEditItem(index)}><Pencil className="h-4 w-4" /></Button>
                                                                    <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </CardContent>
                                        </Card>
                                    )}
                                </TabsContent>
                                <TabsContent value="cuttingPlan">
                                    <div className="flex items-center gap-1 mb-4 border-b">
                                        {watchedCuttingPlans?.map((plan, index) => (
                                            <div key={plan.id} className="relative">
                                                <Button
                                                    type="button"
                                                    variant={activeCutPlanIndex === index ? 'secondary' : 'ghost'}
                                                    onClick={() => setActiveCutPlanIndex(index)}
                                                    className={cn(watchedCuttingPlans && watchedCuttingPlans.length > 1 && "pr-8")}
                                                >
                                                    {plan.name}
                                                </Button>
                                                {watchedCuttingPlans && watchedCuttingPlans.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute top-1/2 right-1 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                                                        onClick={() => handleRemoveCutPlan(index)}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        <Button type="button" variant="outline" size="icon" onClick={handleAddNewCutPlan}>
                                            <PlusCircle className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    
                                    {watchedCuttingPlans && watchedCuttingPlans.length > 0 && activeCutPlanIndex < watchedCuttingPlans.length && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <Card>
                                                <CardHeader><CardTitle>Parâmetros de Entrada</CardTitle></CardHeader>
                                                <CardContent className="space-y-4">
                                                    <FormField control={form.control} name={`cuttingPlans.${activeCutPlanIndex}.materialDescription`} render={({ field }) => (
                                                        <FormItem><FormLabel>Descrição do Material da Barra</FormLabel><FormControl><Input placeholder="Ex: Cantoneira 2 x 3/16" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`cuttingPlans.${activeCutPlanIndex}.stockLength`} render={({ field }) => (
                                                        <FormItem><FormLabel>Comprimento da Barra (mm)</FormLabel><FormControl><Input type="number" placeholder="6000" {...field} /></FormControl><FormMessage /></FormItem>
                                                    )} />
                                                    <FormField control={form.control} name={`cuttingPlans.${activeCutPlanIndex}.kerf`} render={({ field }) => (
                                                        <FormItem><FormLabel>Espessura do Corte / Kerf (mm)</FormLabel><FormControl><Input type="number" placeholder="3" {...field} /></FormControl><FormMessage /></FormItem>
                                                    )} />
                                                     <FormField control={form.control} name={`cuttingPlans.${activeCutPlanIndex}.leftoverThreshold`} render={({ field }) => (
                                                        <FormItem><FormLabel>Aceitar sobras menores que (mm)</FormLabel><FormControl><Input type="number" placeholder="Opcional" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                    )} />
                                                     <FormField control={form.control} name={`cuttingPlans.${activeCutPlanIndex}.deliveryDate`} render={({ field }) => (
                                                        <FormItem><FormLabel>Entrega Prevista do Plano</FormLabel>
                                                            <Popover>
                                                                <PopoverTrigger asChild><FormControl>
                                                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left", !field.value && "text-muted-foreground")}>
                                                                        {field.value ? format(new Date(field.value), "dd/MM/yyyy") : <span>Escolha a data</span>}
                                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                                    </Button>
                                                                </FormControl></PopoverTrigger>
                                                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} /></PopoverContent>
                                                            </Popover><FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle>Item do Plano de Corte</CardTitle>
                                                    <CardDescription>
                                                        {editCutIndex !== null ? 'Edite os dados do item selecionado.' : 'Preencha os dados e adicione um novo item.'}
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                    <div>
                                                        <Label>Descrição</Label>
                                                        <Input placeholder={`Peça ${cutItems.length + 1}`} value={currentCutItem.description} onChange={e => handleCurrentCutItemChange('description', e.target.value)} />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div>
                                                            <Label>Código</Label>
                                                            <Input placeholder="Opcional" value={currentCutItem.code || ''} onChange={e => handleCurrentCutItemChange('code', e.target.value)} />
                                                        </div>
                                                        <div>
                                                            <Label>Comprimento (mm)</Label>
                                                            <Input type="number" value={currentCutItem.length} onChange={e => handleCurrentCutItemChange('length', e.target.value)} />
                                                        </div>
                                                        <div>
                                                            <Label>Quantidade</Label>
                                                            <Input type="number" value={currentCutItem.quantity} onChange={e => handleCurrentCutItemChange('quantity', e.target.value)} />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end gap-2">
                                                        {editCutIndex !== null && (
                                                            <Button type="button" variant="outline" onClick={handleCancelEditCutItem}>Cancelar Edição</Button>
                                                        )}
                                                        <Button type="button" onClick={editCutIndex !== null ? handleUpdateCutItem : handleAddCutItem}>
                                                            <PlusCircle className="mr-2 h-4 w-4" />
                                                            {editCutIndex !== null ? 'Atualizar Item' : 'Adicionar Item'}
                                                        </Button>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                             {cutItems.length > 0 && (
                                                <Card>
                                                    <CardHeader>
                                                        <CardTitle>Itens a Cortar</CardTitle>
                                                    </CardHeader>
                                                    <CardContent>
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Código</TableHead>
                                                                    <TableHead>Descrição</TableHead>
                                                                    <TableHead>Comp. (mm)</TableHead>
                                                                    <TableHead>Qtd.</TableHead>
                                                                    <TableHead className="text-right">Ações</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {cutItems.map((item, index) => (
                                                                    <TableRow key={item.id}>
                                                                        <TableCell>{item.code}</TableCell>
                                                                        <TableCell>{item.description}</TableCell>
                                                                        <TableCell>{item.length}</TableCell>
                                                                        <TableCell>{item.quantity}</TableCell>
                                                                        <TableCell className="text-right">
                                                                            <Button type="button" variant="ghost" size="icon" onClick={() => handleEditCutItem(index)}><Pencil className="h-4 w-4" /></Button>
                                                                            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeCutItem(index)}><Trash2 className="h-4 w-4" /></Button>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </CardContent>
                                                </Card>
                                            )}
                                            <Button type="button" className="w-full" onClick={generateCuttingPlan}>
                                                <BrainCircuit className="mr-2 h-4 w-4" /> Gerar Plano de Corte
                                            </Button>
                                        </div>
                                        <div className="space-y-6">
                                            <Card>
                                                <CardHeader><CardTitle>Resultados do Plano</CardTitle><CardDescription>Padrões de corte para otimizar o uso do material.</CardDescription></CardHeader>
                                                <CardContent>
                                                    {(watchedActivePlan?.summary) ? (
                                                        <>
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Padrão</TableHead>
                                                                        <TableHead>Uso / Sobra</TableHead>
                                                                        <TableHead>Nº Barras</TableHead>
                                                                        <TableHead>Rend.</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {(watchedActivePlan.patterns || []).map((p: any) => (
                                                                        <TableRow key={p.patternId}>
                                                                            <TableCell className="text-xs">{p.patternString}</TableCell>
                                                                            <TableCell>{(p.barUsage || 0).toFixed(0)}mm / <span className="text-destructive">{(p.leftover || 0).toFixed(0)}mm</span></TableCell>
                                                                            <TableCell>{p.barsNeeded}</TableCell>
                                                                            <TableCell>{(p.yieldPercentage || 0).toFixed(1)}%</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                            <Separator className="my-4" />
                                                            <div className="text-sm space-y-2">
                                                                <div className="flex justify-between font-medium"><span className="text-muted-foreground">Total de Barras:</span> <span>{watchedActivePlan.summary?.totalBars}</span></div>
                                                                <div className="flex justify-between font-medium"><span className="text-muted-foreground">Rendimento Total:</span> <span>{(watchedActivePlan.summary?.totalYieldPercentage || 0).toFixed(2)}%</span></div>
                                                                <div className="flex justify-between font-medium"><span className="text-muted-foreground">Sucata Total (%):</span> <span className="text-destructive">{(watchedActivePlan.summary?.totalScrapPercentage || 0).toFixed(2)}%</span></div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-center text-muted-foreground py-10">
                                                            <p>Gere um plano para ver os resultados.</p>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </div>
                                    )}
                                </TabsContent>
                                <TabsContent value="approval" className="space-y-6">
                                    <Card>
                                        <CardHeader><CardTitle>Autorização e Aprovação</CardTitle></CardHeader>
                                        <CardContent className="space-y-4">
                                             <FormField control={form.control} name="approval.approvedBy" render={({ field }) => (
                                                <FormItem><FormLabel>Aprovador Responsável</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um aprovador"/></SelectTrigger></FormControl>
                                                    <SelectContent>{team.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                                                </Select><FormMessage />
                                                </FormItem>
                                            )} />
                                            <FormField control={form.control} name="approval.approvalDate" render={({ field }) => (
                                                <FormItem className="flex flex-col"><FormLabel>Data de Aprovação</FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild><FormControl>
                                                            <Button variant={"outline"} className={cn("pl-3 text-left", !field.value && "text-muted-foreground")}>
                                                                {field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl></PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} /></PopoverContent>
                                                    </Popover><FormMessage />
                                                </FormItem>
                                            )} />
                                            <FormField control={form.control} name="approval.justification" render={({ field }) => (
                                                <FormItem><FormLabel>Justificativa / Parecer da Aprovação</FormLabel><FormControl><Textarea placeholder="Descreva a justificativa para a aprovação ou reprovação desta requisição." {...field} value={field.value ?? ''} /></FormControl><FormMessage/></FormItem>
                                            )} />
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                                <TabsContent value="history">
                                    <Card>
                                        <CardHeader><CardTitle>Histórico de Alterações</CardTitle></CardHeader>
                                        <CardContent>
                                            {(form.getValues('history') || []).length > 0 ? (
                                                <ul className="space-y-4">
                                                    {form.getValues('history')?.map((log, index) => (
                                                        <li key={index} className="flex gap-4 text-sm">
                                                            <div className="flex flex-col items-center">
                                                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                                                                    <History className="h-4 w-4" />
                                                                </span>
                                                                {index < form.getValues('history')!.length - 1 && <div className="h-full w-px bg-border" />}
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold">{log.action} por {log.user}</p>
                                                                <p className="text-muted-foreground">{format(log.timestamp, "dd/MM/yyyy 'às' HH:mm")}</p>
                                                                {log.details && <p className="text-xs mt-1">{log.details}</p>}
                                                            </div>
                                                        </li>
                                                    )).sort((a,b) => b.key! > a.key! ? 1 : -1)}
                                                </ul>
                                            ) : (
                                                <p className="text-center text-muted-foreground py-4">Nenhum histórico de alterações para esta requisição.</p>
                                            )}
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                                </ScrollArea>
                                </div>
                            </Tabs>
                            <DialogFooter className="pt-6 border-t mt-4 flex-shrink-0 flex-wrap sm:justify-between gap-2">
                                <div className="flex gap-2">
                                    {selectedRequisition && (
                                        <Button type="button" variant="outline" onClick={() => handleExportPDF()}>
                                            <FileDown className="mr-2 h-4 w-4" /> Exportar Requisição
                                        </Button>
                                    )}
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        onClick={handleExportCutPlanPDF} 
                                        disabled={!watchedActivePlan?.items?.length || !watchedActivePlan?.summary}
                                    >
                                        <GanttChart className="mr-2 h-4 w-4" /> Exportar Plano de Corte
                                    </Button>
                                </div>
                                <div className="flex gap-2">
                                    <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                                    <Button type="submit" disabled={form.formState.isSubmitting}>
                                        {form.formState.isSubmitting ? "Salvando..." : (selectedRequisition ? "Salvar Alterações" : "Criar Requisição")}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

             <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente a requisição <strong>Nº {requisitionToDelete?.requisitionNumber}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
                            Sim, excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
