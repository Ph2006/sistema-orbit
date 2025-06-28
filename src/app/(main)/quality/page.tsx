

"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, setDoc, getDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, addMonths, isPast, differenceInDays } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";


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
import { PlusCircle, Pencil, Trash2, CalendarIcon, CheckCircle, AlertTriangle, XCircle, FileText, Beaker, ShieldCheck, Wrench, Microscope, BookOpen, BrainCircuit, Phone, SlidersHorizontal, PackageSearch, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";


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

const dimensionalMeasurementSchema = z.object({
  id: z.string(),
  dimensionName: z.string().min(1, "O nome da dimensão é obrigatório."),
  nominalValue: z.coerce.number(),
  toleranceMin: z.coerce.number().optional(),
  toleranceMax: z.coerce.number().optional(),
  measuredValue: z.coerce.number(),
  instrumentUsed: z.string({ required_error: "O instrumento é obrigatório." }),
  result: z.enum(["Conforme", "Não Conforme"]),
});

const dimensionalReportSchema = z.object({
  id: z.string().optional(),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  inspectionDate: z.date({ required_error: "A data da inspeção é obrigatória." }),
  quantityInspected: z.coerce.number().min(1, "A quantidade inspecionada é obrigatória.").optional(),
  photosUrl: z.string().url("URL inválida.").or(z.literal("")).optional(),
  notes: z.string().optional(),
  measurements: z.array(dimensionalMeasurementSchema).min(1, "Adicione pelo menos uma medição."),
});

const weldingInspectionSchema = z.object({
  id: z.string().optional(),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  inspectionType: z.enum(["Visual", "LP - Líquido Penetrante", "UT - Ultrassom"]),
  inspectionDate: z.date({ required_error: "A data é obrigatória." }),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  result: z.enum(["Aprovado", "Reprovado", "Conforme", "Não Conforme"]),
  welder: z.string().optional(),
  process: z.string().optional(), // For Visual
  acceptanceCriteria: z.string().optional(), // For Visual
  technician: z.string().optional(), // For LP/UT
  standard: z.string().optional(), // For LP/UT
  equipment: z.string().optional(), // For UT
  reportUrl: z.string().url("URL inválida.").or(z.literal("")).optional(),
  notes: z.string().optional(),
});

const paintingReportSchema = z.object({
  id: z.string().optional(),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  inspectionDate: z.date({ required_error: "A data é obrigatória." }),
  paintType: z.string().min(1, "O tipo de tinta é obrigatório."),
  colorRal: z.string().optional(),
  surfacePreparation: z.string().optional(), // Ex: SA 2½
  dryFilmThickness: z.coerce.number().optional(), // in μm
  instrumentUsed: z.string().optional(),
  adhesionTestResult: z.enum(["Aprovado", "Reprovado"]).optional(),
  result: z.enum(["Aprovado", "Reprovado"]),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  notes: z.string().optional(),
});


// --- TYPES ---
type NonConformance = z.infer<typeof nonConformanceSchema> & { id: string, orderNumber: string, customerName: string };
type OrderInfo = { id: string, number: string, customerId: string, customerName: string, items: { id: string, description: string, code?: string, quantity?: number }[] };
type Calibration = z.infer<typeof calibrationSchema> & { id: string };
type RawMaterialInspection = z.infer<typeof rawMaterialInspectionSchema> & { id: string, orderNumber: string, itemName: string };
type DimensionalReport = z.infer<typeof dimensionalReportSchema> & { id: string, orderNumber: string, itemName: string, overallResult?: string };
type WeldingInspection = z.infer<typeof weldingInspectionSchema> & { id: string, orderNumber: string, itemName: string };
type PaintingReport = z.infer<typeof paintingReportSchema> & { id: string, orderNumber: string, itemName: string };
type TeamMember = { id: string; name: string };
type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
};


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

const getStatusVariant = (status?: string) => {
    if (!status) return 'outline';
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
  const [weldingInspections, setWeldingInspections] = useState<WeldingInspection[]>([]);
  const [paintingReports, setPaintingReports] = useState<PaintingReport[]>([]);

  const [isInspectionFormOpen, setIsInspectionFormOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'material' | 'dimensional' | 'welding' | 'painting' | null>(null);
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
      orderId: undefined, itemId: undefined, materialLot: '', supplierName: '', inspectedBy: undefined, notes: '', materialCertificateUrl: '', materialStandard: '', quantityReceived: undefined,
    },
  });

  const dimensionalReportForm = useForm<z.infer<typeof dimensionalReportSchema>>({
    resolver: zodResolver(dimensionalReportSchema),
    defaultValues: {
      inspectionDate: new Date(),
      orderId: undefined, itemId: undefined, inspectedBy: undefined, photosUrl: '', notes: '',
      quantityInspected: undefined,
      measurements: []
    },
  });
  const { fields: measurementFields, append: appendMeasurement, remove: removeMeasurement, update: updateMeasurement } = useFieldArray({
      control: dimensionalReportForm.control,
      name: "measurements"
  });

  const weldingInspectionForm = useForm<z.infer<typeof weldingInspectionSchema>>({
      resolver: zodResolver(weldingInspectionSchema),
      defaultValues: {
          inspectionDate: new Date(), inspectionType: "Visual", result: "Conforme", inspectedBy: undefined
      }
  });
   const onPaintingReportSubmit = async (values: z.infer<typeof paintingReportSchema>) => {
    try {
       const dataToSave = { ...values, inspectionDate: Timestamp.fromDate(values.inspectionDate) };
       if (selectedInspection) {
         await setDoc(doc(db, "companies", "mecald", "paintingReports", selectedInspection.id), dataToSave, { merge: true });
         toast({ title: "Relatório de pintura atualizado!" });
       } else {
         await addDoc(collection(db, "companies", "mecald", "paintingReports"), dataToSave);
         toast({ title: "Relatório de pintura criado!" });
       }
       setIsInspectionFormOpen(false); await fetchAllData();
     } catch (error) { console.error("Error saving painting report:", error); toast({ variant: "destructive", title: "Erro ao salvar relatório" }); }
  };

  const paintingReportForm = useForm<z.infer<typeof paintingReportSchema>>({
      resolver: zodResolver(paintingReportSchema),
      defaultValues: {
          inspectionDate: new Date(), result: "Aprovado", paintType: "", inspectedBy: undefined, dryFilmThickness: undefined,
      }
  });


  // --- DATA FETCHING ---
  const fetchAllData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [
        ordersSnapshot, reportsSnapshot, calibrationsSnapshot, teamSnapshot, 
        materialInspectionsSnapshot, dimensionalReportsSnapshot, weldingInspectionsSnapshot, paintingReportsSnapshot
      ] = await Promise.all([
        getDocs(collection(db, "companies", "mecald", "orders")),
        getDocs(collection(db, "companies", "mecald", "qualityReports")),
        getDocs(collection(db, "companies", "mecald", "calibrations")),
        getDoc(doc(db, "companies", "mecald", "settings", "team")),
        getDocs(collection(db, "companies", "mecald", "rawMaterialInspections")),
        getDocs(collection(db, "companies", "mecald", "dimensionalReports")),
        getDocs(collection(db, "companies", "mecald", "weldingInspections")),
        getDocs(collection(db, "companies", "mecald", "paintingReports")),
      ]);

      const ordersList: OrderInfo[] = ordersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, number: data.quotationNumber || data.orderNumber || 'N/A', customerId: data.customer?.id || data.customerId || '',
          customerName: data.customer?.name || data.customerName || 'N/A',
          items: (data.items || []).map((item: any, index: number) => ({ id: item.id || `${doc.id}-${index}`, description: item.description, code: item.code, quantity: item.quantity })),
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
        const overallResult = (data.measurements || []).every((m: any) => m.result === "Conforme") ? "Conforme" : "Não Conforme";
        return {
          id: doc.id, ...data, inspectionDate: data.inspectionDate.toDate(),
          orderNumber: order?.number || 'N/A', itemName: item?.description || 'Item não encontrado', overallResult
        } as DimensionalReport;
      });
      setDimensionalReports(dimReportsList.sort((a, b) => b.inspectionDate.getTime() - a.inspectionDate.getTime()));

      const weldInspectionsList = weldingInspectionsSnapshot.docs.map(doc => {
          const data = doc.data();
          const order = ordersList.find(o => o.id === data.orderId);
          const item = order?.items.find(i => i.id === data.itemId);
          return { id: doc.id, ...data, inspectionDate: data.inspectionDate.toDate(), orderNumber: order?.number || 'N/A', itemName: item?.description || 'Item não encontrado' } as WeldingInspection;
      });
      setWeldingInspections(weldInspectionsList.sort((a,b) => b.inspectionDate.getTime() - a.inspectionDate.getTime()));

      const paintReportsList = paintingReportsSnapshot.docs.map(doc => {
          const data = doc.data();
          const order = ordersList.find(o => o.id === data.orderId);
          const item = order?.items.find(i => i.id === data.itemId);
          return { id: doc.id, ...data, inspectionDate: data.inspectionDate.toDate(), orderNumber: order?.number || 'N/A', itemName: item?.description || 'Item não encontrado' } as PaintingReport;
      });
      setPaintingReports(paintReportsList.sort((a,b) => b.inspectionDate.getTime() - a.inspectionDate.getTime()));

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
         await setDoc(doc(db, "companies", "mecald", "dimensionalReports", selectedInspection.id), dataToSave, { merge: true });
         toast({ title: "Relatório atualizado!" });
       } else {
         await addDoc(collection(db, "companies", "mecald", "dimensionalReports"), dataToSave);
         toast({ title: "Relatório dimensional criado!" });
       }
       setIsInspectionFormOpen(false); await fetchAllData();
     } catch (error) { console.error("Error saving dimensional report:", error); toast({ variant: "destructive", title: "Erro ao salvar relatório" }); }
  };
  const onWeldingInspectionSubmit = async (values: z.infer<typeof weldingInspectionSchema>) => {
    try {
       const dataToSave = { ...values, inspectionDate: Timestamp.fromDate(values.inspectionDate) };
       if (selectedInspection) {
         await setDoc(doc(db, "companies", "mecald", "weldingInspections", selectedInspection.id), dataToSave, { merge: true });
         toast({ title: "Relatório de solda atualizado!" });
       } else {
         await addDoc(collection(db, "companies", "mecald", "weldingInspections"), dataToSave);
         toast({ title: "Relatório de solda criado!" });
       }
       setIsInspectionFormOpen(false); await fetchAllData();
     } catch (error) { console.error("Error saving welding inspection:", error); toast({ variant: "destructive", title: "Erro ao salvar relatório" }); }
  };

  const handleOpenMaterialForm = (inspection: RawMaterialInspection | null = null) => {
    setSelectedInspection(inspection); setDialogType('material');
    if (inspection) { materialInspectionForm.reset(inspection); } 
    else { materialInspectionForm.reset({ receiptDate: new Date(), inspectionResult: "Aprovado", orderId: undefined, itemId: undefined, materialLot: '', supplierName: '', inspectedBy: undefined, notes: '', materialCertificateUrl: '', materialStandard: '', quantityReceived: undefined }); }
    setIsInspectionFormOpen(true);
  };
  const handleOpenDimensionalForm = (report: DimensionalReport | null = null) => {
    setSelectedInspection(report); setDialogType('dimensional');
    if (report) { dimensionalReportForm.reset(report); } 
    else { dimensionalReportForm.reset({ inspectionDate: new Date(), orderId: undefined, itemId: undefined, inspectedBy: undefined, photosUrl: '', notes: '', quantityInspected: undefined, measurements: [] }); }
    setIsInspectionFormOpen(true);
  };
  const handleOpenWeldingForm = (report: WeldingInspection | null = null) => {
    setSelectedInspection(report); setDialogType('welding');
    if (report) { weldingInspectionForm.reset(report); } 
    else { weldingInspectionForm.reset({ inspectionDate: new Date(), inspectionType: "Visual", result: "Conforme", inspectedBy: undefined }); }
    setIsInspectionFormOpen(true);
  };
  const handleOpenPaintingForm = (report: PaintingReport | null = null) => {
    setSelectedInspection(report); setDialogType('painting');
    if (report) { paintingReportForm.reset(report); } 
    else { paintingReportForm.reset({ inspectionDate: new Date(), result: "Aprovado", paintType: "", inspectedBy: undefined, dryFilmThickness: undefined }); }
    setIsInspectionFormOpen(true);
  };
  const handleDeleteInspectionClick = (inspection: any, type: string) => { setInspectionToDelete({ ...inspection, type }); setIsDeleteInspectionAlertOpen(true); };
  const handleConfirmDeleteInspection = async () => {
    if (!inspectionToDelete) return;
    let collectionName = '';
    switch(inspectionToDelete.type) {
        case 'material': collectionName = 'rawMaterialInspections'; break;
        case 'dimensional': collectionName = 'dimensionalReports'; break;
        case 'welding': collectionName = 'weldingInspections'; break;
        case 'painting': collectionName = 'paintingReports'; break;
    }
    if (!collectionName) return;
    try {
        await deleteDoc(doc(db, "companies", "mecald", collectionName, inspectionToDelete.id));
        toast({ title: "Relatório excluído!" }); setIsDeleteInspectionAlertOpen(false); await fetchAllData();
    } catch (error) { toast({ variant: "destructive", title: "Erro ao excluir relatório" }); }
  };
  
  const handleInspectionFormSubmit = (data: any) => {
    switch(dialogType) {
        case 'material': materialInspectionForm.handleSubmit(onMaterialInspectionSubmit)(data); break;
        case 'dimensional': dimensionalReportForm.handleSubmit(onDimensionalReportSubmit)(data); break;
        case 'welding': weldingInspectionForm.handleSubmit(onWeldingInspectionSubmit)(data); break;
        case 'painting': paintingReportForm.handleSubmit(onPaintingReportSubmit)(data); break;
    }
  };

  const handleDimensionalReportPDF = async (report: DimensionalReport) => {
    toast({ title: "Gerando PDF..." });
    try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const companySnap = await getDoc(companyRef);
        const companyData: { nomeFantasia?: string, logo?: { preview?: string } } = companySnap.exists() ? companySnap.data() as any : {};
        const orderInfo = orders.find(o => o.id === report.orderId);
        const itemInfo = orderInfo?.items.find(i => i.id === report.itemId);

        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        let y = 15;
        
        if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15); } catch(e) { console.error("Error adding image to PDF:", e) } }
        docPdf.setFontSize(16).setFont(undefined, 'bold');
        docPdf.text('Relatório de Inspeção Dimensional', pageWidth / 2, y + 8, { align: 'center' });
        y += 25;

        docPdf.setFontSize(10).setFont(undefined, 'normal');
        docPdf.text(`Pedido: ${orderInfo?.number || 'N/A'}`, 15, y);
        docPdf.text(`Cliente: ${orderInfo?.customerName || 'N/A'}`, 15, y + 5);
        docPdf.text(`Item: ${report.itemName} (Cód: ${itemInfo?.code || 'N/A'})`, 15, y + 10);
        docPdf.text(`Quantidade Inspecionada: ${report.quantityInspected || 'N/A'}`, 15, y + 15);
        
        docPdf.text(`Data: ${format(report.inspectionDate, 'dd/MM/yyyy')}`, pageWidth - 15, y, { align: 'right' });
        docPdf.text(`Inspetor: ${report.inspectedBy}`, pageWidth - 15, y + 5, { align: 'right' });
        docPdf.text(`Resultado Geral: ${report.overallResult}`, pageWidth - 15, y + 10, { align: 'right' });
        
        if (report.photosUrl) {
            docPdf.setTextColor(60, 120, 255); // Blue link color
            docPdf.textWithLink('Link para Fotos do Processo', 15, y + 20, { url: report.photosUrl });
            docPdf.setTextColor(0, 0, 0); // Reset color
        }
        y += 25;

        const body = report.measurements.map(m => {
            const instrument = calibrations.find(c => c.equipmentName === m.instrumentUsed);
            const instrumentDisplay = instrument ? `${instrument.equipmentName} (${instrument.internalCode})` : m.instrumentUsed;
            return [
                m.dimensionName,
                m.nominalValue.toString(),
                m.toleranceMin?.toString() ?? '-',
                m.toleranceMax?.toString() ?? '-',
                m.measuredValue.toString(),
                instrumentDisplay,
                m.result
            ];
        });

        autoTable(docPdf, {
            startY: y,
            head: [['Dimensão', 'Nominal', 'Tol. Inferior (-)', 'Tol. Superior (+)', 'Medido', 'Instrumento', 'Resultado']],
            body: body,
            headStyles: { fillColor: [40, 40, 40] }
        });

        docPdf.save(`RelatorioDimensional_${orderInfo?.number || report.id}.pdf`);

    } catch (error) {
        console.error("Error exporting PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF." });
    }
  };


  const currentForm = useMemo(() => {
    switch(dialogType) {
        case 'material': return materialInspectionForm;
        case 'dimensional': return dimensionalReportForm;
        case 'welding': return weldingInspectionForm;
        case 'painting': return paintingReportForm;
        default: return null;
    }
  }, [dialogType, materialInspectionForm, dimensionalReportForm, weldingInspectionForm, paintingReportForm]);
  
  const watchedWeldingInspectionType = weldingInspectionForm.watch('inspectionType');

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
                                          <TableCell><Badge variant={getStatusVariant(rep.overallResult)}>{rep.overallResult}</Badge></TableCell><TableCell>{rep.inspectedBy}</TableCell>
                                          <TableCell className="text-right">
                                              <Button variant="ghost" size="icon" onClick={() => handleDimensionalReportPDF(rep)}><FileDown className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" onClick={() => handleOpenDimensionalForm(rep)}><Pencil className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(rep, 'dimensional')}><Trash2 className="h-4 w-4" /></Button>
                                          </TableCell></TableRow>
                                      )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório dimensional.</TableCell></TableRow>}
                                      </TableBody></Table>}
                              </CardContent></Card>
                      </AccordionContent>
                  </AccordionItem>
                   <AccordionItem value="welding-inspection">
                      <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Inspeções de Solda</div></AccordionTrigger>
                      <AccordionContent className="pt-2">
                          <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Inspeções</CardTitle><Button size="sm" onClick={() => handleOpenWeldingForm()}><PlusCircle className="mr-2 h-4 w-4"/>Nova Inspeção</Button></CardHeader>
                              <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                  <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Pedido</TableHead><TableHead>Item</TableHead><TableHead>Tipo</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                      <TableBody>{weldingInspections.length > 0 ? weldingInspections.map(insp => (
                                          <TableRow key={insp.id}><TableCell>{format(insp.inspectionDate, 'dd/MM/yy')}</TableCell><TableCell>{insp.orderNumber}</TableCell><TableCell>{insp.itemName}</TableCell>
                                          <TableCell><Badge variant="outline">{insp.inspectionType}</Badge></TableCell>
                                          <TableCell><Badge variant={getStatusVariant(insp.result)}>{insp.result}</Badge></TableCell><TableCell>{insp.inspectedBy}</TableCell>
                                          <TableCell className="text-right">
                                              <Button variant="ghost" size="icon" onClick={() => handleOpenWeldingForm(insp)}><Pencil className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(insp, 'welding')}><Trash2 className="h-4 w-4" /></Button>
                                          </TableCell></TableRow>
                                      )) : <TableRow><TableCell colSpan={7} className="h-24 text-center">Nenhuma inspeção de solda registrada.</TableCell></TableRow>}
                                      </TableBody></Table>}
                              </CardContent></Card>
                      </AccordionContent>
                   </AccordionItem>
                   <AccordionItem value="painting-inspection">
                      <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary" />Controle de Pintura</div></AccordionTrigger>
                       <AccordionContent className="pt-2">
                          <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Relatórios</CardTitle><Button size="sm" onClick={() => handleOpenPaintingForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Relatório</Button></CardHeader>
                              <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                  <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Pedido</TableHead><TableHead>Item</TableHead><TableHead>Tipo de Tinta</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                      <TableBody>{paintingReports.length > 0 ? paintingReports.map(rep => (
                                          <TableRow key={rep.id}><TableCell>{format(rep.inspectionDate, 'dd/MM/yy')}</TableCell><TableCell>{rep.orderNumber}</TableCell><TableCell>{rep.itemName}</TableCell>
                                          <TableCell>{rep.paintType}</TableCell>
                                          <TableCell><Badge variant={getStatusVariant(rep.result)}>{rep.result}</Badge></TableCell><TableCell>{rep.inspectedBy}</TableCell>
                                          <TableCell className="text-right">
                                              <Button variant="ghost" size="icon" onClick={() => handleOpenPaintingForm(rep)}><Pencil className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(rep, 'painting')}><Trash2 className="h-4 w-4" /></Button>
                                          </TableCell></TableRow>
                                      )) : <TableRow><TableCell colSpan={7} className="h-24 text-center">Nenhum relatório de pintura registrado.</TableCell></TableRow>}
                                      </TableBody></Table>}
                              </CardContent></Card>
                      </AccordionContent>
                   </AccordionItem>
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
        <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
                {dialogType === 'material' && (selectedInspection ? 'Editar Inspeção de Material' : 'Nova Inspeção de Material')}
                {dialogType === 'dimensional' && (selectedInspection ? 'Editar Relatório Dimensional' : 'Novo Relatório Dimensional')}
                {dialogType === 'welding' && (selectedInspection ? 'Editar Inspeção de Solda' : 'Nova Inspeção de Solda')}
                {dialogType === 'painting' && (selectedInspection ? 'Editar Relatório de Pintura' : 'Novo Relatório de Pintura')}
            </DialogTitle>
            <DialogDescription>Preencha os campos para registrar a inspeção.</DialogDescription>
        </DialogHeader>
        {currentForm && (
            <Form {...currentForm}>
                <form onSubmit={currentForm.handleSubmit(handleInspectionFormSubmit)} className="flex-1 flex flex-col min-h-0">
                    <ScrollArea className="flex-1 p-1 pr-4">
                        <div className="space-y-4 p-2">
                            {dialogType === 'material' && (
                                <MaterialInspectionForm form={materialInspectionForm} orders={orders} teamMembers={teamMembers} />
                            )}
                            {dialogType === 'dimensional' && (
                                <DimensionalReportForm form={dimensionalReportForm} orders={orders} teamMembers={teamMembers} fieldArrayProps={{ fields: measurementFields, append: appendMeasurement, remove: removeMeasurement, update: updateMeasurement }} calibrations={calibrations} toast={toast} />
                            )}
                             {dialogType === 'welding' && (
                                 <WeldingInspectionForm form={weldingInspectionForm} orders={orders} teamMembers={teamMembers} />
                            )}
                             {dialogType === 'painting' && (
                                 <PaintingReportForm form={paintingReportForm} orders={orders} teamMembers={teamMembers} />
                            )}
                        </div>
                    </ScrollArea>
                    <DialogFooter className="pt-4 mt-4 border-t flex-shrink-0">
                        <Button type="button" variant="outline" onClick={() => setIsInspectionFormOpen(false)}>Cancelar</Button>
                        <Button type="submit">Salvar</Button>
                    </DialogFooter>
                </form>
            </Form>
        )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={isDeleteInspectionAlertOpen} onOpenChange={setIsDeleteInspectionAlertOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita e excluirá permanentemente o relatório de inspeção.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDeleteInspection} className="bg-destructive hover:bg-destructive/90">Sim, excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}


// --- SUB-COMPONENTS FOR FORMS ---
function MaterialInspectionForm({ form, orders, teamMembers }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[] }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);

    return (<>
        <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="receiptDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data de Recebimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="supplierName" render={({ field }) => ( <FormItem><FormLabel>Fornecedor</FormLabel><FormControl><Input {...field} placeholder="Nome do fornecedor do material" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="quantityReceived" render={({ field }) => ( <FormItem><FormLabel>Quantidade Recebida</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="Qtd. conforme NF" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="materialStandard" render={({ field }) => ( <FormItem><FormLabel>Norma do Material</FormLabel><FormControl><Input {...field} placeholder="Ex: ASTM A36" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="materialCertificateUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Certificado</FormLabel><FormControl><Input type="url" {...field} placeholder="https://" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="inspectionResult" render={({ field }) => ( <FormItem><FormLabel>Resultado</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem><SelectItem value="Aprovado com ressalva">Aprovado com ressalva</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
    </>);
}

function DimensionalReportForm({ form, orders, teamMembers, fieldArrayProps, calibrations, toast }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[], fieldArrayProps: any, calibrations: Calibration[], toast: any }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);
    
    const [newMeasurement, setNewMeasurement] = useState({ dimensionName: '', nominalValue: '', toleranceMin: '', toleranceMax: '', measuredValue: '', instrumentUsed: '' });
    const [editMeasurementIndex, setEditMeasurementIndex] = useState<number | null>(null);

    const handleAddMeasurement = () => {
        const nominal = parseFloat(newMeasurement.nominalValue);
        const measured = parseFloat(newMeasurement.measuredValue);
        const tolMin = newMeasurement.toleranceMin !== '' ? Math.abs(parseFloat(newMeasurement.toleranceMin)) : null;
        const tolMax = newMeasurement.toleranceMax !== '' ? Math.abs(parseFloat(newMeasurement.toleranceMax)) : null;
    
        if (!newMeasurement.dimensionName || isNaN(nominal) || isNaN(measured) || !newMeasurement.instrumentUsed) {
            toast({
                variant: "destructive",
                title: "Campos obrigatórios",
                description: "Por favor, preencha o Nome da Dimensão, Valor Nominal, Valor Medido e selecione um Instrumento.",
            });
            return;
        }
    
        let result: "Conforme" | "Não Conforme" = "Conforme";
        const lowerBound = tolMin !== null ? nominal - tolMin : nominal;
        const upperBound = tolMax !== null ? nominal + tolMax : nominal;

        if (measured < lowerBound || measured > upperBound) {
            result = "Não Conforme";
        }
        
        fieldArrayProps.append({
            id: Date.now().toString(),
            dimensionName: newMeasurement.dimensionName,
            nominalValue: nominal,
            toleranceMin: tolMin ?? undefined,
            toleranceMax: tolMax ?? undefined,
            measuredValue: measured,
            instrumentUsed: newMeasurement.instrumentUsed,
            result: result,
        });
        setNewMeasurement({ dimensionName: '', nominalValue: '', toleranceMin: '', toleranceMax: '', measuredValue: '', instrumentUsed: '' });
    };
    
    const handleEditMeasurement = (index: number) => {
        const measurementToEdit = fieldArrayProps.fields[index];
        setNewMeasurement({
            dimensionName: measurementToEdit.dimensionName,
            nominalValue: measurementToEdit.nominalValue.toString(),
            toleranceMin: measurementToEdit.toleranceMin?.toString() ?? '',
            toleranceMax: measurementToEdit.toleranceMax?.toString() ?? '',
            measuredValue: measurementToEdit.measuredValue.toString(),
            instrumentUsed: measurementToEdit.instrumentUsed,
        });
        setEditMeasurementIndex(index);
    };

    const handleUpdateMeasurement = () => {
        if (editMeasurementIndex === null) return;
        
        const nominal = parseFloat(newMeasurement.nominalValue);
        const measured = parseFloat(newMeasurement.measuredValue);
        const tolMin = newMeasurement.toleranceMin !== '' ? Math.abs(parseFloat(newMeasurement.toleranceMin)) : null;
        const tolMax = newMeasurement.toleranceMax !== '' ? Math.abs(parseFloat(newMeasurement.toleranceMax)) : null;

        if (!newMeasurement.dimensionName || isNaN(nominal) || isNaN(measured) || !newMeasurement.instrumentUsed) {
            toast({
                variant: "destructive",
                title: "Campos obrigatórios",
                description: "Por favor, preencha o Nome da Dimensão, Valor Nominal, Valor Medido e selecione um Instrumento.",
            });
            return;
        }

        let result: "Conforme" | "Não Conforme" = "Conforme";
        const lowerBound = tolMin !== null ? nominal - tolMin : nominal;
        const upperBound = tolMax !== null ? nominal + tolMax : nominal;
        
        if (measured < lowerBound || measured > upperBound) {
            result = "Não Conforme";
        }
        
        fieldArrayProps.update(editMeasurementIndex, {
            ...fieldArrayProps.fields[editMeasurementIndex],
            dimensionName: newMeasurement.dimensionName,
            nominalValue: nominal,
            toleranceMin: tolMin ?? undefined,
            toleranceMax: tolMax ?? undefined,
            measuredValue: measured,
            instrumentUsed: newMeasurement.instrumentUsed,
            result: result,
        });

        setNewMeasurement({ dimensionName: '', nominalValue: '', toleranceMin: '', toleranceMax: '', measuredValue: '', instrumentUsed: '' });
        setEditMeasurementIndex(null);
    };
    
    const handleCancelEdit = () => {
        setNewMeasurement({ dimensionName: '', nominalValue: '', toleranceMin: '', toleranceMax: '', measuredValue: '', instrumentUsed: '' });
        setEditMeasurementIndex(null);
    };

    return (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="inspectionDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Inspeção</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="quantityInspected" render={({ field }) => ( <FormItem><FormLabel>Quantidade de Peças Inspecionadas</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="Ex: 10" /></FormControl><FormMessage /></FormItem> )}/>
        </div>


        <Card><CardHeader><CardTitle className="text-base">Medições</CardTitle></CardHeader>
        <CardContent>
            {fieldArrayProps.fields.length > 0 && (
            <Table><TableHeader><TableRow><TableHead>Dimensão</TableHead><TableHead>Nominal</TableHead><TableHead>Tol. (-)</TableHead><TableHead>Tol. (+)</TableHead><TableHead>Medido</TableHead><TableHead>Instrumento</TableHead><TableHead>Resultado</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
                {fieldArrayProps.fields.map((field: any, index: number) => (
                <TableRow key={field.id}>
                    <TableCell>{field.dimensionName}</TableCell><TableCell>{field.nominalValue}</TableCell>
                    <TableCell>{field.toleranceMin ?? '-'}</TableCell><TableCell>{field.toleranceMax ?? '-'}</TableCell>
                    <TableCell>{field.measuredValue}</TableCell><TableCell>{field.instrumentUsed}</TableCell>
                    <TableCell><Badge variant={getStatusVariant(field.result)}>{field.result}</Badge></TableCell>
                    <TableCell className="flex items-center">
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleEditMeasurement(index)}><Pencil className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => fieldArrayProps.remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                    </TableCell>
                </TableRow>))}
            </TableBody></Table>
            )}
            <div className="mt-4 space-y-4 p-4 border rounded-md">
                <h4 className="font-medium">{editMeasurementIndex !== null ? 'Editar Medição' : 'Adicionar Nova Medição'}</h4>
                <div>
                    <Label>Nome da Dimensão</Label>
                    <Input value={newMeasurement.dimensionName} onChange={(e) => setNewMeasurement({...newMeasurement, dimensionName: e.target.value})} placeholder="Ex: Diâmetro externo"/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <Label>Valor Nominal</Label>
                        <Input type="number" step="any" value={newMeasurement.nominalValue} onChange={(e) => setNewMeasurement({...newMeasurement, nominalValue: e.target.value})} placeholder="100.0"/>
                    </div>
                    <div>
                        <Label>Tolerância Inferior (-)</Label>
                        <Input type="number" step="any" value={newMeasurement.toleranceMin} onChange={(e) => setNewMeasurement({...newMeasurement, toleranceMin: e.target.value})} placeholder="Ex: 0.1"/>
                    </div>
                    <div>
                        <Label>Tolerância Superior (+)</Label>
                        <Input type="number" step="any" value={newMeasurement.toleranceMax} onChange={(e) => setNewMeasurement({...newMeasurement, toleranceMax: e.target.value})} placeholder="Ex: 0.2"/>
                    </div>
                    <div>
                        <Label>Valor Medido</Label>
                        <Input type="number" step="any" value={newMeasurement.measuredValue} onChange={(e) => setNewMeasurement({...newMeasurement, measuredValue: e.target.value})} placeholder="100.05"/>
                    </div>
                </div>
                 <div className="mt-4">
                    <Label>Instrumento Utilizado</Label>
                    <Select value={newMeasurement.instrumentUsed} onValueChange={(value) => setNewMeasurement({...newMeasurement, instrumentUsed: value})}>
                        <SelectTrigger><SelectValue placeholder="Selecione um instrumento" /></SelectTrigger>
                        <SelectContent>
                            {calibrations.length > 0 ? (
                                calibrations.map(cal => <SelectItem key={cal.id} value={cal.equipmentName}>{cal.equipmentName} ({cal.internalCode})</SelectItem>)
                            ) : (
                                <SelectItem value="none" disabled>Cadastre na aba 'Calibração'</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>
                 <div className="flex justify-end mt-4 gap-2">
                    {editMeasurementIndex !== null && <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>Cancelar</Button>}
                    <Button type="button" size="sm" onClick={editMeasurementIndex !== null ? handleUpdateMeasurement : handleAddMeasurement}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        {editMeasurementIndex !== null ? 'Atualizar Medição' : 'Adicionar Medição'}
                    </Button>
                </div>
            </div>
           
        </CardContent></Card>
        
        <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="photosUrl" render={({ field }) => ( <FormItem><FormLabel>Link para Fotos do Processo</FormLabel><FormControl><Input type="url" {...field} value={field.value ?? ''} placeholder="https://drive.google.com/..." /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
    </>);
}

function WeldingInspectionForm({ form, orders, teamMembers }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[] }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);
    const inspectionType = form.watch("inspectionType");

    return (<>
        <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="inspectionDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Inspeção</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="inspectionType" render={({ field }) => ( <FormItem><FormLabel>Tipo de Inspeção</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Visual">Visual</SelectItem><SelectItem value="LP - Líquido Penetrante">LP - Líquido Penetrante</SelectItem><SelectItem value="UT - Ultrassom">UT - Ultrassom</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
        
        {inspectionType === 'Visual' && (<>
            <FormField control={form.control} name="welder" render={({ field }) => ( <FormItem><FormLabel>Soldador</FormLabel><FormControl><Input {...field} placeholder="Nome do soldador" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="process" render={({ field }) => ( <FormItem><FormLabel>Processo de Solda</FormLabel><FormControl><Input {...field} placeholder="MIG/MAG/TIG/SMAW" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Resultado</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Conforme">Conforme</SelectItem><SelectItem value="Não Conforme">Não Conforme</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
        </>)}

        {(inspectionType === 'LP - Líquido Penetrante' || inspectionType === 'UT - Ultrassom') && (<>
            <FormField control={form.control} name="technician" render={({ field }) => ( <FormItem><FormLabel>Técnico Responsável</FormLabel><FormControl><Input {...field} placeholder="Nome do técnico" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="standard" render={({ field }) => ( <FormItem><FormLabel>Norma Aplicada</FormLabel><FormControl><Input {...field} placeholder="Ex: ASTM E165" /></FormControl><FormMessage /></FormItem> )}/>
            {inspectionType === 'UT - Ultrassom' && <FormField control={form.control} name="equipment" render={({ field }) => ( <FormItem><FormLabel>Equipamento</FormLabel><FormControl><Input {...field} placeholder="Nome do equipamento de UT" /></FormControl><FormMessage /></FormItem> )}/>}
            <FormField control={form.control} name="reportUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Laudo</FormLabel><FormControl><Input type="url" {...field} placeholder="https://" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Resultado</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
        </>)}
        
        <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
    </>);
}

function PaintingReportForm({ form, orders, teamMembers }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[] }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);

    return (<>
        <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="inspectionDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Inspeção</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="paintType" render={({ field }) => ( <FormItem><FormLabel>Tipo de Tinta</FormLabel><FormControl><Input {...field} placeholder="Ex: Primer Epóxi, Esmalte PU" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="colorRal" render={({ field }) => ( <FormItem><FormLabel>Cor (RAL)</FormLabel><FormControl><Input {...field} placeholder="Ex: RAL 7035" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="surfacePreparation" render={({ field }) => ( <FormItem><FormLabel>Preparação da Superfície</FormLabel><FormControl><Input {...field} placeholder="Ex: Jateamento SA 2 1/2" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="dryFilmThickness" render={({ field }) => ( <FormItem><FormLabel>Espessura (μm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="Ex: 120" /></FormControl><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="adhesionTestResult" render={({ field }) => ( <FormItem><FormLabel>Teste de Aderência</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Resultado do teste"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Resultado Geral</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )}/>
        <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
    </>);
}








