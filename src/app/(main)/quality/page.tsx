
"use client";

import OrderEngineeringTickets from './OrderEngineeringTickets';
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
import Image from "next/image";


import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Pencil, Trash2, CalendarIcon, CheckCircle, AlertTriangle, XCircle, FileText, Beaker, ShieldCheck, Wrench, Microscope, BookOpen, BrainCircuit, Phone, SlidersHorizontal, PackageSearch, FileDown, Search, FilePen, AlertCircle, Clock, Play, MoreVertical, TicketCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";

// === COMPONENTE VISUAL DE INDICADOR DE TAMANHO ===
const DataSizeIndicator = ({ data, maxSizeKB = 900 }: { data: any, maxSizeKB?: number }) => {
    const currentSizeKB = (JSON.stringify(data).length / 1024);
    const percentage = (currentSizeKB / maxSizeKB) * 100;
    
    const getColor = () => {
        if (percentage < 50) return 'bg-green-500';
        if (percentage < 75) return 'bg-yellow-500';
        if (percentage < 90) return 'bg-orange-500';
        return 'bg-red-500';
    };
    
    const getTextColor = () => {
        if (percentage < 50) return 'text-green-700';
        if (percentage < 75) return 'text-yellow-700';
        if (percentage < 90) return 'text-orange-700';
        return 'text-red-700';
    };
    
    return (
        <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${getTextColor()}`}>
                    Tamanho do Relatório
                </span>
                <span className={`font-mono ${getTextColor()}`}>
                    {currentSizeKB.toFixed(1)}KB / {maxSizeKB}KB
                </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                    className={`h-2 rounded-full transition-all duration-300 ${getColor()}`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                />
            </div>
            {percentage > 90 && (
                <p className="text-xs text-red-600 font-medium">
                    ⚠️ Relatório próximo do limite! Remova algumas fotos.
                </p>
            )}
        </div>
    );
};

// === FUNÇÃO DE COMPRESSÃO OTIMIZADA PARA FIRESTORE ===
const compressImageForFirestore = (file: File, maxWidth: number = 800, quality: number = 0.5): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            if (!dataUrl) {
                reject(new Error('Erro ao ler arquivo'));
                return;
            }
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                reject(new Error('Canvas não suportado'));
                return;
            }
            
            const image = document.createElement('img');
            
            image.onload = () => {
                try {
                    let { width, height } = image;
                    
                    // Redimensionamento mais agressivo
                    const maxDimension = maxWidth;
                    if (width > height && width > maxDimension) {
                        height = (height * maxDimension) / width;
                        width = maxDimension;
                    } else if (height > maxDimension) {
                        width = (width * maxDimension) / height;
                        height = maxDimension;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // Desenhar com qualidade otimizada
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'medium';
                    ctx.drawImage(image, 0, 0, width, height);
                    
                    // Compressão mais agressiva baseada no tamanho do arquivo
                    let finalQuality = quality;
                    const fileSizeKB = file.size / 1024;
                    
                    if (fileSizeKB > 5000) finalQuality = 0.3; // > 5MB
                    else if (fileSizeKB > 2000) finalQuality = 0.4; // > 2MB
                    else if (fileSizeKB > 1000) finalQuality = 0.5; // > 1MB
                    else if (fileSizeKB > 500) finalQuality = 0.6; // > 500KB
                    
                    let compressedDataUrl = canvas.toDataURL('image/jpeg', finalQuality);
                    
                    // Verificar se ainda está muito grande e comprimir mais se necessário
                    const estimatedSizeKB = (compressedDataUrl.length * 0.75) / 1024;
                    
                    if (estimatedSizeKB > 100) { // Se maior que 100KB, comprimir mais
                        finalQuality = Math.max(0.2, finalQuality - 0.2);
                        compressedDataUrl = canvas.toDataURL('image/jpeg', finalQuality);
                        console.log(`Compressão adicional aplicada: qualidade ${finalQuality}`);
                    }
                    
                    const finalSizeKB = (compressedDataUrl.length * 0.75) / 1024;
                    console.log(`Foto comprimida - Original: ${fileSizeKB.toFixed(1)}KB → Final: ${finalSizeKB.toFixed(1)}KB`);
                    
                    resolve(compressedDataUrl);
                } catch (error) {
                    console.error('Erro ao comprimir imagem:', error);
                    reject(error);
                }
            };
            
            image.onerror = () => reject(new Error('Erro ao carregar imagem'));
            image.src = dataUrl;
        };
        
        reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(file);
    });
};

// === CONFIGURAÇÕES E VALIDAÇÕES PARA FIRESTORE ===
const PHOTO_LIMITS = {
    MAX_PHOTOS: 6,           // Máximo 6 fotos por relatório
    MAX_PHOTO_SIZE_KB: 120,  // Máximo 120KB por foto
    MAX_TOTAL_SIZE_KB: 500,  // Máximo 500KB total em fotos
    IMAGE_MAX_WIDTH: 800,    // Largura máxima da imagem
    COMPRESSION_QUALITY: 0.5 // Qualidade de compressão JPEG
};

const validateDataSizeBeforeSave = (data: any): boolean => {
    const dataSize = JSON.stringify(data).length;
    const maxSize = 900000; // 900KB de segurança
    
    if (dataSize > maxSize) {
        console.error(`❌ Dados muito grandes: ${(dataSize / 1024).toFixed(1)}KB (máximo: ${(maxSize / 1024).toFixed(1)}KB)`);
        return false;
    }
    
    console.log(`✓ Tamanho dos dados OK: ${(dataSize / 1024).toFixed(1)}KB`);
    return true;
};




import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";


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
  
  // ✅ NOVOS CAMPOS ADICIONADOS PARA FOTOS
  photos: z.array(z.string()).optional(),
  
  // ✅ NOVOS CAMPOS PARA PLANO DE AÇÕES
  actionPlan: z.object({
    rootCause: z.string().optional(),
    correctiveActions: z.string().optional(),
    preventiveActions: z.string().optional(),
    responsible: z.string().optional(),
    deadline: z.date().optional().nullable(),
    actionStatus: z.enum(["Não Iniciado", "Em Andamento", "Concluído"]).optional(),
    implementationNotes: z.string().optional(),
  }).optional(),
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
  certificateNumber: z.string().optional(),
  certificateUrl: z.string().url("Insira uma URL válida.").or(z.literal('')).optional(),
  notes: z.string().optional(),
});

const rawMaterialInspectionSchema = z.object({
  id: z.string().optional(),
  reportNumber: z.string().optional(),
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
  photos: z.array(z.string()).optional(),
});

const dimensionalMeasurementSchema = z.object({
  id: z.string(),
  dimensionName: z.string().min(1, "O nome da dimensão é obrigatório."),
  nominalValue: z.coerce.number(),
  toleranceMin: z.string().optional(), // Mudou de number para string
  toleranceMax: z.string().optional(), // Mudou de number para string
  measuredValue: z.coerce.number(),
  instrumentUsed: z.string({ required_error: "O instrumento é obrigatório." }),
  result: z.enum(["Conforme", "Não Conforme"]),
});

const dimensionalReportSchema = z.object({
  id: z.string().optional(),
  reportNumber: z.string().optional(),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  partIdentifier: z.string().optional(),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  customerInspector: z.string().optional(),
  inspectionDate: z.date({ required_error: "A data da inspeção é obrigatória." }),
  quantityInspected: z.coerce.number().min(1, "A quantidade inspecionada é obrigatória.").optional(),
  photos: z.array(z.string()).optional(),
  notes: z.string().optional(),
  measurements: z.array(dimensionalMeasurementSchema).min(1, "Adicione pelo menos uma medição."),
});

const weldingInspectionSchema = z.object({
  id: z.string().optional(),
  reportNumber: z.string().optional(),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  inspectionDate: z.date({ required_error: "A data é obrigatória." }),
  inspectionType: z.enum(["Visual", "LP - Líquido Penetrante", "UT - Ultrassom"]),
  jointIdentification: z.string().optional(),
  weldingProcess: z.string().optional(),
  jointType: z.string().optional(),
  weldingPosition: z.string().optional(),
  baseMaterial: z.string().optional(),
  fillerMaterial: z.string().optional(),
  materialThickness: z.string().optional(),
  welderSinete: z.string().optional(),
  welderQualification: z.string().optional(),
  wpsCode: z.string().optional(),
  dimensionalTools: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  surfaceCondition: z.string().optional(),
  observedDefects: z.string().optional(),
  result: z.enum(["Aprovado", "Reprovado", "Conforme", "Não Conforme"]),
  technician: z.string().optional(),
  standard: z.string().optional(),
  equipment: z.string().optional(),
  reportUrl: z.string().url("URL inválida.").or(z.literal("")).optional(),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  customerInspector: z.string().optional(),
  releaseResponsible: z.string().optional(),
  notes: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const paintLayerSchema = z.object({
    thickness: z.coerce.number().optional(),
    colorRal: z.string().optional(),
    type: z.string().optional(),
    manufacturer: z.string().optional(),
    lotNumber: z.string().optional(),
    dryingTime: z.string().optional(),
    cureTime: z.string().optional(),
});

const paintingReportSchema = z.object({
    id: z.string().optional(),
    reportNumber: z.string().optional(),
    orderId: z.string({ required_error: "Selecione um pedido." }),
    itemId: z.string({ required_error: "Selecione um item." }),
    quantity: z.coerce.number().optional(),
    painter: z.string().optional(),
    startDate: z.date().optional().nullable(),
    endDate: z.date().optional().nullable(),
    location: z.string().optional(),
    paintSystem: z.object({
        referenceNorm: z.string().optional(),
        systemDescription: z.string().optional(),
        totalLayers: z.coerce.number().optional(),
        primer: paintLayerSchema.optional(),
        intermediate: paintLayerSchema.optional(),
        finish: paintLayerSchema.optional(),
    }).optional(),
    surfacePrep: z.object({
        substrate: z.string().optional(),
        method: z.string().optional(),
        cleaningStandard: z.string().optional(),
        roughness: z.coerce.number().optional(),
        roughnessInstrument: z.string().optional(),
        conductivity: z.coerce.number().optional(),
    }).optional(),
    environmentalConditions: z.array(z.object({
        layer: z.string(),
        ambientTemp: z.coerce.number().optional(),
        surfaceTemp: z.coerce.number().optional(),
        humidity: z.coerce.number().optional(),
        dewPoint: z.coerce.number().optional(),
    })).optional(),
    dftControl: z.object({
        instrument: z.string().optional(),
        calibrationCert: z.string().optional(),
        measurementPoints: z.string().optional(),
        primerMeasured: z.coerce.number().optional(),
        intermediateMeasured: z.coerce.number().optional(),
        finishMeasured: z.coerce.number().optional(),
        totalMeasured: z.coerce.number().optional(),
        isCompliant: z.boolean().optional(),
        notes: z.string().optional(),
    }).optional(),
    additionalTests: z.object({
        adhesion: z.string().optional(),
        hardness: z.string().optional(),
        glossColor: z.string().optional(),
        chemicalResistance: z.string().optional(),
    }).optional(),
    conclusion: z.object({
        finalResult: z.enum(["Conforme", "Não Conforme"]),
        deviations: z.string().optional(),
        generalNotes: z.string().optional(),
        inspector: z.string().optional(),
        inspectionDate: z.date().optional().nullable(),
    }).optional(),
    photos: z.array(z.string()).optional(),
});



const liquidPenetrantSchema = z.object({
  id: z.string().optional(),
  reportNumber: z.string().optional(),
  inspectionDate: z.date({ required_error: "A data de emissão é obrigatória." }),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  inspectorQualification: z.string().optional(),
  baseMaterial: z.string().optional(),
  heatTreatment: z.string().optional(),
  examinedAreas: z.string().optional(),
  quantityInspected: z.coerce.number().optional(),
  testLocation: z.string().optional(),
  appliedStandard: z.string().optional(),
  technique: z.enum(["visível", "fluorescente"]),
  method: z.enum(["removível com solvente", "lavável com água", "pós-emulsificável"]),
  ambientTemperature: z.coerce.number().optional(),
  partTemperature: z.coerce.number().optional(),
  penetrant: z.string().optional(),
  developer: z.string().optional(),
  remover: z.string().optional(),
  consumableValidity: z.date().optional().nullable(),
  consumableLot: z.string().optional(),
  sensitivityTest: z.boolean().default(false),
  procedure: z.object({
    preCleaning: z.boolean().default(false),
    penetrantApplication: z.boolean().default(false),
    penetrationTime: z.coerce.number().optional(),
    excessRemoval: z.boolean().default(false),
    developerApplication: z.boolean().default(false),
    developmentTime: z.coerce.number().optional(),
    totalProcessTime: z.coerce.number().optional(),
    lightingMode: z.string().optional(),
    lightIntensity: z.string().optional(),
    inspectionType: z.enum(["geral", "localizada", "completa", "parcial"]),
    isSurfaceAccessible: z.boolean().default(true),
  }),
  results: z.object({
    defectType: z.string().optional(),
    defectLocation: z.string().optional(),
    defectDimensions: z.string().optional(),
    isAreaFree: z.boolean().default(true),
    sketch: z.string().optional(),
  }),
  finalResult: z.enum(["Conforme", "Não Conforme"]),
  acceptanceCriteria: z.string().optional(),
  finalNotes: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const ultrasoundResultSchema = z.object({
    id: z.string(),
    jointCode: z.string().min(1, "Código da junta é obrigatório."),
    defectType: z.string().optional(),
    location: z.string().optional(),
    depth: z.coerce.number().optional(),
    extension: z.coerce.number().optional(),
    amplitude: z.string().optional(),
    evaluationResult: z.enum(["Conforme", "Não Conforme"]),
});

const ultrasoundReportSchema = z.object({
  id: z.string().optional(),
  reportNumber: z.string().optional(),
  inspectionDate: z.date({ required_error: "A data de emissão é obrigatória." }),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  itemId: z.string({ required_error: "Selecione um item." }),
  inspectedBy: z.string({ required_error: "O inspetor é obrigatório." }),
  qualificationLevel: z.string().optional(),
  baseMaterial: z.string().optional(),
  heatTreatment: z.string().optional(),
  weldTypeAndThickness: z.string().optional(),
  examinedAreaDescription: z.string().optional(),
  quantityInspected: z.coerce.number().optional(),
  testLocation: z.string().optional(),
  executionStandard: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  examinationType: z.enum(["Detecção de Descontinuidades", "Medição de Espessura", "TOFD", "Phased Array"]).optional(),
  testExtent: z.string().optional(),
  equipment: z.string().optional(),
  equipmentSerial: z.string().optional(),
  equipmentCalibration: z.string().optional(),
  headType: z.string().optional(),
  frequency: z.coerce.number().optional(),
  incidentAngle: z.coerce.number().optional(),
  couplant: z.string().optional(),
  referenceBlock: z.string().optional(),
  pulseMode: z.string().optional(),
  range: z.coerce.number().optional(),
  gain: z.coerce.number().optional(),
  distanceCorrection: z.string().optional(),
  scanRate: z.coerce.number().optional(),
  minResolution: z.coerce.number().optional(),
  results: z.array(ultrasoundResultSchema).optional(),
  finalResult: z.enum(["Conforme", "Não Conforme"]),
  rejectionCriteria: z.string().optional(),
  finalNotes: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const lessonsLearnedSchema = z.object({
  id: z.string().optional(),
  reportNumber: z.string().optional(),
  emissionDate: z.date({ required_error: "A data de emissão é obrigatória." }),
  orderId: z.string().optional(),
  itemId: z.string().optional(),
  department: z.string().optional(),
  projectPhase: z.array(z.string()).optional(),
  occurrenceDate: z.date().optional().nullable(),
  eventDescription: z.string().min(10, "A descrição é obrigatória."),
  rootCause: z.string().optional(),
  analysisTool: z.string().optional(),
  impact: z.object({
    reprocess: z.boolean().default(false),
    delay: z.boolean().default(false),
    cost: z.boolean().default(false),
    rework: z.boolean().default(false),
    materialLoss: z.boolean().default(false),
  }).optional(),
  correctiveAction: z.string().optional(),
  preventiveAction: z.string().optional(),
  actionResponsible: z.string().optional(),
  actionDeadline: z.date().optional().nullable(),
  actionStatus: z.enum(["Pendente", "Em andamento", "Concluída"]).optional(),
  lessonSummary: z.string().optional(),
  procedureChangeNeeded: z.boolean().optional(),
  procedureChanges: z.string().optional(),
  includeInTraining: z.boolean().optional(),
  evidence: z.array(z.string()).optional(),
  filledBy: z.string().optional(),
  verifiedBy: z.string().optional(),
  approvedBy: z.string().optional(),
  closeDate: z.date().optional().nullable(),
});





// --- TYPES ---
type NonConformance = z.infer<typeof nonConformanceSchema> & { id: string, orderNumber: string, customerName: string };
  // ✅ NOVOS CAMPOS TIPADOS
  photos?: string[],
  actionPlan?: {
    rootCause?: string,
    correctiveActions?: string,
    preventiveActions?: string,
    responsible?: string,
    deadline?: Date | null,
    actionStatus?: "Não Iniciado" | "Em Andamento" | "Concluído",
    implementationNotes?: string,
  } | null
};
type OrderInfo = { id: string; number: string; customerId: string; customerName: string, projectName?: string, items: { id: string, description: string, code?: string, quantity?: number }[] };
type Calibration = z.infer<typeof calibrationSchema> & { id: string };
type RawMaterialInspection = z.infer<typeof rawMaterialInspectionSchema> & { id: string, orderNumber: string, itemName: string };
type DimensionalReport = z.infer<typeof dimensionalReportSchema> & { id: string, orderNumber: string, itemName: string, overallResult?: string };
type WeldingInspection = z.infer<typeof weldingInspectionSchema> & { id: string, orderNumber: string, itemName: string };
type PaintingReport = z.infer<typeof paintingReportSchema> & { id: string, orderNumber: string, itemName: string, result: string };
type LiquidPenetrantReport = z.infer<typeof liquidPenetrantSchema> & { id: string, orderNumber: string, itemName: string };
type UltrasoundReport = z.infer<typeof ultrasoundReportSchema> & { id: string, orderNumber: string, itemName: string };
type UltrasoundResult = z.infer<typeof ultrasoundResultSchema>;
type LessonsLearnedReport = z.infer<typeof lessonsLearnedSchema> & { id: string, orderNumber?: string };
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

const getStatusVariant = (status?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (!status) return 'outline';
    switch (status) {
        case 'Aberta': return 'destructive';
        case 'Em Análise': return 'secondary';
        case 'Em andamento': return 'secondary';
        case 'Concluída': return 'default';
        case 'Aprovado': return 'default';
        case 'Aprovado com ressalva': return 'secondary';
        case 'Reprovado': return 'destructive';
        case 'Conforme': return 'default';
        case 'Não Conforme': return 'destructive';
        case 'Pendente': return 'secondary';
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

// 2.1 ADICIONAR ESTE COMPONENTE APÓS AS FUNÇÕES HELPER

// Componente para upload e gerenciamento de fotos
function PhotoUploadSection({ form, toast }: { form: any, toast: any }) {
  const watchedPhotos = form.watch("photos", []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const currentPhotos = form.getValues("photos") || [];
    
    // Verificar limite de fotos (máximo 6 por RNC)
    if (currentPhotos.length + files.length > 6) {
        toast({
            title: "Muitas fotos",
            description: `Máximo de 6 fotos permitidas. Você tem ${currentPhotos.length} e está tentando adicionar ${files.length}.`,
            variant: "destructive",
        });
        return;
    }
    
    const validFiles = Array.from(files).filter(file => {
        // Verificar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            toast({
                title: "Tipo de arquivo inválido",
                description: `O arquivo ${file.name} não é uma imagem válida.`,
                variant: "destructive",
            });
            return false;
        }
        
        // Verificar tamanho (máximo 10MB)
        if (file.size > 10 * 1024 * 1024) {
            toast({
                title: "Arquivo muito grande",
                description: `O arquivo ${file.name} é muito grande (máximo 10MB).`,
                variant: "destructive",
            });
            return false;
        }
        
        return true;
    });
    
    if (validFiles.length === 0) return;
    
    try {
        toast({ title: "Processando fotos...", description: "Aguarde enquanto comprimimos as imagens." });
        
        const compressedPhotos = await Promise.all(
            validFiles.map(async (file) => {
                try {
                    console.log(`Processando foto RNC: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                    return await compressImageForFirestore(file, 600, 0.7); // Menor resolução para RNC
                } catch (error) {
                    console.error(`Erro ao comprimir ${file.name}:`, error);
                    // Em caso de erro, usar o arquivo original comprimido
                    return new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target?.result as string);
                        reader.readAsDataURL(file);
                    });
                }
            })
        );
        
        const updatedPhotos = [...currentPhotos, ...compressedPhotos];
        form.setValue("photos", updatedPhotos, { shouldValidate: true });
        
        toast({
            title: "Fotos adicionadas",
            description: `${validFiles.length} foto(s) processada(s) com sucesso.`,
        });
        
    } catch (error) {
        console.error('Erro ao processar fotos:', error);
        toast({
            title: "Erro ao processar fotos",
            description: "Tente novamente ou entre em contato com o suporte.",
            variant: "destructive",
        });
    }
    
    // Limpar o input para permitir selecionar os mesmos arquivos novamente
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
      const currentPhotos = form.getValues("photos") || [];
      const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
      form.setValue("photos", updatedPhotos, { shouldValidate: true });
      
      toast({
          title: "Foto removida",
          description: `Foto ${index + 1} foi removida da RNC.`,
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          📷 Registro Fotográfico da Não Conformidade
          <Badge variant="secondary">{watchedPhotos?.length || 0}/6</Badge>
        </CardTitle>
        <CardDescription>
          Anexe fotos que evidenciem a não conformidade encontrada. As imagens serão comprimidas automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormItem>
          <FormLabel>Selecionar Fotos</FormLabel>
          <FormControl>
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                  </svg>
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Clique para selecionar</span> ou arraste as imagens
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG, JPEG (máx. 10MB cada)</p>
                </div>
                <Input 
                  type="file" 
                  multiple 
                  accept="image/jpeg,image/jpg,image/png" 
                  onChange={handlePhotoUpload} 
                  className="hidden"
                />
              </label>
            </div>
          </FormControl>
          <FormDescription className="text-xs">
            • Máximo 6 fotos por RNC<br/>
            • Tamanho máximo: 10MB por imagem<br/>
            • Formatos aceitos: JPEG, PNG<br/>
            • Dica: Fotos nítidas ajudam na análise
          </FormDescription>
        </FormItem>

        {watchedPhotos && watchedPhotos.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Fotos da Não Conformidade</h4>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => {
                  form.setValue("photos", [], { shouldValidate: true });
                  toast({ title: "Todas as fotos foram removidas" });
                }}
              >
                Remover Todas
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {watchedPhotos.map((photo, index) => (
                <div key={index} className="relative group">
                  <div className="relative overflow-hidden rounded-lg border">
                    <Image 
                      src={photo} 
                      alt={`RNC ${index + 1}`} 
                      width={200} 
                      height={200} 
                      className="object-cover w-full aspect-square transition-transform group-hover:scale-105" 
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
                    <Button 
                      type="button" 
                      size="icon" 
                      variant="destructive" 
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removePhoto(index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-center mt-1 text-muted-foreground">
                    Foto {index + 1}
                  </p>
                  <p className="text-xs text-center text-muted-foreground">
                    {Math.round((photo.length * 0.75) / 1024)}KB
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <FormMessage />
      </CardContent>
    </Card>
  );
}

// 3.1 ADICIONAR ESTE COMPONENTE APÓS O PhotoUploadSection

// Componente para plano de ações corretivas
function ActionPlanSection({ form, teamMembers }: { form: any, teamMembers: TeamMember[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          🎯 Plano de Ações Corretivas
          <Badge variant="outline">Opcional</Badge>
        </CardTitle>
        <CardDescription>
          Defina as ações necessárias para tratar esta não conformidade e evitar reincidências.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField control={form.control} name="actionPlan.rootCause" render={({ field }) => ( 
          <FormItem>
            <FormLabel>Causa Raiz</FormLabel>
            <FormControl>
              <Textarea 
                placeholder="Qual foi a causa raiz identificada para esta não conformidade? Use técnicas como 5 Porquês, Ishikawa, etc." 
                {...field} 
                value={field.value ?? ''}
                className="min-h-[80px]"
              />
            </FormControl>
            <FormDescription>
              Identifique a origem do problema para que as ações sejam efetivas.
            </FormDescription>
            <FormMessage />
          </FormItem> 
        )}/>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="actionPlan.correctiveActions" render={({ field }) => ( 
            <FormItem>
              <FormLabel>Ações Corretivas</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="O que será feito para corrigir esta não conformidade específica?" 
                  {...field} 
                  value={field.value ?? ''}
                  className="min-h-[100px]"
                />
              </FormControl>
              <FormDescription>
                Ações imediatas para resolver o problema atual.
              </FormDescription>
              <FormMessage />
            </FormItem> 
          )}/>

          <FormField control={form.control} name="actionPlan.preventiveActions" render={({ field }) => ( 
            <FormItem>
              <FormLabel>Ações Preventivas</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="O que será feito para prevenir que esta não conformidade aconteça novamente?" 
                  {...field} 
                  value={field.value ?? ''}
                  className="min-h-[100px]"
                />
              </FormControl>
              <FormDescription>
                Ações sistêmicas para evitar reincidências.
              </FormDescription>
              <FormMessage />
            </FormItem> 
          )}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="actionPlan.responsible" render={({ field }) => ( 
            <FormItem>
              <FormLabel>Responsável pelas Ações</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um responsável" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {teamMembers.map(m => 
                    <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                Pessoa responsável por executar as ações definidas.
              </FormDescription>
              <FormMessage />
            </FormItem> 
          )} />

          <FormField control={form.control} name="actionPlan.deadline" render={({ field }) => ( 
            <FormItem className="flex flex-col">
              <FormLabel>Prazo para Implementação</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                      {field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha uma data</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                </PopoverContent>
              </Popover>
              <FormDescription>
                Data limite para completar todas as ações.
              </FormDescription>
              <FormMessage />
            </FormItem> 
          )}/>
        </div>

        <FormField control={form.control} name="actionPlan.actionStatus" render={({ field }) => ( 
          <FormItem>
            <FormLabel>Status das Ações</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="Não Iniciado">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                    Não Iniciado
                  </div>
                </SelectItem>
                <SelectItem value="Em Andamento">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    Em Andamento
                  </div>
                </SelectItem>
                <SelectItem value="Concluído">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    Concluído
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Status atual da implementação das ações definidas.
            </FormDescription>
            <FormMessage />
          </FormItem> 
        )} />

        <FormField control={form.control} name="actionPlan.implementationNotes" render={({ field }) => ( 
          <FormItem>
            <FormLabel>Observações da Implementação</FormLabel>
            <FormControl>
              <Textarea 
                placeholder="Anote aqui o progresso, dificuldades encontradas, resultados obtidos, etc." 
                {...field} 
                value={field.value ?? ''}
                className="min-h-[80px]"
              />
            </FormControl>
            <FormDescription>
              Registre o progresso e observações sobre a execução das ações.
            </FormDescription>
            <FormMessage />
          </FormItem> 
        )}/>
      </CardContent>
    </Card>
  );
}

// --- MAIN COMPONENT ---
export default function QualityPage() {
  const [activeTab, setActiveTab] = useState("rnc");
  
  const [reports, setReports] = useState<NonConformance[]>([]);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [isRncFormOpen, setIsRncFormOpen] = useState(false);
  const [isRncDeleting, setIsRncDeleting] = useState(false);
  const [selectedReport, setSelectedReport] = useState<NonConformance | null>(null);
  const [reportToDelete, setReportToDelete] = useState<NonConformance | null>(null);

  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [isCalibrationFormOpen, setIsCalibrationFormOpen] = useState(false);
  const [isCalibrationDeleting, setIsCalibrationDeleting] = useState(false);
  const [selectedCalibration, setSelectedCalibration] = useState<Calibration | null>(null);
  const [calibrationToDelete, setCalibrationToDelete] = useState<Calibration | null>(null);
  
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [materialInspections, setMaterialInspections] = useState<RawMaterialInspection[]>([]);
  const [dimensionalReports, setDimensionalReports] = useState<DimensionalReport[]>([]);
  const [weldingInspections, setWeldingInspections] = useState<WeldingInspection[]>([]);
  const [paintingReports, setPaintingReports] = useState<PaintingReport[]>([]);
  const [liquidPenetrantReports, setLiquidPenetrantReports] = useState<LiquidPenetrantReport[]>([]);
  const [ultrasoundReports, setUltrasoundReports] = useState<UltrasoundReport[]>([]);
  const [lessonsLearnedReports, setLessonsLearnedReports] = useState<LessonsLearnedReport[]>([]);

  const [isInspectionFormOpen, setIsInspectionFormOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'material' | 'dimensional' | 'welding' | 'painting' | 'liquidPenetrant' | 'ultrasound' | 'lessonsLearned' | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<any | null>(null);
  const [inspectionToDelete, setInspectionToDelete] = useState<any | null>(null);
  const [isDeleteInspectionAlertOpen, setIsDeleteInspectionAlertOpen] = useState(false);
  const [inspectionSearchQuery, setInspectionSearchQuery] = useState("");
  const [isInspectionsDetailOpen, setIsInspectionsDetailOpen] = useState(false);
  const [selectedOrderForInspections, setSelectedOrderForInspections] = useState<OrderInfo | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  

  // --- FORMS ---
  const rncForm = useForm<z.infer<typeof nonConformanceSchema>>({
    resolver: zodResolver(nonConformanceSchema),
    defaultValues: { date: new Date(), status: "Aberta", type: "Interna", description: '', orderId: undefined, item: { id: '', description: '' } },
  });



  const calibrationForm = useForm<z.infer<typeof calibrationSchema>>({
    resolver: zodResolver(calibrationSchema),
    defaultValues: {
      internalCode: "", equipmentName: "", modelSerial: "", manufacturer: "", location: "", category: "",
      lastCalibrationDate: new Date(), calibrationIntervalMonths: 12, result: "Aprovado", responsible: "", norm: "", certificateNumber: "", certificateUrl: "", notes: "",
    }
  });

  const materialInspectionForm = useForm<z.infer<typeof rawMaterialInspectionSchema>>({
    resolver: zodResolver(rawMaterialInspectionSchema),
    defaultValues: {
      receiptDate: new Date(), inspectionResult: "Aprovado",
      orderId: undefined, itemId: undefined, materialLot: '', supplierName: '', inspectedBy: undefined, notes: '', materialCertificateUrl: '', materialStandard: '', quantityReceived: undefined, photos: [],
    },
  });

  const dimensionalReportForm = useForm<z.infer<typeof dimensionalReportSchema>>({
    resolver: zodResolver(dimensionalReportSchema),
    defaultValues: {
      reportNumber: '', inspectionDate: new Date(), orderId: undefined, itemId: undefined, inspectedBy: undefined, notes: '', quantityInspected: undefined, measurements: [], photos: [], partIdentifier: '', customerInspector: ''
    },
  });
  const { fields: measurementFields, append: appendMeasurement, remove: removeMeasurement, update: updateMeasurement } = useFieldArray({
      control: dimensionalReportForm.control,
      name: "measurements"
  });

  const weldingInspectionForm = useForm<z.infer<typeof weldingInspectionSchema>>({
      resolver: zodResolver(weldingInspectionSchema),
      defaultValues: {
        reportNumber: '',
        orderId: undefined,
        itemId: undefined,
        inspectionDate: new Date(), 
        inspectionType: "Visual" as const, 
        result: "Conforme" as const, 
        inspectedBy: undefined,
        customerInspector: '',
        welderSinete: "",
        weldingProcess: "",
        acceptanceCriteria: "",
        technician: "",
        standard: "",
        equipment: "",
        reportUrl: "",
        notes: "",
        photos: [],
        baseMaterial: "",
        fillerMaterial: "",
        jointIdentification: "",
        jointType: "",
        materialThickness: "",
        observedDefects: "",
        releaseResponsible: "",
        surfaceCondition: "",
        welderQualification: "",
        weldingPosition: "",
        wpsCode: "",
        dimensionalTools: "",
      }
  });

  const paintingReportForm = useForm<z.infer<typeof paintingReportSchema>>({
    resolver: zodResolver(paintingReportSchema),
    defaultValues: {
      quantity: 1,
      startDate: new Date(),
      endDate: new Date(),
      paintSystem: { primer: {}, intermediate: {}, finish: {} },
      surfacePrep: {},
      environmentalConditions: [
          { layer: 'Fundo', dewPoint: 0 },
          { layer: 'Intermediário', dewPoint: 0 },
          { layer: 'Acabamento', dewPoint: 0 },
      ],
      dftControl: { isCompliant: true },
      additionalTests: {},
      conclusion: { finalResult: 'Conforme', inspectionDate: new Date() },
      photos: [],
    },
  });
  
  const liquidPenetrantForm = useForm<z.infer<typeof liquidPenetrantSchema>>({
    resolver: zodResolver(liquidPenetrantSchema),
    defaultValues: {
      inspectionDate: new Date(),
      technique: "visível",
      method: "removível com solvente",
      finalResult: "Conforme",
      photos: [],
      inspectorQualification: "",
      baseMaterial: "",
      heatTreatment: "",
      examinedAreas: "",
      quantityInspected: undefined,
      testLocation: "",
      appliedStandard: "",
      ambientTemperature: undefined,
      partTemperature: undefined,
      penetrant: "",
      developer: "",
      remover: "",
      consumableValidity: null,
      consumableLot: "",
      sensitivityTest: false,
      acceptanceCriteria: "",
      finalNotes: "",
      procedure: {
        preCleaning: false,
        penetrantApplication: false,
        excessRemoval: false,
        developerApplication: false,
        inspectionType: "completa",
        isSurfaceAccessible: true,
        penetrationTime: undefined,
        developmentTime: undefined,
        totalProcessTime: undefined,
        lightingMode: "",
        lightIntensity: "",
      },
      results: {
        isAreaFree: true,
        defectType: "",
        defectLocation: "",
        defectDimensions: "",
        sketch: "",
      },
    },
  });

  const ultrasoundReportForm = useForm<z.infer<typeof ultrasoundReportSchema>>({
    resolver: zodResolver(ultrasoundReportSchema),
    defaultValues: {
        inspectionDate: new Date(),
        finalResult: "Conforme",
        photos: [],
        results: [],
        qualificationLevel: "",
        baseMaterial: "",
        heatTreatment: "",
        weldTypeAndThickness: "",
        examinedAreaDescription: "",
        quantityInspected: undefined,
        testLocation: "",
        executionStandard: "",
        acceptanceCriteria: "",
        examinationType: undefined,
        testExtent: "",
        equipment: "",
        equipmentSerial: "",
        equipmentCalibration: "",
        headType: "",
        frequency: undefined,
        incidentAngle: undefined,
        couplant: "",
        referenceBlock: "",
        pulseMode: "",
        range: undefined,
        gain: undefined,
        distanceCorrection: "",
        scanRate: undefined,
        minResolution: undefined,
        rejectionCriteria: "",
        finalNotes: "",
    },
  });
  const { fields: ultrasoundResultFields, append: appendUltrasoundResult, remove: removeUltrasoundResult } = useFieldArray({
      control: ultrasoundReportForm.control,
      name: "results"
  });

  const lessonsLearnedForm = useForm<z.infer<typeof lessonsLearnedSchema>>({
      resolver: zodResolver(lessonsLearnedSchema),
      defaultValues: {
        emissionDate: new Date(),
        projectPhase: [],
        impact: { reprocess: false, delay: false, cost: false, rework: false, materialLoss: false },
        actionStatus: "Pendente",
        procedureChangeNeeded: false,
        includeInTraining: false,
        evidence: [],
      },
  });


  // --- DATA FETCHING ---
  const fetchAllData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [
        ordersSnapshot, reportsSnapshot, calibrationsSnapshot, teamSnapshot, 
        materialInspectionsSnapshot, dimensionalReportsSnapshot, weldingInspectionsSnapshot, paintingReportsSnapshot,
        liquidPenetrantReportsSnapshot, ultrasoundReportsSnapshot, lessonsLearnedSnapshot
      ] = await Promise.all([
        getDocs(collection(db, "companies", "mecald", "orders")),
        getDocs(collection(db, "companies", "mecald", "qualityReports")),
        getDocs(collection(db, "companies", "mecald", "calibrations")),
        getDoc(doc(db, "companies", "mecald", "settings", "team")),
        getDocs(collection(db, "companies", "mecald", "rawMaterialInspections")),
        getDocs(collection(db, "companies", "mecald", "dimensionalReports")),
        getDocs(collection(db, "companies", "mecald", "weldingInspections")),
        getDocs(collection(db, "companies", "mecald", "paintingReports")),
        getDocs(collection(db, "companies", "mecald", "liquidPenetrantReports")),
        getDocs(collection(db, "companies", "mecald", "ultrasoundReports")),
        getDocs(collection(db, "companies", "mecald", "lessonsLearned")),

      ]);

      const ordersList: OrderInfo[] = ordersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, 
          number: data.internalOS || data.quotationNumber || 'N/A', 
          projectName: data.projectName,
          customerId: data.customer?.id || data.customerId || '',
          customerName: data.customer?.name || data.customerName || 'N/A',
          items: (data.items || []).map((item: any, index: number) => ({ id: item.id || `${doc.id}-${index}`, description: item.description, code: item.code, quantity: item.quantity })),
        };
      });
      setOrders(ordersList);

      const reportsList = reportsSnapshot.docs.map(doc => {
  const data = doc.data();
  const order = ordersList.find(o => o.id === data.orderId);
  
  console.log(`Carregando RNC ${doc.id}:`, {
    hasPhotos: !!(data.photos && data.photos.length > 0),
    photosCount: data.photos?.length || 0,
    hasActionPlan: !!(data.actionPlan && data.actionPlan.correctiveActions),
    actionStatus: data.actionPlan?.actionStatus || 'N/A'
  });
  
  return {
    id: doc.id, 
    date: data.date.toDate(), 
    orderId: data.orderId, 
    orderNumber: order?.number || 'N/A',
    item: { id: data.itemId, description: data.itemDescription }, 
    customerName: order?.customerName || 'N/A',
    description: data.description, 
    type: data.type, 
    status: data.status,
    
    // ✅ NOVOS CAMPOS CARREGADOS DO FIRESTORE
    photos: data.photos || [],
    actionPlan: data.actionPlan ? {
      rootCause: data.actionPlan.rootCause || '',
      correctiveActions: data.actionPlan.correctiveActions || '',
      preventiveActions: data.actionPlan.preventiveActions || '',
      responsible: data.actionPlan.responsible || '',
      deadline: data.actionPlan.deadline ? data.actionPlan.deadline.toDate() : null,
      actionStatus: data.actionPlan.actionStatus || 'Não Iniciado',
      implementationNotes: data.actionPlan.implementationNotes || '',
    } : null,
    
    // Metadados
    lastModified: data.lastModified ? data.lastModified.toDate() : data.date.toDate(),
    modifiedBy: data.modifiedBy || 'N/A',
  } as NonConformance;
});

// Ordenar por data (mais recentes primeiro) e depois por última modificação
setReports(reportsList.sort((a, b) => {
  const dateA = (a as any).lastModified || a.date;
  const dateB = (b as any).lastModified || b.date;
  return dateB.getTime() - dateA.getTime();
}));

console.log(`✓ ${reportsList.length} RNCs carregadas:`, {
  comFotos: reportsList.filter(r => (r as any).photos && (r as any).photos.length > 0).length,
  comPlanoAcao: reportsList.filter(r => (r as any).actionPlan && (r as any).actionPlan.correctiveActions).length,
  totalFotos: reportsList.reduce((total, r) => total + ((r as any).photos?.length || 0), 0)
});

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
      }).sort((a, b) => (parseInt((a.reportNumber || '0').replace(/[^0-9]/g, '')) || 0) - (parseInt((b.reportNumber || '0').replace(/[^0-9]/g, '')) || 0));
      setMaterialInspections(matInspectionsList);
            
      const dimReportsList = dimensionalReportsSnapshot.docs.map(doc => {
        const data = doc.data();
        const order = ordersList.find(o => o.id === data.orderId);
        
        // Buscar item usando dados salvos ou fallback para busca por ID
        let itemDescription = data.itemDescription; // Usar descrição salva primeiro
        
        if (!itemDescription) {
            // Fallback: buscar pelo itemId se não tiver descrição salva
            const item = order?.items.find(i => i.id === data.itemId);
            itemDescription = item?.description || 'Item não encontrado';
        }
        
        const overallResult = (data.measurements || []).every((m: any) => m.result === "Conforme") ? "Conforme" : "Não Conforme";
        
        return {
            id: doc.id, 
            ...data, 
            inspectionDate: data.inspectionDate.toDate(),
            orderNumber: data.orderNumber || order?.number || 'N/A', 
            itemName: itemDescription,
            itemCode: data.itemCode || 'N/A',
            overallResult
        } as DimensionalReport;
      }).sort((a, b) => (parseInt((a.reportNumber || '0').replace(/[^0-9]/g, '')) || 0) - (parseInt((b.reportNumber || '0').replace(/[^0-9]/g, '')) || 0));
      setDimensionalReports(dimReportsList);

      const weldInspectionsList = weldingInspectionsSnapshot.docs.map(doc => {
          const data = doc.data();
          const order = ordersList.find(o => o.id === data.orderId);
          const item = order?.items.find(i => i.id === data.itemId);
          return { id: doc.id, ...data, inspectionDate: data.inspectionDate.toDate(), orderNumber: order?.number || 'N/A', itemName: item?.description || 'Item não encontrado' } as WeldingInspection;
      }).sort((a,b) => (parseInt((b.reportNumber || 'END-0').replace(/[^0-9]/g, ''), 10)) - (parseInt((a.reportNumber || 'END-0').replace(/[^0-9]/g, ''), 10)));
      setWeldingInspections(weldInspectionsList);

      const paintReportsList = paintingReportsSnapshot.docs.map(doc => {
          const data = doc.data();
          const order = ordersList.find(o => o.id === data.orderId);
          const item = order?.items.find(i => i.id === data.itemId);
          return { id: doc.id, ...data, inspectionDate: data.conclusion.inspectionDate?.toDate(), orderNumber: order?.number || 'N/A', itemName: item?.description || 'Item não encontrado', result: data.conclusion.finalResult } as PaintingReport;
      }).sort((a,b) => (b.conclusion?.inspectionDate?.toDate()?.getTime() || 0) - (a.conclusion?.inspectionDate?.toDate()?.getTime() || 0));
      setPaintingReports(paintReportsList);
      
      const lpReportsList = liquidPenetrantReportsSnapshot.docs.map(doc => {
        const data = doc.data();
        const order = ordersList.find(o => o.id === data.orderId);
        const item = order?.items.find(i => i.id === data.itemId);
        return {
          id: doc.id,
          ...data,
          inspectionDate: data.inspectionDate.toDate(),
          consumableValidity: data.consumableValidity?.toDate() || null,
          orderNumber: order?.number || "N/A",
          itemName: item?.description || "Item não encontrado",
        } as LiquidPenetrantReport;
      }).sort((a,b) => (parseInt((b.reportNumber || 'END-0').replace(/[^0-9]/g, ''), 10)) - (parseInt((a.reportNumber || 'END-0').replace(/[^0-9]/g, ''), 10)));
      setLiquidPenetrantReports(lpReportsList);

      const utReportsList = ultrasoundReportsSnapshot.docs.map(doc => {
          const data = doc.data();
          const order = ordersList.find(o => o.id === data.orderId);
          const item = order?.items.find(i => i.id === data.itemId);
          return {
              id: doc.id,
              ...data,
              inspectionDate: data.inspectionDate.toDate(),
              orderNumber: order?.number || "N/A",
              itemName: item?.description || "Item não encontrado",
          } as UltrasoundReport;
      }).sort((a,b) => (parseInt((b.reportNumber || 'END-0').replace(/[^0-9]/g, ''), 10)) - (parseInt((a.reportNumber || 'END-0').replace(/[^0-9]/g, ''), 10)));
      setUltrasoundReports(utReportsList);

      const lessonsList = lessonsLearnedSnapshot.docs.map(doc => {
          const data = doc.data();
          const order = ordersList.find(o => o.id === data.orderId);
          return {
              id: doc.id,
              ...data,
              emissionDate: data.emissionDate.toDate(),
              occurrenceDate: data.occurrenceDate?.toDate() || null,
              actionDeadline: data.actionDeadline?.toDate() || null,
              closeDate: data.closeDate?.toDate() || null,
              orderNumber: order?.number || 'N/A',
          } as LessonsLearnedReport;
      });
      setLessonsLearnedReports(lessonsList.sort((a,b) => (b.reportNumber || '').localeCompare(a.reportNumber || '')));

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

  // --- FILTERED DATA ---
    const filteredOrders = useMemo(() => {
        if (!inspectionSearchQuery) return orders;
        const query = inspectionSearchQuery.toLowerCase();
        return orders.filter(
            (order) =>
                order.number.toLowerCase().includes(query) ||
                order.customerName.toLowerCase().includes(query) ||
                (order.projectName?.toLowerCase() ?? '').includes(query)
        );
    }, [orders, inspectionSearchQuery]);

    const getReportCountForOrder = (orderId: string) => {
        const matCount = materialInspections.filter(i => i.orderId === orderId).length;
        const dimCount = dimensionalReports.filter(i => i.orderId === orderId).length;
        const weldCount = weldingInspections.filter(i => i.orderId === orderId).length;
        const paintCount = paintingReports.filter(i => i.orderId === orderId).length;
        const lpCount = liquidPenetrantReports.filter(i => i.orderId === orderId).length;
        const utCount = ultrasoundReports.filter(i => i.orderId === orderId).length;
        const llCount = lessonsLearnedReports.filter(i => i.orderId === orderId).length;
        return matCount + dimCount + weldCount + paintCount + lpCount + utCount + llCount;
    };

    const inspectionsForSelectedOrder = useMemo(() => {
        if (!selectedOrderForInspections) {
            return { material: [], dimensional: [], welding: [], painting: [], liquidPenetrant: [], ultrasound: [], lessonsLearned: [] };
        }
        const orderId = selectedOrderForInspections.id;
        return {
            material: materialInspections.filter(i => i.orderId === orderId),
            dimensional: dimensionalReports.filter(i => i.orderId === orderId),
            welding: weldingInspections.filter(i => i.orderId === orderId),
            painting: paintingReports.filter(i => i.orderId === orderId),
            liquidPenetrant: liquidPenetrantReports.filter(i => i.orderId === orderId),
            ultrasound: ultrasoundReports.filter(i => i.orderId === orderId),
            lessonsLearned: lessonsLearnedReports.filter(i => i.orderId === orderId),
        };
    }, [selectedOrderForInspections, materialInspections, dimensionalReports, weldingInspections, paintingReports, liquidPenetrantReports, ultrasoundReports, lessonsLearnedReports]);


  // --- RNC HANDLERS ---
  const onRncSubmit = async (values: z.infer<typeof nonConformanceSchema>) => {
  try {
    console.log("=== SALVANDO RNC COM FOTOS E PLANO DE AÇÕES ===");
    console.log("Dados recebidos:", values);
    console.log("Fotos recebidas:", values.photos?.length || 0);
    console.log("Plano de ações:", values.actionPlan ? "Sim" : "Não");

    const order = orders.find(o => o.id === values.orderId);
    if (!order) throw new Error("Pedido selecionado não encontrado.");
    
    const dataToSave: any = {
      date: Timestamp.fromDate(values.date), 
      orderId: values.orderId, 
      itemId: values.item.id, 
      itemDescription: values.item.description,
      customerId: order.customerId, 
      customerName: order.customerName, 
      description: values.description, 
      type: values.type, 
      status: values.status,
      
      // ✅ NOVOS CAMPOS - FOTOS
      photos: values.photos || [],
      
      // ✅ NOVOS CAMPOS - PLANO DE AÇÕES
      actionPlan: values.actionPlan ? {
        rootCause: values.actionPlan.rootCause || null,
        correctiveActions: values.actionPlan.correctiveActions || null,
        preventiveActions: values.actionPlan.preventiveActions || null,
        responsible: values.actionPlan.responsible || null,
        deadline: values.actionPlan.deadline ? Timestamp.fromDate(values.actionPlan.deadline) : null,
        actionStatus: values.actionPlan.actionStatus || "Não Iniciado",
        implementationNotes: values.actionPlan.implementationNotes || null,
      } : null,
      
      // Metadados para auditoria
      lastModified: Timestamp.now(),
      modifiedBy: user?.email || 'Usuário desconhecido',
    };

    // ✅ VALIDAÇÃO CRÍTICA DO TAMANHO PARA FIRESTORE
    if (!validateDataSizeBeforeSave(dataToSave)) {
        toast({
            variant: "destructive",
            title: "RNC muito grande para salvar",
            description: `O relatório excede o limite do banco de dados (900KB). Remova algumas fotos e tente novamente.`,
        });
        return;
    }

    console.log(`✓ Fotos incluídas: ${dataToSave.photos?.length || 0}`);
    console.log(`✓ Tamanho total: ${(JSON.stringify(dataToSave).length / 1024).toFixed(1)}KB`);
    console.log(`✓ Plano de ações: ${dataToSave.actionPlan ? 'Configurado' : 'Não configurado'}`);

    if (selectedReport) {
      await updateDoc(doc(db, "companies", "mecald", "qualityReports", selectedReport.id), dataToSave);
      console.log("✓ RNC atualizada no Firestore com sucesso!");
      toast({ 
        title: "RNC atualizada com sucesso!", 
        description: `${values.photos?.length || 0} fotos salvas. Plano de ações ${values.actionPlan?.correctiveActions ? 'configurado' : 'não configurado'}.`
      });
    } else {
      await addDoc(collection(db, "companies", "mecald", "qualityReports"), dataToSave);
      console.log("✓ Nova RNC salva no Firestore com sucesso!");
      toast({ 
        title: "RNC registrada com sucesso!", 
        description: `Não conformidade registrada com ${values.photos?.length || 0} fotos. ${values.actionPlan?.correctiveActions ? 'Plano de ações definido.' : ''}`
      });
    }
    
    setIsRncFormOpen(false);
    await fetchAllData();
    
  } catch (error) {
    console.error("❌ Erro ao salvar RNC:", error);
    
    // Verificar se é erro de tamanho do Firestore
    if ((error as any)?.message?.includes('exceeds the maximum allowed size') || 
        (error as any)?.message?.includes('Document exceeds maximum size')) {
        toast({ 
            variant: "destructive", 
            title: "RNC muito grande", 
            description: "O relatório excede o limite do banco de dados. Remova algumas fotos e tente novamente." 
        });
    } else {
        toast({ 
          variant: "destructive", 
          title: "Erro ao salvar RNC",
          description: "Tente novamente. Se o problema persistir, contate o suporte."
        });
    }
  }
};
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
      lastCalibrationDate: new Date(), calibrationIntervalMonths: 12, result: "Aprovado", responsible: "", norm: "", certificateNumber: "", certificateUrl: "", notes: "",
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
    const handleOpenInspectionsDetail = (order: OrderInfo) => {
        setSelectedOrderForInspections(order);
        setIsInspectionsDetailOpen(true);
    };

  const onMaterialInspectionSubmit = async (values: z.infer<typeof rawMaterialInspectionSchema>) => {
    try {
      console.log("=== SALVANDO RELATÓRIO DE MATERIAL ===");
      console.log("Dados recebidos:", values);
      console.log("Fotos recebidas:", values.photos?.length || 0);

      const { reportNumber, ...restOfValues } = values;
      const dataToSave: any = { 
        ...restOfValues, 
        receiptDate: Timestamp.fromDate(values.receiptDate),
        quantityReceived: values.quantityReceived ?? null,
        photos: values.photos || [],
      };

      // VALIDAÇÃO CRÍTICA DO TAMANHO PARA FIRESTORE
      if (!validateDataSizeBeforeSave(dataToSave)) {
          toast({
              variant: "destructive",
              title: "Relatório muito grande para salvar",
              description: `O relatório excede o limite do banco de dados (900KB). Remova algumas fotos e tente novamente.`,
          });
          return;
      }

      console.log(`Fotos incluídas: ${dataToSave.photos?.length || 0}`);
      console.log(`Tamanho total: ${(JSON.stringify(dataToSave).length / 1024).toFixed(1)}KB`);

      if (selectedInspection) {
        await setDoc(doc(db, "companies", "mecald", "rawMaterialInspections", selectedInspection.id), dataToSave);
        console.log("✓ Relatório atualizado no Firestore com sucesso!");
        toast({ title: "Relatório atualizado!" });
      } else {
        const reportsSnapshot = await getDocs(collection(db, "companies", "mecald", "rawMaterialInspections"));
        const existingNumbers = reportsSnapshot.docs
            .map(d => parseInt((d.data().reportNumber || '0').replace(/[^0-9]/g, ''), 10))
            .filter(n => !isNaN(n) && Number.isFinite(n));
        const highestNumber = Math.max(0, ...existingNumbers);
        const newReportNumber = (highestNumber + 1).toString().padStart(4, '0');
        const finalData = { ...dataToSave, reportNumber: newReportNumber };

        // Validação final antes de salvar
        if (!validateDataSizeBeforeSave(finalData)) {
            toast({
                variant: "destructive",
                title: "Relatório muito grande para salvar",
                description: `O relatório final excede o limite. Remova algumas fotos.`,
            });
            return;
        }

        await addDoc(collection(db, "companies", "mecald", "rawMaterialInspections"), finalData);
        console.log("✓ Dados salvos no Firestore com sucesso!");
        toast({ title: "Relatório de inspeção de material criado!" });
      }
      
      setIsInspectionFormOpen(false); 
      await fetchAllData();
    } catch (error) { 
        console.error("❌ Erro ao salvar relatório:", error);
        
        // Verificar se é erro de tamanho do Firestore
        if ((error as any)?.message?.includes('exceeds the maximum allowed size') || 
            (error as any)?.message?.includes('Document exceeds maximum size')) {
            toast({ 
                variant: "destructive", 
                title: "Relatório muito grande", 
                description: "O relatório excede o limite do banco de dados. Remova algumas fotos e tente novamente." 
            });
        } else {
            toast({ variant: "destructive", title: "Erro ao salvar relatório" });
        }
    }
  };
  const onDimensionalReportSubmit = async (values: z.infer<typeof dimensionalReportSchema>) => {
    try {
       console.log("=== SALVANDO RELATÓRIO DIMENSIONAL ===");
       console.log("Dados recebidos:", values);
       console.log("Fotos recebidas:", values.photos?.length || 0);
       console.log("Item ID selecionado:", values.itemId);
       
       // Buscar informações do item selecionado
       const selectedOrder = orders.find(o => o.id === values.orderId);
       const selectedItem = selectedOrder?.items.find(i => i.id === values.itemId);
       
       console.log("Pedido encontrado:", selectedOrder);
       console.log("Item encontrado:", selectedItem);
       
       if (!selectedItem) {
           toast({
               variant: "destructive",
               title: "Erro",
               description: "Item selecionado não encontrado. Selecione um item válido.",
           });
           return;
       }
       
       const { reportNumber, ...restOfValues } = values;
       
       // Preparar dados para salvar - INCLUINDO informações do item
       const dataToSave = { 
        ...restOfValues,
        inspectionDate: Timestamp.fromDate(values.inspectionDate),
        customerInspector: values.customerInspector || null,
        quantityInspected: values.quantityInspected || null,
        notes: values.notes || null,
        photos: values.photos || [],
        measurements: values.measurements || [],
        
        // DADOS DO ITEM - SALVANDO EXPLICITAMENTE
        itemId: values.itemId,
        itemCode: selectedItem.code || null,
        itemDescription: selectedItem.description,
        itemQuantity: selectedItem.quantity || null,
        
        // DADOS DO PEDIDO
        orderId: values.orderId,
        orderNumber: selectedOrder?.number || 'N/A',
        customerName: selectedOrder?.customerName || 'N/A',
        projectName: selectedOrder?.projectName || null,
      };
      
      // VALIDAÇÃO DO TAMANHO
      const dataSize = JSON.stringify(dataToSave).length;
      console.log(`Tamanho dos dados: ${(dataSize / 1024).toFixed(1)}KB`);
      
      if (dataSize > 900000) { // 900KB
          toast({
              variant: "destructive",
              title: "Relatório muito grande",
              description: "O relatório excede o limite. Remova algumas fotos.",
          });
          return;
      }
      
      console.log("=== DADOS FINAIS PARA FIRESTORE ===");
      console.log("Item salvo:", {
          itemId: dataToSave.itemId,
          itemCode: dataToSave.itemCode,
          itemDescription: dataToSave.itemDescription
      });

       if (selectedInspection) {
         await setDoc(doc(db, "companies", "mecald", "dimensionalReports", selectedInspection.id), dataToSave, { merge: true });
         toast({ title: "Relatório atualizado!" });
       } else {
        const reportsSnapshot = await getDocs(collection(db, "companies", "mecald", "dimensionalReports"));
        const existingNumbers = reportsSnapshot.docs
            .map(d => parseInt((d.data().reportNumber || '0').replace(/[^0-9]/g, ''), 10))
            .filter(n => !isNaN(n) && Number.isFinite(n));
        const highestNumber = Math.max(0, ...existingNumbers);
        const newReportNumber = (highestNumber + 1).toString().padStart(4, '0');
        const finalData = { ...dataToSave, reportNumber: newReportNumber };

         await addDoc(collection(db, "companies", "mecald", "dimensionalReports"), finalData);
         console.log("✓ Relatório salvo com item:", finalData.itemDescription);
         toast({ title: "Relatório dimensional criado!" });
       }
       
       setIsInspectionFormOpen(false); 
       await fetchAllData();
       
     } catch (error) { 
         console.error("❌ Erro ao salvar relatório:", error);
         
         if ((error as any)?.message?.includes('exceeds the maximum allowed size')) {
             toast({ 
                 variant: "destructive", 
                 title: "Relatório muito grande", 
                 description: "O relatório excede o limite do banco de dados. Remova algumas fotos e tente novamente." 
             });
         } else {
             toast({ variant: "destructive", title: "Erro ao salvar relatório" });
         }
     }
};
  const onWeldingInspectionSubmit = async (values: z.infer<typeof weldingInspectionSchema>) => {
    try {
        console.log("=== SALVANDO RELATÓRIO DE SOLDA ===");
        console.log("Dados recebidos:", values);
        console.log("Fotos recebidas:", values.photos?.length || 0);

        const dataToSave: any = {
            ...values,
            inspectionDate: Timestamp.fromDate(values.inspectionDate),
            photos: values.photos || [],
            customerInspector: values.customerInspector || null,
        };

        // VALIDAÇÃO CRÍTICA DO TAMANHO PARA FIRESTORE
        if (!validateDataSizeBeforeSave(dataToSave)) {
            toast({
                variant: "destructive",
                title: "Relatório muito grande para salvar",
                description: `O relatório excede o limite do banco de dados (900KB). Remova algumas fotos e tente novamente.`,
            });
            return;
        }
        
        const docRef = selectedInspection
            ? doc(db, "companies", "mecald", "weldingInspections", selectedInspection.id)
            : doc(collection(db, "companies", "mecald", "weldingInspections"));

        if (!selectedInspection) {
            const weldReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "weldingInspections"));
            const lpReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "liquidPenetrantReports"));
            const utReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "ultrasoundReports"));
            const weldNumbers = weldReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
            const lpNumbers = lpReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
            const utNumbers = utReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
            const allNumbers = [...weldNumbers, ...lpNumbers, ...utNumbers];
            const highestNumber = Math.max(0, ...allNumbers);
            const finalReportNumber = `END-${(highestNumber + 1).toString().padStart(4, "0")}`;
            dataToSave.reportNumber = finalReportNumber;

            // Validação final antes de salvar
            if (!validateDataSizeBeforeSave(dataToSave)) {
                toast({
                    variant: "destructive",
                    title: "Relatório muito grande para salvar",
                    description: `O relatório final excede o limite. Remova algumas fotos.`,
                });
                return;
            }
        }

        console.log(`Fotos incluídas: ${dataToSave.photos?.length || 0}`);
        console.log(`Tamanho total: ${(JSON.stringify(dataToSave).length / 1024).toFixed(1)}KB`);
    
        await setDoc(docRef, dataToSave, { merge: true });
        console.log("✓ Relatório salvo no Firestore com sucesso!");
        
        toast({ title: selectedInspection ? "Relatório de solda atualizado!" : "Relatório de solda criado!" });
        setIsInspectionFormOpen(false);
        await fetchAllData();
    } catch (error) {
        console.error("❌ Erro ao salvar relatório:", error);
        
        // Verificar se é erro de tamanho do Firestore
        if ((error as any)?.message?.includes('exceeds the maximum allowed size') || 
            (error as any)?.message?.includes('Document exceeds maximum size')) {
            toast({ 
                variant: "destructive", 
                title: "Relatório muito grande", 
                description: "O relatório excede o limite do banco de dados. Remova algumas fotos e tente novamente." 
            });
        } else {
            toast({ variant: "destructive", title: "Erro ao salvar relatório" });
        }
    }
  };
   const onPaintingReportSubmit = async (values: z.infer<typeof paintingReportSchema>) => {
    try {
       const { reportNumber, ...restOfValues } = values;
       const dataToSave = { ...restOfValues };
       if (selectedInspection) {
         await setDoc(doc(db, "companies", "mecald", "paintingReports", selectedInspection.id), dataToSave, { merge: true });
         toast({ title: "Relatório de pintura atualizado!" });
       } else {
         const reportsSnapshot = await getDocs(collection(db, "companies", "mecald", "paintingReports"));
         const existingNumbers = reportsSnapshot.docs
            .map(d => parseInt((d.data().reportNumber || 'PINT-0').replace(/[^0-9]/g, ''), 10))
            .filter(n => !isNaN(n) && Number.isFinite(n));
         const highestNumber = Math.max(0, ...existingNumbers);
         dataToSave.reportNumber = `PINT-${(highestNumber + 1).toString().padStart(4, '0')}`;
         await addDoc(collection(db, "companies", "mecald", "paintingReports"), dataToSave);
         toast({ title: "Relatório de pintura criado!" });
       }
       setIsInspectionFormOpen(false); await fetchAllData();
     } catch (error) { console.error("Error saving painting report:", error); toast({ variant: "destructive", title: "Erro ao salvar relatório" }); }
  };
  const onLiquidPenetrantSubmit = async (values: z.infer<typeof liquidPenetrantSchema>) => {
    try {
      console.log("=== SALVANDO RELATÓRIO DE LP ===");
      console.log("Dados recebidos:", values);
      console.log("Fotos recebidas:", values.photos?.length || 0);

      const dataToSave = {
        inspectionDate: Timestamp.fromDate(values.inspectionDate),
        orderId: values.orderId,
        itemId: values.itemId,
        inspectedBy: values.inspectedBy,
        technique: values.technique,
        method: values.method,
        finalResult: values.finalResult,
        sensitivityTest: values.sensitivityTest,
        procedure: { ...values.procedure },
        results: { ...values.results },
        inspectorQualification: values.inspectorQualification || null,
        baseMaterial: values.baseMaterial || null,
        heatTreatment: values.heatTreatment || null,
        examinedAreas: values.examinedAreas || null,
        quantityInspected: values.quantityInspected ?? null,
        testLocation: values.testLocation || null,
        appliedStandard: values.appliedStandard || null,
        ambientTemperature: values.ambientTemperature ?? null,
        partTemperature: values.partTemperature ?? null,
        penetrant: values.penetrant || null,
        developer: values.developer || null,
        remover: values.remover || null,
        consumableValidity: values.consumableValidity ? Timestamp.fromDate(values.consumableValidity) : null,
        consumableLot: values.consumableLot || null,
        acceptanceCriteria: values.acceptanceCriteria || null,
        finalNotes: values.finalNotes || null,
        photos: values.photos || [],
      };

      // VALIDAÇÃO CRÍTICA DO TAMANHO PARA FIRESTORE
      if (!validateDataSizeBeforeSave(dataToSave)) {
          toast({
              variant: "destructive",
              title: "Relatório muito grande para salvar",
              description: `O relatório excede o limite do banco de dados (900KB). Remova algumas fotos e tente novamente.`,
          });
          return;
      }

      console.log(`Fotos incluídas: ${dataToSave.photos?.length || 0}`);
      console.log(`Tamanho total: ${(JSON.stringify(dataToSave).length / 1024).toFixed(1)}KB`);

      if (selectedInspection) {
        await updateDoc(doc(db, "companies", "mecald", "liquidPenetrantReports", selectedInspection.id), dataToSave);
        console.log("✓ Relatório atualizado no Firestore com sucesso!");
        toast({ title: "Relatório de LP atualizado!" });
      } else {
        const weldReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "weldingInspections"));
        const lpReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "liquidPenetrantReports"));
        const utReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "ultrasoundReports"));
        const weldNumbers = weldReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
        const lpNumbers = lpReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
        const utNumbers = utReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
        const allNumbers = [...weldNumbers, ...lpNumbers, ...utNumbers];
        const highestNumber = Math.max(0, ...allNumbers);
        const newReportNumber = `END-${(highestNumber + 1).toString().padStart(4, "0")}`;
        
        const finalData = { ...dataToSave, reportNumber: newReportNumber };

        // Validação final antes de salvar
        if (!validateDataSizeBeforeSave(finalData)) {
            toast({
                variant: "destructive",
                title: "Relatório muito grande para salvar",
                description: `O relatório final excede o limite. Remova algumas fotos.`,
            });
            return;
        }
        
        await addDoc(collection(db, "companies", "mecald", "liquidPenetrantReports"), finalData);
        console.log("✓ Dados salvos no Firestore com sucesso!");
        toast({ title: "Relatório de LP criado!" });
      }

      setIsInspectionFormOpen(false);
      await fetchAllData();
    } catch (error) {
      console.error("❌ Erro ao salvar relatório:", error);
      
      // Verificar se é erro de tamanho do Firestore
      if ((error as any)?.message?.includes('exceeds the maximum allowed size') || 
          (error as any)?.message?.includes('Document exceeds maximum size')) {
          toast({ 
              variant: "destructive", 
              title: "Relatório muito grande", 
              description: "O relatório excede o limite do banco de dados. Remova algumas fotos e tente novamente." 
          });
      } else {
          toast({ variant: "destructive", title: "Erro ao salvar relatório de LP" });
      }
    }
  };

  const onUltrasoundReportSubmit = async (values: z.infer<typeof ultrasoundReportSchema>) => {
    try {
      console.log("=== SALVANDO RELATÓRIO DE ULTRASSOM ===");
      console.log("Dados recebidos:", values);
      console.log("Fotos recebidas:", values.photos?.length || 0);

      const dataToSave = {
        ...values,
        inspectionDate: Timestamp.fromDate(values.inspectionDate),
        results: values.results || [],
        photos: values.photos || [],
        qualificationLevel: values.qualificationLevel || null,
        baseMaterial: values.baseMaterial || null,
        heatTreatment: values.heatTreatment || null,
        weldTypeAndThickness: values.weldTypeAndThickness || null,
        examinedAreaDescription: values.examinedAreaDescription || null,
        quantityInspected: values.quantityInspected ?? null,
        testLocation: values.testLocation || null,
        executionStandard: values.executionStandard || null,
        acceptanceCriteria: values.acceptanceCriteria || null,
        examinationType: values.examinationType || null,
        testExtent: values.testExtent || null,
        equipment: values.equipment || null,
        equipmentSerial: values.equipmentSerial || null,
        equipmentCalibration: values.equipmentCalibration || null,
        headType: values.headType || null,
        frequency: values.frequency ?? null,
        incidentAngle: values.incidentAngle ?? null,
        couplant: values.couplant || null,
        referenceBlock: values.referenceBlock || null,
        pulseMode: values.pulseMode || null,
        range: values.range ?? null,
        gain: values.gain ?? null,
        distanceCorrection: values.distanceCorrection || null,
        scanRate: values.scanRate ?? null,
        minResolution: values.minResolution || null,
        rejectionCriteria: values.rejectionCriteria || null,
        finalNotes: values.finalNotes || null,
      };

      // VALIDAÇÃO CRÍTICA DO TAMANHO PARA FIRESTORE
      if (!validateDataSizeBeforeSave(dataToSave)) {
          toast({
              variant: "destructive",
              title: "Relatório muito grande para salvar",
              description: `O relatório excede o limite do banco de dados (900KB). Remova algumas fotos e tente novamente.`,
          });
          return;
      }

      console.log(`Fotos incluídas: ${dataToSave.photos?.length || 0}`);
      console.log(`Tamanho total: ${(JSON.stringify(dataToSave).length / 1024).toFixed(1)}KB`);

      if (selectedInspection) {
        await updateDoc(doc(db, "companies", "mecald", "ultrasoundReports", selectedInspection.id), dataToSave);
        console.log("✓ Relatório atualizado no Firestore com sucesso!");
        toast({ title: "Relatório de Ultrassom atualizado!" });
      } else {
        const weldReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "weldingInspections"));
        const lpReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "liquidPenetrantReports"));
        const utReportsSnapshot = await getDocs(collection(db, "companies", "mecald", "ultrasoundReports"));
        const weldNumbers = weldReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
        const lpNumbers = lpReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
        const utNumbers = utReportsSnapshot.docs.map(d => parseInt((d.data().reportNumber || "END-0").replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
        const allNumbers = [...weldNumbers, ...lpNumbers, ...utNumbers];
        const highestNumber = Math.max(0, ...allNumbers);
        const newReportNumber = `END-${(highestNumber + 1).toString().padStart(4, "0")}`;
        
        const finalData = { ...dataToSave, reportNumber: newReportNumber };

        // Validação final antes de salvar
        if (!validateDataSizeBeforeSave(finalData)) {
            toast({
                variant: "destructive",
                title: "Relatório muito grande para salvar",
                description: `O relatório final excede o limite. Remova algumas fotos.`,
            });
            return;
        }
        
        await addDoc(collection(db, "companies", "mecald", "ultrasoundReports"), finalData);
        console.log("✓ Dados salvos no Firestore com sucesso!");
        toast({ title: "Relatório de Ultrassom criado!" });
      }

      setIsInspectionFormOpen(false);
      await fetchAllData();
    } catch (error) {
      console.error("❌ Erro ao salvar relatório:", error);
      
      // Verificar se é erro de tamanho do Firestore
      if ((error as any)?.message?.includes('exceeds the maximum allowed size') || 
          (error as any)?.message?.includes('Document exceeds maximum size')) {
          toast({ 
              variant: "destructive", 
              title: "Relatório muito grande", 
              description: "O relatório excede o limite do banco de dados. Remova algumas fotos e tente novamente." 
          });
      } else {
          toast({ variant: "destructive", title: "Erro ao salvar relatório de Ultrassom" });
      }
    }
  };

  const onLessonsLearnedSubmit = async (values: z.infer<typeof lessonsLearnedSchema>) => {
    try {
        const dataToSave: any = {
            ...values,
            emissionDate: Timestamp.fromDate(values.emissionDate),
            occurrenceDate: values.occurrenceDate ? Timestamp.fromDate(values.occurrenceDate) : null,
            actionDeadline: values.actionDeadline ? Timestamp.fromDate(values.actionDeadline) : null,
            closeDate: values.closeDate ? Timestamp.fromDate(values.closeDate) : null,
        };

        if (selectedInspection) {
            await setDoc(doc(db, "companies", "mecald", "lessonsLearned", selectedInspection.id), dataToSave, { merge: true });
            toast({ title: "Lição Aprendida atualizada!" });
        } else {
            const reportsSnapshot = await getDocs(collection(db, "companies", "mecald", "lessonsLearned"));
            const currentYear = new Date().getFullYear();
            const yearReports = reportsSnapshot.docs
                .map(d => d.data().reportNumber)
                .filter(num => num && num.startsWith(`LA-${currentYear}`));
            const highestNumber = yearReports.reduce((max, num) => {
                const seq = parseInt(num.split('-')[2], 10);
                return seq > max ? seq : max;
            }, 0);
            dataToSave.reportNumber = `LA-${currentYear}-${(highestNumber + 1).toString().padStart(3, '0')}`;
            
            await addDoc(collection(db, "companies", "mecald", "lessonsLearned"), dataToSave);
            toast({ title: "Lição Aprendida registrada!" });
        }
        setIsInspectionFormOpen(false);
        await fetchAllData();
    } catch (error) {
        console.error("Error saving lessons learned report:", error);
        toast({ variant: "destructive", title: "Erro ao salvar lição aprendida" });
    }
  };



  // --- END SUBMIT FUNCTIONS ---

  const handleOpenMaterialForm = (inspection: RawMaterialInspection | null = null, order: OrderInfo | null = selectedOrderForInspections) => {
    setSelectedInspection(inspection); setDialogType('material');
    if (inspection) { 
        materialInspectionForm.reset(inspection); 
    } else { 
        materialInspectionForm.reset({ 
            reportNumber: '', receiptDate: new Date(), inspectionResult: "Aprovado", 
            orderId: order?.id || undefined, 
            itemId: undefined, materialLot: '', supplierName: '', inspectedBy: undefined, notes: '', 
            materialCertificateUrl: '', materialStandard: '', quantityReceived: undefined, photos: [] 
        }); 
    }
    setIsInspectionFormOpen(true);
  };
  const handleOpenDimensionalForm = (report: DimensionalReport | null = null, order: OrderInfo | null = selectedOrderForInspections) => {
    setSelectedInspection(report); setDialogType('dimensional');
    if (report) { 
        dimensionalReportForm.reset(report); 
    } else { 
        dimensionalReportForm.reset({ 
            reportNumber: '', inspectionDate: new Date(), 
            orderId: order?.id || undefined, 
            itemId: undefined, inspectedBy: undefined, notes: '', quantityInspected: undefined, 
            measurements: [], photos: [], partIdentifier: '', customerInspector: '' 
        }); 
    }
    setIsInspectionFormOpen(true);
  };

  const handleOpenWeldingForm = (report: WeldingInspection | null = null, order: OrderInfo | null = selectedOrderForInspections) => {
    setSelectedInspection(report); setDialogType('welding');
    const defaultNewValues = { 
        reportNumber: '',
        orderId: order?.id || undefined,
        itemId: undefined,
        inspectionDate: new Date(), 
        inspectionType: "Visual" as const, 
        result: "Conforme" as const, 
        inspectedBy: undefined,
        customerInspector: '',
        welderSinete: "",
        weldingProcess: "",
        acceptanceCriteria: "",
        technician: "",
        standard: "",
        equipment: "",
        reportUrl: "",
        notes: "",
        photos: [],
        baseMaterial: "",
        fillerMaterial: "",
        jointIdentification: "",
        jointType: "",
        materialThickness: "",
        observedDefects: "",
        releaseResponsible: "",
        surfaceCondition: "",
        welderQualification: "",
        weldingPosition: "",
        wpsCode: "",
        dimensionalTools: "",
    };
    if (report) { 
        weldingInspectionForm.reset({
            ...defaultNewValues,
            ...report,
            inspectionDate: report.inspectionDate ? new Date(report.inspectionDate) : new Date(),
        }); 
    } else { 
        weldingInspectionForm.reset(defaultNewValues); 
    }
    setIsInspectionFormOpen(true);
  };
  const handleOpenPaintingForm = (report: PaintingReport | null = null, order: OrderInfo | null = selectedOrderForInspections) => {
    setSelectedInspection(report);
    setDialogType('painting');
    if (report) {
      paintingReportForm.reset({
        ...report,
        startDate: report.startDate ? new Date(report.startDate) : null,
        endDate: report.endDate ? new Date(report.endDate) : null,
        conclusion: {
            ...report.conclusion,
            inspectionDate: report.conclusion?.inspectionDate ? new Date(report.conclusion.inspectionDate) : null,
        }
      });
    } else {
      paintingReportForm.reset({
        orderId: order?.id,
        quantity: 1,
        startDate: new Date(),
        endDate: new Date(),
        paintSystem: { primer: {}, intermediate: {}, finish: {} },
        surfacePrep: {},
        environmentalConditions: [
            { layer: 'Fundo', dewPoint: 0 },
            { layer: 'Intermediário', dewPoint: 0 },
            { layer: 'Acabamento', dewPoint: 0 },
        ],
        dftControl: { isCompliant: true },
        additionalTests: {},
        conclusion: { finalResult: 'Conforme', inspectionDate: new Date() },
        photos: [],
      });
    }
    setIsInspectionFormOpen(true);
  };

  const handleOpenLiquidPenetrantForm = (report: LiquidPenetrantReport | null = null, order: OrderInfo | null = selectedOrderForInspections) => {
    setSelectedInspection(report);
    setDialogType('liquidPenetrant');
    if (report) {
      liquidPenetrantForm.reset({
        ...report,
        inspectionDate: new Date(report.inspectionDate),
        consumableValidity: report.consumableValidity ? new Date(report.consumableValidity) : null,
      });
    } else {
      liquidPenetrantForm.reset({
        orderId: order?.id || undefined,
        itemId: undefined,
        inspectionDate: new Date(),
        technique: "visível",
        method: "removível com solvente",
        finalResult: "Conforme",
        photos: [],
        inspectorQualification: "",
        baseMaterial: "",
        heatTreatment: "",
        examinedAreas: "",
        quantityInspected: undefined,
        testLocation: "",
        appliedStandard: "",
        ambientTemperature: undefined,
        partTemperature: undefined,
        penetrant: "",
        developer: "",
        remover: "",
        consumableValidity: null,
        consumableLot: "",
        acceptanceCriteria: "",
        finalNotes: "",
        procedure: {
          preCleaning: false,
          penetrantApplication: false,
          excessRemoval: false,
          developerApplication: false,
          inspectionType: "completa",
          isSurfaceAccessible: true,
          penetrationTime: undefined,
          developmentTime: undefined,
          totalProcessTime: undefined,
          lightingMode: "",
          lightIntensity: "",
        },
        results: {
          isAreaFree: true,
          defectType: "",
          defectLocation: "",
          defectDimensions: "",
          sketch: "",
        },
      });
    }
    setIsInspectionFormOpen(true);
  };

  const handleOpenUltrasoundForm = (report: UltrasoundReport | null = null, order: OrderInfo | null = selectedOrderForInspections) => {
    setSelectedInspection(report);
    setDialogType('ultrasound');
    const defaultValues = {
        orderId: order?.id || undefined,
        inspectionDate: new Date(),
        finalResult: "Conforme" as const,
        photos: [],
        results: [],
        qualificationLevel: "",
        baseMaterial: "",
        heatTreatment: "",
        weldTypeAndThickness: "",
        examinedAreaDescription: "",
        quantityInspected: undefined,
        testLocation: "",
        executionStandard: "",
        acceptanceCriteria: "",
        examinationType: undefined,
        testExtent: "",
        equipment: "",
        equipmentSerial: "",
        equipmentCalibration: "",
        headType: "",
        frequency: undefined,
        incidentAngle: undefined,
        couplant: "",
        referenceBlock: "",
        pulseMode: "",
        range: undefined,
        gain: undefined,
        distanceCorrection: "",
        scanRate: undefined,
        minResolution: undefined,
        rejectionCriteria: "",
        finalNotes: "",
    };

    if (report) {
        ultrasoundReportForm.reset({
            ...defaultValues,
            ...report,
            inspectionDate: new Date(report.inspectionDate),
        });
    } else {
        ultrasoundReportForm.reset(defaultValues);
    }
    setIsInspectionFormOpen(true);
  };

    const handleOpenLessonsLearnedForm = (report: LessonsLearnedReport | null = null, order: OrderInfo | null = selectedOrderForInspections) => {
        setSelectedInspection(report);
        setDialogType('lessonsLearned');
        if (report) {
            lessonsLearnedForm.reset(report);
        } else {
            lessonsLearnedForm.reset({
                orderId: order?.id || undefined,
                itemId: undefined,
                emissionDate: new Date(),
                projectPhase: [],
                impact: { reprocess: false, delay: false, cost: false, rework: false, materialLoss: false },
                actionStatus: "Pendente",
                procedureChangeNeeded: false,
                includeInTraining: false,
                evidence: [],
            });
        }
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
        case 'liquidPenetrant': collectionName = 'liquidPenetrantReports'; break;
        case 'ultrasound': collectionName = 'ultrasoundReports'; break;
        case 'lessonsLearned': collectionName = 'lessonsLearned'; break;
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
        case 'liquidPenetrant': liquidPenetrantForm.handleSubmit(onLiquidPenetrantSubmit)(data); break;
        case 'ultrasound': ultrasoundReportForm.handleSubmit(onUltrasoundReportSubmit)(data); break;
        case 'lessonsLearned': lessonsLearnedForm.handleSubmit(onLessonsLearnedSubmit)(data); break;
    }
  };

  const handleMaterialInspectionPDF = async (report: RawMaterialInspection) => {
    toast({ title: "Gerando PDF..." });
    try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const companySnap = await getDoc(companyRef);
        const companyData: CompanyData = companySnap.exists() ? companySnap.data() as any : {};
        const orderInfo = orders.find(o => o.id === report.orderId);
        const itemInfo = orderInfo?.items.find(i => i.id === report.itemId);

        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        const pageHeight = docPdf.internal.pageSize.height;
        let y = 15;
        
        if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15); } catch(e) { console.error("Error adding image to PDF:", e) } }
        docPdf.setFontSize(16).setFont(undefined, 'bold');
        docPdf.text(`Relatório de Inspeção de Matéria-Prima Nº ${report.reportNumber || 'N/A'}`, pageWidth / 2, y + 8, { align: 'center' });
        y += 25;

        autoTable(docPdf, {
            startY: y,
            theme: 'plain',
            styles: { fontSize: 9 },
            body: [
                ['Pedido', `${orderInfo?.number || 'N/A'}`, 'Data de Recebimento', format(report.receiptDate, 'dd/MM/yyyy')],
                ['Cliente', `${orderInfo?.customerName || 'N/A'}`, 'Fornecedor', report.supplierName || 'N/A'],
                ['Item', `${itemInfo?.description || 'N/A'} (Cód: ${itemInfo?.code || 'N/A'})`, 'Lote/Corrida', report.materialLot || 'N/A'],
                ['Norma do Material', report.materialStandard || 'N/A', 'Inspetor', report.inspectedBy],
                ['Resultado Final', { content: report.inspectionResult, styles: { fontStyle: 'bold' } }, 'Certificado de Material', { content: 'Ver link', styles: { textColor: [0,0,255], fontStyle: 'italic' } }]
            ],
            didParseCell: (data) => {
                if (data.cell.raw === 'Ver link' && report.materialCertificateUrl) {
                    // This is a placeholder; jspdf-autotable doesn't directly support links in cells this way.
                    // Links would need to be added manually after the table is drawn.
                }
            }
        });
        y = (docPdf as any).lastAutoTable.finalY;

        if (report.photos && report.photos.length > 0) {
            y += 10;
            if (y > pageHeight - 60) { docPdf.addPage(); y = 20; }
            docPdf.setFontSize(12).setFont(undefined, 'bold');
            docPdf.text('Fotos da Inspeção', 15, y);
            y += 7;

            const photoWidth = (pageWidth - 45) / 2;
            const photoHeight = photoWidth * (3/4);
            let x = 15;

            for (const photoDataUri of report.photos) {
                if (y + photoHeight > pageHeight - 45) {
                    docPdf.addPage();
                    y = 20;
                    x = 15;
                }
                try {
                    docPdf.addImage(photoDataUri, 'JPEG', x, y, photoWidth, photoHeight);
                } catch(e) { docPdf.text("Erro ao carregar imagem", x, y + 10); }
                x = (x === 15) ? (15 + photoWidth + 15) : 15;
                if (x === 15) y += photoHeight + 5;
            }
        }

        const pageCount = docPdf.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            docPdf.setPage(i);
            docPdf.setFontSize(8).setFont(undefined, 'normal');
            docPdf.text('INS-MP-MEC-202501.REV0', 15, pageHeight - 10);
            docPdf.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
        }
        
        docPdf.save(`Relatorio_Material_${report.reportNumber || report.id}.pdf`);
    } catch (error) {
        console.error("Error exporting PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF." });
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
        const pageHeight = docPdf.internal.pageSize.height;
        let y = 15;
        
        if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15); } catch(e) { console.error("Error adding image to PDF:", e) } }
        docPdf.setFontSize(16).setFont(undefined, 'bold');
        docPdf.text(`Relatório Dimensional Nº ${report.reportNumber || 'N/A'}`, pageWidth / 2, y + 8, { align: 'center' });
        y += 25;

        docPdf.setFontSize(10).setFont(undefined, 'normal');
        docPdf.text(`Pedido: ${orderInfo?.number || 'N/A'}`, 15, y);
        docPdf.text(`Cliente: ${orderInfo?.customerName || 'N/A'}`, 15, y + 5);
        docPdf.text(`Item: ${report.itemName} (Cód: ${itemInfo?.code || 'N/A'})`, 15, y + 10);
        
        docPdf.text(`Data: ${format(report.inspectionDate, 'dd/MM/yy')}`, pageWidth - 15, y, { align: 'right' });
        docPdf.text(`Inspetor: ${report.inspectedBy}`, pageWidth - 15, y + 5, { align: 'right' });
        docPdf.text(`Resultado Geral: ${report.overallResult}`, pageWidth - 15, y + 10, { align: 'right' });
        if (report.quantityInspected) {
          docPdf.text(`Quantidade Inspecionada: ${report.quantityInspected}`, 15, y + 15);
        }
        y += 25;

        const body = report.measurements.map(m => {
            const instrument = calibrations.find(c => c.equipmentName === m.instrumentUsed);
            const instrumentDisplay = instrument ? `${instrument.equipmentName} (${instrument.internalCode})` : m.instrumentUsed;
            
            return [
                m.dimensionName,
                m.nominalValue.toString(),
                m.toleranceMin || '-',
                m.toleranceMax || '-', 
                m.measuredValue.toString(),
                instrumentDisplay,
                m.result
            ];
        });

        autoTable(docPdf, {
            startY: y,
            head: [['Dimensão', 'Nominal', 'Tolerância 1', 'Tolerância 2', 'Medido', 'Instrumento', 'Resultado']],
            body: body,
            headStyles: { fillColor: [40, 40, 40] },
            didParseCell: (data) => {
                if(data.section === 'body' && data.column.index === 6) {
                    if (data.cell.text[0] === 'Não Conforme') {
                        data.cell.styles.textColor = [255, 0, 0];
                    }
                }
            }
        });

        let finalY = (docPdf as any).lastAutoTable.finalY;

        // Seção de Fotos - versão melhorada
        console.log("=== SEÇÃO DE FOTOS NO PDF ===");
        console.log("report.photos exists:", !!report.photos);
        console.log("report.photos is array:", Array.isArray(report.photos));
        console.log("report.photos length:", report.photos?.length || 0);

        if (report.photos && Array.isArray(report.photos) && report.photos.length > 0) {
            console.log("✓ Fotos encontradas! Adicionando ao PDF. Total:", report.photos.length);
            
            y = finalY + 15;
            if (y > pageHeight - 60) { 
                docPdf.addPage(); 
                y = 20; 
            }
            
            docPdf.setFontSize(14).setFont(undefined, 'bold');
            docPdf.text('Registro Fotográfico', 15, y);
            y += 10;

            // Configurações para layout das fotos
            const photosPerRow = 2;
            const photoWidth = (pageWidth - 45) / photosPerRow; // 2 fotos por linha
            const photoHeight = photoWidth * 0.75; // Proporção 4:3
            let currentX = 15;
            let photoCount = 0;

            for (let i = 0; i < report.photos.length; i++) {
                const photoDataUri = report.photos[i];
                console.log(`--- Processando foto ${i + 1} de ${report.photos.length} ---`);
                
                // Verificar se precisa de nova página
                if (y + photoHeight + 20 > pageHeight - 25) {
                    docPdf.addPage();
                    y = 20;
                    currentX = 15;
                    photoCount = 0;
                    
                    // Reescrever título na nova página
                    docPdf.setFontSize(14).setFont(undefined, 'bold');
                    docPdf.text('Registro Fotográfico (continuação)', 15, y);
                    y += 10;
                }
                
                try {
                    if (photoDataUri && typeof photoDataUri === 'string' && photoDataUri.startsWith('data:image/')) {
                        console.log(`✓ Adicionando foto ${i + 1} ao PDF na posição (${currentX}, ${y})`);
                        
                        // Adicionar borda ao redor da foto
                        docPdf.setDrawColor(200, 200, 200);
                        docPdf.setLineWidth(0.5);
                        docPdf.rect(currentX - 1, y - 1, photoWidth + 2, photoHeight + 2);
                        
                        // Adicionar a imagem
                        docPdf.addImage(photoDataUri, 'JPEG', currentX, y, photoWidth, photoHeight);
                        
                        // Adicionar numeração da foto
                        docPdf.setFontSize(10).setFont(undefined, 'bold');
                        docPdf.setTextColor(60, 60, 60);
                        docPdf.text(`Foto ${i + 1}`, currentX + photoWidth/2, y + photoHeight + 8, { align: 'center' });
                        
                        console.log(`✓ Foto ${i + 1} adicionada com sucesso!`);
                    } else {
                        console.warn(`❌ Foto ${i + 1} inválida - dados corrompidos ou formato incorreto`);
                        
                        // Desenhar placeholder para foto inválida
                        docPdf.setFillColor(240, 240, 240);
                        docPdf.rect(currentX, y, photoWidth, photoHeight, 'F');
                        docPdf.setFontSize(10).setTextColor(120, 120, 120);
                        docPdf.text(`Foto ${i + 1}: Erro ao carregar`, currentX + photoWidth/2, y + photoHeight/2, { align: 'center' });
                    }
                } catch(e) {
                    console.error(`❌ Erro ao adicionar foto ${i + 1} ao PDF:`, e);
                    
                    // Desenhar placeholder para erro
                    docPdf.setFillColor(250, 200, 200);
                    docPdf.rect(currentX, y, photoWidth, photoHeight, 'F');
                    docPdf.setFontSize(10).setTextColor(150, 50, 50);
                    docPdf.text(`Foto ${i + 1}: Erro no processamento`, currentX + photoWidth/2, y + photoHeight/2, { align: 'center' });
                }

                photoCount++;
                
                // Calcular posição da próxima foto
                if (photoCount % photosPerRow === 0) {
                    // Nova linha
                    currentX = 15;
                    y += photoHeight + 20;
                } else {
                    // Próxima coluna
                    currentX += photoWidth + 15;
                }
            }
            
            // Ajustar finalY considerando a última linha
            if (photoCount % photosPerRow !== 0) {
                finalY = y + photoHeight + 20;
            } else {
                finalY = y;
            }
            
            console.log(`✓ Todas as ${report.photos.length} fotos processadas para o PDF`);
        } else {
            console.log("❌ Nenhuma foto encontrada no relatório para o PDF");
        }
        
        const footerText = `DIM-MEC-2025-01.REV0`;
        const pageCount = docPdf.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            docPdf.setPage(i);
            
            const signatureY = pageHeight - 35;
            if (i === pageCount) { 
                docPdf.setFontSize(10).setFont(undefined, 'normal');
                
                const enterpriseInspectorX = 15;
                docPdf.line(enterpriseInspectorX, signatureY, enterpriseInspectorX + 85, signatureY);
                docPdf.text(report.inspectedBy, enterpriseInspectorX, signatureY + 5);
                docPdf.text('Inspetor Responsável (Empresa)', enterpriseInspectorX, signatureY + 10);

                if (report.customerInspector) {
                    const customerInspectorX = pageWidth - 15 - 85;
                    docPdf.line(customerInspectorX, signatureY, customerInspectorX + 85, signatureY);
                    docPdf.text(report.customerInspector, customerInspectorX, signatureY + 5);
                    docPdf.text('Inspetor Responsável (Cliente)', customerInspectorX, signatureY + 10);
                }
            }

            docPdf.setFontSize(8).setFont(undefined, 'normal');
            docPdf.text(footerText, 15, pageHeight - 10);
            docPdf.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
        }
        
        docPdf.save(`RelatorioDimensional_${report.reportNumber || report.id}.pdf`);

    } catch (error) {
        console.error("Error exporting PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF." });
    }
  };

    const handleWeldingInspectionPDF = async (report: WeldingInspection) => {
        toast({ title: "Gerando PDF..." });
        try {
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const companySnap = await getDoc(companyRef);
            const companyData: CompanyData = companySnap.exists() ? companySnap.data() as any : {};
            const orderInfo = orders.find(o => o.id === report.orderId);
            const itemInfo = orderInfo?.items.find(i => i.id === report.itemId);

            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            const pageHeight = docPdf.internal.pageSize.height;
            let y = 15;

            // Header
            if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo?.preview, 'PNG', 15, y, 30, 15); } catch(e) { console.error("Error adding image to PDF:", e) } }
            docPdf.setFontSize(16).setFont(undefined, 'bold');
            docPdf.text(`Ensaio Visual de Solda`, 50, y + 5);
            docPdf.setFontSize(14).setFont(undefined, 'normal');
            docPdf.text(`Nº ${report.reportNumber || 'N/A'}`, 50, y + 12);
            y += 25;

            // General Info using a plain table for a 2-column layout
            autoTable(docPdf, {
                startY: y,
                theme: 'plain',
                styles: { fontSize: 9, cellPadding: 1 },
                body: [
                    ['Pedido:', `${orderInfo?.number || 'N/A'}`, 'Data da Inspeção:', format(report.inspectionDate, 'dd/MM/yyyy')],
                    ['Cliente:', `${orderInfo?.customerName || 'N/A'}`, 'Inspetor (Empresa):', report.inspectedBy],
                    ['Item:', `${itemInfo?.description || 'N/A'}`, 'Inspetor (Cliente):', report.customerInspector || 'N/A'],
                    ['Tipo de Inspeção:', report.inspectionType, 'Resultado Final:', { content: report.result, styles: { fontStyle: 'bold' } }]
                ] as any,
            });
            y = (docPdf as any).lastAutoTable.finalY + 5;

            const addSection = (title: string, data: (string | number | null | undefined)[][]) => {
                if (y > pageHeight - 40) { docPdf.addPage(); y = 20; }
                docPdf.setFontSize(11).setFont(undefined, 'bold');
                docPdf.text(title, 15, y);
                y += 2;
                autoTable(docPdf, {
                    startY: y,
                    theme: 'grid',
                    body: data,
                    styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.1, lineColor: [200, 200, 200] },
                    columnStyles: { 
                        0: { fontStyle: 'bold', cellWidth: 50 },
                        1: { cellWidth: 'auto' }
                    },
                    bodyStyles: {
                        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 }
                    }
                });
                y = (docPdf as any).lastAutoTable.finalY + 5;
            }

            addSection('1. Dados Gerais da Peça e da Soldagem', [
                ['Identificação da Junta', report.jointIdentification],
                ['Processo de Soldagem', report.weldingProcess],
                ['Tipo de Junta', report.jointType],
                ['Posição de Soldagem', report.weldingPosition],
                ['Material Base', report.baseMaterial],
                ['Material de Adição', report.fillerMaterial],
                ['Espessura (mm)', report.materialThickness],
            ].map(([key, value]) => [key, value || 'N/A']));

            addSection('2. Dados do Soldador', [
                ['Sinete do Soldador', report.welderSinete],
                ['Qualificação', report.welderQualification],
                ['Código da WPS', report.wpsCode],
            ].map(([key, value]) => [key, value || 'N/A']));
            
            const selectedToolName = report.dimensionalTools;
            const tool = calibrations.find(c => c.equipmentName === selectedToolName);
            const toolDisplay = tool
                ? `${tool.equipmentName} (Cód: ${tool.internalCode})\nCertificado: ${tool.certificateUrl || 'N/A'}`
                : selectedToolName || 'N/A';
                
            addSection('3. Dados do Ensaio Dimensional', [
                ['Ferramentas Utilizadas', toolDisplay],
                ['Critério de Aceitação', report.acceptanceCriteria],
            ].map(([key, value]) => [key, value || 'N/A']));

            addSection('4. Dados do Ensaio Visual', [
                ['Condições da Superfície', report.surfaceCondition],
                ['Defeitos Observados', report.observedDefects],
            ].map(([key, value]) => [key, value || 'N/A']));

            if (report.inspectionType !== 'Visual') {
                addSection(`Dados do Ensaio de ${report.inspectionType}`, [
                    ['Técnico Responsável', report.technician],
                    ['Norma Aplicada', report.standard],
                    ...(report.inspectionType === 'UT - Ultrassom' ? [['Equipamento', report.equipment]] : []),
                    ...(report.reportUrl ? [['Link do Laudo Externo', report.reportUrl]] : []),
                ].map(([key, value]) => [key, value || 'N/A']));
            }
            
            let finalY = y;
            if (report.notes) {
                if (finalY > pageHeight - 60) { docPdf.addPage(); finalY = 20; }
                docPdf.setFontSize(12).setFont(undefined, 'bold').text('Observações', 15, finalY);
                finalY += 6;
                const splitNotes = docPdf.splitTextToSize(report.notes, pageWidth - 30);
                docPdf.setFontSize(9).setFont(undefined, 'normal').text(splitNotes, 15, finalY);
                finalY += (splitNotes.length * 5);
            }
            
            docPdf.addPage();
            let photoY = 20;
            docPdf.setFontSize(12).setFont(undefined, 'bold');
            docPdf.text('Fotos da Inspeção', 15, photoY);
            photoY += 7;
            
            if (report.photos && report.photos.length > 0) {
                const photoWidth = (pageWidth - 45) / 2;
                const photoHeight = photoWidth * (3/4);
                let x = 15;
                for (const photoDataUri of report.photos) {
                    if (photoY + photoHeight > pageHeight - 45) {
                        docPdf.addPage();
                        photoY = 20;
                        x = 15;
                    }
                    try { docPdf.addImage(photoDataUri, 'JPEG', x, photoY, photoWidth, photoHeight); } 
                    catch(e) { docPdf.text("Erro ao carregar imagem", x, photoY + 10); }
                    x = (x === 15) ? (15 + photoWidth + 15) : 15;
                    if (x === 15) photoY += photoHeight + 5;
                }
            }


            let footerText = 'DOC-MEC-000';
            switch(report.inspectionType) {
                case 'Visual': footerText = 'EVS-MEC-202501.REV0'; break;
                case 'LP - Líquido Penetrante': footerText = 'LP-MEC-202501.REV0'; break;
                case 'UT - Ultrassom': footerText = 'US-MEC-202501.REV0'; break;
            }

            const pageCount = docPdf.internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                docPdf.setPage(i);
                const signatureY = pageHeight - 35;
                if (i === pageCount) { 
                    docPdf.setFontSize(10).setFont(undefined, 'normal');
                    const enterpriseInspectorX = 15;
                    docPdf.line(enterpriseInspectorX, signatureY, enterpriseInspectorX + 85, signatureY);
                    docPdf.text(report.inspectedBy, enterpriseInspectorX, signatureY + 5);
                    docPdf.text('Inspetor Responsável (Empresa)', enterpriseInspectorX, signatureY + 10);

                    if (report.customerInspector) {
                        const customerInspectorX = pageWidth - 15 - 85;
                        docPdf.line(customerInspectorX, signatureY, customerInspectorX + 85, signatureY);
                        docPdf.text(report.customerInspector, customerInspectorX, signatureY + 5);
                        docPdf.text('Inspetor Responsável (Cliente)', customerInspectorX, signatureY + 10);
                    }
                }
                docPdf.setFontSize(8).setFont(undefined, 'normal');
                docPdf.text(footerText, 15, pageHeight - 10);
                docPdf.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
            }
            
            docPdf.save(`Relatorio_Solda_${report.reportNumber || report.id}.pdf`);
        } catch (error) {
            console.error("Error exporting PDF:", error);
            toast({ variant: "destructive", title: "Erro ao gerar PDF." });
        }
    };
    
    const handleLiquidPenetrantPDF = async (report: LiquidPenetrantReport) => {
    toast({ title: "Gerando PDF..." });
    try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const companySnap = await getDoc(companyRef);
        const companyData: CompanyData = companySnap.exists() ? companySnap.data() as any : {};
        const orderInfo = orders.find(o => o.id === report.orderId);
        const itemInfo = orderInfo?.items.find(i => i.id === report.itemId);

        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        const pageHeight = docPdf.internal.pageSize.height;
        let y = 15;

        // Header
        if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15); } catch(e) { console.error("Error adding image to PDF:", e) } }
        docPdf.setFontSize(14).setFont(undefined, 'bold');
        docPdf.text(`Relatório de Ensaio de Líquido Penetrante (LP)`, pageWidth / 2, y + 5, { align: 'center' });
        docPdf.setFontSize(12).setFont(undefined, 'normal');
        docPdf.text(`Nº ${report.reportNumber || 'N/A'}`, pageWidth / 2, y + 12, { align: 'center' });
        y += 25;
        
        const addSection = (title: string, data: (string | number | null | undefined)[][]) => {
            if (y > pageHeight - 40 && docPdf.internal.getNumberOfPages() > 0) { docPdf.addPage(); y = 20; }
            docPdf.setFontSize(11).setFont(undefined, 'bold');
            docPdf.text(title, 15, y);
            y += 2;
            autoTable(docPdf, {
                startY: y,
                theme: 'grid',
                body: data.map(row => row.map(cell => cell ?? 'N/A')),
                styles: { fontSize: 8, cellPadding: 1.5, lineWidth: 0.1, lineColor: [200, 200, 200] },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
            });
            y = (docPdf as any).lastAutoTable.finalY + 5;
        }

        addSection('1. Dados do Relatório', [
            ['Número do Relatório', report.reportNumber],
            ['Data de Emissão', format(report.inspectionDate, 'dd/MM/yyyy')],
            ['Nº Pedido / OS', orderInfo?.number],
            ['Projeto / Cliente', orderInfo?.customerName],
            ['Inspetor Responsável', report.inspectedBy],
            ['Qualificação Inspetor', report.inspectorQualification],
        ]);
        
        addSection('2. Identificação do Corpo de Prova', [
          ['Código do Item', itemInfo?.code],
          ['Nome da Peça', itemInfo?.description],
          ['Material Base', report.baseMaterial],
          ['Tratamento Térmico', report.heatTreatment],
          ['Áreas Examinadas', report.examinedAreas],
          ['Quantidade de Peças', report.quantityInspected],
          ['Local do Ensaio', report.testLocation],
        ]);
        
        addSection('3. Parâmetros do Ensaio', [
            ['Norma Aplicada', report.appliedStandard],
            ['Técnica Utilizada', report.technique],
            ['Método de Ensaio', report.method],
            ['Temperatura Ambiente (°C)', report.ambientTemperature],
            ['Temperatura da Peça (°C)', report.partTemperature],
        ]);
        
        addSection('4. Equipamentos e Consumíveis', [
            ['Penetrante', report.penetrant],
            ['Revelador', report.developer],
            ['Removedor', report.remover],
            ['Validade Consumíveis', report.consumableValidity ? format(report.consumableValidity, 'dd/MM/yyyy') : 'N/A'],
            ['Lote / Certificação', report.consumableLot],
            ['Teste de Sensibilidade', report.sensitivityTest ? 'Sim' : 'Não'],
        ]);
        
        addSection('5. Procedimento de Execução', [
          ['Limpeza Prévia', report.procedure.preCleaning ? 'Executado' : 'Não Executado'],
          ['Aplicação do Penetrante', report.procedure.penetrantApplication ? 'Executado' : 'Não Executado'],
          ['Tempo de Penetração (min)', report.procedure.penetrationTime],
          ['Remoção do Excesso', report.procedure.excessRemoval ? 'Executado' : 'Não Executado'],
          ['Aplicação do Revelador', report.procedure.developerApplication ? 'Executado' : 'Não Executado'],
          ['Tempo de Revelação (min)', report.procedure.developmentTime],
          ['Tempo Total do Processo', report.procedure.totalProcessTime],
          ['Modo de Iluminação', report.procedure.lightingMode],
          ['Intensidade da Luz', report.procedure.lightIntensity],
          ['Tipo de Inspeção', report.procedure.inspectionType],
          ['Superfície Acessível 100%?', report.procedure.isSurfaceAccessible ? 'Sim' : 'Não'],
        ]);
        
        addSection('6. Resultados', [
            ['Tipo de Defeito', report.results.defectType],
            ['Localização', report.results.defectLocation],
            ['Dimensões Estimadas', report.results.defectDimensions],
            ['Área Livre de Indicações?', report.results.isAreaFree ? 'Sim' : 'Não'],
            ['Croqui', report.results.sketch],
        ]);
        
        addSection('7. Conclusão', [
            ['Resultado Final', report.finalResult],
            ['Critério de Aceitação Aplicado', report.acceptanceCriteria],
            ['Observações Finais', report.finalNotes],
        ]);

        if (report.photos && report.photos.length > 0) {
            if (y > pageHeight - 60) { docPdf.addPage(); y = 20; }
            docPdf.setFontSize(12).setFont(undefined, 'bold');
            docPdf.text('8. Anexos Fotográficos', 15, y);
            y += 7;
            const photoWidth = (pageWidth - 45) / 2;
            const photoHeight = photoWidth * (3/4);
            let x = 15;
            for (const photoDataUri of report.photos) {
                if (y + photoHeight > pageHeight - 45) { docPdf.addPage(); y = 20; x = 15; }
                try { docPdf.addImage(photoDataUri, 'JPEG', x, y, photoWidth, photoHeight); } 
                catch(e) { docPdf.text("Erro ao carregar imagem", x, y + 10); }
                x = (x === 15) ? (15 + photoWidth + 15) : 15;
                if (x === 15) y += photoHeight + 5;
            }
        }

        const pageCount = docPdf.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            docPdf.setPage(i);
            const signatureY = pageHeight - 35;
            if (i === pageCount) { 
                docPdf.setFontSize(10).setFont(undefined, 'normal');
                const enterpriseInspectorX = 15;
                docPdf.line(enterpriseInspectorX, signatureY, enterpriseInspectorX + 85, signatureY);
                docPdf.text(report.inspectedBy, enterpriseInspectorX, signatureY + 5);
                docPdf.text('Responsável Técnico', enterpriseInspectorX, signatureY + 10);
            }
            docPdf.setFontSize(8).setFont(undefined, 'normal');
            docPdf.text('LP-MEC-202501.REV0', 15, pageHeight - 10);
            docPdf.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
        }
        
        docPdf.save(`Relatorio_LP_${report.reportNumber || report.id}.pdf`);
    } catch (error) {
        console.error("Error exporting PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF." });
    }
  };

  const handleUltrasoundReportPDF = async (report: UltrasoundReport) => {
    toast({ title: "Gerando PDF..." });
    try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const companySnap = await getDoc(companyRef);
        const companyData: CompanyData = companySnap.exists() ? companySnap.data() as any : {};
        const orderInfo = orders.find(o => o.id === report.orderId);
        const itemInfo = orderInfo?.items.find(i => i.id === report.itemId);

        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        const pageHeight = docPdf.internal.pageSize.height;
        let y = 15;

        // Header
        if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15); } catch(e) {} }
        docPdf.setFontSize(14).setFont(undefined, 'bold');
        docPdf.text(`Relatório de Ensaio por Ultrassom (UT)`, pageWidth / 2, y + 5, { align: 'center' });
        docPdf.setFontSize(12).setFont(undefined, 'normal');
        docPdf.text(`Nº ${report.reportNumber || 'N/A'}`, pageWidth / 2, y + 12, { align: 'center' });
        y += 25;

        const addSection = (title: string, data: (string | number | null | undefined)[][]) => {
            if (y > pageHeight - 40 && docPdf.internal.getNumberOfPages() > 0) { docPdf.addPage(); y = 20; }
            docPdf.setFontSize(11).setFont(undefined, 'bold');
            docPdf.text(title, 15, y);
            y += 2;
            autoTable(docPdf, {
                startY: y,
                theme: 'grid',
                body: data.map(row => row.map(cell => cell ?? 'N/A')),
                styles: { fontSize: 8, cellPadding: 1.5, lineWidth: 0.1, lineColor: [200, 200, 200] },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
            });
            y = (docPdf as any).lastAutoTable.finalY + 5;
        };

        addSection('1. Dados do Relatório', [
            ['Nº do Relatório', report.reportNumber],
            ['Data de Emissão', format(report.inspectionDate, 'dd/MM/yyyy')],
            ['Pedido / OS', orderInfo?.number],
            ['Projeto / Cliente', orderInfo?.customerName],
            ['Código do Desenho', itemInfo?.code],
            ['Inspetor Responsável', report.inspectedBy],
            ['Nível de Qualificação', report.qualificationLevel],
        ]);

        addSection('2. Identificação do Componente', [
            ['Nome da Peça', itemInfo?.description],
            ['Material Base', report.baseMaterial],
            ['Tratamento Térmico', report.heatTreatment],
            ['Tipo e Espessura da Solda', report.weldTypeAndThickness],
            ['Área Examinada', report.examinedAreaDescription],
            ['Quantidade de Peças', report.quantityInspected],
            ['Local do Ensaio', report.testLocation],
        ]);
        
        addSection('3. Normas e Critérios Aplicados', [
            ['Norma de Execução', report.executionStandard],
            ['Critério de Aceitação', report.acceptanceCriteria],
            ['Tipo de Exame', report.examinationType],
            ['Extensão do Ensaio', report.testExtent],
        ]);

        addSection('4. Equipamentos e Acessórios Utilizados', [
            ['Equipamento (Marca/Modelo)', report.equipment],
            ['Nº de Série', report.equipmentSerial],
            ['Calibração (Cert.+Val.)', report.equipmentCalibration],
            ['Tipo de Cabeçote', report.headType],
            ['Frequência (MHz)', report.frequency],
            ['Ângulo (°)', report.incidentAngle],
            ['Acoplante', report.couplant],
            ['Bloco Padrão de Referência', report.referenceBlock],
        ]);

        addSection('5. Parâmetros do Ensaio', [
            ['Modo de Pulso', report.pulseMode],
            ['Alcance (mm)', report.range],
            ['Ganho (dB)', report.gain],
            ['Correção de Distância', report.distanceCorrection],
            ['Taxa de Varredura (mm/s)', report.scanRate],
            ['Resolução Mínima (mm)', report.minResolution],
        ]);

        if (report.results && report.results.length > 0) {
            if (y > pageHeight - 60) { docPdf.addPage(); y = 20; }
            docPdf.setFontSize(12).setFont(undefined, 'bold').text('6. Resultados Detalhados', 15, y);
            y += 7;
            autoTable(docPdf, {
                startY: y,
                head: [['Junta', 'Tipo de Indicação', 'Localização', 'Prof. (mm)', 'Extensão (mm)', 'Amplitude', 'Resultado']],
                body: report.results.map(r => [
                    r.jointCode, r.defectType, r.location, r.depth, r.extension, r.amplitude, r.evaluationResult
                ]),
                styles: { fontSize: 8 },
                headStyles: { fillColor: [40, 40, 40] },
            });
            y = (docPdf as any).lastAutoTable.finalY + 5;
        }

        addSection('7. Conclusão', [
            ['Resultado Final', report.finalResult],
            ['Critério de Rejeição', report.rejectionCriteria],
            ['Observações Finais', report.finalNotes],
        ]);

        if (report.photos && report.photos.length > 0) {
            if (y > pageHeight - 60) { docPdf.addPage(); y = 20; }
            docPdf.setFontSize(12).setFont(undefined, 'bold');
            docPdf.text('8. Anexos Fotográficos', 15, y);
            y += 7;
            const photoWidth = (pageWidth - 45) / 2;
            const photoHeight = photoWidth * (3/4);
            let x = 15;
            for (const photoDataUri of report.photos) {
                if (y + photoHeight > pageHeight - 45) { docPdf.addPage(); y = 20; x = 15; }
                try { docPdf.addImage(photoDataUri, 'JPEG', x, y, photoWidth, photoHeight); } 
                catch(e) { docPdf.text("Erro ao carregar imagem", x, y + 10); }
                x = (x === 15) ? (15 + photoWidth + 15) : 15;
                if (x === 15) y += photoHeight + 5;
            }
        }

        const pageCount = docPdf.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            docPdf.setPage(i);
            const signatureY = pageHeight - 35;
            if (i === pageCount) { 
                docPdf.setFontSize(10).setFont(undefined, 'normal');
                const enterpriseInspectorX = 15;
                docPdf.line(enterpriseInspectorX, signatureY, enterpriseInspectorX + 85, signatureY);
                docPdf.text(report.inspectedBy, enterpriseInspectorX, signatureY + 5);
                docPdf.text('Inspetor Responsável', enterpriseInspectorX, signatureY + 10);
            }
            docPdf.setFontSize(8).setFont(undefined, 'normal');
            docPdf.text('UT-MEC-202501.REV0', 15, pageHeight - 10);
            docPdf.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
        }

        docPdf.save(`Relatorio_UT_${report.reportNumber || report.id}.pdf`);
    } catch (error) {
        console.error("Error exporting UT PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF." });
    }
  };

  const handleLessonsLearnedPDF = async (report: LessonsLearnedReport) => {
    toast({ title: "Gerando PDF..." });
    try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const companySnap = await getDoc(companyRef);
        const companyData: CompanyData = companySnap.exists() ? companySnap.data() as any : {};
        const orderInfo = orders.find(o => o.id === report.orderId);
        const itemInfo = orderInfo?.items.find(i => i.id === report.itemId);

        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        const pageHeight = docPdf.internal.pageSize.height;
        let y = 15;

        // Header
        if (companyData.logo?.preview) { try { docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15); } catch(e) {} }
        docPdf.setFontSize(16).setFont(undefined, 'bold');
        docPdf.text(`Relatório de Lições Aprendidas Nº ${report.reportNumber || 'N/A'}`, pageWidth / 2, y + 8, { align: 'center' });
        y += 25;
        
        const addSection = (title: string, data: (string | number | null | undefined)[][], colWidths?: any) => {
            if (y > pageHeight - 40) { docPdf.addPage(); y = 20; }
            docPdf.setFontSize(11).setFont(undefined, 'bold');
            docPdf.text(title, 15, y);
            y += 2;
            autoTable(docPdf, {
                startY: y, theme: 'grid', body: data.map(row => row.map(cell => cell ?? 'N/A')),
                styles: { fontSize: 8, cellPadding: 1.5, lineWidth: 0.1, lineColor: [200, 200, 200] },
                columnStyles: { 0: { fontStyle: 'bold', ...colWidths } },
            });
            y = (docPdf as any).lastAutoTable.finalY + 5;
        }

        addSection('1. Identificação', [
            ['Código do Relatório', report.reportNumber],
            ['Data da Emissão', format(report.emissionDate, 'dd/MM/yyyy')],
            ['Pedido / OS', orderInfo?.number],
            ['Projeto ou Cliente', orderInfo?.customerName],
            ['Item ou Conjunto Afetado', itemInfo?.description],
            ['Departamento Envolvido', report.department],
        ]);
        
        const phases = report.projectPhase?.join(', ') || 'N/A';
        addSection('2. Contexto', [
            ['Fase do Projeto', phases],
            ['Data da Ocorrência', report.occurrenceDate ? format(report.occurrenceDate, 'dd/MM/yyyy') : 'N/A'],
            ['Descrição do Evento', report.eventDescription],
        ]);

        const impacts = Object.entries(report.impact || {})
            .filter(([, value]) => value === true)
            .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1))
            .join(', ') || 'Nenhum';
        addSection('3. Análise do Problema', [
            ['Causa Raiz Identificada', report.rootCause],
            ['Ferramenta de Análise', report.analysisTool],
            ['Impacto Gerado', impacts],
        ]);

        addSection('4. Ações Corretivas e Preventivas', [
            ['Ação Corretiva Imediata', report.correctiveAction],
            ['Ação Preventiva Definida', report.preventiveAction],
            ['Responsável pela Ação', report.actionResponsible],
            ['Prazo de Execução', report.actionDeadline ? format(report.actionDeadline, 'dd/MM/yyyy') : 'N/A'],
            ['Status da Ação', report.actionStatus],
        ]);

        addSection('5. Aprendizado Consolidado', [
            ['Resumo da Lição Aprendida', report.lessonSummary],
            ['Alterar Procedimento?', report.procedureChangeNeeded ? 'Sim' : 'Não'],
            ['Alterações Documentais', report.procedureChanges],
            ['Incluir no Treinamento?', report.includeInTraining ? 'Sim' : 'Não'],
        ]);

        addSection('7. Responsáveis', [
            ['Preenchido por', report.filledBy],
            ['Verificado por', report.verifiedBy],
            ['Aprovado por', report.approvedBy],
            ['Data de Encerramento', report.closeDate ? format(report.closeDate, 'dd/MM/yyyy') : 'N/A'],
        ]);

        const pageCount = docPdf.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            docPdf.setPage(i);
            docPdf.setFontSize(8).setFont(undefined, 'normal');
            docPdf.text(`LA-FORM-001.REV0`, 15, pageHeight - 10);
            docPdf.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
        }
        
        docPdf.save(`LicaoAprendida_${report.reportNumber || report.id}.pdf`);
    } catch (error) {
        console.error("Error exporting lessons learned PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF." });
    }
  };


  const currentForm = useMemo(() => {
    switch(dialogType) {
        case 'material': return materialInspectionForm;
        case 'dimensional': return dimensionalReportForm;
        case 'welding': return weldingInspectionForm;
        case 'painting': return paintingReportForm;
        case 'liquidPenetrant': return liquidPenetrantForm;
        case 'ultrasound': return ultrasoundReportForm;
        case 'lessonsLearned': return lessonsLearnedForm;
        default: return null;
    }
  }, [dialogType, materialInspectionForm, dimensionalReportForm, weldingInspectionForm, paintingReportForm, liquidPenetrantForm, ultrasoundReportForm, lessonsLearnedForm]);
  

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
                  <Table>
  <TableHeader>
    <TableRow>
      <TableHead>Data</TableHead>
      <TableHead>Pedido</TableHead>
      <TableHead>Cliente</TableHead>
      <TableHead>Item</TableHead>
      <TableHead>Tipo</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-center">📷 Fotos</TableHead>
      <TableHead className="text-center">🎯 Ações</TableHead>
      <TableHead className="text-right">Opções</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {reports.length > 0 ? (
      reports.map((report) => {
        const photos = (report as any).photos || [];
        const actionPlan = (report as any).actionPlan;
        const hasActionPlan = !!(actionPlan && actionPlan.correctiveActions);
        
        return (
          <TableRow key={report.id} className="hover:bg-muted/50">
            <TableCell className="font-medium">
              {format(report.date, 'dd/MM/yyyy')}
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{report.orderNumber}</span>
                {(report as any).lastModified && (
                  <span className="text-xs text-muted-foreground">
                    Mod: {format((report as any).lastModified, 'dd/MM HH:mm')}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>{report.customerName}</TableCell>
            <TableCell>
              <div className="max-w-[200px] truncate" title={report.item.description}>
                {report.item.description}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={report.type === "Reclamação de Cliente" ? "destructive" : "secondary"} className="text-xs">
                {report.type === "Reclamação de Cliente" ? "Cliente" : "Interna"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={getStatusVariant(report.status)}>{report.status}</Badge>
            </TableCell>
            
            {/* COLUNA DE FOTOS */}
            <TableCell className="text-center">
              {photos.length > 0 ? (
                <div className="flex items-center justify-center gap-1">
                  <Badge variant="secondary" className="text-xs px-2">
                    {photos.length}
                  </Badge>
                  <div className="flex -space-x-1">
                    {photos.slice(0, 3).map((photo, idx) => (
                      <div 
                        key={idx} 
                        className="w-6 h-6 rounded-full border-2 border-white bg-muted overflow-hidden"
                        title={`Foto ${idx + 1}`}
                      >
                        <Image 
                          src={photo} 
                          alt={`Preview ${idx + 1}`} 
                          width={24} 
                          height={24} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                    {photos.length > 3 && (
                      <div className="w-6 h-6 rounded-full border-2 border-white bg-muted flex items-center justify-center text-xs">
                        +{photos.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">-</span>
              )}
            </TableCell>
            
            {/* COLUNA DE PLANO DE AÇÕES */}
            <TableCell className="text-center">
              {hasActionPlan ? (
                <div className="flex flex-col items-center gap-1">
                  <Badge 
                    variant={
                      actionPlan.actionStatus === "Concluído" ? "default" : 
                      actionPlan.actionStatus === "Em Andamento" ? "secondary" : 
                      "destructive"
                    }
                    className="text-xs"
                  >
                    {actionPlan.actionStatus || "Não Iniciado"}
                  </Badge>
                  {actionPlan.deadline && (
                    <span className="text-xs text-muted-foreground">
                      {format(actionPlan.deadline, 'dd/MM')}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">-</span>
              )}
            </TableCell>
            
            {/* COLUNA DE AÇÕES */}
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    // Função de visualização rápida (implementar depois)
                    toast({ title: "Visualização rápida", description: "Funcionalidade em desenvolvimento" });
                  }}>
                    <Search className="mr-2 h-4 w-4" />
                    Visualizar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleEditRncClick(report)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleDeleteRncClick(report)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        );
      })
    ) : ( 
      <TableRow>
        <TableCell colSpan={9} className="h-24 text-center">
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <span>Nenhuma não conformidade registrada.</span>
            <Button variant="outline" size="sm" onClick={handleAddRncClick}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Registrar primeira RNC
            </Button>
          </div>
        </TableCell>
      </TableRow> 
    )}
  </TableBody>
</Table>

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
              <Card>
                <CardHeader>
                    <CardTitle>Inspeções por Pedido</CardTitle>
                    <CardDescription>
                        Visualize e gerencie todos os relatórios de qualidade agrupados por pedido.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por OS, Cliente ou Projeto..."
                                value={inspectionSearchQuery}
                                onChange={(e) => setInspectionSearchQuery(e.target.value)}
                                className="pl-9 w-full md:w-1/3"
                            />
                        </div>
                    </div>
                    {isLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>OS</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Projeto</TableHead>
                                    <TableHead className="text-center">Relatórios</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOrders.length > 0 ? (
                                    filteredOrders.map(order => (
                                        <TableRow key={order.id} className="cursor-pointer" onClick={() => handleOpenInspectionsDetail(order)}>
                                            <TableCell className="font-medium">{order.number}</TableCell>
                                            <TableCell>{order.customerName}</TableCell>
                                            <TableCell>{order.projectName}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary">{getReportCountForOrder(order.id)}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center">Nenhum pedido encontrado.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
              </Card>
            </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isRncFormOpen} onOpenChange={setIsRncFormOpen}>
  <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
    <DialogHeader>
      <DialogTitle>
        {selectedReport ? "Editar Relatório de Não Conformidade" : "Registrar Nova Não Conformidade"}
      </DialogTitle>
      <DialogDescription>
        Preencha os detalhes para registrar o ocorrido e definir plano de ações. As fotos ajudam na documentação.
      </DialogDescription>
    </DialogHeader>
    
    <Form {...rncForm}>
      <form onSubmit={rncForm.handleSubmit(onRncSubmit)} className="flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 p-1 pr-4">
          <div className="space-y-6 p-2">
            
            {/* SEÇÃO 1: Informações Básicas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informações Básicas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={rncForm.control} name="date" render={({ field }) => ( 
                    <FormItem className="flex flex-col">
                      <FormLabel>Data da Ocorrência</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                              {field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha uma data</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem> 
                  )}/>
                  
                  <FormField control={rncForm.control} name="type" render={({ field }) => ( 
                    <FormItem>
                      <FormLabel>Tipo de Não Conformidade</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Interna">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-orange-500" />
                              Interna
                            </div>
                          </SelectItem>
                          <SelectItem value="Reclamação de Cliente">
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-red-500" />
                              Reclamação de Cliente
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem> 
                  )} />
                </div>

                <FormField control={rncForm.control} name="orderId" render={({ field }) => ( 
                  <FormItem>
                    <FormLabel>Pedido Relacionado</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um pedido" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {orders.map(o => 
                          <SelectItem key={o.id} value={o.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">Nº {o.number}</span>
                              <span className="text-sm text-muted-foreground">{o.customerName}</span>
                            </div>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem> 
                )} />

                <FormField control={rncForm.control} name="item" render={({ field }) => ( 
                  <FormItem>
                    <FormLabel>Item Afetado</FormLabel>
                    <Select 
                      onValueChange={value => { 
                        const selectedItem = availableRncItems.find(i => i.id === value); 
                        if (selectedItem) field.onChange(selectedItem); 
                      }} 
                      value={field.value?.id || ""}
                    >
                      <FormControl>
                        <SelectTrigger disabled={!watchedRncOrderId}>
                          <SelectValue placeholder="Selecione um item do pedido" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableRncItems.map(i => 
                          <SelectItem key={i.id} value={i.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {i.code ? `[${i.code}] ` : ''}{i.description}
                              </span>
                              {i.quantity && (
                                <span className="text-sm text-muted-foreground">Qtd: {i.quantity}</span>
                              )}
                            </div>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem> 
                )} />

                <FormField control={rncForm.control} name="description" render={({ field }) => ( 
                  <FormItem>
                    <FormLabel>Descrição Detalhada da Não Conformidade</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Detalhe o que aconteceu, como foi identificado, qual o impacto, etc. Seja específico para facilitar a análise." 
                        {...field} 
                        value={field.value ?? ''}
                        className="min-h-[120px]"
                      />
                    </FormControl>
                    <FormDescription>
                      Mínimo 10 caracteres. Quanto mais detalhado, melhor para a análise.
                    </FormDescription>
                    <FormMessage />
                  </FormItem> 
                )}/>

                <FormField control={rncForm.control} name="status" render={({ field }) => ( 
                  <FormItem>
                    <FormLabel>Status da RNC</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Aberta">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            Aberta
                          </div>
                        </SelectItem>
                        <SelectItem value="Em Análise">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                            Em Análise
                          </div>
                        </SelectItem>
                        <SelectItem value="Concluída">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            Concluída
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem> 
                )} />
              </CardContent>
            </Card>

            {/* SEÇÃO 2: Registro Fotográfico */}
            <PhotoUploadSection form={rncForm} toast={toast} />

            {/* SEÇÃO 3: Plano de Ações */}
            <ActionPlanSection form={rncForm} teamMembers={teamMembers} />

            {/* SEÇÃO 4: Indicador de Tamanho */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Monitoramento de Tamanho do Relatório</CardTitle>
              </CardHeader>
              <CardContent>
                <DataSizeIndicator data={rncForm.getValues()} />
              </CardContent>
            </Card>

          </div>
        </ScrollArea>
        
        <DialogFooter className="pt-4 mt-4 border-t flex-shrink-0">
          <Button type="button" variant="outline" onClick={() => setIsRncFormOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" className="min-w-[120px]">
            {selectedReport ? "Atualizar RNC" : "Salvar RNC"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  </DialogContent>
</Dialog>
      <Dialog open={isCalibrationFormOpen} onOpenChange={setIsCalibrationFormOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{selectedCalibration ? "Editar Calibração" : "Adicionar Equipamento para Calibração"}</DialogTitle><DialogDescription>Preencha os dados do equipamento e seu plano de calibração.</DialogDescription></DialogHeader>
          <Form {...calibrationForm}><form onSubmit={calibrationForm.handleSubmit(onCalibrationSubmit)} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={calibrationForm.control} name="equipmentName" render={({ field }) => ( <FormItem><FormLabel>Nome do Equipamento</FormLabel><FormControl><Input placeholder="Ex: Paquímetro Digital Mitutoyo" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="internalCode" render={({ field }) => ( <FormItem><FormLabel>Código Interno</FormLabel><FormControl><Input placeholder="Ex: PAQ-001" {...field} value={field.value ?? ''} disabled={!!selectedCalibration} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField control={calibrationForm.control} name="location" render={({ field }) => ( <FormItem><FormLabel>Localização</FormLabel><FormControl><Input placeholder="Ex: Metrologia" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="manufacturer" render={({ field }) => ( <FormItem><FormLabel>Fabricante</FormLabel><FormControl><Input placeholder="Ex: Mitutoyo" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="modelSerial" render={({ field }) => ( <FormItem><FormLabel>Modelo/Série</FormLabel><FormControl><Input placeholder="Ex: 500-196-30B" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={calibrationForm.control} name="lastCalibrationDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Última Calibração</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
              <FormField control={calibrationForm.control} name="calibrationIntervalMonths" render={({ field }) => ( <FormItem><FormLabel>Intervalo (meses)</FormLabel><FormControl><Input type="number" placeholder="12" {...field} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
             <FormField control={calibrationForm.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Resultado da Última Cal.</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem><SelectItem value="Aprovado com Ajuste">Aprovado com Ajuste</SelectItem></SelectContent></Select><FormMessage /></FormItem> )}/>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={calibrationForm.control} name="certificateNumber" render={({ field }) => ( <FormItem><FormLabel>Nº do Certificado</FormLabel><FormControl><Input placeholder="Número do certificado" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={calibrationForm.control} name="certificateUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Certificado</FormLabel><FormControl><Input type="url" placeholder="https://" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setIsCalibrationFormOpen(false)}>Cancelar</Button><Button type="submit">{selectedCalibration ? 'Salvar Alterações' : 'Adicionar'}</Button></DialogFooter>
          </form></Form></DialogContent></Dialog>
      <AlertDialog open={isCalibrationDeleting} onOpenChange={setIsCalibrationDeleting}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Isso excluirá permanentemente o registro de calibração para <span className="font-bold">{calibrationToDelete?.equipmentName}</span>.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmCalibrationDelete} className="bg-destructive hover:bg-destructive/90">Sim, excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      
      <Dialog open={isInspectionsDetailOpen} onOpenChange={setIsInspectionsDetailOpen}>
        <DialogContent className="max-w-6xl h-[95vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Relatórios de Qualidade do Pedido: {selectedOrderForInspections?.number}</DialogTitle>
                <DialogDescription>
                    Cliente: {selectedOrderForInspections?.customerName} | Projeto: {selectedOrderForInspections?.projectName}
                </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-4">
            <Accordion type="multiple" className="w-full space-y-4">
                <AccordionItem value="material-inspection">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><PackageSearch className="h-5 w-5 text-primary" />Inspeção de Matéria-Prima</div></AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Inspeções</CardTitle><Button size="sm" onClick={() => handleOpenMaterialForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Relatório</Button></CardHeader>
                            <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                <Table><TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Item</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                    <TableBody>{inspectionsForSelectedOrder.material.length > 0 ? inspectionsForSelectedOrder.material.map(insp => (
                                        <TableRow key={insp.id}>
                                        <TableCell className="font-mono">{insp.reportNumber || 'N/A'}</TableCell>
                                        <TableCell>{format(insp.receiptDate, 'dd/MM/yy')}</TableCell><TableCell>{insp.itemName}</TableCell>
                                        <TableCell><Badge variant={getStatusVariant(insp.inspectionResult)}>{insp.inspectionResult}</Badge></TableCell><TableCell>{insp.inspectedBy}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleMaterialInspectionPDF(insp)}><FileDown className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenMaterialForm(insp)}><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(insp, 'material')}><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell></TableRow>
                                    )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório de inspeção de matéria-prima para este pedido.</TableCell></TableRow>}
                                    </TableBody></Table>}
                            </CardContent></Card>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="dimensional-report">
                      <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Relatório Dimensional</div></AccordionTrigger>
                      <AccordionContent className="pt-2">
                          <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Relatórios</CardTitle><Button size="sm" onClick={() => handleOpenDimensionalForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Relatório</Button></CardHeader>
                              <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                  <Table><TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Item</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                      <TableBody>{inspectionsForSelectedOrder.dimensional.length > 0 ? inspectionsForSelectedOrder.dimensional.map(rep => (
                                          <TableRow key={rep.id}>
                                          <TableCell className="font-mono">{rep.reportNumber || 'N/A'}</TableCell>
                                          <TableCell>{format(rep.inspectionDate, 'dd/MM/yy')}</TableCell><TableCell>{rep.itemName}</TableCell>
                                          <TableCell><Badge variant={getStatusVariant(rep.overallResult)}>{rep.overallResult}</Badge></TableCell><TableCell>{rep.inspectedBy}</TableCell>
                                          <TableCell className="text-right">
                                              <Button variant="ghost" size="icon" onClick={() => handleDimensionalReportPDF(rep)}><FileDown className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" onClick={() => handleOpenDimensionalForm(rep)}><Pencil className="h-4 w-4" /></Button>
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(rep, 'dimensional')}><Trash2 className="h-4 w-4" /></Button>
                                          </TableCell></TableRow>
                                      )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório dimensional para este pedido.</TableCell></TableRow>}
                                      </TableBody></Table>}
                              </CardContent></Card>
                      </AccordionContent>
                </AccordionItem>
                <AccordionItem value="welding-inspection">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Ensaio Visual de Solda</div></AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Ensaios Visuais</CardTitle><Button size="sm" onClick={() => handleOpenWeldingForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Ensaio Visual</Button></CardHeader>
                            <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                <Table><TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Item</TableHead><TableHead>Tipo</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                    <TableBody>{inspectionsForSelectedOrder.welding.length > 0 ? inspectionsForSelectedOrder.welding.map(insp => (
                                        <TableRow key={insp.id}><TableCell className="font-mono">{insp.reportNumber || 'N/A'}</TableCell><TableCell>{format(insp.inspectionDate, 'dd/MM/yy')}</TableCell><TableCell>{insp.itemName}</TableCell>
                                        <TableCell><Badge variant="outline">{insp.inspectionType}</Badge></TableCell>
                                        <TableCell><Badge variant={getStatusVariant(insp.result)}>{insp.result}</Badge></TableCell><TableCell>{insp.inspectedBy}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleWeldingInspectionPDF(insp)}><FileDown className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenWeldingForm(insp)}><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(insp, 'welding')}><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell></TableRow>
                                    )) : <TableRow><TableCell colSpan={7} className="h-24 text-center">Nenhum ensaio visual de solda para este pedido.</TableCell></TableRow>}
                                    </TableBody></Table>}
                            </CardContent></Card>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="liquid-penetrant">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><Beaker className="h-5 w-5 text-primary" />Ensaio de Líquido Penetrante (LP)</div></AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <Card>
                        <CardHeader className="flex-row justify-between items-center">
                          <CardTitle className="text-base">Histórico de Relatórios de LP</CardTitle>
                          <Button size="sm" onClick={() => handleOpenLiquidPenetrantForm()}><PlusCircle className="mr-2 h-4 w-4" />Novo Relatório de LP</Button>
                        </CardHeader>
                        <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                            <Table><TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Item</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                <TableBody>{inspectionsForSelectedOrder.liquidPenetrant.length > 0 ? inspectionsForSelectedOrder.liquidPenetrant.map(insp => (
                                    <TableRow key={insp.id}>
                                    <TableCell className="font-mono">{insp.reportNumber || 'N/A'}</TableCell>
                                    <TableCell>{format(insp.inspectionDate, 'dd/MM/yy')}</TableCell><TableCell>{insp.itemName}</TableCell>
                                    <TableCell><Badge variant={getStatusVariant(insp.finalResult)}>{insp.finalResult}</Badge></TableCell><TableCell>{insp.inspectedBy}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleLiquidPenetrantPDF(insp)}><FileDown className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenLiquidPenetrantForm(insp)}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(insp, 'liquidPenetrant')}><Trash2 className="h-4 w-4" /></Button>
                                    </TableCell></TableRow>
                                )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório de líquido penetrante para este pedido.</TableCell></TableRow>}
                                </TableBody></Table>}
                        </CardContent>
                      </Card>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="ultrasound-inspection">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><FilePen className="h-5 w-5 text-primary" />Ensaio por Ultrassom (UT)</div></AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <Card>
                            <CardHeader className="flex-row justify-between items-center">
                                <CardTitle className="text-base">Histórico de Relatórios de UT</CardTitle>
                                <Button size="sm" onClick={() => handleOpenUltrasoundForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Relatório de UT</Button>
                            </CardHeader>
                            <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                <Table><TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Item</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                    <TableBody>{inspectionsForSelectedOrder.ultrasound.length > 0 ? inspectionsForSelectedOrder.ultrasound.map(rep => (
                                        <TableRow key={rep.id}>
                                            <TableCell className="font-mono">{rep.reportNumber || 'N/A'}</TableCell>
                                            <TableCell>{format(rep.inspectionDate, 'dd/MM/yy')}</TableCell>
                                            <TableCell>{rep.itemName}</TableCell>
                                            <TableCell><Badge variant={getStatusVariant(rep.finalResult)}>{rep.finalResult}</Badge></TableCell>
                                            <TableCell>{rep.inspectedBy}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleUltrasoundReportPDF(rep)}><FileDown className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleOpenUltrasoundForm(rep)}><Pencil className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(rep, 'ultrasound')}><Trash2 className="h-4 w-4" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório de ultrassom para este pedido.</TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                            }
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="painting-inspection">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted"><div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary" />Relatório Técnico de Pintura</div></AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <Card><CardHeader className="flex-row justify-between items-center"><CardTitle className="text-base">Histórico de Relatórios</CardTitle><Button size="sm" onClick={() => handleOpenPaintingForm()}><PlusCircle className="mr-2 h-4 w-4"/>Novo Relatório</Button></CardHeader>
                            <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                <Table><TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Item</TableHead><TableHead>Resultado</TableHead><TableHead>Inspetor</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                                    <TableBody>{inspectionsForSelectedOrder.painting.length > 0 ? inspectionsForSelectedOrder.painting.map(rep => (
                                        <TableRow key={rep.id}><TableCell className="font-mono">{rep.reportNumber || 'N/A'}</TableCell><TableCell>{rep.inspectionDate ? format(rep.inspectionDate, 'dd/MM/yy') : 'N/A'}</TableCell><TableCell>{rep.itemName}</TableCell>
                                        <TableCell><Badge variant={getStatusVariant(rep.result)}>{rep.result}</Badge></TableCell><TableCell>{rep.conclusion?.inspector}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenPaintingForm(rep)}><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(rep, 'painting')}><Trash2 className="h-4 w-4" /></Button>
                                        </TableCell></TableRow>
                                    )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum relatório de pintura para este pedido.</TableCell></TableRow>}
                                    </TableBody></Table>}
                            </CardContent></Card>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="procedures">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted">
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-primary" />
                            Procedimentos Aplicáveis
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <PlaceholderCard 
                            title="Gestão de Procedimentos"
                            description="Visualize e anexe os procedimentos de solda, pintura e inspeção aplicáveis a este pedido."
                            icon={BookOpen} 
                        />
                    </AccordionContent>
                </AccordionItem>
                 <AccordionItem value="lessons-learned">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted">
                        <div className="flex items-center gap-2">
                            <BrainCircuit className="h-5 w-5 text-primary" />
                            Lições Aprendidas
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <Card>
                            <CardHeader className="flex-row justify-between items-center">
                                <CardTitle className="text-base">Histórico de Lições Aprendidas</CardTitle>
                                <Button size="sm" onClick={() => handleOpenLessonsLearnedForm(null)}>
                                    <PlusCircle className="mr-2 h-4 w-4"/>
                                    Registrar Lição
                                </Button>
                            </CardHeader>
                            <CardContent>{isLoading ? <Skeleton className="h-40 w-full"/> : 
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nº</TableHead>
                                            <TableHead>Data</TableHead>
                                            <TableHead>Resumo</TableHead>
                                            <TableHead>Status Ação</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {inspectionsForSelectedOrder.lessonsLearned.length > 0 ? inspectionsForSelectedOrder.lessonsLearned.map(report => (
                                            <TableRow key={report.id}>
                                                <TableCell className="font-mono">{report.reportNumber}</TableCell>
                                                <TableCell>{format(report.emissionDate, 'dd/MM/yy')}</TableCell>
                                                <TableCell className="max-w-[200px] truncate">{report.lessonSummary}</TableCell>
                                                <TableCell><Badge variant={getStatusVariant(report.actionStatus)}>{report.actionStatus}</Badge></TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => handleLessonsLearnedPDF(report)}><FileDown className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenLessonsLearnedForm(report)}><Pencil className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteInspectionClick(report, 'lessonsLearned')}><Trash2 className="h-4 w-4" /></Button>
                                                </TableCell>
                                            </TableRow>
                                        )) : <TableRow><TableCell colSpan={5} className="h-24 text-center">Nenhuma lição aprendida para este pedido.</TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                                }
                            </CardContent>
                        </Card>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="engineering-tickets">
                    <AccordionTrigger className="text-lg font-semibold bg-muted/50 px-4 rounded-md hover:bg-muted">
                        <div className="flex items-center gap-2">
                            <Phone className="h-5 w-5 text-primary" />
                            Chamados de Engenharia
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                        <OrderEngineeringTickets 
                            selectedOrder={selectedOrderForInspections}
                            teamMembers={teamMembers}
                            user={user}
                            toast={toast}
                            isLoading={isLoading}
                        />
            </AccordionContent>
        </AccordionItem>
            </Accordion>
            </ScrollArea>
            </div>
        </DialogContent>
      </Dialog>


      <Dialog open={isInspectionFormOpen} onOpenChange={setIsInspectionFormOpen}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
                {dialogType === 'material' && (selectedInspection ? 'Editar Inspeção de Material' : 'Nova Inspeção de Material')}
                {dialogType === 'dimensional' && (selectedInspection ? 'Editar Relatório Dimensional' : 'Novo Relatório Dimensional')}
                {dialogType === 'welding' && (selectedInspection ? 'Editar Ensaio Visual de Solda' : 'Novo Ensaio Visual de Solda')}
                {dialogType === 'painting' && (selectedInspection ? 'Editar Relatório de Pintura' : 'Novo Relatório Técnico de Pintura')}
                {dialogType === 'liquidPenetrant' && (selectedInspection ? 'Editar Relatório de LP' : 'Novo Relatório de LP')}
                {dialogType === 'ultrasound' && (selectedInspection ? 'Editar Relatório de UT' : 'Novo Relatório de UT')}
                {dialogType === 'lessonsLearned' && (selectedInspection ? 'Editar Lição Aprendida' : 'Registrar Nova Lição Aprendida')}
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
                                 <WeldingInspectionForm form={weldingInspectionForm} orders={orders} teamMembers={teamMembers} calibrations={calibrations} />
                            )}
                             {dialogType === 'painting' && (
                                <PaintingReportForm form={paintingReportForm} orders={orders} teamMembers={teamMembers} />
                            )}
                             {dialogType === 'liquidPenetrant' && (
                                 <LiquidPenetrantForm form={liquidPenetrantForm} orders={orders} teamMembers={teamMembers} />
                            )}
                            {dialogType === 'ultrasound' && (
                                <UltrasoundReportForm form={ultrasoundReportForm} orders={orders} teamMembers={teamMembers} calibrations={calibrations} toast={toast} fieldArrayProps={{ fields: ultrasoundResultFields, append: appendUltrasoundResult, remove: removeUltrasoundResult }} />
                            )}
                             {dialogType === 'lessonsLearned' && (
                                <LessonsLearnedForm form={lessonsLearnedForm} orders={orders} teamMembers={teamMembers} />
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
    const { toast } = useToast();
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);

    const watchedPhotos = form.watch("photos", []);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        
        const currentPhotos = form.getValues("photos") || [];
        
        // Verificar limite de fotos (máximo 6 por formulário)
        if (currentPhotos.length + files.length > 6) {
            toast({
                title: "Muitas fotos",
                description: `Máximo de 6 fotos permitidas. Você tem ${currentPhotos.length} e está tentando adicionar ${files.length}.`,
                variant: "destructive",
            });
            return;
        }
        
        const validFiles = Array.from(files).filter(file => {
            // Verificar tipo de arquivo
            if (!file.type.startsWith('image/')) {
                toast({
                    title: "Tipo de arquivo inválido",
                    description: `O arquivo ${file.name} não é uma imagem válida.`,
                    variant: "destructive",
                });
                return false;
            }
            
            // Verificar tamanho (máximo 20MB)
            if (file.size > 20 * 1024 * 1024) {
                toast({
                    title: "Arquivo muito grande",
                    description: `O arquivo ${file.name} é muito grande (máximo 20MB).`,
                    variant: "destructive",
                });
                return false;
            }
            
            return true;
        });
        
        if (validFiles.length === 0) return;
        
        try {
            const compressedPhotos = await Promise.all(
                validFiles.map(async (file) => {
                    try {
                        console.log(`Processando foto: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                        return await compressImageForFirestore(file);
                    } catch (error) {
                        console.error(`Erro ao comprimir ${file.name}:`, error);
                        // Em caso de erro, usar o arquivo original
                        return new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = (e) => resolve(e.target?.result as string);
                            reader.readAsDataURL(file);
                        });
                    }
                })
            );
            
            const updatedPhotos = [...currentPhotos, ...compressedPhotos];
            form.setValue("photos", updatedPhotos, { shouldValidate: true });
            
            toast({
                title: "Fotos adicionadas",
                description: `${validFiles.length} foto(s) processada(s) com sucesso.`,
            });
            
        } catch (error) {
            console.error('Erro ao processar fotos:', error);
            toast({
                title: "Erro ao processar fotos",
                description: "Tente novamente ou entre em contato com o suporte.",
                variant: "destructive",
            });
        }
    };

    const removePhoto = (index: number) => {
        const currentPhotos = form.getValues("photos") || [];
        const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
        form.setValue("photos", updatedPhotos, { shouldValidate: true });
    };

    return (<>
        <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="receiptDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data de Recebimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="supplierName" render={({ field }) => ( <FormItem><FormLabel>Fornecedor</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Nome do fornecedor do material" /></FormControl><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="quantityReceived" render={({ field }) => ( <FormItem><FormLabel>Quantidade Recebida</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="Qtd. conforme NF" /></FormControl><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="materialStandard" render={({ field }) => ( <FormItem><FormLabel>Norma do Material</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASTM A36" /></FormControl><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="materialCertificateUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Certificado</FormLabel><FormControl><Input type="url" {...field} value={field.value ?? ''} placeholder="https://" /></FormControl><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="inspectionResult" render={({ field }) => ( <FormItem><FormLabel>Resultado</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem><SelectItem value="Aprovado com ressalva">Aprovado com ressalva</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
        <FormItem>
            <FormLabel>Registro Fotográfico</FormLabel>
            <FormControl>
                <Input type="file" multiple accept="image/*" onChange={handlePhotoUpload} />
            </FormControl>
             <FormDescription>
                Selecione uma ou mais imagens para anexar ao relatório.
            </FormDescription>
            {watchedPhotos && watchedPhotos.length > 0 && (
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>{watchedPhotos.length} de 6 fotos</span>
                        <span>Compressão aplicada automaticamente</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {watchedPhotos.map((photo: string, index: number) => (
                            <div key={index} className="relative group">
                                <div className="aspect-square overflow-hidden rounded-lg border border-border">
                                    <Image 
                                        src={photo} 
                                        alt={`Foto ${index + 1}`} 
                                        width={200} 
                                        height={200} 
                                        className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                                    />
                                </div>
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => removePhoto(index)}
                                        className="shadow-lg"
                                    >
                                        <Trash2 className="h-4 w-4 mr-1" />
                                        Remover
                                    </Button>
                                </div>
                                <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                    {index + 1}
                                </div>
                                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                    {Math.round((photo.length * 0.75) / 1024)}KB
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <FormMessage />
        </FormItem>
        <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
        
        {/* Indicador de tamanho do relatório */}
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">Monitoramento de Tamanho</CardTitle>
            </CardHeader>
            <CardContent>
                <DataSizeIndicator data={form.getValues()} />
            </CardContent>
        </Card>
    </>);
}

function DimensionalReportForm({ form, orders, teamMembers, fieldArrayProps, calibrations, toast }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[], fieldArrayProps: any, calibrations: Calibration[], toast: any }) {
    const watchedOrderId = form.watch("orderId");
    const watchedItemId = form.watch("itemId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); form.setValue('partIdentifier', ''); }, [watchedOrderId, form]);
    
    const selectedItemInfo = useMemo(() => {
        if (!watchedItemId) return null;
        return availableItems.find(i => i.id === watchedItemId);
    }, [watchedItemId, availableItems]);
    const totalItemQuantity = selectedItemInfo?.quantity || 0;
    useEffect(() => {
      form.setValue('partIdentifier', '');
    }, [watchedItemId, form]);
    
    const [newMeasurement, setNewMeasurement] = useState({ dimensionName: '', nominalValue: '', toleranceMin: '', toleranceMax: '', measuredValue: '', instrumentUsed: '' });
    const [editMeasurementIndex, setEditMeasurementIndex] = useState<number | null>(null);

    const watchedPhotos = form.watch("photos", []);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        
        const currentPhotos = form.getValues("photos") || [];
        
        // Verificar limite de fotos (máximo 8 por relatório dimensional)
        if (currentPhotos.length + files.length > 8) {
            toast({
                title: "Muitas fotos",
                description: `Máximo de 8 fotos permitidas. Você tem ${currentPhotos.length} e está tentando adicionar ${files.length}.`,
                variant: "destructive",
            });
            return;
        }
        
        const validFiles = Array.from(files).filter(file => {
            // Verificar tipo de arquivo
            if (!file.type.startsWith('image/')) {
                toast({
                    title: "Tipo de arquivo inválido",
                    description: `O arquivo ${file.name} não é uma imagem válida.`,
                    variant: "destructive",
                });
                return false;
            }
            
            // Verificar tamanho (máximo 20MB)
            if (file.size > 20 * 1024 * 1024) {
                toast({
                    title: "Arquivo muito grande",
                    description: `O arquivo ${file.name} é muito grande (máximo 20MB).`,
                    variant: "destructive",
                });
                return false;
            }
            
            return true;
        });
        
        if (validFiles.length === 0) return;
        
        try {
            const compressedPhotos = await Promise.all(
                validFiles.map(async (file) => {
                    try {
                        console.log(`Processando foto dimensional: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                        return await compressImageForFirestore(file);
                    } catch (error) {
                        console.error(`Erro ao comprimir ${file.name}:`, error);
                        // Em caso de erro, usar o arquivo original
                        return new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = (e) => resolve(e.target?.result as string);
                            reader.readAsDataURL(file);
                        });
                    }
                })
            );
            
            const updatedPhotos = [...currentPhotos, ...compressedPhotos];
            form.setValue("photos", updatedPhotos, { shouldValidate: true });
            
            toast({
                title: "Fotos adicionadas",
                description: `${validFiles.length} foto(s) processada(s) com sucesso.`,
            });
            
        } catch (error) {
            console.error('Erro ao processar fotos:', error);
            toast({
                title: "Erro ao processar fotos",
                description: "Tente novamente ou entre em contato com o suporte.",
                variant: "destructive",
            });
        }
        
        // Limpar o input para permitir selecionar os mesmos arquivos novamente
        e.target.value = '';
    };

    const removePhoto = (index: number) => {
        const currentPhotos = form.getValues("photos") || [];
        const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
        form.setValue("photos", updatedPhotos, { shouldValidate: true });
    };

    const handleAddMeasurement = () => {
        const nominal = parseFloat(newMeasurement.nominalValue);
        const measured = parseFloat(newMeasurement.measuredValue);
        
        if (!newMeasurement.dimensionName || isNaN(nominal) || isNaN(measured) || !newMeasurement.instrumentUsed) {
            toast({
                variant: "destructive",
                title: "Campos obrigatórios",
                description: "Por favor, preencha o Nome da Dimensão, Valor Nominal, Valor Medido e selecione um Instrumento.",
            });
            return;
        }

        // Nova lógica para tolerâncias com sinais
        let result: "Conforme" | "Não Conforme" = "Conforme";
        
        // Verificar tolerâncias se foram preenchidas
        if (newMeasurement.toleranceMin || newMeasurement.toleranceMax) {
            let lowerBound = nominal;
            let upperBound = nominal;
            
            // Processar tolerância 1
            if (newMeasurement.toleranceMin) {
                const tol1 = newMeasurement.toleranceMin.trim();
                if (tol1.startsWith('+')) {
                    upperBound = nominal + Math.abs(parseFloat(tol1.substring(1)));
                } else if (tol1.startsWith('-')) {
                    lowerBound = nominal - Math.abs(parseFloat(tol1.substring(1)));
                } else {
                    // Se não tem sinal, assume como ±
                    const tolValue = Math.abs(parseFloat(tol1));
                    lowerBound = nominal - tolValue;
                    upperBound = nominal + tolValue;
                }
            }
            
            // Processar tolerância 2
            if (newMeasurement.toleranceMax) {
                const tol2 = newMeasurement.toleranceMax.trim();
                if (tol2.startsWith('+')) {
                    upperBound = nominal + Math.abs(parseFloat(tol2.substring(1)));
                } else if (tol2.startsWith('-')) {
                    lowerBound = nominal - Math.abs(parseFloat(tol2.substring(1)));
                } else {
                    // Se não tem sinal, assume como ±
                    const tolValue = Math.abs(parseFloat(tol2));
                    if (!newMeasurement.toleranceMin) {
                        lowerBound = nominal - tolValue;
                        upperBound = nominal + tolValue;
                    }
                }
            }
            
            // Verificar se o valor medido está dentro da tolerância
            if (measured < lowerBound || measured > upperBound) {
                result = "Não Conforme";
            }
        }
        
        fieldArrayProps.append({
            id: Date.now().toString(),
            dimensionName: newMeasurement.dimensionName,
            nominalValue: nominal,
            toleranceMin: newMeasurement.toleranceMin || undefined,
            toleranceMax: newMeasurement.toleranceMax || undefined,
            measuredValue: measured,
            instrumentUsed: newMeasurement.instrumentUsed,
            result: result,
        });
        
        setNewMeasurement({ 
            dimensionName: '', 
            nominalValue: '', 
            toleranceMin: '', 
            toleranceMax: '', 
            measuredValue: '', 
            instrumentUsed: '' 
        });
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

        if (!newMeasurement.dimensionName || isNaN(nominal) || isNaN(measured) || !newMeasurement.instrumentUsed) {
            toast({
                variant: "destructive",
                title: "Campos obrigatórios",
                description: "Por favor, preencha o Nome da Dimensão, Valor Nominal, Valor Medido e selecione um Instrumento.",
            });
            return;
        }

        // Nova lógica para tolerâncias com sinais
        let result: "Conforme" | "Não Conforme" = "Conforme";
        
        // Verificar tolerâncias se foram preenchidas
        if (newMeasurement.toleranceMin || newMeasurement.toleranceMax) {
            let lowerBound = nominal;
            let upperBound = nominal;
            
            // Processar tolerância 1
            if (newMeasurement.toleranceMin) {
                const tol1 = newMeasurement.toleranceMin.trim();
                if (tol1.startsWith('+')) {
                    upperBound = nominal + Math.abs(parseFloat(tol1.substring(1)));
                } else if (tol1.startsWith('-')) {
                    lowerBound = nominal - Math.abs(parseFloat(tol1.substring(1)));
                } else {
                    // Se não tem sinal, assume como ±
                    const tolValue = Math.abs(parseFloat(tol1));
                    lowerBound = nominal - tolValue;
                    upperBound = nominal + tolValue;
                }
            }
            
            // Processar tolerância 2
            if (newMeasurement.toleranceMax) {
                const tol2 = newMeasurement.toleranceMax.trim();
                if (tol2.startsWith('+')) {
                    upperBound = nominal + Math.abs(parseFloat(tol2.substring(1)));
                } else if (tol2.startsWith('-')) {
                    lowerBound = nominal - Math.abs(parseFloat(tol2.substring(1)));
                } else {
                    // Se não tem sinal, assume como ±
                    const tolValue = Math.abs(parseFloat(tol2));
                    if (!newMeasurement.toleranceMin) {
                        lowerBound = nominal - tolValue;
                        upperBound = nominal + tolValue;
                    }
                }
            }
            
            // Verificar se o valor medido está dentro da tolerância
            if (measured < lowerBound || measured > upperBound) {
                result = "Não Conforme";
            }
        }
        
        fieldArrayProps.update(editMeasurementIndex, {
            ...fieldArrayProps.fields[editMeasurementIndex],
            dimensionName: newMeasurement.dimensionName,
            nominalValue: nominal,
            toleranceMin: newMeasurement.toleranceMin || undefined,
            toleranceMax: newMeasurement.toleranceMax || undefined,
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Item Afetado</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="partIdentifier" render={({ field }) => ( 
                <FormItem>
                    <FormLabel>Peça Inspecionada</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!watchedItemId || totalItemQuantity === 0}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione a peça" /></SelectTrigger></FormControl>
                        <SelectContent>
                            {totalItemQuantity > 0 ? (
                                Array.from({ length: totalItemQuantity }, (_, i) => i + 1).map(num => (
                                    <SelectItem key={num} value={`Peça ${num} de ${totalItemQuantity}`}>
                                        Peça {num} de {totalItemQuantity}
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled>Selecione um item primeiro</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="inspectionDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data da Inspeção</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="quantityInspected" render={({ field }) => ( <FormItem><FormLabel>Quantidade de Peças Inspecionadas</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="Ex: 1" /></FormControl><FormMessage /></FormItem> )}/>
        </div>


        <Card><CardHeader><CardTitle className="text-base">Medições</CardTitle></CardHeader>
        <CardContent>
            {fieldArrayProps.fields.length > 0 && (
            <Table><TableHeader><TableRow><TableHead>Dimensão</TableHead><TableHead>Nominal</TableHead><TableHead>Tolerância 1</TableHead><TableHead>Tolerância 2</TableHead><TableHead>Medido</TableHead><TableHead>Instrumento</TableHead><TableHead>Resultado</TableHead><TableHead></TableHead></TableRow></TableHeader>
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
                        <Label>Tolerância 1</Label>
                        <Input type="text" value={newMeasurement.toleranceMin} onChange={(e) => setNewMeasurement({...newMeasurement, toleranceMin: e.target.value})} placeholder="Ex: +0.1 ou -0.05"/>
                    </div>
                    <div>
                        <Label>Tolerância 2</Label>
                        <Input type="text" value={newMeasurement.toleranceMax} onChange={(e) => setNewMeasurement({...newMeasurement, toleranceMax: e.target.value})} placeholder="Ex: +0.2 ou -0.1"/>
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor Responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro da equipe" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="customerInspector" render={({ field }) => ( <FormItem><FormLabel>Inspetor do Cliente (Nome)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Opcional" /></FormControl><FormMessage /></FormItem> )} />
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    📷 Registro Fotográfico
                    <Badge variant="secondary">{watchedPhotos?.length || 0}/10</Badge>
                </CardTitle>
                <CardDescription>
                    Anexe fotos da inspeção dimensional para documentar o processo e resultados.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <FormItem>
                    <FormLabel>Selecionar Fotos</FormLabel>
                    <FormControl>
                        <div className="flex items-center justify-center w-full">
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                                    </svg>
                                    <p className="mb-2 text-sm text-gray-500">
                                        <span className="font-semibold">Clique para selecionar</span> ou arraste as imagens
                                    </p>
                                    <p className="text-xs text-gray-500">PNG, JPG, JPEG, WebP (máx. 5MB cada)</p>
                                </div>
                                <Input 
                                    type="file" 
                                    multiple 
                                    accept="image/jpeg,image/jpg,image/png,image/webp" 
                                    onChange={handlePhotoUpload} 
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </FormControl>
                    <FormDescription className="text-xs">
                        • Máximo 10 fotos por relatório<br/>
                        • Tamanho máximo: 5MB por imagem<br/>
                        • Formatos aceitos: JPEG, PNG, WebP<br/>
                        • Dica: Fotos menores carregam mais rápido
                    </FormDescription>
                </FormItem>

                {watchedPhotos && watchedPhotos.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm">Fotos Anexadas</h4>
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm"
                                onClick={() => form.setValue("photos", [], { shouldValidate: true })}
                            >
                                Remover Todas
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {watchedPhotos.map((photo, index) => (
                                <div key={index} className="relative group">
                                    <div className="relative overflow-hidden rounded-lg border">
                                        <Image 
                                            src={photo} 
                                            alt={`Inspeção ${index + 1}`} 
                                            width={200} 
                                            height={200} 
                                            className="object-cover w-full aspect-square transition-transform group-hover:scale-105" 
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
                                        <Button 
                                            type="button" 
                                            size="icon" 
                                            variant="destructive" 
                                            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => removePhoto(index)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-center mt-1 text-muted-foreground">
                                        Foto {index + 1}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <FormMessage />
            </CardContent>
        </Card>

        <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
        
        {/* Indicador de tamanho do relatório */}
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">Monitoramento de Tamanho</CardTitle>
            </CardHeader>
            <CardContent>
                <DataSizeIndicator data={form.getValues()} />
            </CardContent>
        </Card>
    </>);
}

function WeldingInspectionForm({ form, orders, teamMembers, calibrations }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[], calibrations: Calibration[] }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);
    const inspectionType = form.watch("inspectionType");

    const watchedPhotos = form.watch("photos", []);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        
        const currentPhotos = form.getValues("photos") || [];
        
        // Verificar limite de fotos (máximo 6 por inspeção de solda)
        if (currentPhotos.length + files.length > 6) {
            alert(`Máximo de 6 fotos permitidas. Você tem ${currentPhotos.length} e está tentando adicionar ${files.length}.`);
            return;
        }
        
        const validFiles = Array.from(files).filter(file => {
            // Verificar tipo de arquivo
            if (!file.type.startsWith('image/')) {
                alert(`O arquivo ${file.name} não é uma imagem válida.`);
                return false;
            }
            
            // Verificar tamanho (máximo 20MB)
            if (file.size > 20 * 1024 * 1024) {
                alert(`O arquivo ${file.name} é muito grande (máximo 20MB).`);
                return false;
            }
            
            return true;
        });
        
        if (validFiles.length === 0) return;
        
        try {
            const compressedPhotos = await Promise.all(
                validFiles.map(async (file) => {
                    try {
                        console.log(`Processando foto de solda: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                        return await compressImageForFirestore(file);
                    } catch (error) {
                        console.error(`Erro ao comprimir ${file.name}:`, error);
                        // Em caso de erro, usar o arquivo original
                        return new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = (e) => resolve(e.target?.result as string);
                            reader.readAsDataURL(file);
                        });
                    }
                })
            );
            
            const updatedPhotos = [...currentPhotos, ...compressedPhotos];
            form.setValue("photos", updatedPhotos, { shouldValidate: true });
            
        } catch (error) {
            console.error('Erro ao processar fotos:', error);
            alert("Erro ao processar fotos. Tente novamente.");
        }
    };

    const removePhoto = (index: number) => {
        const currentPhotos = form.getValues("photos") || [];
        const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
        form.setValue("photos", updatedPhotos, { shouldValidate: true });
    };

    return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">1. Dados Gerais da Peça e da Soldagem</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Número do pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Código do Item</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
          </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField control={form.control} name="jointIdentification" render={({ field }) => ( <FormItem><FormLabel>Identificação da Junta</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: J1, J2..." /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="weldingProcess" render={({ field }) => ( <FormItem><FormLabel>Processo de soldagem</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: SMAW, MIG/MAG" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="jointType" render={({ field }) => ( <FormItem><FormLabel>Tipo de junta</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Topo, Canto" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="weldingPosition" render={({ field }) => ( <FormItem><FormLabel>Posição de soldagem</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: 1G, 2F" /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="baseMaterial" render={({ field }) => ( <FormItem><FormLabel>Material base</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASTM A36" /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="fillerMaterial" render={({ field }) => ( <FormItem><FormLabel>Material de adição</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: E7018" /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="materialThickness" render={({ field }) => ( <FormItem><FormLabel>Espessura (mm)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: 12.7" /></FormControl><FormMessage /></FormItem> )} />
            </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle className="text-base">2. Dados do Soldador</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
           <FormField control={form.control} name="welderSinete" render={({ field }) => ( <FormItem><FormLabel>Sinete do soldador</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
           <FormField control={form.control} name="welderQualification" render={({ field }) => ( <FormItem><FormLabel>Número da qualificação</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
           <FormField control={form.control} name="wpsCode" render={({ field }) => ( <FormItem><FormLabel>Código da WPS</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
        </CardContent>
      </Card>

      <Card>
          <CardHeader><CardTitle className="text-base">3. Dados do Ensaio Dimensional</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="dimensionalTools"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Ferramentas utilizadas</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione uma ferramenta calibrada" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {calibrations.map((cal) => (
                                    <SelectItem key={cal.id} value={cal.equipmentName}>
                                        {cal.equipmentName} ({cal.internalCode})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField control={form.control} name="acceptanceCriteria" render={({ field }) => ( <FormItem><FormLabel>Critério de aceitação</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: AWS D1.1, Tabela 6.1" /></FormControl><FormMessage /></FormItem> )}/>
          </CardContent>
      </Card>

       <Card>
        <CardHeader><CardTitle className="text-base">4. Dados do Ensaio Visual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FormField control={form.control} name="surfaceCondition" render={({ field }) => ( <FormItem><FormLabel>Condições da Superfície</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Limpa, isenta de respingos" /></FormControl><FormMessage /></FormItem> )}/>
          <FormField control={form.control} name="observedDefects" render={({ field }) => ( <FormItem><FormLabel>Defeitos Observados</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Porosidade, mordedura" /></FormControl><FormMessage /></FormItem> )}/>
          
           {(inspectionType === 'LP - Líquido Penetrante' || inspectionType === 'UT - Ultrassom') && (<>
            <FormField control={form.control} name="technician" render={({ field }) => ( <FormItem><FormLabel>Técnico Responsável</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Nome do técnico" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="standard" render={({ field }) => ( <FormItem><FormLabel>Norma Aplicada</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASTM E165" /></FormControl><FormMessage /></FormItem> )}/>
            {inspectionType === 'UT - Ultrassom' && <FormField control={form.control} name="equipment" render={({ field }) => ( <FormItem><FormLabel>Equipamento</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Nome do equipamento de UT" /></FormControl><FormMessage /></FormItem> )}/>}
            <FormField control={form.control} name="reportUrl" render={({ field }) => ( <FormItem><FormLabel>Link do Laudo Externo</FormLabel><FormControl><Input type="url" {...field} value={field.value ?? ''} placeholder="https://" /></FormControl><FormMessage /></FormItem> )}/>
          </>)}
          <FormField control={form.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Resultado Geral</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Conforme">Conforme</SelectItem><SelectItem value="Não Conforme">Não Conforme</SelectItem><SelectItem value="Aprovado">Aprovado</SelectItem><SelectItem value="Reprovado">Reprovado</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
          <FormItem>
              <FormLabel>Registro Fotográfico</FormLabel>
              <FormControl><Input type="file" multiple accept="image/*" onChange={handlePhotoUpload} /></FormControl>
              <FormDescription>Selecione imagens para anexar ao relatório.</FormDescription>
              {watchedPhotos && watchedPhotos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                      {watchedPhotos.map((photo, index) => (
                          <div key={index} className="relative">
                              <Image src={photo} alt={`Preview ${index + 1}`} width={150} height={150} className="rounded-md object-cover w-full aspect-square" />
                              <Button type="button" size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6 z-10" onClick={() => removePhoto(index)}>
                                  <Trash2 className="h-3 w-3" />
                              </Button>
                          </div>
                      ))}
                  </div>
              )}
              <FormMessage />
          </FormItem>
          <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Observações Adicionais</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Detalhes técnicos, observações, etc." /></FormControl><FormMessage /></FormItem> )}/>
        </CardContent>
      </Card>
        
      <Card>
        <CardHeader><CardTitle className="text-base">5. Registro e Responsáveis</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="inspectionDate" render={({ field }) => ( <FormItem className="flex flex-col"><FormLabel>Data do Ensaio</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Responsável técnico</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="customerInspector" render={({ field }) => ( <FormItem><FormLabel>Inspetor do Cliente</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Opcional" /></FormControl><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="releaseResponsible" render={({ field }) => ( <FormItem><FormLabel>Responsável Liberação</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Opcional" /></FormControl><FormMessage /></FormItem> )} />
        </CardContent>
      </Card>
      
      {/* Indicador de tamanho do relatório */}
      <Card>
          <CardHeader>
              <CardTitle className="text-sm">Monitoramento de Tamanho</CardTitle>
          </CardHeader>
          <CardContent>
              <DataSizeIndicator data={form.getValues()} />
          </CardContent>
      </Card>
    </div>);
}

function PaintingReportForm({ form, orders, teamMembers }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[] }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);

    return (<div>Formulário de Pintura aqui</div>);
}

function LiquidPenetrantForm({ form, orders, teamMembers }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[] }) {
  const watchedOrderId = form.watch("orderId");
  const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
  useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);
  const watchedPhotos = form.watch("photos", []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      
      const currentPhotos = form.getValues("photos") || [];
      
      // Verificar limite de fotos (máximo 6 por relatório LP)
      if (currentPhotos.length + files.length > 6) {
          alert(`Máximo de 6 fotos permitidas. Você tem ${currentPhotos.length} e está tentando adicionar ${files.length}.`);
          return;
      }
      
      const validFiles = Array.from(files).filter(file => {
          // Verificar tipo de arquivo
          if (!file.type.startsWith('image/')) {
              alert(`O arquivo ${file.name} não é uma imagem válida.`);
              return false;
          }
          
          // Verificar tamanho (máximo 20MB)
          if (file.size > 20 * 1024 * 1024) {
              alert(`O arquivo ${file.name} é muito grande (máximo 20MB).`);
              return false;
          }
          
          return true;
      });
      
      if (validFiles.length === 0) return;
      
      try {
          const compressedPhotos = await Promise.all(
              validFiles.map(async (file) => {
                  try {
                      console.log(`Processando foto LP: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                      return await compressImageForFirestore(file);
                  } catch (error) {
                      console.error(`Erro ao comprimir ${file.name}:`, error);
                      // Em caso de erro, usar o arquivo original
                      return new Promise<string>((resolve) => {
                          const reader = new FileReader();
                          reader.onload = (e) => resolve(e.target?.result as string);
                          reader.readAsDataURL(file);
                      });
                  }
              })
          );
          
          const updatedPhotos = [...currentPhotos, ...compressedPhotos];
          form.setValue("photos", updatedPhotos, { shouldValidate: true });
          
      } catch (error) {
          console.error('Erro ao processar fotos:', error);
          alert("Erro ao processar fotos. Tente novamente.");
      }
  };

  const removePhoto = (index: number) => {
      const currentPhotos = form.getValues("photos") || [];
      const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
      form.setValue("photos", updatedPhotos, { shouldValidate: true });
  };
  
  const normOptions = ["ABNT NBR 16140", "ASTM E1417/E1417M", "ISO 3452-1", "ASME Section V – Article 6", "AWS D1.1", "Norma do cliente"];

  return (
    <div className="space-y-4">
    <Card>
        <CardHeader><CardTitle className="text-base">1. Dados do Relatório</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="inspectionDate" render={({ field }) => ( <FormItem><FormLabel>Data da emissão</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Nº do pedido / OS</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="inspectorQualification" render={({ field }) => ( <FormItem><FormLabel>Qualificação do inspetor</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Nível II ABENDI / SNQC" /></FormControl><FormMessage /></FormItem> )}/>
        </CardContent>
    </Card>
    <Card>
        <CardHeader><CardTitle className="text-base">2. Identificação do Corpo de Prova</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Código do item</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="baseMaterial" render={({ field }) => ( <FormItem><FormLabel>Material base</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASTM A516 Gr.70" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="heatTreatment" render={({ field }) => ( <FormItem><FormLabel>Tratamento térmico</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Sim/Não/Tipo" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="examinedAreas" render={({ field }) => ( <FormItem><FormLabel>Áreas examinadas</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: soldas J1 a J4" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="quantityInspected" render={({ field }) => ( <FormItem><FormLabel>Quantidade de peças</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="testLocation" render={({ field }) => ( <FormItem><FormLabel>Local do ensaio</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: fábrica, campo" /></FormControl><FormMessage /></FormItem> )} />
        </CardContent>
    </Card>
    <Card>
        <CardHeader><CardTitle className="text-base">3. Parâmetros do Ensaio</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="appliedStandard" render={({ field }) => ( <FormItem><FormLabel>Norma Aplicada</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione uma norma" /></SelectTrigger></FormControl><SelectContent>{normOptions.map(norm => (<SelectItem key={norm} value={norm}>{norm}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="technique" render={({ field }) => ( <FormItem><FormLabel>Técnica Utilizada</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="visível">Visível (cor contrastante)</SelectItem><SelectItem value="fluorescente">Fluorescente</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="method" render={({ field }) => ( <FormItem><FormLabel>Método de Ensaio</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="removível com solvente">Removível com solvente</SelectItem><SelectItem value="lavável com água">Lavável com água</SelectItem><SelectItem value="pós-emulsificável">Pós-emulsificável</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="ambientTemperature" render={({ field }) => ( <FormItem><FormLabel>Temperatura Ambiente (°C)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="partTemperature" render={({ field }) => ( <FormItem><FormLabel>Temperatura da Peça (°C)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
        </CardContent>
    </Card>
    <Card>
        <CardHeader><CardTitle className="text-base">4. Equipamentos e Consumíveis</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="penetrant" render={({ field }) => ( <FormItem><FormLabel>Penetrante</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Nome e fabricante" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="developer" render={({ field }) => ( <FormItem><FormLabel>Revelador</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Nome e fabricante" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="remover" render={({ field }) => ( <FormItem><FormLabel>Removedor</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Nome e fabricante" /></FormControl><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="consumableValidity" render={({ field }) => ( <FormItem><FormLabel>Validade dos Consumíveis</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
            <FormField control={form.control} name="consumableLot" render={({ field }) => ( <FormItem><FormLabel>Lote / Nº Certificação</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="sensitivityTest" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm col-span-full"><div className="space-y-0.5"><FormLabel>Verificação de Desempenho</FormLabel><FormDescription>O teste de sensibilidade do penetrante foi realizado?</FormDescription></div><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)}/>
        </CardContent>
    </Card>
    <Card>
        <CardHeader><CardTitle className="text-base">5. Procedimento de Execução</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
                {Object.entries({preCleaning: "Limpeza Prévia", penetrantApplication: "Aplicação do Penetrante", excessRemoval: "Remoção do Excesso", developerApplication: "Aplicação do Revelador"}).map(([key, label]) => (
                    <FormField key={key} control={form.control} name={`procedure.${key}`} render={({ field }) => (<FormItem className="flex flex-row items-center space-x-3 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>{label}</FormLabel></div></FormItem>)}/>
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField control={form.control} name="procedure.penetrationTime" render={({ field }) => ( <FormItem><FormLabel>Tempo de Penetração (min)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="procedure.developmentTime" render={({ field }) => ( <FormItem><FormLabel>Tempo de Revelação (min)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="procedure.totalProcessTime" render={({ field }) => ( <FormItem><FormLabel>Tempo Total do Processo</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="procedure.lightingMode" render={({ field }) => ( <FormItem><FormLabel>Modo de Iluminação</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Luz visível ou UV" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="procedure.lightIntensity" render={({ field }) => ( <FormItem><FormLabel>Intensidade da Luz</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="lux ou μW/cm²" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="procedure.inspectionType" render={({ field }) => ( <FormItem><FormLabel>Tipo de Inspeção</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="geral">Geral</SelectItem><SelectItem value="localizada">Localizada</SelectItem><SelectItem value="completa">Completa</SelectItem><SelectItem value="parcial">Parcial</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
            </div>
            <FormField control={form.control} name="procedure.isSurfaceAccessible" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Superfície acessível 100%?</FormLabel></div><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)}/>
        </CardContent>
    </Card>
    <Card>
        <CardHeader><CardTitle className="text-base">6. Resultados</CardTitle></CardHeader>
        <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="results.defectType" render={({ field }) => ( <FormItem><FormLabel>Tipo de Defeito</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Trinca, poro, etc." /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="results.defectLocation" render={({ field }) => ( <FormItem><FormLabel>Localização</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Desenho ou coordenadas" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="results.defectDimensions" render={({ field }) => ( <FormItem><FormLabel>Dimensões Estimadas</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Comprimento, largura" /></FormControl><FormMessage /></FormItem> )}/>
              </div>
              <FormField control={form.control} name="results.isAreaFree" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Área avaliada livre de indicações?</FormLabel></div><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)}/>
              <FormField control={form.control} name="results.sketch" render={({ field }) => ( <FormItem><FormLabel>Croqui da Área Ensaida</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Descrição ou link para imagem do croqui" /></FormControl><FormMessage /></FormItem> )}/>
        </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">7. Conclusão</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <FormField control={form.control} name="finalResult" render={({ field }) => ( <FormItem><FormLabel>Resultado Final</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="Conforme">Conforme</SelectItem><SelectItem value="Não Conforme">Não Conforme</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="acceptanceCriteria" render={({ field }) => ( <FormItem><FormLabel>Critério de Aceitação Aplicado</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASME VIII, AWS D1.1" /></FormControl><FormMessage /></FormItem> )} />
        <FormField control={form.control} name="finalNotes" render={({ field }) => ( <FormItem><FormLabel>Observações Finais</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Ações corretivas, recomendações, etc." /></FormControl><FormMessage /></FormItem> )}/>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">8. Anexos Fotográficos</CardTitle></CardHeader>
      <CardContent>
          <FormItem>
              <FormLabel>Registro Fotográfico</FormLabel>
              <FormControl><Input type="file" multiple accept="image/*" onChange={handlePhotoUpload} /></FormControl>
              <FormDescription>Selecione imagens das indicações ou da área inspecionada.</FormDescription>
              {watchedPhotos && watchedPhotos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                      {watchedPhotos.map((photo, index) => (
                          <div key={index} className="relative">
                              <Image src={photo} alt={`Preview ${index + 1}`} width={150} height={150} className="rounded-md object-cover w-full aspect-square" />
                              <Button type="button" size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6 z-10" onClick={() => removePhoto(index)}>
                                  <Trash2 className="h-3 w-3" />
                              </Button>
                          </div>
                      ))}
                  </div>
              )}
              <FormMessage />
          </FormItem>
      </CardContent>
    </Card>
    
    {/* Indicador de tamanho do relatório */}
    <Card>
        <CardHeader>
            <CardTitle className="text-sm">Monitoramento de Tamanho</CardTitle>
        </CardHeader>
        <CardContent>
            <DataSizeIndicator data={form.getValues()} />
        </CardContent>
    </Card>
    </div>);
}

function UltrasoundReportForm({ form, orders, teamMembers, calibrations, toast, fieldArrayProps }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[], calibrations: Calibration[], toast: any, fieldArrayProps: any }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => {
        if (!watchedOrderId) return [];
        return orders.find(o => o.id === watchedOrderId)?.items || [];
    }, [watchedOrderId, orders]);
    
    useEffect(() => {
        form.setValue('itemId', '');
    }, [watchedOrderId, form]);
    
    const [newResult, setNewResult] = useState<Partial<UltrasoundResult>>({ jointCode: '', evaluationResult: 'Conforme' });
    const [editResultIndex, setEditResultIndex] = useState<number | null>(null);

    const handleAddResult = () => {
        const result = ultrasoundResultSchema.safeParse({ id: Date.now().toString(), ...newResult });
        if (!result.success) {
            toast({ variant: 'destructive', title: 'Erro de Validação', description: result.error.errors[0].message });
            return;
        }
        fieldArrayProps.append(result.data);
        setNewResult({ jointCode: '', evaluationResult: 'Conforme' });
        setEditResultIndex(null);
    };

    const handleUpdateResult = () => {
        if (editResultIndex === null) return;
        const result = ultrasoundResultSchema.safeParse({ ...fieldArrayProps.fields[editResultIndex], ...newResult });
        if (!result.success) {
            toast({ variant: 'destructive', title: 'Erro de Validação', description: result.error.errors[0].message });
            return;
        }
        fieldArrayProps.update(editResultIndex, result.data);
        setNewResult({ jointCode: '', evaluationResult: 'Conforme' });
        setEditResultIndex(null);
    };

    const watchedPhotos = form.watch("photos", []);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        
        const currentPhotos = form.getValues("photos") || [];
        
        // Verificar limite de fotos (máximo 6 por relatório de ultrassom)
        if (currentPhotos.length + files.length > 6) {
            toast({
                title: "Muitas fotos",
                description: `Máximo de 6 fotos permitidas. Você tem ${currentPhotos.length} e está tentando adicionar ${files.length}.`,
                variant: "destructive",
            });
            return;
        }
        
        const validFiles = Array.from(files).filter(file => {
            // Verificar tipo de arquivo
            if (!file.type.startsWith('image/')) {
                toast({
                    title: "Tipo de arquivo inválido",
                    description: `O arquivo ${file.name} não é uma imagem válida.`,
                    variant: "destructive",
                });
                return false;
            }
            
            // Verificar tamanho (máximo 20MB)
            if (file.size > 20 * 1024 * 1024) {
                toast({
                    title: "Arquivo muito grande",
                    description: `O arquivo ${file.name} é muito grande (máximo 20MB).`,
                    variant: "destructive",
                });
                return false;
            }
            
            return true;
        });
        
        if (validFiles.length === 0) return;
        
        try {
            const compressedPhotos = await Promise.all(
                validFiles.map(async (file) => {
                    try {
                        console.log(`Processando foto de ultrassom: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
                        return await compressImageForFirestore(file);
                    } catch (error) {
                        console.error(`Erro ao comprimir ${file.name}:`, error);
                        // Em caso de erro, usar o arquivo original
                        return new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = (e) => resolve(e.target?.result as string);
                            reader.readAsDataURL(file);
                        });
                    }
                })
            );
            
            const updatedPhotos = [...currentPhotos, ...compressedPhotos];
            form.setValue("photos", updatedPhotos, { shouldValidate: true });
            
            toast({
                title: "Fotos adicionadas",
                description: `${validFiles.length} foto(s) processada(s) com sucesso.`,
            });
            
        } catch (error) {
            console.error('Erro ao processar fotos:', error);
            toast({
                title: "Erro ao processar fotos",
                description: "Tente novamente ou entre em contato com o suporte.",
                variant: "destructive",
            });
        }
    };

    const removePhoto = (index: number) => {
        const currentPhotos = form.getValues("photos") || [];
        const updatedPhotos = currentPhotos.filter((_, i) => i !== index);
        form.setValue("photos", updatedPhotos, { shouldValidate: true });
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader><CardTitle className="text-base">1. Dados do Relatório</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="inspectionDate" render={({ field }) => ( <FormItem><FormLabel>Data da emissão</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Nº do pedido / OS</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="inspectedBy" render={({ field }) => ( <FormItem><FormLabel>Inspetor responsável</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um membro" /></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="qualificationLevel" render={({ field }) => ( <FormItem><FormLabel>Nível de qualificação</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Nível II - SNQC" /></FormControl><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">2. Identificação do Componente</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Código do item / desenho</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="baseMaterial" render={({ field }) => ( <FormItem><FormLabel>Material base</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASTM A36" /></FormControl><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="heatTreatment" render={({ field }) => ( <FormItem><FormLabel>Tratamento Térmico</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Normalizado" /></FormControl><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="weldTypeAndThickness" render={({ field }) => ( <FormItem><FormLabel>Tipo e Espessura da Solda</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Topo, 12.7mm" /></FormControl><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="examinedAreaDescription" render={({ field }) => ( <FormItem><FormLabel>Área Examinada</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Descreva a área ou anexe um desenho marcado" /></FormControl><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="quantityInspected" render={({ field }) => ( <FormItem><FormLabel>Quantidade de Peças</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="testLocation" render={({ field }) => ( <FormItem><FormLabel>Local do Ensaio</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: Oficina" /></FormControl><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle className="text-base">3. Normas e Critérios Aplicados</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="executionStandard" render={({ field }) => ( <FormItem><FormLabel>Norma de Execução</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASME V Art. 4" /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="acceptanceCriteria" render={({ field }) => ( <FormItem><FormLabel>Critério de Aceitação</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: ASME VIII Div. 1" /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="examinationType" render={({ field }) => ( <FormItem><FormLabel>Tipo de Exame</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Detecção de Descontinuidades">Detecção de Descontinuidades</SelectItem><SelectItem value="Medição de Espessura">Medição de Espessura</SelectItem><SelectItem value="TOFD">TOFD</SelectItem><SelectItem value="Phased Array">Phased Array</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="testExtent" render={({ field }) => ( <FormItem><FormLabel>Extensão do Ensaio</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Ex: 100%, junta J-01" /></FormControl><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">4. Equipamentos e Acessórios</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="equipment" render={({ field }) => ( <FormItem><FormLabel>Equipamento (Marca/Modelo)</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="equipmentSerial" render={({ field }) => ( <FormItem><FormLabel>Nº de Série</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="equipmentCalibration" render={({ field }) => ( <FormItem><FormLabel>Calibração do Equipamento</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Certificado + Validade" /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="headType" render={({ field }) => ( <FormItem><FormLabel>Tipo de Cabeçote</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Reto, Angular, etc." /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="frequency" render={({ field }) => ( <FormItem><FormLabel>Frequência (MHz)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="incidentAngle" render={({ field }) => ( <FormItem><FormLabel>Ângulo de Incidência (°)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} placeholder="0, 45, 60, etc." /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="couplant" render={({ field }) => ( <FormItem><FormLabel>Acoplante</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Gel, óleo, etc." /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="referenceBlock" render={({ field }) => ( <FormItem><FormLabel>Bloco Padrão de Referência</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="V1, V2, IIW, etc." /></FormControl><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">5. Parâmetros do Ensaio</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="pulseMode" render={({ field }) => ( <FormItem><FormLabel>Modo de Pulso</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Pulso-Eco, etc." /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="range" render={({ field }) => ( <FormItem><FormLabel>Alcance (mm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="gain" render={({ field }) => ( <FormItem><FormLabel>Ganho (dB)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="distanceCorrection" render={({ field }) => ( <FormItem><FormLabel>Correção de Distância</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="scanRate" render={({ field }) => ( <FormItem><FormLabel>Taxa de Varredura (mm/s)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="minResolution" render={({ field }) => ( <FormItem><FormLabel>Resolução Mínima (mm)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle className="text-base">6. Resultados Detalhados</CardTitle></CardHeader>
                <CardContent>
                    {fieldArrayProps.fields.length > 0 && (
                        <Table><TableHeader><TableRow><TableHead>Junta</TableHead><TableHead>Resultado</TableHead><TableHead></TableHead></TableRow></TableHeader>
                        <TableBody>
                        {fieldArrayProps.fields.map((field: any, index: number) => (
                            <TableRow key={field.id}><TableCell>{field.jointCode}</TableCell><TableCell><Badge variant={getStatusVariant(field.evaluationResult)}>{field.evaluationResult}</Badge></TableCell>
                            <TableCell className="text-right">
                                <Button type="button" variant="ghost" size="icon" onClick={() => { setEditResultIndex(index); setNewResult(fieldArrayProps.fields[index]); }}><Pencil className="h-4 w-4" /></Button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => fieldArrayProps.remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                            </TableCell>
                            </TableRow>
                        ))}
                        </TableBody></Table>
                    )}
                    <div className="mt-4 p-4 border rounded-md space-y-4">
                        <h4 className="font-medium">{editResultIndex !== null ? 'Editar Resultado' : 'Adicionar Novo Resultado'}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><Label>Código da Junta/Área</Label><Input value={newResult.jointCode || ''} onChange={(e) => setNewResult({...newResult, jointCode: e.target.value})} /></div>
                            <div><Label>Resultado</Label><Select value={newResult.evaluationResult} onValueChange={(val) => setNewResult({...newResult, evaluationResult: val as any})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Conforme">Conforme</SelectItem><SelectItem value="Não Conforme">Não Conforme</SelectItem></SelectContent></Select></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><Label>Tipo de Indicação</Label><Input value={newResult.defectType || ''} onChange={(e) => setNewResult({...newResult, defectType: e.target.value})} /></div>
                            <div><Label>Localização</Label><Input value={newResult.location || ''} onChange={(e) => setNewResult({...newResult, location: e.target.value})} /></div>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><Label>Profundidade (mm)</Label><Input type="number" value={newResult.depth || ''} onChange={(e) => setNewResult({...newResult, depth: parseFloat(e.target.value)})} /></div>
                            <div><Label>Extensão (mm)</Label><Input type="number" value={newResult.extension || ''} onChange={(e) => setNewResult({...newResult, extension: parseFloat(e.target.value)})} /></div>
                            <div><Label>Amplitude (% / dB)</Label><Input value={newResult.amplitude || ''} onChange={(e) => setNewResult({...newResult, amplitude: e.target.value})} /></div>
                        </div>
                        <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => { setNewResult({ jointCode: '', evaluationResult: 'Conforme' }); setEditResultIndex(null); }}>Cancelar</Button><Button size="sm" onClick={editResultIndex !== null ? handleUpdateResult : handleAddResult}>{editResultIndex !== null ? 'Atualizar Resultado' : 'Adicionar Resultado'}</Button></div>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle className="text-base">7. Conclusão</CardTitle></CardHeader>
                <CardContent>
                    <FormField control={form.control} name="finalResult" render={({ field }) => ( <FormItem><FormLabel>Resultado Final</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione o resultado"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Conforme">Conforme</SelectItem><SelectItem value="Não Conforme">Não Conforme</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="rejectionCriteria" render={({ field }) => ( <FormItem><FormLabel>Critério de Rejeição</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="Especifique o critério de rejeição" /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="finalNotes" render={({ field }) => ( <FormItem><FormLabel>Observações Finais</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} placeholder="Quaisquer notas adicionais sobre o ensaio" /></FormControl><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">8. Anexos Fotográficos</CardTitle></CardHeader>
                <CardContent>
                     <FormItem>
                        <FormLabel>Registro Fotográfico</FormLabel>
                        <FormControl><Input type="file" multiple accept="image/*" onChange={handlePhotoUpload} /></FormControl>
                        <FormDescription>Selecione uma ou mais imagens para anexar ao relatório. Imagens grandes podem demorar para salvar.</FormDescription>
                        {watchedPhotos && watchedPhotos.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                                {watchedPhotos.map((photo, index) => (
                                    <div key={index} className="relative">
                                        <Image src={photo} alt={`Preview ${index + 1}`} width={150} height={150} className="rounded-md object-cover w-full aspect-square" />
                                        <Button type="button" size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6 z-10" onClick={() => removePhoto(index)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <FormMessage />
                    </FormItem>
                </CardContent>
            </Card>
            
            {/* Indicador de tamanho do relatório */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Monitoramento de Tamanho</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataSizeIndicator data={form.getValues()} />
                </CardContent>
            </Card>
        </div>
    );
}

function LessonsLearnedForm({ form, orders, teamMembers }: { form: any, orders: OrderInfo[], teamMembers: TeamMember[] }) {
    const watchedOrderId = form.watch("orderId");
    const availableItems = useMemo(() => { if (!watchedOrderId) return []; return orders.find(o => o.id === watchedOrderId)?.items || []; }, [watchedOrderId, orders]);
    useEffect(() => { form.setValue('itemId', ''); }, [watchedOrderId, form]);
    const analysisToolOptions = ["5 Porquês", "Diagrama de Ishikawa", "Análise de Causa Raiz (RCA)", "FTA (Análise de Árvore de Falhas)", "FMEA (Análise de Modos e Efeitos de Falha)", "Outro"];
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader><CardTitle className="text-base">1. Identificação</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="emissionDate" render={({ field }) => ( <FormItem><FormLabel>Data da Emissão</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="department" render={({ field }) => ( <FormItem><FormLabel>Departamento Envolvido</FormLabel><FormControl><Input {...field} placeholder="Ex: Engenharia, Produção" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="orderId" render={({ field }) => ( <FormItem><FormLabel>Pedido</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl><SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                     <FormField control={form.control} name="itemId" render={({ field }) => ( <FormItem><FormLabel>Código do item</FormLabel><Select onValueChange={field.onChange} value={field.value || ""}><FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item" /></SelectTrigger></FormControl><SelectContent>{availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.description}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem> )} />
                    
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-base">2. Contexto</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={form.control} name="projectPhase" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Fase do Projeto</FormLabel>
                            <div className="flex flex-wrap gap-2">
                                {["Planejamento", "Execução", "Testes", "Entrega", "Pós-Entrega"].map((phase) => (
                                    <FormField
                                        key={phase}
                                        control={form.control}
                                        name="projectPhase"
                                        render={({ field }) => {
                                            return (
                                                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value?.includes(phase)}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    field.onChange([...(field.value || []), phase]);
                                                                } else {
                                                                    field.onChange(field.value?.filter((v: string) => v !== phase));
                                                                }
                                                            }}
                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        {phase}
                                                    </FormLabel>
                                                </FormItem>
                                            );
                                        }}
                                    />
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}/>
                  <FormField control={form.control} name="occurrenceDate" render={({ field }) => ( <FormItem><FormLabel>Data da Ocorrência</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                   <FormField control={form.control} name="eventDescription" render={({ field }) => ( <FormItem><FormLabel>Descrição do Evento</FormLabel><FormControl><Textarea placeholder="Descreva o evento ocorrido" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem> )}/>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-base">3. Análise do Problema</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     <FormField control={form.control} name="rootCause" render={({ field }) => ( <FormItem><FormLabel>Causa Raiz Identificada</FormLabel><FormControl><Input {...field} placeholder="Qual foi a causa raiz do problema?" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
                     <FormField control={form.control} name="analysisTool" render={({ field }) => ( <FormItem><FormLabel>Ferramenta de Análise Utilizada</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione uma ferramenta" /></SelectTrigger></FormControl><SelectContent>{analysisToolOptions.map(tool => (<SelectItem key={tool} value={tool}>{tool}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name="impact" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Impacto Gerado</FormLabel>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries({reprocess: "Reprocesso", delay: "Atraso", cost: "Custo", rework: "Retrabalho", materialLoss: "Perda de Material"}).map(([key, label]) => (
                                    <FormField key={key} control={form.control} name={`impact.${key}`} render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                            </FormControl>
                                            <FormLabel className="font-normal">{label}</FormLabel>
                                        </FormItem>
                                    )}/>
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}/>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-base">4. Ações Corretivas e Preventivas</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     <FormField control={form.control} name="correctiveAction" render={({ field }) => ( <FormItem><FormLabel>Ação Corretiva Imediata</FormLabel><FormControl><Textarea placeholder="O que foi feito para corrigir o problema?" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem> )}/>
                     <FormField control={form.control} name="preventiveAction" render={({ field }) => ( <FormItem><FormLabel>Ação Preventiva Definida</FormLabel><FormControl><Textarea placeholder="O que será feito para evitar que o problema ocorra novamente?" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem> )}/>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="actionResponsible" render={({ field }) => ( <FormItem><FormLabel>Responsável pela Ação</FormLabel><FormControl><Input {...field} placeholder="Quem é responsável por implementar a ação?" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="actionDeadline" render={({ field }) => ( <FormItem><FormLabel>Prazo de Execução</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                    </div>
                    <FormField control={form.control} name="actionStatus" render={({ field }) => ( <FormItem><FormLabel>Status da Ação</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Pendente">Pendente</SelectItem><SelectItem value="Em andamento">Em andamento</SelectItem><SelectItem value="Concluída">Concluída</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-base">5. Aprendizado Consolidado</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={form.control} name="lessonSummary" render={({ field }) => ( <FormItem><FormLabel>Resumo da Lição Aprendida</FormLabel><FormControl><Textarea placeholder="Qual é a principal lição aprendida com este evento?" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name="procedureChangeNeeded" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Alterar Procedimento?</FormLabel>
                                <FormDescription>É necessário alterar algum procedimento interno?</FormDescription>
                            </div>
                            <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="procedureChanges" render={({ field }) => ( <FormItem><FormLabel>Alterações Documentais</FormLabel><FormControl><Textarea placeholder="Quais procedimentos precisam ser alterados?" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name="includeInTraining" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Incluir no Treinamento?</FormLabel>
                                <FormDescription>Esta lição deve ser incluída no treinamento da equipe?</FormDescription>
                            </div>
                            <FormControl>
                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                        </FormItem>
                    )}/>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-base">6. Evidências e Aprovações</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <FormField control={form.control} name="evidence" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Evidências</FormLabel>
                            <FormDescription>Links para documentos, fotos ou outros arquivos relevantes.</FormDescription>
                            <FormControl><Textarea placeholder="Cole os links para as evidências aqui" {...field} value={Array.isArray(field.value) ? field.value.join('\\n') : ''} onChange={(e) => field.onChange(e.target.value.split('\\n'))}/></FormControl><FormMessage />
                        </FormItem>
                    )}/>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField control={form.control} name="filledBy" render={({ field }) => ( <FormItem><FormLabel>Preenchido por</FormLabel><FormControl><Input {...field} placeholder="Nome de quem preencheu o relatório" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="verifiedBy" render={({ field }) => ( <FormItem><FormLabel>Verificado por</FormLabel><FormControl><Input {...field} placeholder="Nome de quem verificou o relatório" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField control={form.control} name="approvedBy" render={({ field }) => ( <FormItem><FormLabel>Aprovado por</FormLabel><FormControl><Input {...field} placeholder="Nome de quem aprovou o relatório" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                    </div>
                    <FormField control={form.control} name="closeDate" render={({ field }) => ( <FormItem><FormLabel>Data de Encerramento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                </CardContent>
            </Card>
        </div>
    );
}


    
