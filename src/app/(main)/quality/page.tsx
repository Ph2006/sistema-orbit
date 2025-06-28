
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, addMonths, isPast, isFuture, differenceInDays } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Pencil, Trash2, CalendarIcon, CheckCircle, AlertTriangle, XCircle, FileText, Beaker, ShieldCheck, Wrench, Microscope, BookOpen, BrainCircuit, Phone, SlidersHorizontal, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";


// --- SCHEMAS ---
const nonConformanceSchema = z.object({
  id: z.string().optional(),
  date: z.date({ required_error: "A data é obrigatória." }),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  item: z.object({
      id: z.string({ required_error: "Selecione um item." }),
      description: z.string(),
  }),
  description: z.string().min(10, "A descrição detalhada é obrigatória (mín. 10 caracteres)."),
  type: z.enum(["Interna", "Reclamação de Cliente"], { required_error: "Selecione o tipo de não conformidade." }),
  status: z.enum(["Aberta", "Em Análise", "Concluída"]),
});

const calibrationSchema = z.object({
  id: z.string().optional(),
  internalCode: z.string().min(1, "O código interno é obrigatório."),
  equipmentName: z.string().min(1, "O nome do equipamento é obrigatório."),
  modelSerial: z.string().optional(),
  manufacturer: z.string().optional(),
  location: z.string().optional(),
  category: z.string().optional(),
  lastCalibrationDate: z.date({ required_error: "A data da última calibração é obrigatória." }),
  calibrationIntervalMonths: z.coerce.number().min(0, "O intervalo deve ser um número positivo."),
  result: z.enum(["Aprovado", "Reprovado", "Aprovado com Ajuste"]),
  responsible: z.string().optional(),
  norm: z.string().optional(),
  certificateUrl: z.string().url("Insira uma URL válida.").or(z.literal('')).optional(),
  notes: z.string().optional(),
});

const rawMaterialInspectionSchema = z.object({
  id: z.string().optional(),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  materialLot: z.string().optional(),
  supplierName: z.string().optional(),
  quantityReceived: z.coerce.number().optional(),
  receiptDate: z.date({ required_error: "A data de recebimento é obrigatória." }),
  materialCertificateUrl: z.string().url("URL inválida.").or(z.literal("")).optional(),
  materialStandard: z.string().optional(),
  inspectionResult: z.enum(["Aprovado", "Reprovado", "Aprovado com ressalva"]),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  notes: z.string().optional(),
});

const dimensionalReportSchema = z.object({
  id: z.string().optional(),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  instrumentUsed: z.string().min(1, "O instrumento é obrigatório."),
  result: z.enum(["Conforme", "Não Conforme"]),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  inspectionDate: z.date({ required_error: "A data da inspeção é obrigatória." }),
  reportUrl: z.string().url("URL inválida.").or(z.literal("")).optional(),
  notes: z.string().optional(),
});


// --- TYPES ---
type NonConformance = z.infer<typeof nonConformanceSchema> & { id: string, orderNumber: string, customerName: string };
type OrderInfo = { id: string, number: string, customerId: string, customerName: string, items: { id: string, description: string }[] };
type Calibration = z.infer<typeof calibrationSchema> & { id: string };
type RawMaterialInspection = z.infer<typeof rawMaterialInspectionSchema> & { id: string, orderNumber: string, itemName: string };
type DimensionalReport = z.infer<typeof dimensionalReportSchema> & { id: string, orderNumber: string, itemName: string };
type TeamMember = { id: string; name: string };


// --- HELPER FUNCTIONS ---
const getCalibrationStatus = (calibration: Calibration) => {
    const nextDueDate = addMonths(calibration.lastCalibrationDate, calibration.calibrationIntervalMonths);
    const today = new Date();
    
    if (isPast(nextDueDate)) {
      return { text: "Vencida", variant: "destructive", icon: XCircle };
    }
    if (differenceInDays(nextDueDate, today) <= 30) {
      return { text: "Pendente", variant: "secondary", icon: AlertTriangle };
    }
    return { text: "Em dia", variant: "default", icon: CheckCircle };
};

const getStatusVariant = (status: string) => {
    switch (status) {
        case 'Aberta': return 'destructive';
        case 'Em Análise': return 'secondary';
        case 'Concluída': return 'default';
        case 'Aprovado': return 'default';
        case 'Aprovado com ressalva': return 'secondary';
        case 'Reprovado': return 'destructive';
        case 'Conforme': return 'default';
        case 'Não Conforme': return 'destructive';
        default: return 'outline';
    }
};

const PlaceholderCard = ({ title, description, icon: Icon }: { title: string; description: string; icon: React.ElementType }) => (
    <Card className="text-center bg-muted/30">
      <CardHeader>
        <div className="flex justify-center mb-2">
            <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="outline">A ser implementado</Badge>
      </CardContent>
    </Card>
);


// --- MAIN COMPONENT ---
export default function QualityPage() {
  const [activeTab, setActiveTab] = useState("rnc");
  
  // RNC State
  const [reports, setReports] = useState<NonConformance[]>([]);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [isRncFormOpen, setIsRncFormOpen] = useState(false);
  const [isRncDeleting, setIsRncDeleting] = useState(false);
  const [selectedReport, setSelectedReport] = useState<NonConformance | null>(null);
  const [reportToDelete, setReportToDelete] = useState<NonConformance | null>(null);

  // Calibration State
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [isCalibrationFormOpen, setIsCalibrationFormOpen] = useState(false);
  const [isCalibrationDeleting, setIsCalibrationDeleting] = useState(false);
  const [selectedCalibration, setSelectedCalibration] = useState<Calibration | null>(null);
  const [calibrationToDelete, setCalibrationToDelete] = useState<Calibration | null>(null);
  
  // Inspection State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [materialInspections, setMaterialInspections] = useState<RawMaterialInspection[]>([]);
  const [dimensionalReports, setDimensionalReports] = useState<DimensionalReport[]>([]);
  const [isInspectionFormOpen, setIsInspectionFormOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'material' | 'dimensional' | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<any | null>(null);
  const [inspectionToDelete, setInspectionToDelete] = useState<any | null>(null);
  const [isDeleteInspectionAlertOpen, setIsDeleteInspectionAlertOpen] = useState(false);

  // General State
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // --- FORMS ---
  const rncForm = useForm<z.infer<typeof nonConformanceSchema>>({
    resolver: zodResolver(nonConformanceSchema),
    defaultValues: { date: new Date(), status: "Aberta", type: "Interna" },
  });

  const calibrationForm = useForm<z.infer<typeof calibrationSchema>>({
    resolver: zodResolver(calibrationSchema),
    defaultValues: {
      internalCode: "", equipmentName: "", modelSerial: "", manufacturer: "", location: "", category: "",
      lastCalibrationDate: new Date(), calibrationIntervalMonths: 12, result: "Aprovado", responsible: "", norm: "", certificateUrl: "", notes: "",
    }
  });

  const materialInspectionForm = useForm<z.infer<typeof rawMaterialInspectionSchema>>({
    resolver: zodResolver(rawMaterialInspectionSchema),
    defaultValues: {
      receiptDate: new Date(), inspectionResult: "Aprovado",
      orderId: undefined, itemId: undefined, materialLot: '', supplierName: '', inspectedBy: undefined, notes: '', materialCertificateUrl: '', materialStandard: ''
    },
  });

  const dimensionalReportForm = useForm<z.infer<typeof dimensionalReportSchema>>({
    resolver: zodResolver(dimensionalReportSchema),
    defaultValues: {
      inspectionDate: new Date(), result: "Conforme",
      orderId: undefined, itemId: undefined, instrumentUsed: '', inspectedBy: undefined, notes: '', reportUrl: ''
    },
  });

  // --- DATA FETCHING ---
  const fetchAllData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [
        ordersSnapshot, reportsSnapshot, calibrationsSnapshot, teamSnapshot, 
        materialInspectionsSnapshot, dimensionalReportsSnapshot
      ] = await Promise.all([
        getDocs(collection(db, "companies", "mecald", "orders")),
        getDocs(collection(db, "companies", "mecald", "qualityReports")),
        getDocs(collection(db, "companies", "mecald", "calibrations")),
        getDoc(doc(db, "companies", "mecald", "settings", "team")),
        getDocs(collection(db, "companies", "mecald", "rawMaterialInspections")),
        getDocs(collection(db, "companies", "mecald", "dimensionalReports")),
      ]);

      const ordersList: OrderInfo[] = ordersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, number: data.quotationNumber || data.orderNumber || 'N/A', customerId: data.customer?.id || data.customerId || '',
          customerName: data.customer?.name || data.customerName || 'N/A',
          items: (data.items || []).map((item: any, index: number) => ({ id: item.id || `${doc.id}-${index}`, description: item.description, })),
        };
      });
      setOrders(ordersList);

      const reportsList = reportsSnapshot.docs.map(doc => {
        const data = doc.data();
        const order = ordersList.find(o => o.id === data.orderId);
        return {
          id: doc.id, date: data.date.toDate(), orderId: data.orderId, orderNumber: order?.number || 'N/A',
          item: { id: data.itemId, description: data.itemDescription }, customerName: order?.customerName || 'N/A',
          description: data.description, type: data.type, status: data.status,
        } as NonConformance;
      });
      setReports(reportsList.sort((a, b) => b.date.getTime() - a.date.getTime()));

      const calibrationsList = calibrationsSnapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data, lastCalibrationDate: data.lastCalibrationDate.toDate() } as Calibration;
      });
      setCalibrations(calibrationsList);

      if (teamSnapshot.exists() && teamSnapshot.data().members) {
        const members = teamSnapshot.data().members.map((m: any) => ({ id: m.id || m.name, name: m.name }));
        setTeamMembers(members);
      }

      const matInspectionsList = materialInspectionsSnapshot.docs.map(doc => {
        const data = doc.data();
        const order = ordersList.find(o => o.id === data.orderId);
        const item = order?.items.find(i => i.id === data.itemId);
        return {
          id: doc.id, ...data, receiptDate: data.receiptDate.toDate(),
          orderNumber: order?.number || 'N/A', itemName: item?.description || 'Item não encontrado',
        } as RawMaterialInspection;
      });
      setMaterialInspections(matInspectionsList.sort((a, b) => b.receiptDate.getTime() - a.receiptDate.getTime()));
            
      const dimReportsList = dimensionalReportsSnapshot.docs.map(doc => {
        const data = doc.data();
        const order = ordersList.find(o => o.id === data.orderId);
        const item = order?.items.find(i => i.id === data.itemId);
        return {
          id: doc.id, ...data, inspectionDate: data.inspectionDate.toDate(),
          orderNumber: order?.number || 'N/A', itemName: item?.description || 'Item não encontrado',
        } as DimensionalReport;
      });
      setDimensionalReports(dimReportsList.sort((a, b) => b.inspectionDate.getTime() - a.inspectionDate.getTime()));

    } catch (error) {
      console.error("Error fetching quality data:", error);
      toast({ variant: "destructive", title: "Erro ao buscar dados" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchAllData();
    }
  }, [user, authLoading]);

  // --- RNC HANDLERS ---
  const onRncSubmit = async (values: z.infer<typeof nonConformanceSchema>) => {
    try {
      const order = orders.find(o => o.id === values.orderId);
      if (!order) throw new Error("Pedido selecionado não encontrado.");
      const dataToSave = {
        date: Timestamp.fromDate(values.date), orderId: values.orderId, itemId: values.item.id, itemDescription: values.item.description,
        customerId: order.customerId, customerName: order.customerName, description: values.description, type: values.type, status: values.status,
      };
      if (selectedReport) {
        await updateDoc(doc(db, "companies", "mecald", "qualityReports", selectedReport.id), dataToSave);
        toast({ title: "Relatório atualizado com sucesso!" });
      } else {
        await addDoc(collection(db, "companies", "mecald", "qualityReports"), dataToSave);
        toast({ title: "Relatório de não conformidade criado!" });
      }
      setIsRncFormOpen(false);
      await fetchAllData();
    } catch (error) {
      console.error("Error saving report:", error);
      toast({ variant: "destructive", title: "Erro ao salvar relatório" });
    }
  };
  const handleAddRncClick = () => { setSelectedReport(null); rncForm.reset({ date: new Date(), status: "Aberta", type: "Interna" }); setIsRncFormOpen(true); };
  const handleEditRncClick = (report: NonConformance) => { setSelectedReport(report); rncForm.reset({ ...report, item: { id: report.item.id, description: report.item.description } }); setIsRncFormOpen(true); };
  const handleDeleteRncClick = (report: NonConformance) => { setReportToDelete(report); setIsRncDeleting(true); };
  const handleConfirmRncDelete = async () => {
    if (!reportToDelete) return;
    try {
      await deleteDoc(doc(db, "companies", "mecald", "qualityReports", reportToDelete.id));
      toast({ title: "Relatório excluído!" });
      setIsRncDeleting(false); await fetchAllData();
    } catch (error) { toast({ variant: "destructive", title: "Erro ao excluir relatório" }); }
  };
  const watchedRncOrderId = rncForm.watch("orderId");
  const availableRncItems = useMemo(() => { if (!watchedRncOrderId) return []; return orders.find(o => o.id === watchedRncOrderId)?.items || []; }, [watchedRncOrderId, orders]);
  useEffect(() => { rncForm.setValue('item', {id: '', description: ''}); }, [watchedRncOrderId, rncForm]);

  // --- CALIBRATION HANDLERS ---
  const onCalibrationSubmit = async (values: z.infer<typeof calibrationSchema>) => {
    try {
        const dataToSave = { ...values, lastCalibrationDate: Timestamp.fromDate(values.lastCalibrationDate) };
        const id = selectedCalibration ? selectedCalibration.id : values.internalCode;
        if (id.includes('/') || id.includes('..')) {
            toast({ variant: 'destructive', title: 'Código Inválido', description: 'O código do equipamento não pode conter / ou ..'}); return;
        }
        const docRef = doc(db, "companies", "mecald", "calibrations", id);
        await setDoc(docRef, dataToSave);
        toast({ title: selectedCalibration ? "Calibração atualizada!" : "Equipamento adicionado!" });
        setIsCalibrationFormOpen(false); await fetchAllData();
    } catch (error) { console.error("Error saving calibration:", error); toast({ variant: "destructive", title: "Erro ao salvar calibração" }); }
  };
  const handleAddCalibrationClick = () => {
    setSelectedCalibration(null);
    calibrationForm.reset({
      internalCode: "", equipmentName: "", modelSerial: "", manufacturer: "", location: "", category: "",
      lastCalibrationDate: new Date(), calibrationIntervalMonths: 12, result: "Aprovado", responsible: "", norm: "", certificateUrl: "", notes: "",
    }); setIsCalibrationFormOpen(true);
  };
  const handleEditCalibrationClick = (calibration: Calibration) => { setSelectedCalibration(calibration); calibrationForm.reset(calibration); setIsCalibrationFormOpen(true); };
  const handleDeleteCalibrationClick = (calibration: Calibration) => { setCalibrationToDelete(calibration); setIsCalibrationDeleting(true); };
  const handleConfirmCalibrationDelete = async () => {
    if (!calibrationToDelete) return;
    try {
        await deleteDoc(doc(db, "companies", "mecald", "calibrations", calibrationToDelete.id));
        toast({ title: "Registro de calibração excluído!" }); setIsCalibrationDeleting(false); await fetchAllData();
    } catch (error) { toast({ variant: "destructive", title: "Erro ao excluir registro" }); }
  };

  // --- INSPECTION HANDLERS ---
  const onMaterialInspectionSubmit = async (values: z.infer<typeof rawMaterialInspectionSchema>) => {
    try {
      const dataToSave = { ...values, receiptDate: Timestamp.fromDate(values.receiptDate) };
      if (selectedInspection) {
        await setDoc(doc(db, "companies", "mecald", "rawMaterialInspections", selectedInspection.id), dataToSave);
        toast({ title: "Relatório atualizado!" });
      } else {
        await addDoc(collection(db, "companies", "mecald", "rawMaterialInspections"), dataToSave);
        toast({ title: "Relatório de inspeção de material criado!" });
      }
      setIsInspectionFormOpen(false); await fetchAllData();
    } catch (error) { console.error("Error saving material inspection:", error); toast({ variant: "destructive", title: "Erro ao salvar relatório" }); }
  };
  const onDimensionalReportSubmit = async (values: z.infer<typeof dimensionalReportSchema>) => {
    try {
       const dataToSave = { ...values, inspectionDate: Timestamp.fromDate(values.inspectionDate) };
       if (selectedInspection) {
         await setDoc(doc(db, "companies", "mecald", "dimensionalReports", selectedInspection.id), dataToSave);
         toast({ title: "Relatório atualizado!" });
       } else {
         await addDoc(collection(db, "companies", "mecald", "dimensionalReports"), dataToSave);
         toast({ title: "Relatório dimensional criado!" });
       }
       setIsInspectionFormOpen(false); await fetchAllData();
     } catch (error) { console.error("Error saving dimensional report:", error); toast({ variant: "destructive", title: "Erro ao salvar relatório" }); }
  };
  const handleOpenMaterialForm = (inspection: RawMaterialInspection | null = null) => {
    setSelectedInspection(inspection); setDialogType('material');
    if (inspection) { materialInspectionForm.reset(inspection); } 
    else { materialInspectionForm.reset({ receiptDate: new Date(), inspectionResult: "Aprovado", orderId: undefined, itemId: undefined, materialLot: '', supplierName: '', inspectedBy: undefined, notes: '', materialCertificateUrl: '', materialStandard: '' }); }
    setIsInspectionFormOpen(true);
  };
  const handleOpenDimensionalForm = (report: DimensionalReport | null = null) => {
    setSelectedInspection(report); setDialogType('dimensional');
    if (report) { dimensionalReportForm.reset(report); } 
    else { dimensionalReportForm.reset({ inspectionDate: new Date(), result: "Conforme", orderId: undefined, itemId: undefined, instrumentUsed: '', inspectedBy: undefined, notes: '', reportUrl: '' }); }
    setIsInspectionFormOpen(true);
  };
  const handleDeleteInspectionClick = (inspection: any, type: 'material' | 'dimensional') => { setInspectionToDelete({ ...inspection, type }); setIsDeleteInspectionAlertOpen(true); };
  const handleConfirmDeleteInspection = async () => {
    if (!inspectionToDelete) return;
    const collectionName = inspectionToDelete.type === 'material' ? 'rawMaterialInspections' : 'dimensionalReports';
    try {
        await deleteDoc(doc(db, "companies", "mecald", collectionName, inspectionToDelete.id));
        toast({ title: "Relatório excluído!" }); setIsDeleteInspectionAlertOpen(false); await fetchAllData();
    } catch (error) { toast({ variant: "destructive", title: "Erro ao excluir relatório" }); }
  };
  const handleInspectionFormSubmit = (data: any) => {
    if (dialogType === 'material') { materialInspectionForm.handleSubmit(onMaterialInspectionSubmit)(data); } 
    else if (dialogType === 'dimensional') { dimensionalReportForm.handleSubmit(onDimensionalReportSubmit)(data); }
  };
  const currentForm = dialogType === 'material' ? materialInspectionForm : dimensionalReportForm;
  
  // Dependent select logic
  const watchedMaterialOrderId = materialInspectionForm.watch("orderId");
  const availableMaterialItems = useMemo(() => { if (!watchedMaterialOrderId) return []; return orders.find(o => o.id === watchedMaterialOrderId)?.items || []; }, [watchedMaterialOrderId, orders]);
  useEffect(() => { materialInspectionForm.setValue('itemId', ''); }, [watchedMaterialOrderId, materialInspectionForm]);
  const watchedDimensionalOrderId = dimensionalReportForm.watch("orderId");
  const availableDimensionalItems = useMemo(() => { if (!watchedDimensionalOrderId) return []; return orders.find(o => o.id === watchedDimensionalOrderId)?.items || []; }, [watchedDimensionalOrderId, orders]);
  useEffect(() => { dimensionalReportForm.setValue('itemId', ''); }, [watchedDimensionalOrderId, dimensionalReportForm]);

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Controle de Qualidade</h1>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
                <TabsTrigger value="rnc">Relatórios de Não Conformidade (RNC)</TabsTrigger>
                <TabsTrigger value="calibrations">Calibração de Equipamentos</TabsTrigger>
                <TabsTrigger value="inspections">Inspeções e Documentos</TabsTrigger>
            </TabsList>
            
            <TabsContent value="rnc">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div><CardTitle>Histórico de RNCs</CardTitle><CardDescription>Gerencie todas as não conformidades internas e reclamações de clientes.</CardDescription></div>
                    <Button onClick={handleAddRncClick}><PlusCircle className="mr-2 h-4 w-4" />Registrar Não Conformidade</Button>
                </CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-64 w-full" /> :
                  <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Item</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {reports.length > 0 ? (
                        reports.map((report) => (<TableRow key={report.id}>
                            <TableCell>{format(report.date, 'dd/MM/yyyy')}</TableCell><TableCell>{report.orderNumber}</TableCell><TableCell>{report.customerName}</TableCell>
                            <TableCell>{report.item.description}</TableCell><TableCell>{report.type}</TableCell>
                            <TableCell><Badge variant={getStatusVariant(report.status)}>{report.status}</Badge></TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleEditRncClick(report)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteRncClick(report)}><Trash2 className="h-4 w-4" /></Button>
                            </TableCell></TableRow>))
                      ) : ( <TableRow><TableCell colSpan={7} className="h-24 text-center">Nenhum relatório de não conformidade encontrado.</TableCell></TableRow> )}
                    </TableBody></Table> }
                </CardContent></Card>
            </TabsContent>

            <TabsContent value="calibrations">
                <Card><CardHeader className="flex flex-row items-center justify-between">
                    <div><CardTitle>Controle de Calibração</CardTitle><CardDescription>Gerencie a calibração de todos os instrumentos e máquinas da empresa.</CardDescription></div>
                    <Button onClick={handleAddCalibrationClick}><PlusCircle className="mr-2 h-4 w-4" />Adicionar Equipamento</Button>
                    </CardHeader><CardContent>
                        {isLoading ? <Skeleton className="h-64 w-full" /> :
                        <Table><TableHeader><TableRow><TableHead>Equipamento</TableHead><TableHead>Cód. Interno</TableHead><TableHead>Local</TableHead><TableHead>Última Cal.</TableHead><TableHead>Próxima Cal.</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>
                            {calibrations.length > 0 ? (
                                calibrations.map((cal) => {
                                    const status = getCalibrationStatus(cal);
                                    return (<TableRow key={cal.id}>
                                        <TableCell className="font-medium">{cal.equipmentName}</TableCell><TableCell>{cal.internalCode}</TableCell>
                                        <TableCell>{cal.location}</TableCell><TableCell>{format(cal.lastCalibrationDate, 'dd/MM/yyyy')}</TableCell>
                                        <TableCell>{format(addMonths(cal.lastCalibrationDate, cal.calibrationIntervalMonths), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell><Badge variant={status.variant} className="gap-1"><status.icon className="h-3.5 w-3.5" />{status.text}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleEditCalibrationClick(cal)}><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteCalibrationClick(cal)}><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell></TableRow>);
                                })
                            ) : ( <TableRow><TableCell colSpan={7} className="h-24 text-center">Nenhum equipamento cadastrado para calibração.</TableCell></TableRow> )}
                            </TableBody></Table>}
                    </CardContent></Card>
            </TabsContent>
            
            <TabsContent value="inspections">
              <Accordion type="multiple" className="w-full space-y-4">
                  <AccordionItem value="material-inspection">
                      <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><PackageSearch className="h-5 w-5 text-primary" />Inspeção de Matéria-Prima</div></AccordionTrigger>
                      <AccordionContent className="pt-2">
                          <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Inspeções</CardTitle><Button size="sm" onClick={() => handleOpenMaterialForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Relatório</Button></CardHeader>
                              <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                  <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Pedido</TableHead><TableHead>Item</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                      <TableBody>{materialInspections.length > 0 ? materialInspections.map(insp => (
                                          <TableRow key={insp.id}><TableCell>{format(insp.receiptDate, 'dd/MM/yy')}</TableCell><TableCell>{insp.orderNumber}</TableCell><TableCell>{insp.itemName}</TableCell>
                                          <TableCell><Badge variant={getStatusVariant(insp.inspectionResult)}>{insp.inspectionResult}</Badge></TableCell><TableCell>{insp.inspectedBy}</TableCell>
                                          <TableCell className="text-right">
                                              <Button variant="ghost" size="icon" onClick={() => handleOpenMaterialForm(insp)}><Pencil className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(insp, 'material')}><Trash2 className="h-4 w-4" /></Button>
                                          </TableCell></TableRow>
                                      )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório de inspeção de matéria-prima.</TableCell></TableRow>}
                                      </TableBody></Table>}
                              </CardContent></Card>
                      </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="dimensional-report">
                      <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Relatório Dimensional</div></AccordionTrigger>
                      <AccordionContent className="pt-2">
                          <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Relatórios</CardTitle><Button size="sm" onClick={() => handleOpenDimensionalForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Relatório</Button></CardHeader>
                              <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                  <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Pedido</TableHead><TableHead>Item</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                      <TableBody>{dimensionalReports.length > 0 ? dimensionalReports.map(rep => (
                                          <TableRow key={rep.id}><TableCell>{format(rep.inspectionDate, 'dd/MM/yy')}</TableCell><TableCell>{rep.orderNumber}</TableCell><TableCell>{rep.itemName}</TableCell>
                                          <TableCell><Badge variant={getStatusVariant(rep.result)}>{rep.result}</Badge></TableCell><TableCell>{rep.inspectedBy}</TableCell>
                                          <TableCell className="text-right">
                                              <Button variant="ghost" size="icon" onClick={() => handleOpenDimensionalForm(rep)}><Pencil className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(rep, 'dimensional')}><Trash2 className="h-4 w-4" /></Button>
                                          </TableCell></TableRow>
                                      )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório dimensional.</TableCell></TableRow>}
                                      </TableBody></Table>}
                              </CardContent></Card>
                      </AccordionContent>
                  </AccordionItem>
                   <AccordionItem value="welding-inspection"><AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Inspeções de Solda</div></AccordionTrigger><AccordionContent><PlaceholderCard title="Inspeções de Solda" description="Registros de ensaios (LP, UT, Visual)." icon={ShieldCheck} /></AccordionContent></AccordionItem>
                   <AccordionItem value="painting-inspection"><AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary" />Controle de Pintura</div></AccordionTrigger><AccordionContent><PlaceholderCard title="Controle de Pintura" description="Verificação de camada e aderência." icon={SlidersHorizontal} /></AccordionContent></AccordionItem>
                   <AccordionItem value="procedures"><AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Procedimentos Técnicos</div></AccordionTrigger><AccordionContent><PlaceholderCard title="Procedimentos Técnicos" description="Gestão de documentos (WPS, PIT, etc.)." icon={BookOpen} /></AccordionContent></AccordionItem>
                   <AccordionItem value="lessons-learned"><AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />Lições Aprendidas</div></AccordionTrigger><AccordionContent><PlaceholderCard title="Lições Aprendidas" description="Base de conhecimento para melhoria contínua." icon={BrainCircuit} /></AccordionContent></AccordionItem>
                   <AccordionItem value="engineering-tickets"><AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" />Chamados para Engenharia</div></AccordionTrigger><AccordionContent><PlaceholderCard title="Chamados para Engenharia" description="Controle de solicitações e respostas." icon={Phone} /></AccordionContent></AccordionItem>
              </Accordion>
            </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isRncFormOpen} onOpenChange={setIsRncFormOpen}><DialogContent><DialogHeader><DialogTitle>{selectedReport ? "Editar Relatório" : "Registrar Não Conformidade"}</DialogTitle><DialogDescription>Preencha os detalhes para registrar o ocorrido.</DialogDescription></DialogHeader>
        <Form {...rncForm}><form onSubmit={rncForm.handleSubmit(onRncSubmit)} className="space-y-4 pt-4">
          <FormField control={rncForm.control} name="date" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Ocorrência</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha uma data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
          <FormField control={rncForm.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
          <FormField control={rncForm.control} name="item" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={value => { const selectedItem = availableRncItems.find(i => i.id === value); if (selectedItem) field.onChange(selectedItem); }} value={field.value?.id || ""}><FormControl><SelectTrigger disabled={!watchedRncOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableRncItems.map(i => <SelectItem key={i.id} value={i.id}>{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
          <FormField control={rncForm.control} name="type" render={({ field }) => ( <FormItem><FormLabel>Tipo de Não Conformidade</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Interna">Interna</SelectItem><SelectItem value="Reclamação de Cliente">Reclamação de Cliente</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
          <FormField control={rncForm.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Descrição da Ocorrência</FormLabel><FormControl><Textarea placeholder="Detalhe o que aconteceu, peças envolvidas, etc." {...field} /></FormControl><FormMessage /></FormItem> )}/>
          <FormField control={rncForm.control} name="status" render={({ field }) => ( <FormItem><FormLabel>Status</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Aberta">Aberta</SelectItem><SelectItem value="Em Análise">Em Análise</SelectItem><SelectItem value="Concluída">Concluída</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
          <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
      </form></Form></DialogContent></Dialog>
      <AlertDialog open={isRncDeleting} onOpenChange={setIsRncDeleting}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente o relatório de não conformidade.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmRncDelete} className="bg-destructive hover:bg-destructive/90">Sim, excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Dialog open={isCalibrationFormOpen} onOpenChange={setIsCalibrationFormOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{selectedCalibration ? "Editar Calibração" : "Adicionar Equipamento para Calibração"}</DialogTitle><DialogDescription>Preencha os dados do equipamento e seu plano de calibração.</DialogDescription></DialogHeader>
          <Form {...calibrationForm}><form onSubmit={calibrationForm.handleSubmit(onCalibrationSubmit)} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={calibrationForm.control} name="equipmentName" render={({ field }) => ( <FormItem><FormLabel>Nome do Equipamento</FormLabel><FormControl><Input placeholder="Ex: Paquímetro Digital Mitutoyo" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="internalCode" render={({ field }) => ( <FormItem><FormLabel>Código Interno</FormLabel><FormControl><Input placeholder="Ex: PAQ-001" {...field} disabled={!!selectedCalibration} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField control={calibrationForm.control} name="location" render={({ field }) => ( <FormItem><FormLabel>Localização</FormLabel><FormControl><Input placeholder="Ex: Metrologia" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="manufacturer" render={({ field }) => ( <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input placeholder="Ex: Mitutoyo" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="modelSerial" render={({ field }) => ( <FormItem><FormLabel>Modelo/Série</FormLabel><FormControl><Input placeholder="Ex: 500-196-30B" {...field} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={calibrationForm.control} name="lastCalibrationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Última Calibração</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="calibrationIntervalMonths" render={({ field }) => ( <FormItem><FormLabel>Intervalo (meses)</FormLabel><FormControl><Input type="number" placeholder="12" {...field} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
             <FormField control={calibrationForm.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Resultado da Última Cal.</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem><SelectItem value="Aprovado com Ajuste">Aprovado com Ajuste</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
            <FormField control={calibrationForm.control} name="certificateUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Certificado</FormLabel><FormControl><Input type="url" placeholder="https://" {...field} /></FormControl><FormMessage /></FormItem> )}/>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsCalibrationFormOpen(false)}>Cancelar</Button><Button type="submit">{selectedCalibration ? 'Salvar Alterações' : 'Adicionar'}</Button></DialogFooter>
          </form></Form></DialogContent></Dialog>
      <AlertDialog open={isCalibrationDeleting} onOpenChange={setIsCalibrationDeleting}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Isso excluirá permanentemente o registro de calibração para <span className="font-bold">{calibrationToDelete?.equipmentName}</span>.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmCalibrationDelete} className="bg-destructive hover:bg-destructive/90">Sim, excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Dialog open={isInspectionFormOpen} onOpenChange={setIsInspectionFormOpen}>
        <DialogContent className="sm:max-w-2xl"><DialogHeader>
            <DialogTitle>{dialogType === 'material' ? (selectedInspection ? 'Editar Inspeção de Material' : 'Nova Inspeção de Material') : (selectedInspection ? 'Editar Relatório Dimensional' : 'Novo Relatório Dimensional')}</DialogTitle>
            <DialogDescription>Preencha os campos para registrar a inspeção.</DialogDescription>
        </DialogHeader>
        <Form {...currentForm}>
            <form onSubmit={currentForm.handleSubmit(handleInspectionFormSubmit)}><ScrollArea className="max-h-[60vh] p-1"><div className="space-y-4 p-2 pr-6">
            {dialogType === 'material' ? (<>
                <FormField control={materialInspectionForm.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                <FormField control={materialInspectionForm.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedMaterialOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableMaterialItems.map(i => <SelectItem key={i.id} value={i.id}>{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                <FormField control={materialInspectionForm.control} name="receiptDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data de Recebimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
                <FormField control={materialInspectionForm.control} name="supplierName" render={({ field }) => ( <FormItem><FormLabel>Fornecedor</FormLabel><FormControl><Input {...field} placeholder="Nome do fornecedor do material" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={materialInspectionForm.control} name="materialStandard" render={({ field }) => ( <FormItem><FormLabel>Norma do Material</FormLabel><FormControl><Input {...field} placeholder="Ex: ASTM A36" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={materialInspectionForm.control} name="materialCertificateUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Certificado</FormLabel><FormControl><Input type="url" {...field} placeholder="https://" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={materialInspectionForm.control} name="inspectionResult" render={({ field }) => ( <FormItem><FormLabel>Resultado</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem><SelectItem value="Aprovado com ressalva">Aprovado com ressalva</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
                <FormField control={materialInspectionForm.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
            </>) : (<>
                <FormField control={dimensionalReportForm.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                <FormField control={dimensionalReportForm.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedDimensionalOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableDimensionalItems.map(i => <SelectItem key={i.id} value={i.id}>{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                <FormField control={dimensionalReportForm.control} name="inspectionDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Inspeção</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
                <FormField control={dimensionalReportForm.control} name="instrumentUsed" render={({ field }) => ( <FormItem><FormLabel>Instrumento Utilizado</FormLabel><FormControl><Input {...field} placeholder="Ex: Paquímetro, Micrômetro" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={dimensionalReportForm.control} name="reportUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Relatório</FormLabel><FormControl><Input type="url" {...field} placeholder="https://" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={dimensionalReportForm.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Resultado</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Conforme">Conforme</SelectItem><SelectItem value="Não Conforme">Não Conforme</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
                <FormField control={dimensionalReportForm.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
            </>)}
            <FormField control={currentForm.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
            </div></ScrollArea><DialogFooter className="pt-4 mt-4 border-t"><Button type="button" variant="outline" onClick={() => setIsInspectionFormOpen(false)}>Cancelar</Button><Button type="submit">Salvar</Button></DialogFooter>
        </form></Form></DialogContent>
      </Dialog>
      <AlertDialog open={isDeleteInspectionAlertOpen} onOpenChange={setIsDeleteInspectionAlertOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita e excluirá permanentemente o relatório de inspeção.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDeleteInspection} className="bg-destructive hover:bg-destructive/90">Sim, excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}
