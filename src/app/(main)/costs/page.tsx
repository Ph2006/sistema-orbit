"use client";

import React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, Timestamp, getDoc, addDoc, deleteDoc, setDoc, arrayUnion, arrayRemove, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, PackageSearch, FilePen, PlusCircle, Pencil, Trash2, FileText, Search, Link2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";


const inspectionStatuses = ["Pendente", "Aprovado", "Aprovado com ressalvas", "Rejeitado"] as const;

const itemUpdateSchema = z.object({
  supplierName: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceItemValue: z.coerce.number().optional(),
  certificateNumber: z.string().optional(),
  storageLocation: z.string().optional(),
  deliveryReceiptDate: z.date().optional().nullable(),
  inspectionStatus: z.enum(inspectionStatuses).optional(),
  weight: z.coerce.number().optional(),
  weightUnit: z.string().optional(),
});

type ItemUpdateData = z.infer<typeof itemUpdateSchema>;

const requisitionItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantityRequested: z.number(),
  status: z.string(),
  supplierName: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceItemValue: z.number().optional(),
  certificateNumber: z.string().optional(),
  storageLocation: z.string().optional(),
  deliveryReceiptDate: z.date().optional().nullable(),
  inspectionStatus: z.enum(inspectionStatuses).optional(),
  weight: z.number().optional(),
  weightUnit: z.string().optional(),
  material: z.string().optional(),
  code: z.string().optional(),
  dimensao: z.string().optional(),
  unit: z.string().optional(),
});

const segmentOptions = [
  "Insumos de pintura", 
  "Matéria-Prima", 
  "Ensaios não-destrutivos", 
  "Tratamento Térmico", 
  "Emborrachamento", 
  "Dobra", 
  "Corte a laser", 
  "Usinagem CNC", 
  "Eletroerosão", 
  "Usinagem", 
  "Insumos de solda"
];

const supplierSchema = z.object({
  supplierCode: z.string().optional(),
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().optional(),
  inscricaoEstadual: z.string().optional(),
  inscricaoMunicipal: z.string().optional(),
  segment: z.string().optional(),
  status: z.enum(["ativo", "inativo"]).optional().default("ativo"),
  telefone: z.string().optional(),
  primaryEmail: z.string().optional(),
  salesContactName: z.string().optional(),
  address: z.object({
    zipCode: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    cityState: z.string().optional(),
  }).optional(),
  bankInfo: z.object({
    bank: z.string().optional(),
    agency: z.string().optional(),
    accountNumber: z.string().optional(),
    accountType: z.enum(["Pessoa Jurídica", "Pessoa Física"]).optional(),
    pix: z.string().optional(),
  }).optional(),
  commercialInfo: z.object({
    paymentTerms: z.string().optional(),
    avgLeadTimeDays: z.coerce.number().optional(),
    shippingMethods: z.string().optional(),
    shippingIncluded: z.boolean().optional().default(false),
  }).optional(),
  documentation: z.object({
    contratoSocialUrl: z.string().optional(),
    cartaoCnpjUrl: z.string().optional(),
    certidoesNegativasUrl: z.string().optional(),
    isoCertificateUrl: z.string().optional(),
    alvaraUrl: z.string().optional(),
  }).optional(),
  firstRegistrationDate: z.date().optional(),
  lastUpdate: z.date().optional(),
});

const costEntrySchema = z.object({
  orderId: z.string().optional(),
  description: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unitCost: z.coerce.number().optional(),
  purchaseOrderNumber: z.string().optional(),
});

type CostEntryData = z.infer<typeof costEntrySchema>;

type Supplier = z.infer<typeof supplierSchema> & { id: string, name?: string };
type RequisitionItem = z.infer<typeof requisitionItemSchema>;

type Requisition = {
  id: string;
  requisitionNumber: string;
  date: Date;
  status: string;
  orderId?: string;
  orderNumber?: string;
  internalOS?: string;
  totalValue?: number;
  itemsWithPrice?: number;
  progress?: number;
  lastPriceUpdate?: Date | null;
  items: RequisitionItem[];
};

type ItemForUpdate = RequisitionItem & { requisitionId: string };
type OrderInfo = { id: string; internalOS: string; customerName: string; customerId?: string; costEntries?: any[] };

const normalizeOSNumber = (value?: string): string =>
    (value || '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, '');

const requisitionSequence = (value?: string): number => {
    const digits = (value || '').replace(/\D/g, '');
    return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
};

const compareRequisitionsAscending = (a: Requisition, b: Requisition): number =>
    requisitionSequence(a.requisitionNumber) - requisitionSequence(b.requisitionNumber)
    || a.requisitionNumber.localeCompare(b.requisitionNumber, 'pt-BR', { numeric: true });

const weightToKg = (weight?: number, unit?: string): number => {
    const value = Number(weight) || 0;
    if (value <= 0) return 0;
    const normalizedUnit = (unit || 'kg').trim().toLocaleLowerCase('pt-BR');
    if (['g', 'grama', 'gramas'].includes(normalizedUnit)) return value / 1000;
    if (['t', 'ton', 'tonelada', 'toneladas'].includes(normalizedUnit)) return value * 1000;
    if (['lb', 'lbs', 'libra', 'libras'].includes(normalizedUnit)) return value * 0.45359237;
    return value;
};

const requisitionFinancialSummary = (requisition: Requisition) => {
    const totalValue = requisition.items.reduce((sum, item) => sum + (Number(item.invoiceItemValue) || 0), 0);
    const totalWeightKg = requisition.items.reduce((sum, item) => sum + weightToKg(item.weight, item.weightUnit), 0);
    return {
        totalValue,
        totalWeightKg,
        averageCostPerKg: totalWeightKg > 0 ? totalValue / totalWeightKg : 0,
    };
};

// Mantém a especificação cadastrada na requisição e oferece uma identificação
// segura para registros antigos cuja liga/norma esteja apenas na descrição.
const resolveMaterialDescription = (item: RequisitionItem): string => {
    const savedMaterial = String(item.material || '').trim();
    if (savedMaterial) return savedMaterial;

    const description = String(item.description || '');
    const knownSpecification = description.match(
        /\b(?:ASTM\s*)?(?:A\s*36|A\s*572(?:\s*(?:GR(?:AU)?\.?\s*)?\d+)?|A\s*516(?:\s*(?:GR(?:AU)?\.?\s*)?\d+)?|A\s*240|SAE\s*\d{4}|INOX\s*(?:304|316|310)|HARDOX\s*\d{3}|AR\s*\d{3})\b/i
    );

    return knownSpecification
        ? knownSpecification[0].replace(/\s+/g, ' ').toUpperCase()
        : 'Não especificado';
};

// Função utilitária para formatação segura de datas
const safeFormatDate = (date: any, formatString: string, fallback: string = 'Data inválida'): string => {
    try {
        if (!date) return fallback;
        
        // Converter Firestore Timestamp para Date se necessário
        let dateObj = date;
        if (date?.toDate) {
            dateObj = date.toDate();
        } else if (typeof date === 'string' || typeof date === 'number') {
            dateObj = new Date(date);
        }
        
        // Verificar se a data é válida
        if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
            console.warn('Data inválida detectada:', { 
                originalDate: date, 
                convertedDate: dateObj, 
                formatString,
                dateType: typeof date,
                isDate: dateObj instanceof Date
            });
            return fallback;
        }
        
        // Tentar formatar com proteção adicional
        const result = format(dateObj, formatString);
        return result;
        
    } catch (error: any) {
        console.error('❌ Erro ao formatar data:', { 
            date, 
            formatString, 
            error: error.message,
            stack: error.stack 
        });
        
        // Se for especificamente o erro RangeError: Invalid time value
        if (error.message?.includes('Invalid time value')) {
            console.error('🚨 ERRO ESPECÍFICO - Invalid time value:', {
                originalDate: date,
                dateType: typeof date,
                formatString
            });
        }
        
        return fallback;
    }
};

// Função utilitária para limpar valores undefined recursivamente
const cleanFirestoreData = (obj) => {
    if (obj === null || obj === undefined) {
        return null;
    }
    
    if (obj instanceof Date || obj?.toDate) {
        return obj; // Manter Timestamps e Dates como estão
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => cleanFirestoreData(item)).filter(item => item !== null && item !== undefined);
    }
    
    if (typeof obj === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
            const cleanedValue = cleanFirestoreData(value);
            if (cleanedValue !== undefined && cleanedValue !== null) {
                cleaned[key] = cleanedValue;
            }
        }
        return Object.keys(cleaned).length > 0 ? cleaned : null;
    }
    
    return obj;
};

// Biblioteca global de insumos para caldeiraria e usinagem
const insumosBiblioteca = {
    "MATERIAS_PRIMAS": [
        // Aços Carbono
        "Aço carbono ASTM A36",
        "Aço SAE 1020",
        "Aço SAE 1045",
        "Aço SAE 8620",
        "Aço SAE 4140",
        "Aço SAE 4340",
        "Aço 52100",
        
        // Aços Ferramenta
        "Aço ferramenta D2",
        "Aço ferramenta D6",
        "Aço ferramenta VC131",
        "Aço ferramenta H13",
        
        // Aços Inoxidáveis
        "Aço inox AISI 304",
        "Aço inox AISI 316",
        "Aço inox AISI 310",
        "Aço inox AISI 410",
        "Aço inox AISI 420",
        
        // Aços Especiais
        "HARDOX 400",
        "HARDOX 450",
        "HARDOX 500",
        "Dillidur 400",
        "Dillidur 500",
        "USI AR 400",
        "USI AR 500",
        
        // Metais Não Ferrosos
        "Alumínio 6061",
        "Alumínio 7075",
        "Alumínio 5083",
        "Latão",
        "Bronze SAE 660",
        "Titânio Ti-6Al-4V",
        "Cobre eletrolítico",
        "Zinco fundido",
        "Magnésio fundido",
        "Níquel puro ou ligado",
        
        // Plásticos Técnicos
        "Plástico Nylon (PA6)",
        "Plástico UHMW",
        "Plástico POM (Delrin)",
        "Plástico PTFE (Teflon)",
        "Plástico PVC industrial",
        "Poliuretano sólido",
        "Poliuretano expandido",
        "Grafite para eletroerosão"
    ],
    
    "FERRAMENTAS_CORTE": [
        // Pastilhas
        "Pastilha de corte de metal duro (carbeto de tungstênio)",
        "Pastilha de corte cerâmica",
        "Pastilha de corte CBN (nitreto cúbico de boro)",
        "Pastilha de corte PCD (diamante policristalino)",
        
        // Brocas
        "Brocas HSS",
        "Brocas de metal duro",
        
        // Fresas
        "Fresas topo reto",
        "Fresas topo esférico",
        "Fresas de canal",
        
        // Ferramentas Especiais
        "Alargadores manuais",
        "Alargadores de máquina",
        "Machos de rosca M, G, NPT",
        
        // Abrasivos
        "Discos de desbaste",
        "Discos flap",
        "Discos de corte",
        "Rebolos"
    ],
    
    "CONSUMIVEIS_USINAGEM": [
        // Fluidos
        "Fluidos de corte solúveis",
        "Fluidos de corte semissintéticos",
        "Fluidos de corte sintéticos",
        "Óleos integrais para usinagem pesada",
        "Óleos de base vegetal para usinagem ecológica",
        
        // Porta-ferramentas
        "Porta-pastilhas ISO",
        "Porta-fresas tipo Weldon",
        "Porta-ferramentas ER",
        "Porta-ferramentas BT",
        "Porta-ferramentas SK",
        "Porta-ferramentas HSK",
        "Mandris para usinagem"
    ],
    
    "FIXACAO": [
        // Parafusos
        "Parafusos cabeça sextavada",
        "Parafusos Allen",
        "Parafusos de pressão",
        "Parafusos cabeça chata",
        
        // Porcas e Arruelas
        "Porcas sextavadas",
        "Porcas travantes (nylon ou metal)",
        "Arruelas lisas",
        "Arruelas de pressão",
        "Arruelas dentadas",
        
        // Elementos de Fixação
        "Pinos de posicionamento cilíndricos",
        "Pinos cônicos",
        "Chavetas retas DIN 6885",
        "Chavetas paralelas DIN 6886",
        "Prisioneiros roscados",
        "Anéis de retenção Seeger",
        "Buchas de guia",
        "Buchas de redução"
    ],
    
    "SOLDAGEM": [
        // Arames
        "Arame MIG ER70S-6",
        "Arame MIG inox ER308L",
        "Arame MIG inox ER309",
        "Arame MIG inox ER316",
        "Arame tubular E71T-1",
        "Arame tubular E71T-GS",
        
        // Eletrodos
        "Eletrodo revestido E6013",
        "Eletrodo revestido E7018",
        "Eletrodo inoxidável 308L",
        "Eletrodo de níquel Ni99",
        
        // Varetas TIG
        "Vareta TIG ER308L",
        "Vareta TIG ER4045",
        "Vareta TIG ER5356",
        
        // Gases
        "Argônio puro",
        "CO₂ industrial",
        "Mistura Ar + CO₂ (92/8 ou 80/20)",
        "Oxigênio industrial",
        "Acetileno Puro",
        "Nitrogênio gasoso",
        "Gás hélio (uso especial)",
        
        // Fundentes
        "Fundente para soldagem TIG",
        "Fluxo para brasagem"
    ],
    
    "ACABAMENTO_PINTURA": [
        // Abrasivos
        "Lixas ferro grão 36, 60, 80",
        "Lixas flap zirconada",
        "Escovas de aço rotativas",
        
        // Ensaios
        "Líquido penetrante (ensaio LP)",
        "Tinta de contraste para LP",
        "Revelador em spray",
        
        // Limpeza
        "Trapos industriais",
        "Panos não tecidos",
        "Solvente desengraxante",
        "Desengraxante biodegradável",
        
        // Tintas e Primers
        "Tinta epóxi bicomponente",
        "Tinta poliuretano (PU)",
        "Tinta esmalte sintético industrial",
        "Primer zarcão industrial",
        "Diluente industrial",
        "Catalisador PU",
        "Fita crepe de alta temperatura",
        "Pistola de pintura convencional",
        "Pistola de pintura HVLP"
    ],
    
    "LUBRIFICACAO": [
        "Óleo hidráulico ISO VG 32",
        "Óleo hidráulico ISO VG 68",
        "Graxa industrial EP2",
        "Graxa branca atóxica",
        "Graxa com bisulfeto de molibdênio"
    ],
    
    "DISPOSITIVOS_FIXACAO": [
        "Mandíbulas de torno",
        "Garras de torno automático",
        "Calços metálicos",
        "Calços plásticos",
        "Calas de nivelamento",
        "Morsas fixas e giratórias",
        "Suportes magnéticos",
        "Dispositivos de fixação rápida"
    ],
    
    "ELEMENTOS_MAQUINAS": [
        // Mancais e Rolamentos
        "Mancais tipo pedestal",
        "Mancais tipo flange",
        "Rolamentos rígidos de esferas",
        "Rolamentos de rolos cilíndricos",
        "Rolamentos de agulhas",
        "Rolamentos axiais",
        
        // Transmissão
        "Engrenagens retas",
        "Engrenagens helicoidais",
        "Polias de alumínio",
        "Polias de ferro fundido",
        "Correias em V A/B/C",
        "Correias sincronizadoras HTD",
        "Acoplamento elástico tipo H",
        "Acoplamento dentado tipo KTR",
        "Acoplamento cardan",
        
        // Molas
        "Molas helicoidais",
        "Molas prato",
        "Molas de compressão e tração"
    ],
    
    "INSTRUMENTOS_MEDICAO": [
        // Instrumentos Dimensionais
        "Paquímetros digitais e analógicos",
        "Micrômetros externos",
        "Micrômetros internos",
        "Relógios comparadores",
        "Relógios apalpadores",
        "Blocos padrão",
        "Calibradores de raio",
        "Calibradores de rosca (M, G, UN, NPT)",
        "Calibradores de folga",
        "Trenas industriais",
        "Esquadros de precisão"
    ]
};

const emptySupplierFormValues: z.infer<typeof supplierSchema> = {
    status: 'ativo',
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    segment: '',
    telefone: '',
    primaryEmail: '',
    salesContactName: '',
    address: {
        zipCode: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        cityState: '',
    },
    bankInfo: {
        bank: '',
        agency: '',
        accountNumber: '',
        accountType: undefined,
        pix: '',
    },
    commercialInfo: {
        paymentTerms: '',
        avgLeadTimeDays: undefined,
        shippingMethods: '',
        shippingIncluded: false,
    },
    documentation: {
        contratoSocialUrl: '',
        cartaoCnpjUrl: '',
        certidoesNegativasUrl: '',
        isoCertificateUrl: '',
        alvaraUrl: '',
    },
};

export default function CostsPage() {
    // Verificação inicial de problemas com datas
    React.useEffect(() => {
        try {
            // Testar se a biblioteca de formatação de datas está funcionando
            const testDate = new Date();
            format(testDate, 'dd/MM/yyyy');
            console.log("✅ Biblioteca de formatação de datas funcionando corretamente");
        } catch (error) {
            console.error("❌ Problema detectado com a biblioteca de formatação de datas:", error);
        }

        // Interceptar erros de RangeError relacionados a datas
        const originalError = console.error;
        console.error = (...args) => {
            const message = args.join(' ');
            if (message.includes('Invalid time value') || message.includes('RangeError')) {
                console.warn("🚨 ERRO DE DATA DETECTADO:", ...args);
                console.trace("Stack trace do erro de data:");
            }
            originalError.apply(console, args);
        };

        return () => {
            console.error = originalError;
        };
    }, []);

    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [orders, setOrders] = useState<OrderInfo[]>([]);

    const [isLoadingRequisitions, setIsLoadingRequisitions] = useState(true);
    const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);
    const [isLoadingOrders, setIsLoadingOrders] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSupplierFormOpen, setIsSupplierFormOpen] = useState(false);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<ItemForUpdate | null>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();
    
    const [isDeleteCostAlertOpen, setIsDeleteCostAlertOpen] = useState(false);
    const [costEntryToDelete, setCostEntryToDelete] = useState<any | null>(null);
    const [editingCostEntry, setEditingCostEntry] = useState<any | null>(null);
    const [isEditingCost, setIsEditingCost] = useState(false);
    const [osSearchTerm, setOsSearchTerm] = useState("");
    const [selectedInsumo, setSelectedInsumo] = useState("");
    const [itemSpecification, setItemSpecification] = useState("");
    const [activeTab, setActiveTab] = useState("receipts");
    const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedOrderForReport, setSelectedOrderForReport] = useState<OrderInfo | null>(null);
    const [receiptSearchTerm, setReceiptSearchTerm] = useState("");
    const [relinkSearchByRequisition, setRelinkSearchByRequisition] = useState<Record<string, string>>({});
    const [selectedOrderByRequisition, setSelectedOrderByRequisition] = useState<Record<string, string>>({});
    const [relinkingRequisitionId, setRelinkingRequisitionId] = useState<string | null>(null);

    const itemForm = useForm<ItemUpdateData>({
        resolver: zodResolver(itemUpdateSchema),
    });

    const supplierForm = useForm<z.infer<typeof supplierSchema>>({
        resolver: zodResolver(supplierSchema),
        defaultValues: emptySupplierFormValues
    });
    
    const costEntryForm = useForm<CostEntryData>({
        resolver: zodResolver(costEntrySchema),
    });

    // Resolve o vínculo primeiro pelo ID e, como contingência, pelo número legível da OS.
    // Isso mantém compatibilidade com requisições antigas e documentos migrados.
    const resolveLinkedOrder = useCallback((requisition: Pick<Requisition, 'orderId' | 'orderNumber' | 'internalOS'>) => {
        const orderById = requisition.orderId
            ? orders.find(order => order.id === requisition.orderId)
            : undefined;
        if (orderById) return orderById;

        const savedOSNumber = normalizeOSNumber(requisition.orderNumber || requisition.internalOS);
        if (!savedOSNumber) return undefined;

        return orders.find(order => normalizeOSNumber(order.internalOS) === savedOSNumber);
    }, [orders]);

    const filteredReceiptRequisitions = useMemo(() => {
        const query = receiptSearchTerm.trim().toLocaleLowerCase('pt-BR');
        const filtered = query ? requisitions.filter(requisition => {
            const linkedOrder = resolveLinkedOrder(requisition);
            const searchableText = [
                requisition.requisitionNumber,
                requisition.orderId,
                requisition.orderNumber,
                requisition.internalOS,
                linkedOrder?.internalOS,
                linkedOrder?.customerName,
                ...requisition.items.map(item => item.description),
                ...requisition.items.map(item => item.supplierName || ''),
                ...requisition.items.map(item => item.invoiceNumber || ''),
            ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');

            return searchableText.includes(query);
        }) : [...requisitions];

        return filtered.sort(compareRequisitionsAscending);
    }, [requisitions, receiptSearchTerm, resolveLinkedOrder]);

    const fetchRequisitions = useCallback(async () => {
        if (!user) return;
        setIsLoadingRequisitions(true);
        try {
            const reqsSnapshot = await getDocs(collection(db, "companies", "mecald", "materialRequisitions"));
            const reqsList: Requisition[] = reqsSnapshot.docs.map(d => {
                const data = d.data();
                const requisition = {
                    id: d.id,
                    requisitionNumber: data.requisitionNumber || 'N/A',
                    date: (() => {
                        try {
                            if (data.date?.toDate) return data.date.toDate();
                            if (data.date) {
                                const date = new Date(data.date);
                                return !isNaN(date.getTime()) ? date : new Date();
                            }
                            return new Date();
                        } catch {
                            return new Date();
                        }
                    })(),
                    status: data.status,
                    orderId: data.orderId,
                    orderNumber: data.orderNumber || data.internalOS || data.osNumber || undefined,
                    internalOS: data.internalOS || data.orderNumber || data.osNumber || undefined,
                    totalValue: data.totalValue || 0,
                    itemsWithPrice: data.itemsWithPrice || 0,
                    progress: data.progress || 0,
                    lastPriceUpdate: (() => {
                        try {
                            if (!data.lastPriceUpdate) return null;
                            if (data.lastPriceUpdate?.toDate) return data.lastPriceUpdate.toDate();
                            if (data.lastPriceUpdate) {
                                const date = new Date(data.lastPriceUpdate);
                                return !isNaN(date.getTime()) ? date : null;
                            }
                            return null;
                        } catch {
                            return null;
                        }
                    })(),
                    items: (data.items || []).map((item: any, index: number): RequisitionItem => {
                        // Tentar diferentes possíveis estruturas para o peso
                        const weight = item.weight || item.peso || item.materialWeight || item.itemWeight || undefined;
                        const weightUnit = item.weightUnit || item.pesoUnidade || item.unidadePeso || item.unit || "kg";
                        
                        return {
                        id: item.id || `${d.id}-${index}`,
                        description: item.description,
                        quantityRequested: item.quantityRequested,
                        status: item.status || "Pendente",
                        supplierName: item.supplierName || "",
                        invoiceNumber: item.invoiceNumber || "",
                        invoiceItemValue: item.invoiceItemValue || undefined,
                        certificateNumber: item.certificateNumber || "",
                        storageLocation: item.storageLocation || "",
                        deliveryReceiptDate: (() => {
                            try {
                                if (!item.deliveryReceiptDate) return null;
                                if (item.deliveryReceiptDate?.toDate) return item.deliveryReceiptDate.toDate();
                                if (item.deliveryReceiptDate) {
                                    const date = new Date(item.deliveryReceiptDate);
                                    return !isNaN(date.getTime()) ? date : null;
                                }
                                return null;
                            } catch {
                                return null;
                            }
                        })(),
                        inspectionStatus: item.inspectionStatus || "Pendente",
                        weight: weight,
                        weightUnit: weightUnit,
                        material: item.material || item.materialType || item.materialGrade || item.grade || "",
                        code: item.code || item.codigo || "",
                        dimensao: item.dimensao || item.dimension || item.dimensions || "",
                        unit: item.unit || item.unidade || "",
                        };
                    }),
                };
                
                // Log para debug requisições com valores
                if (requisition.totalValue && requisition.totalValue > 0) {
                    console.log(`💰 Requisição ${requisition.requisitionNumber} carregada com valor R$ ${requisition.totalValue} (${requisition.progress}% completa) - OS ID: ${requisition.orderId || 'NÃO VINCULADA'}`);
                    
                    // Log especial para a requisição 00008
                    if (requisition.requisitionNumber === '00008') {
                        console.log(`🔍 ===== REQUISIÇÃO 00008 DETECTADA =====`);
                        console.log(`💰 Valor: R$ ${requisition.totalValue}`);
                        console.log(`📊 Progresso: ${requisition.progress}%`);
                        console.log(`🔗 OS ID: ${requisition.orderId}`);
                        console.log(`📅 Última atualização: ${requisition.lastPriceUpdate}`);
                        console.log(`🔍 ===== FIM DEBUG 00008 =====`);
                    }
                } else if (requisition.orderId) {
                    console.log(`📋 Requisição ${requisition.requisitionNumber} sem valores ainda - OS ID: ${requisition.orderId}`);
                }
                
                return requisition;
            });
            setRequisitions(reqsList.sort(compareRequisitionsAscending));
        } catch (error) {
            console.error("Error fetching requisitions:", error);
            toast({ variant: "destructive", title: "Erro ao buscar requisições" });
        } finally {
            setIsLoadingRequisitions(false);
        }
    }, [user, toast]);

     const fetchSuppliers = useCallback(async () => {
        if (!user) return;
        setIsLoadingSuppliers(true);
        try {
            const suppliersSnapshot = await getDocs(collection(db, "companies", "mecald", "suppliers"));
            const suppliersList: Supplier[] = suppliersSnapshot.docs.map(d => {
              const data = d.data();
              return { 
                id: d.id,
                ...data,
                firstRegistrationDate: (() => {
                  try {
                    if (!data.firstRegistrationDate) return undefined;
                    if (data.firstRegistrationDate?.toDate) return data.firstRegistrationDate.toDate();
                    if (data.firstRegistrationDate) {
                      const date = new Date(data.firstRegistrationDate);
                      return !isNaN(date.getTime()) ? date : undefined;
                    }
                    return undefined;
                  } catch {
                    return undefined;
                  }
                })(),
                lastUpdate: (() => {
                  try {
                    if (!data.lastUpdate) return undefined;
                    if (data.lastUpdate?.toDate) return data.lastUpdate.toDate();
                    if (data.lastUpdate) {
                      const date = new Date(data.lastUpdate);
                      return !isNaN(date.getTime()) ? date : undefined;
                    }
                    return undefined;
                  } catch {
                    return undefined;
                  }
                })(),
              } as Supplier
            });
            setSuppliers(suppliersList);
        } catch (error) {
            console.error("Error fetching suppliers:", error);
            toast({ variant: "destructive", title: "Erro ao buscar fornecedores" });
        } finally {
            setIsLoadingSuppliers(false);
        }
    }, [user, toast]);
    
    const fetchOrders = useCallback(async () => {
        if (!user) return;
        console.log('📊 Iniciando busca de ordens de serviço...');
        setIsLoadingOrders(true);
        try {
            const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
            const ordersList: OrderInfo[] = ordersSnapshot.docs
                // Custos precisam localizar também OS concluídas ou canceladas,
                // pois seus vínculos e históricos financeiros continuam válidos.
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        internalOS: data.internalOS || 'N/A',
                        customerName: data.customer?.name || data.customerName || 'Cliente Desconhecido',
                        customerId: data.customer?.id || data.customerId || undefined,
                        costEntries: (data.costEntries || []).map((entry: any) => ({
                            ...entry,
                            entryDate: (() => {
                                try {
                                    if (!entry.entryDate) return undefined;
                                    if (entry.entryDate?.toDate) return entry.entryDate.toDate();
                                    if (entry.entryDate) {
                                        const date = new Date(entry.entryDate);
                                        return !isNaN(date.getTime()) ? date : undefined;
                                    }
                                    return undefined;
                                } catch {
                                    return undefined;
                                }
                            })(),
                            lastEditDate: (() => {
                                try {
                                    if (!entry.lastEditDate) return undefined;
                                    if (entry.lastEditDate?.toDate) return entry.lastEditDate.toDate();
                                    if (entry.lastEditDate) {
                                        const date = new Date(entry.lastEditDate);
                                        return !isNaN(date.getTime()) ? date : undefined;
                                    }
                                    return undefined;
                                } catch {
                                    return undefined;
                                }
                            })(),
                            lastPriceUpdate: (() => {
                                try {
                                    if (!entry.lastPriceUpdate) return undefined;
                                    if (entry.lastPriceUpdate?.toDate) return entry.lastPriceUpdate.toDate();
                                    if (entry.lastPriceUpdate) {
                                        const date = new Date(entry.lastPriceUpdate);
                                        return !isNaN(date.getTime()) ? date : undefined;
                                    }
                                    return undefined;
                                } catch {
                                    return undefined;
                                }
                            })(),
                        })),
                    };
                });
            
            const totalCostEntries = ordersList.reduce((sum, order) => sum + (order.costEntries?.length || 0), 0);
            console.log(`📊 ${ordersList.length} ordens carregadas com ${totalCostEntries} lançamentos de custo`);
            
            // Log especial para debug da OS 724/25
            const order724 = ordersList.find(order => order.internalOS === '724/25');
            if (order724) {
                console.log(`🔍 ===== OS 724/25 DETECTADA =====`);
                console.log(`🆔 ID: ${order724.id}`);
                console.log(`📋 Número: ${order724.internalOS}`);
                console.log(`👤 Cliente: ${order724.customerName}`);
                console.log(`💼 Lançamentos: ${(order724.costEntries || []).length}`);
                if (order724.costEntries && order724.costEntries.length > 0) {
                    order724.costEntries.forEach((entry: any, index: number) => {
                        console.log(`  📝 Lançamento ${index + 1}: ${entry.description} - R$ ${entry.totalCost} (Req ID: ${entry.requisitionId || 'N/A'})`);
                    });
                }
                console.log(`🔍 ===== FIM DEBUG OS 724/25 =====`);
            } else {
                console.log(`⚠️ OS 724/25 NÃO ENCONTRADA nas ${ordersList.length} ordens carregadas`);
                // Listar todas as OS para debug
                console.log('📋 Ordens carregadas:');
                ordersList.forEach(order => {
                    console.log(`  - ${order.internalOS} (ID: ${order.id}) - ${order.customerName}`);
                });
            }
            
            setOrders(ordersList);
            setLastUpdateTime(new Date());

        } catch (error) {
            console.error("Error fetching orders:", error);
            toast({ variant: "destructive", title: "Erro ao buscar Ordens de Serviço" });
        } finally {
            setIsLoadingOrders(false);
        }
    }, [user, toast]);


    useEffect(() => {
        if (!authLoading && user) {
            fetchRequisitions();
            fetchSuppliers();
            fetchOrders();
        }
    }, [user, authLoading, fetchRequisitions, fetchSuppliers, fetchOrders]);

    // Algumas consultas/versões antigas não retornavam OS concluídas. Se a requisição
    // possui um ID válido, carregamos esse documento diretamente para preservar o vínculo.
    useEffect(() => {
        if (isLoadingRequisitions || isLoadingOrders || !requisitions.length) return;

        const loadedIds = new Set(orders.map(order => order.id));
        const missingOrderIds = [...new Set(
            requisitions
                .map(requisition => requisition.orderId)
                .filter((orderId): orderId is string => Boolean(orderId) && !loadedIds.has(orderId as string))
        )];

        if (!missingOrderIds.length) return;
        let cancelled = false;

        const hydrateLinkedOrders = async () => {
            const linkedOrders = await Promise.all(missingOrderIds.map(async orderId => {
                try {
                    const orderSnapshot = await getDoc(doc(db, "companies", "mecald", "orders", orderId));
                    if (!orderSnapshot.exists()) return null;

                    const data = orderSnapshot.data();
                    return {
                        id: orderSnapshot.id,
                        internalOS: data.internalOS || data.orderNumber || data.osNumber || 'N/A',
                        customerName: data.customer?.name || data.customerName || 'Cliente Desconhecido',
                        customerId: data.customer?.id || data.customerId || undefined,
                        costEntries: data.costEntries || [],
                    } as OrderInfo;
                } catch (error) {
                    console.error(`Erro ao carregar diretamente a OS ${orderId}:`, error);
                    return null;
                }
            }));

            if (cancelled) return;
            const validOrders = linkedOrders.filter((order): order is OrderInfo => Boolean(order));
            if (!validOrders.length) return;

            setOrders(currentOrders => {
                const merged = new Map(currentOrders.map(order => [order.id, order]));
                validOrders.forEach(order => merged.set(order.id, order));
                return [...merged.values()];
            });
        };

        hydrateLinkedOrders();
        return () => { cancelled = true; };
    }, [requisitions, orders, isLoadingRequisitions, isLoadingOrders]);

    // Sincronizar requisições com OS automaticamente
    useEffect(() => {
        const syncRequisitionsWithOrders = async () => {
            if (!requisitions.length || !orders.length || isLoadingRequisitions || isLoadingOrders) return;
            
            console.log('🔄 ===== INICIANDO VERIFICAÇÃO DE SINCRONIZAÇÃO =====');
            console.log(`📊 Total de requisições: ${requisitions.length}`);
            console.log(`📊 Total de ordens: ${orders.length}`);
            
            let hasChanges = false;
            
            for (const req of requisitions) {
                const hasOrderLink = Boolean(req.orderId || req.orderNumber || req.internalOS);
                if (hasOrderLink && req.totalValue && req.totalValue > 0) {
                    console.log(`🔍 ===== VERIFICANDO REQUISIÇÃO ${req.requisitionNumber} =====`);
                    console.log(`💰 Valor: R$ ${req.totalValue} | Progresso: ${req.progress}% | OS ID: ${req.orderId}`);
                    
                    const order = resolveLinkedOrder(req);
                    if (order) {
                        // Migração automática: consolida ID atual e número da OS
                        // nas requisições antigas assim que o vínculo é reconhecido.
                        if (req.orderId !== order.id || req.orderNumber !== order.internalOS || req.internalOS !== order.internalOS) {
                            await updateDoc(doc(db, "companies", "mecald", "materialRequisitions", req.id), {
                                orderId: order.id,
                                orderNumber: order.internalOS,
                                internalOS: order.internalOS,
                            });
                            req.orderId = order.id;
                            req.orderNumber = order.internalOS;
                            req.internalOS = order.internalOS;
                            hasChanges = true;
                        }
                        console.log(`📋 OS encontrada: ${order.internalOS} - ${order.customerName}`);
                        console.log(`💼 Lançamentos existentes na OS: ${(order.costEntries || []).length}`);
                        
                        // Debug especial para requisição 00008
                        if (req.requisitionNumber === '00008') {
                            console.log(`🔍 ===== MAPEAMENTO REQUISIÇÃO 00008 =====`);
                            console.log(`🔗 Requisição 00008 está vinculada ao ID: ${req.orderId}`);
                            console.log(`📋 Este ID corresponde à OS: ${order.internalOS}`);
                            console.log(`🎯 Esperado: OS 724/25`);
                            console.log(`✅ Match: ${order.internalOS === '724/25' ? 'SIM' : 'NÃO - PROBLEMA!'}`);
                            if (order.internalOS !== '724/25') {
                                console.error(`❌ ERRO: Requisição 00008 deveria estar vinculada à OS 724/25, mas está vinculada à OS ${order.internalOS}`);
                            }
                            console.log(`🔍 ===== FIM MAPEAMENTO 00008 =====`);
                        }
                        
                        const existingReqCost = order.costEntries?.find((entry: any) => 
                            entry.requisitionId === req.id
                        );
                        
                        if (existingReqCost) {
                            console.log(`🔍 Lançamento existente encontrado: R$ ${existingReqCost.totalCost} | Pendente: ${existingReqCost.isPending}`);
                        } else {
                            console.log(`⚠️ NENHUM lançamento encontrado para esta requisição!`);
                        }
                        
                        // Se não existe lançamento OU o lançamento existente tem valor diferente
                        const needsUpdate = !existingReqCost || 
                                          (existingReqCost.totalCost !== req.totalValue) ||
                                          existingReqCost.isPending;
                        
                        if (needsUpdate) {
                            console.log(`🚀 EXECUTANDO SINCRONIZAÇÃO: Requisição ${req.requisitionNumber} -> OS ${req.orderId}`);
                            try {
                                await updateOrderCostFromRequisition(order.id, req.id, req.items);
                                hasChanges = true;
                                console.log(`✅ Sincronização da requisição ${req.requisitionNumber} CONCLUÍDA`);
                            } catch (error) {
                                console.error(`❌ ERRO na sincronização da requisição ${req.requisitionNumber}:`, error);
                            }
                        } else {
                            console.log(`✅ Requisição ${req.requisitionNumber} já está sincronizada corretamente`);
                        }
                    } else {
                        console.error(`❌ OS ${req.orderId} NÃO ENCONTRADA para requisição ${req.requisitionNumber}!`);
                    }
                } else if (hasOrderLink && (!req.totalValue || req.totalValue === 0)) {
                    // Requisição sem valores ainda - criar lançamento pendente
                    const order = resolveLinkedOrder(req);
                    if (order) {
                        const existingReqCost = order.costEntries?.find((entry: any) => 
                            entry.requisitionId === req.id
                        );
                        
                        if (!existingReqCost) {
                            console.log(`📝 Criando lançamento pendente para requisição ${req.requisitionNumber} na OS ${req.orderId}`);
                            await createInitialOrderCostFromRequisition(order.id, req.id);
                            hasChanges = true;
                        }
                    }
                }
            }
            
            // Re-fetch orders se houve mudanças
            console.log('🔄 ===== FINALIZANDO VERIFICAÇÃO DE SINCRONIZAÇÃO =====');
            if (hasChanges) {
                console.log('📊 ✅ MUDANÇAS DETECTADAS - Atualizando interface...');
                await fetchOrders();
                console.log('🔄 Interface atualizada após sincronização');
            } else {
                console.log('✅ Nenhuma sincronização necessária - todos os dados estão atualizados');
            }
            console.log('🔄 ===== VERIFICAÇÃO DE SINCRONIZAÇÃO CONCLUÍDA =====');
        };
        
        // Sincronizar quando dados mudam - aguardar um pouco para garantir que tudo foi carregado
        const timeoutId = setTimeout(syncRequisitionsWithOrders, 1000);
        return () => clearTimeout(timeoutId);
    }, [requisitions, orders, isLoadingRequisitions, isLoadingOrders, resolveLinkedOrder, fetchOrders]);

    // Função para forçar refresh dos dados de custos
    const forceRefreshCosts = useCallback(async () => {
        console.log('🔄 Refresh forçado dos dados...');
        setIsLoadingOrders(true);
        setIsLoadingRequisitions(true);
        
        // Recarregar tanto requisições quanto ordens
        await Promise.all([
            fetchRequisitions(),
            fetchOrders()
        ]);
        
        console.log('✅ Refresh completo - dados serão sincronizados automaticamente');
    }, [fetchOrders, fetchRequisitions]);

    // Auto-atualizar dados quando mudar para aba de custos
    useEffect(() => {
        if (activeTab === "costEntry") {
            console.log('🔄 Mudou para aba de custos, atualizando dados...');
            forceRefreshCosts();
        }
    }, [activeTab, forceRefreshCosts]);
    


    const handleOpenForm = (item: RequisitionItem, requisitionId: string) => {
        try {
            const selectedItemData = { ...item, requisitionId };
            setSelectedItem(selectedItemData);
            
            // Resetar formulário com dados existentes - com proteção para datas
            const formData = {
                supplierName: item.supplierName || "",
                invoiceNumber: item.invoiceNumber || "",
                invoiceItemValue: item.invoiceItemValue || undefined,
                certificateNumber: item.certificateNumber || "",
                storageLocation: item.storageLocation || "",
                deliveryReceiptDate: (() => {
                    try {
                        if (!item.deliveryReceiptDate) return null;
                        const date = item.deliveryReceiptDate;
                        return date && !isNaN(date.getTime()) ? date : null;
                    } catch {
                        console.warn("Data de entrega inválida no item:", item.deliveryReceiptDate);
                        return null;
                    }
                })(),
                inspectionStatus: item.inspectionStatus || "Pendente",
                weight: item.weight || undefined,
                weightUnit: item.weightUnit || "kg",
            };
            
            itemForm.reset(formData);
            setIsFormOpen(true);
        } catch (error) {
            console.error("Erro ao abrir formulário de item:", error);
            toast({ 
                variant: "destructive",
                title: "Erro", 
                description: "Não foi possível abrir o formulário. Tente novamente." 
            });
        }
    };

    const onItemSubmit = async (values: ItemUpdateData) => {
        if (!selectedItem) return;

        try {
            const reqRef = doc(db, "companies", "mecald", "materialRequisitions", selectedItem.requisitionId);
            const reqSnap = await getDoc(reqRef);
            if (!reqSnap.exists()) {
                throw new Error("Requisição não encontrada.");
            }

            const reqData = reqSnap.data();
            const items = reqData.items || [];
            const itemIndex = items.findIndex((i: any) => i.id === selectedItem.id);

            if (itemIndex === -1) {
                throw new Error("Item não encontrado na requisição.");
            }

            const updatedItem = {
                ...items[itemIndex],
                ...values,
                deliveryReceiptDate: values.deliveryReceiptDate ? Timestamp.fromDate(values.deliveryReceiptDate) : null,
            };

            if (values.inspectionStatus === "Aprovado" || values.inspectionStatus === "Aprovado com ressalvas") {
                updatedItem.status = "Inspecionado e Aprovado";
            } else if (values.inspectionStatus === "Rejeitado") {
                updatedItem.status = "Inspecionado e Rejeitado";
            } else if (values.deliveryReceiptDate) {
                updatedItem.status = "Recebido (Aguardando Inspeção)";
            }

            const updatedItems = [...items];
            updatedItems[itemIndex] = updatedItem;

            // Calcular valor total da requisição
            const totalValue = updatedItems.reduce((sum, item) => sum + (item.invoiceItemValue || 0), 0);
            const itemsWithPrice = updatedItems.filter(item => item.invoiceItemValue && item.invoiceItemValue > 0).length;
            const progress = updatedItems.length > 0 ? Math.round((itemsWithPrice / updatedItems.length) * 100) : 0;

            console.log(`💰 Valor total calculado da requisição: R$ ${totalValue}`);
            console.log(`📊 Progresso de precificação: ${progress}% (${itemsWithPrice}/${updatedItems.length} itens)`);

            // Atualizar requisição com os novos valores e totais
            await updateDoc(reqRef, { 
                items: updatedItems,
                totalValue: totalValue,
                itemsWithPrice: itemsWithPrice,
                progress: progress,
                lastPriceUpdate: Timestamp.now()
            });
            console.log('✅ Requisição atualizada no banco de dados com valores totais');

            // Atualizar custos da OS automaticamente se a requisição estiver vinculada a uma OS
            let costUpdateSuccess = false;
            const requisitionForLink = requisitions.find(req => req.id === selectedItem.requisitionId);
            const resolvedOrder = requisitionForLink ? resolveLinkedOrder(requisitionForLink) : undefined;
            const resolvedOrderId = resolvedOrder?.id || reqData.orderId;

            if (resolvedOrderId) {
                console.log('🔗 Requisição vinculada à OS, atualizando custos...');
                try {
                    await updateOrderCostFromRequisition(resolvedOrderId, selectedItem.requisitionId, updatedItems);
                    console.log('✅ Custos da OS atualizados com sucesso');
                    costUpdateSuccess = true;
                } catch (costError) {
                    console.error('❌ Erro ao atualizar custos da OS:', costError);
                    // Mesmo se houver erro nos custos, mostra que a requisição foi salva
                }
            } else {
                console.log('⚠️ Requisição não está vinculada a uma OS');
            }

            // Toast mais informativo baseado nos valores
            if (resolvedOrderId) {
                const hasValues = values.invoiceItemValue && values.invoiceItemValue > 0;
                if (hasValues && costUpdateSuccess) {
                    toast({ 
                        title: "✅ Item precificado com sucesso!", 
                        description: `Valor ${values.invoiceItemValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} foi adicionado aos custos da OS.`,
                        duration: 5000
                    });
                } else if (hasValues && !costUpdateSuccess) {
                    toast({ 
                        title: "⚠️ Item atualizado com aviso!", 
                        description: "Dados salvos, mas houve problema ao atualizar custos da OS. Tente recarregar a página." 
                    });
                } else {
                    toast({ 
                        title: "📝 Item atualizado!", 
                        description: "Dados salvos. Adicione o valor da nota fiscal para atualizar os custos da OS." 
                    });
                }
            } else {
                toast({ 
                    title: "Item atualizado com sucesso!", 
                    description: "Requisição não vinculada a uma OS." 
                });
            }

            // CORREÇÃO: NÃO fechar o modal nem mudar de aba automaticamente
            // Deixar o usuário decidir quando sair da tela de precificação
            // setIsFormOpen(false); // REMOVIDO
            
            // Forçar refresh de dados de forma mais robusta
            console.log('🔄 Atualizando interface após edição...');
            
            // Aguardar um pouco para o Firestore processar as mudanças
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Atualizar dados sequencialmente para evitar conflitos
            await fetchRequisitions();
            await fetchOrders();
            
            console.log('✅ Interface atualizada');
            
            // MELHORIA: Mostrar toast com opção de continuar precificando ou voltar
            toast({
                title: "🎉 Item salvo com sucesso!",
                description: "Você pode continuar precificando outros itens ou fechar esta janela quando terminar.",
                duration: 7000
            });
            
        } catch (error: any) {
            console.error("Error updating item:", error);
            toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
        }
    };

    // Função para atualizar custos da OS baseado na requisição
    const updateOrderCostFromRequisition = async (orderId, requisitionId, items) => {
        console.log('🔄 ===== INICIANDO ATUALIZAÇÃO DE CUSTOS =====');
        console.log('🔄 Dados de entrada:', { orderId, requisitionId, itemsCount: items.length });
        
        try {
            // Buscar dados da requisição
            const reqRef = doc(db, "companies", "mecald", "materialRequisitions", requisitionId);
            const reqSnap = await getDoc(reqRef);
            
            if (!reqSnap.exists()) {
                console.log('❌ Requisição não encontrada:', requisitionId);
                return;
            }
            
            const reqData = reqSnap.data();
            console.log('📋 Requisição encontrada:', {
                id: requisitionId,
                number: reqData.requisitionNumber,
                status: reqData.status,
                itemsCount: (reqData.items || []).length,
                totalValue: reqData.totalValue,
                progress: reqData.progress,
                lastUpdate: reqData.lastPriceUpdate?.toDate ? reqData.lastPriceUpdate.toDate() : null
            });
            
            const orderRef = doc(db, "companies", "mecald", "orders", orderId);
            const orderSnap = await getDoc(orderRef);
            
            if (!orderSnap.exists()) {
                console.log('❌ OS não encontrada:', orderId);
                return;
            }
            
            const orderData = orderSnap.data();
            const existingCostEntries = orderData.costEntries || [];
                    console.log('📊 Custos existentes na OS:', existingCostEntries.length);
        
        // Log detalhado dos lançamentos existentes
        existingCostEntries.forEach((entry, index) => {
            console.log(`📝 Lançamento ${index}: ID=${entry.id}, ReqID=${entry.requisitionId}, Descrição="${entry.description}"`);
        });
        
        // Remover lançamentos antigos desta requisição
        const oldEntriesForThisReq = existingCostEntries.filter((entry) => 
            entry.requisitionId === requisitionId
        );
        console.log(`🔍 Encontrados ${oldEntriesForThisReq.length} lançamentos antigos da requisição ${requisitionId}:`, oldEntriesForThisReq.map(e => e.id));
        
        const filteredCostEntries = existingCostEntries.filter((entry) => 
            entry.requisitionId !== requisitionId
        );
        console.log('🗑️ Removendo custos antigos da requisição, restaram:', filteredCostEntries.length);
        
        // Usar valores já calculados e salvos na requisição
        const requisitionTotal = reqData.totalValue || 0;
        const itemsWithValues = reqData.itemsWithPrice || 0;
        const totalItems = items.length;
        const progress = reqData.progress || 0;
        
        console.log('💵 Valor total da requisição (salvo):', requisitionTotal);
        console.log(`📈 Progresso salvo: ${progress}% (${itemsWithValues}/${totalItems} itens precificados)`);
        
        // Criar descrição dinâmica baseada no progresso
        let description = `Materiais - Requisição ${reqData.requisitionNumber || 'N/A'}`;
        
        if (itemsWithValues === 0) {
            description += ` (Aguardando precificação)`;
        } else if (itemsWithValues < totalItems) {
            description += ` (${itemsWithValues}/${totalItems} itens precificados)`;
        } else {
            description += ` (Totalmente precificada)`;
        }
        
        // Criar novo lançamento consolidado da requisição - ANTES da limpeza
        const requisitionCostEntry = {
            id: `req-${requisitionId}-${Date.now()}`,
            description: description,
            quantity: totalItems,
            unitCost: requisitionTotal > 0 ? requisitionTotal / totalItems : 0,
            totalCost: requisitionTotal,
            entryDate: Timestamp.now(),
            enteredBy: 'Sistema (Auto - Recebimento)',
            requisitionId: requisitionId,
            isFromRequisition: true,
            isPending: requisitionTotal === 0,
            itemsWithValues: itemsWithValues,
            totalItems: totalItems,
            completionPercentage: progress,
            lastPriceUpdate: reqData.lastPriceUpdate || null, // Evitar undefined
            sourceType: 'requisition_total',
            items: items.map(item => ({
                description: item.description || '',
                quantity: item.quantityRequested || 0,
                value: item.invoiceItemValue || 0,
                weight: item.weight || null, // null ao invés de undefined
                weightUnit: item.weightUnit || 'kg',
                hasPricing: !!(item.invoiceItemValue && item.invoiceItemValue > 0)
            }))
        };
        
        // LIMPAR DADOS antes de salvar no Firestore
        const cleanedCostEntry = cleanFirestoreData(requisitionCostEntry);
        
        console.log('💾 Novo lançamento de custo (antes da limpeza):', requisitionCostEntry);
        console.log('🧹 Novo lançamento de custo (após limpeza):', cleanedCostEntry);
        
        // Verificar se ainda há valores undefined
        const hasUndefined = JSON.stringify(cleanedCostEntry).includes('undefined');
        if (hasUndefined) {
            console.error('❌ AINDA HÁ VALORES UNDEFINED após limpeza!');
            console.error('Objeto problemático:', cleanedCostEntry);
            throw new Error('Dados ainda contêm valores undefined após limpeza');
        }
        
        // Primeiro, vamos tentar remover os lançamentos antigos usando arrayRemove
        if (oldEntriesForThisReq.length > 0) {
            console.log('🗑️ Removendo lançamentos antigos usando arrayRemove...');
            
            // Remover lançamentos antigos um por um
            for (const oldEntry of oldEntriesForThisReq) {
                console.log(`🗑️ Removendo lançamento: ${oldEntry.id}`);
                // Limpar também o objeto a ser removido
                const cleanedOldEntry = cleanFirestoreData(oldEntry);
                await updateDoc(orderRef, {
                    costEntries: arrayRemove(cleanedOldEntry)
                });
            }
            
            console.log('✅ Lançamentos antigos removidos');
        }
        
        // Adicionar o novo lançamento
        console.log('📝 Adicionando novo lançamento...');
        await updateDoc(orderRef, {
            costEntries: arrayUnion(cleanedCostEntry)
        });
        console.log('✅ Novo lançamento adicionado');
        
        console.log(`✅ Custo da OS atualizado com sucesso: Requisição ${reqData.requisitionNumber} = R$ ${requisitionTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
        console.log('🔄 ===== ATUALIZAÇÃO DE CUSTOS CONCLUÍDA =====');
        
    } catch (error) {
        console.error("❌ ===== ERRO NA ATUALIZAÇÃO DE CUSTOS =====");
        console.error("❌ Error updating order costs:", error);
        console.error("❌ Detalhes:", { orderId, requisitionId, itemsCount: items.length });
        throw error; // Re-throw para que possa ser tratado no onItemSubmit
    }
    };

    // Função para criar lançamento inicial quando uma requisição é vinculada a uma OS
    const createInitialOrderCostFromRequisition = async (orderId, requisitionId) => {
        try {
            const reqRef = doc(db, "companies", "mecald", "materialRequisitions", requisitionId);
            const reqSnap = await getDoc(reqRef);
            
            if (!reqSnap.exists()) return;
            
            const reqData = reqSnap.data();
            const items = reqData.items || [];
            
            // Criar lançamento inicial (mesmo sem valores)
            const orderRef = doc(db, "companies", "mecald", "orders", orderId);
            const initialCostEntry = {
                id: `req-${requisitionId}-initial`,
                description: `Materiais - Requisição ${reqData.requisitionNumber || 'N/A'} (Aguardando precificação)`,
                quantity: items.length,
                unitCost: 0,
                totalCost: 0,
                entryDate: Timestamp.now(),
                enteredBy: 'Sistema (Requisição)',
                requisitionId: requisitionId,
                isFromRequisition: true,
                isPending: true,
                items: items.map((item) => ({
                    description: item.description || '',
                    quantity: item.quantityRequested || 0,
                    value: 0,
                    weight: item.weight || null, // null ao invés de undefined
                    weightUnit: item.weightUnit || 'kg'
                }))
            };
            
            // Limpar dados antes de salvar
            const cleanedEntry = cleanFirestoreData(initialCostEntry);
            
            await updateDoc(orderRef, {
                costEntries: arrayUnion(cleanedEntry)
            });
            
        } catch (error) {
            console.error("Error creating initial order cost:", error);
        }
    };
    
    const onSupplierSubmit = async (values: z.infer<typeof supplierSchema>) => {
        try {
            console.log("Dados do formulário:", values);
            
            // Função simples para limpar campos undefined/null/vazios
            const cleanObject = (obj: any): any => {
                if (obj === null || obj === undefined || obj === '') {
                    return null;
                }
                
                if (typeof obj === 'object' && !Array.isArray(obj)) {
                    const cleaned: any = {};
                    for (const [key, value] of Object.entries(obj)) {
                        if (value !== null && value !== undefined && value !== '') {
                            if (typeof value === 'object' && !Array.isArray(value)) {
                                const cleanedNested = cleanObject(value);
                                if (cleanedNested && Object.keys(cleanedNested).length > 0) {
                                    cleaned[key] = cleanedNested;
                                }
                            } else {
                                cleaned[key] = value;
                            }
                        }
                    }
                    return Object.keys(cleaned).length > 0 ? cleaned : null;
                }
                
                return obj;
            };

            // Preparar dados básicos obrigatórios
            const dataToSave: any = {
                razaoSocial: values.razaoSocial || values.nomeFantasia || 'Fornecedor',
                nomeFantasia: values.nomeFantasia || values.razaoSocial || 'Fornecedor',
                status: values.status || 'ativo',
                lastUpdate: Timestamp.now(),
            };
            
            // Adicionar campos opcionais apenas se tiverem valor
            if (values.supplierCode) dataToSave.supplierCode = values.supplierCode;
            if (values.cnpj) dataToSave.cnpj = values.cnpj;
            if (values.inscricaoEstadual) dataToSave.inscricaoEstadual = values.inscricaoEstadual;
            if (values.inscricaoMunicipal) dataToSave.inscricaoMunicipal = values.inscricaoMunicipal;
            if (values.segment) dataToSave.segment = values.segment;
            if (values.telefone) dataToSave.telefone = values.telefone;
            if (values.primaryEmail) dataToSave.primaryEmail = values.primaryEmail;
            if (values.salesContactName) dataToSave.salesContactName = values.salesContactName;
            
            // Tratar objetos aninhados
            if (values.address) {
                const cleanAddress = cleanObject(values.address);
                if (cleanAddress) dataToSave.address = cleanAddress;
            }
            
            if (values.bankInfo) {
                const cleanBankInfo = cleanObject(values.bankInfo);
                if (cleanBankInfo) dataToSave.bankInfo = cleanBankInfo;
            }
            
            if (values.commercialInfo) {
                const cleanCommercialInfo = cleanObject(values.commercialInfo);
                if (cleanCommercialInfo) dataToSave.commercialInfo = cleanCommercialInfo;
            }
            
            if (values.documentation) {
                const cleanDocumentation = cleanObject(values.documentation);
                if (cleanDocumentation) dataToSave.documentation = cleanDocumentation;
            }
    
            dataToSave.name = dataToSave.nomeFantasia;
            
            console.log("Dados finais para salvar:", dataToSave);
            
            if (selectedSupplier) { // UPDATE
                await setDoc(doc(db, "companies", "mecald", "suppliers", selectedSupplier.id), dataToSave, { merge: true });
                toast({ title: "Fornecedor atualizado com sucesso!" });
            } else { // CREATE
                const batch = writeBatch(db);
                const newSupplierRef = doc(collection(db, "companies", "mecald", "suppliers"));
                const suppliersSnapshot = await getDocs(collection(db, "companies", "mecald", "suppliers"));
                const highestCode = suppliersSnapshot.docs.reduce((max, s) => {
                    const codeNum = parseInt(s.data().supplierCode || "0", 10);
                    return !isNaN(codeNum) && codeNum > max ? codeNum : max;
                }, 0);
    
                dataToSave.id = newSupplierRef.id;
                dataToSave.supplierCode = (highestCode + 1).toString().padStart(5, '0');
                dataToSave.firstRegistrationDate = Timestamp.now();
                batch.set(newSupplierRef, dataToSave);
                await batch.commit();
                toast({ title: "Fornecedor criado com sucesso!" });
            }
    
            setIsSupplierFormOpen(false);
            setSelectedSupplier(null);
            supplierForm.reset(emptySupplierFormValues);
            await fetchSuppliers();
        } catch (error) {
            console.error("Erro detalhado ao salvar fornecedor:", error);
            toast({ 
                variant: "destructive", 
                title: "Erro ao salvar fornecedor", 
                description: `Detalhe: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
            });
        }
    };

    const onCostEntrySubmit = async (values: CostEntryData) => {
        if (!values.orderId) {
            toast({ variant: "destructive", title: "Erro", description: "Selecione uma OS." });
            return;
        }

        const orderRef = doc(db, "companies", "mecald", "orders", values.orderId);
        
        try {
            if (isEditingCost && editingCostEntry) {
                // EDITANDO LANÇAMENTO EXISTENTE
                const orderSnap = await getDoc(orderRef);
                if (!orderSnap.exists()) {
                    throw new Error("Ordem de serviço não encontrada.");
                }
                
                const orderData = orderSnap.data();
                const costEntries = orderData.costEntries || [];
                
                // Encontrar o lançamento antigo
                const oldEntryIndex = costEntries.findIndex((e: any) => e.id === editingCostEntry.id);
                if (oldEntryIndex === -1) {
                    throw new Error("Lançamento não encontrado.");
                }
                
                const oldEntry = costEntries[oldEntryIndex];
                
                // Criar o lançamento atualizado, preservando campos importantes
                const updatedEntry = {
                    ...oldEntry,
                    // Para lançamentos automáticos, preservar descrição, quantidade e custo originais
                    description: oldEntry.isFromRequisition ? oldEntry.description : values.description,
                    quantity: oldEntry.isFromRequisition ? oldEntry.quantity : values.quantity,
                    unitCost: oldEntry.isFromRequisition ? oldEntry.unitCost : values.unitCost,
                    totalCost: oldEntry.isFromRequisition ? oldEntry.totalCost : (values.quantity * values.unitCost),
                    purchaseOrderNumber: values.purchaseOrderNumber || oldEntry.purchaseOrderNumber,
                    lastEditDate: Timestamp.now(),
                    lastEditedBy: user?.email || 'Sistema',
                };
                
                // Remover o antigo e adicionar o novo
                await updateDoc(orderRef, {
                    costEntries: arrayRemove(oldEntry)
                });
                
                await updateDoc(orderRef, {
                    costEntries: arrayUnion(updatedEntry)
                });
                
                toast({ 
                    title: "Lançamento atualizado!", 
                    description: `As alterações foram salvas com sucesso.` 
                });
            } else {
                // CRIANDO NOVO LANÇAMENTO
                const costEntry = {
                    id: Date.now().toString(),
                    description: values.description,
                    quantity: values.quantity,
                    unitCost: values.unitCost,
                    totalCost: values.quantity * values.unitCost,
                    entryDate: Timestamp.now(),
                    enteredBy: user?.email || 'Sistema',
                    purchaseOrderNumber: values.purchaseOrderNumber,
                };
                
                await updateDoc(orderRef, {
                    costEntries: arrayUnion(costEntry)
                });
                
                toast({ 
                    title: "Custo lançado!", 
                    description: `O custo foi adicionado à OS selecionada.` 
                });
            }
            
            // Reset form and states
            costEntryForm.reset();
            setOsSearchTerm("");
            setSelectedInsumo("");
            setItemSpecification("");
            setIsEditingCost(false);
            setEditingCostEntry(null);
            await fetchOrders();
            
        } catch (error: any) {
            console.error("Error saving cost entry:", error);
            toast({ 
                variant: "destructive", 
                title: "Erro ao salvar", 
                description: error.message 
            });
        }
    };

    const handleAddSupplierClick = () => {
        setSelectedSupplier(null);
        supplierForm.reset(emptySupplierFormValues);
        setIsSupplierFormOpen(true);
    };

    const handleEditSupplierClick = (supplier: Supplier) => {
        const formData = {
            ...emptySupplierFormValues,
            ...supplier,
            address: { ...emptySupplierFormValues.address, ...(supplier.address || {}) },
            bankInfo: { ...emptySupplierFormValues.bankInfo, ...(supplier.bankInfo || {}) },
            commercialInfo: { ...emptySupplierFormValues.commercialInfo, ...(supplier.commercialInfo || {}) },
            documentation: { ...emptySupplierFormValues.documentation, ...(supplier.documentation || {}) },
        };
        setSelectedSupplier(formData);
        supplierForm.reset(formData);
        setIsSupplierFormOpen(true);
    };

    const handleDeleteSupplierClick = (supplier: Supplier) => {
        setSupplierToDelete(supplier);
        setIsDeleteAlertOpen(true);
    };

    const handleConfirmDeleteSupplier = async () => {
        if (!supplierToDelete?.id) return;
        try {
            await deleteDoc(doc(db, "companies", "mecald", "suppliers", supplierToDelete.id));
            toast({ title: "Fornecedor removido com sucesso!" });
        } catch (error) {
            console.error("Error deleting supplier:", error);
            toast({ variant: "destructive", title: "Erro ao remover fornecedor" });
        } finally {
            setIsDeleteAlertOpen(false);
            await fetchSuppliers();
        }
    };

    const handleDeleteCostEntryClick = (entry: any) => {
        setCostEntryToDelete(entry);
        setIsDeleteCostAlertOpen(true);
    };

    const handleEditCostEntryClick = (entry: any) => {
        try {
            setEditingCostEntry(entry);
            setIsEditingCost(true);
            
            // Preencher o formulário com os dados do lançamento
            costEntryForm.reset({
                orderId: entry.orderId || "",
                description: entry.description || "",
                quantity: entry.quantity || 0,
                unitCost: entry.unitCost || 0,
                purchaseOrderNumber: entry.purchaseOrderNumber || "",
            });
            
            // Ir para a aba de lançamento
            setActiveTab("costEntry");
            
            toast({ 
                title: "Modo de edição ativado", 
                description: "Modifique os campos desejados e salve as alterações." 
            });
        } catch (error) {
            console.error("Erro ao ativar modo de edição:", error);
            toast({ 
                variant: "destructive",
                title: "Erro", 
                description: "Não foi possível ativar o modo de edição. Tente novamente." 
            });
        }
    };

    const handleCancelEdit = () => {
        setIsEditingCost(false);
        setEditingCostEntry(null);
        costEntryForm.reset();
        setOsSearchTerm("");
        setSelectedInsumo("");
        setItemSpecification("");
    };

    // Função para gerar relatório de recebimento de materiais por OS
    const generateMaterialsReport = (order: OrderInfo) => {
        try {
            // Buscar todas as requisições vinculadas a esta OS
            const orderRequisitions = requisitions.filter(req => req.orderId === order.id);
            
            // Agrupar gastos por fornecedor
            const supplierCosts: { [key: string]: { 
                supplierName: string; 
                totalCost: number; 
                items: Array<{
                    description: string;
                    material: string;
                    quantity: number;
                    unitValue: number;
                    totalValue: number;
                    invoiceNumber?: string;
                    requisitionNumber: string;
                    weight?: number;
                    weightUnit?: string;
                    deliveryDate?: Date | null;
                    inspectionStatus?: string;
                }>
            }} = {};

            // Resumo por requisição
            const requisitionSummary = orderRequisitions.map(req => {
                const materialsWithValue = req.items.filter(item => 
                    item.invoiceItemValue && item.invoiceItemValue > 0 && item.supplierName
                );
                const totalReqCost = materialsWithValue.reduce((sum, item) => sum + (item.invoiceItemValue || 0), 0);
                
                return {
                    requisitionNumber: req.requisitionNumber,
                    date: req.date,
                    totalItems: req.items.length,
                    itemsWithValue: materialsWithValue.length,
                    totalCost: totalReqCost,
                    progress: req.items.length > 0 ? Math.round((materialsWithValue.length / req.items.length) * 100) : 0
                };
            });

            let totalOrderCost = 0;
            let totalItemsReceived = 0;
            let totalWeight = 0;

            orderRequisitions.forEach(req => {
                req.items.forEach(item => {
                    if (item.invoiceItemValue && item.invoiceItemValue > 0 && item.supplierName) {
                        const supplierKey = item.supplierName.toLowerCase();
                        
                        if (!supplierCosts[supplierKey]) {
                            supplierCosts[supplierKey] = {
                                supplierName: item.supplierName,
                                totalCost: 0,
                                items: []
                            };
                        }

                        supplierCosts[supplierKey].totalCost += item.invoiceItemValue;
                        supplierCosts[supplierKey].items.push({
                            description: item.description,
                            material: resolveMaterialDescription(item),
                            quantity: item.quantityRequested,
                            unitValue: item.invoiceItemValue / item.quantityRequested,
                            totalValue: item.invoiceItemValue,
                            invoiceNumber: item.invoiceNumber,
                            requisitionNumber: req.requisitionNumber,
                            weight: item.weight,
                            weightUnit: item.weightUnit,
                            deliveryDate: item.deliveryReceiptDate,
                            inspectionStatus: item.inspectionStatus
                        });

                        totalOrderCost += item.invoiceItemValue;
                        totalItemsReceived += item.quantityRequested;
                        
                        // Somar peso total (convertendo para kg)
                        if (item.weight) {
                            let weightInKg = item.weight;
                            if (item.weightUnit === 'g') weightInKg = item.weight / 1000;
                            else if (item.weightUnit === 't') weightInKg = item.weight * 1000;
                            totalWeight += weightInKg;
                        }
                    }
                });
            });

            // Ordenar fornecedores por maior gasto
            const sortedSuppliers = Object.values(supplierCosts).sort((a, b) => b.totalCost - a.totalCost);

            return {
                order,
                suppliers: sortedSuppliers,
                requisitionSummary,
                totalOrderCost,
                totalItemsReceived,
                totalWeight,
                totalSuppliers: sortedSuppliers.length,
                requisitionsCount: orderRequisitions.length,
                reportDate: new Date()
            };
        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar relatório",
                description: "Não foi possível processar os dados para o relatório."
            });
            return null;
        }
    };

    const handleGenerateReport = (order: OrderInfo) => {
        const reportData = generateMaterialsReport(order);
        if (reportData && reportData.suppliers.length > 0) {
            setSelectedOrderForReport(order);
            setIsReportModalOpen(true);
        } else {
            const orderReqs = requisitions.filter(req => req.orderId === order.id);
            const totalReqItems = orderReqs.reduce((sum, req) => sum + req.items.length, 0);
            
            if (totalReqItems > 0) {
                toast({
                    title: "📦 Relatório não disponível",
                    description: `Esta OS possui ${totalReqItems} itens em ${orderReqs.length} requisições, mas nenhum material foi recebido e precificado ainda.`
                });
            } else {
                toast({
                    title: "📋 Nenhuma requisição",
                    description: "Esta OS não possui requisições de materiais vinculadas."
                });
            }
        }
    };

    const handleConfirmDeleteCostEntry = async () => {
        if (!costEntryToDelete) return;
        const orderRef = doc(db, "companies", "mecald", "orders", costEntryToDelete.orderId);
        try {
            const orderSnap = await getDoc(orderRef);
            if (!orderSnap.exists()) {
                throw new Error("Ordem de serviço não encontrada.");
            }
            const orderData = orderSnap.data();
            const costEntries = orderData.costEntries || [];
            
            const entryToRemove = costEntries.find((e: any) => e.id === costEntryToDelete.id);

            if (!entryToRemove) {
                toast({ variant: "destructive", title: "Erro", description: "O lançamento de custo já foi removido ou não foi encontrado." });
                setIsDeleteCostAlertOpen(false);
                return;
            }

            await updateDoc(orderRef, {
                costEntries: arrayRemove(entryToRemove)
            });
            
            toast({ title: "Custo removido!", description: `O lançamento foi removido da OS.` });
            
            setIsDeleteCostAlertOpen(false);
            setCostEntryToDelete(null);
            await fetchOrders();
        } catch (error: any) {
            console.error("Error deleting cost entry:", error);
            toast({ variant: "destructive", title: "Erro ao remover custo", description: error.message });
        }
    };

    // Reparo manual e permanente para vínculos antigos ou IDs inválidos.
    const handleRelinkRequisition = async (requisition: Requisition) => {
        const selectedOrderId = selectedOrderByRequisition[requisition.id];
        const selectedOrder = orders.find(order => order.id === selectedOrderId);

        if (!selectedOrder) {
            toast({
                variant: "destructive",
                title: "Selecione uma OS",
                description: "Busque e selecione a OS correta antes de confirmar o vínculo.",
            });
            return;
        }

        setRelinkingRequisitionId(requisition.id);
        try {
            const requisitionRef = doc(db, "companies", "mecald", "materialRequisitions", requisition.id);
            await updateDoc(requisitionRef, {
                orderId: selectedOrder.id,
                orderNumber: selectedOrder.internalOS,
                internalOS: selectedOrder.internalOS,
                customer: {
                    id: selectedOrder.customerId || '',
                    name: selectedOrder.customerName,
                },
                linkUpdatedAt: Timestamp.now(),
                linkUpdatedBy: user?.email || 'Sistema',
            });

            // Se a requisição já possui valores, lança o custo imediatamente.
            if ((requisition.totalValue || 0) > 0) {
                await updateOrderCostFromRequisition(selectedOrder.id, requisition.id, requisition.items);
            } else {
                await createInitialOrderCostFromRequisition(selectedOrder.id, requisition.id);
            }

            toast({
                title: "OS vinculada com sucesso",
                description: `A requisição ${requisition.requisitionNumber} foi vinculada à OS ${selectedOrder.internalOS}.`,
            });

            setSelectedOrderByRequisition(current => {
                const next = { ...current };
                delete next[requisition.id];
                return next;
            });
            setRelinkSearchByRequisition(current => {
                const next = { ...current };
                delete next[requisition.id];
                return next;
            });

            await fetchRequisitions();
            await fetchOrders();
        } catch (error) {
            console.error('Erro ao corrigir vínculo da requisição:', error);
            toast({
                variant: "destructive",
                title: "Erro ao vincular OS",
                description: "Não foi possível salvar o vínculo. Tente novamente.",
            });
        } finally {
            setRelinkingRequisitionId(null);
        }
    };

    const getStatusVariant = (status?: string) => {
        if (!status) return "outline";
        const lowerStatus = status.toLowerCase();
        if (lowerStatus.includes("aprovado")) return "default";
        if (lowerStatus.includes("rejeitado")) return "destructive";
        if (lowerStatus.includes("recebido")) return "secondary";
        if (lowerStatus.includes("ativo")) return "default";
        if (lowerStatus.includes("inativo")) return "destructive";
        return "outline";
    };

    // Filtrar ordens baseado no termo de busca
    const filteredOrders = orders.filter(order => 
        order.internalOS.toLowerCase().includes(osSearchTerm.toLowerCase()) ||
        order.customerName.toLowerCase().includes(osSearchTerm.toLowerCase())
    );

    // Função para selecionar insumo da biblioteca
    const handleInsumoSelect = (insumo: string) => {
        setSelectedInsumo(insumo);
        updateItemDescription(insumo, itemSpecification);
    };

    // Função para atualizar descrição completa do item
    const updateItemDescription = (baseItem: string, specification: string) => {
        const fullDescription = specification ? `${baseItem} - ${specification}` : baseItem;
        costEntryForm.setValue('description', fullDescription);
    };

    // Função para atualizar especificação
    const handleSpecificationChange = (specification: string) => {
        setItemSpecification(specification);
        if (selectedInsumo) {
            updateItemDescription(selectedInsumo, specification);
        }
    };

    const exportRequisitionCostReport = (requisition: Requisition) => {
        const linkedOrder = resolveLinkedOrder(requisition);
        const osNumber = linkedOrder?.internalOS || requisition.orderNumber || requisition.internalOS || 'SEM-OS';
        const customerName = linkedOrder?.customerName || '';
        const { totalValue, totalWeightKg, averageCostPerKg } = requisitionFinancialSummary(requisition);
        const pricedItems = requisition.items.filter(item => (Number(item.invoiceItemValue) || 0) > 0).length;
        const itemsWithoutWeight = requisition.items.filter(item => (Number(item.invoiceItemValue) || 0) > 0 && weightToKg(item.weight, item.weightUnit) <= 0).length;
        const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const number = (value: number, digits = 2) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

        try {
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.text(`RELACAO DE CUSTOS DE MATERIA-PRIMA - OS ${osNumber}`, 14, 15);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.text(`Cliente: ${customerName || '-'}`, 14, 22);
            pdf.text(`Requisicao: ${requisition.requisitionNumber} | Data: ${safeFormatDate(requisition.date, 'dd/MM/yyyy')}`, 14, 27);

            autoTable(pdf, {
                startY: 33,
                head: [['Valor total pago', 'Peso total adquirido', 'Custo medio ponderado', 'Itens precificados']],
                body: [[currency(totalValue), `${number(totalWeightKg, 3)} kg`, `${currency(averageCostPerKg)}/kg`, `${pricedItems}/${requisition.items.length}`]],
                styles: { fontSize: 9, cellPadding: 3 },
                headStyles: { fillColor: [30, 64, 175], textColor: 255 },
            });

            let nextY = (pdf as any).lastAutoTable.finalY + 6;
            pdf.setFontSize(8);
            pdf.text(`Calculo: ${currency(totalValue)} / ${number(totalWeightKg, 3)} kg = ${currency(averageCostPerKg)}/kg`, 14, nextY);
            if (itemsWithoutWeight > 0) {
                nextY += 5;
                pdf.setTextColor(185, 28, 28);
                pdf.text(`ATENCAO: ${itemsWithoutWeight} item(ns) com valor pago nao possuem peso informado.`, 14, nextY);
                pdf.setTextColor(0, 0, 0);
            }

            autoTable(pdf, {
                startY: nextY + 5,
                head: [['Item', 'Material', 'Qtd.', 'Peso em kg', 'Valor pago', 'R$/kg', 'Fornecedor', 'NF', 'Entrada NF', 'Inspecao']],
                body: requisition.items.map(item => {
                    const value = Number(item.invoiceItemValue) || 0;
                    const weightKg = weightToKg(item.weight, item.weightUnit);
                    const itemCostPerKg = weightKg > 0 ? value / weightKg : 0;
                    return [
                        item.description,
                        resolveMaterialDescription(item),
                        number(Number(item.quantityRequested) || 0, 0),
                        weightKg > 0 ? number(weightKg, 3) : '-',
                        currency(value),
                        weightKg > 0 ? currency(itemCostPerKg) : '-',
                        item.supplierName || '-',
                        item.invoiceNumber || '-',
                        safeFormatDate(item.deliveryReceiptDate, 'dd/MM/yyyy', 'Nao informada'),
                        item.inspectionStatus || item.status || '-',
                    ];
                }),
                styles: { fontSize: 6.5, cellPadding: 1.7, overflow: 'linebreak', valign: 'middle' },
                headStyles: { fillColor: [51, 65, 85], textColor: 255 },
                columnStyles: {
                    0: { cellWidth: 46 },
                    1: { cellWidth: 27 },
                    2: { cellWidth: 12, halign: 'center' },
                    3: { cellWidth: 20, halign: 'right' },
                    4: { cellWidth: 24, halign: 'right' },
                    5: { cellWidth: 20, halign: 'right' },
                    6: { cellWidth: 30 },
                    7: { cellWidth: 18 },
                    8: { cellWidth: 22, halign: 'center' },
                    9: { cellWidth: 30 },
                },
                didDrawPage: () => {
                    const pageCount = pdf.getNumberOfPages();
                    pdf.setFontSize(7);
                    pdf.text(`Gerado em ${safeFormatDate(new Date(), 'dd/MM/yyyy HH:mm')} | Pagina ${pageCount}`, 14, 202);
                },
            });

            const safeOS = String(osNumber).replace(/[^a-zA-Z0-9_-]+/g, '-');
            const safeReq = String(requisition.requisitionNumber).replace(/[^a-zA-Z0-9_-]+/g, '-');
            pdf.save(`Custos_OS_${safeOS}_Req_${safeReq}.pdf`);
            toast({ title: 'PDF baixado', description: `Relatorio de custos da OS ${osNumber} gerado com sucesso.` });
        } catch (error) {
            console.error('Erro ao gerar PDF de custos:', error);
            toast({ variant: 'destructive', title: 'Erro ao gerar PDF', description: 'Nao foi possivel gerar o arquivo.' });
        }
    };



    // Proteção contra erros de renderização
    try {
        return (
        <>
          <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Centro de Custos</h1>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
                <TabsTrigger value="receipts">Recebimento de Materiais</TabsTrigger>
                <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
                <TabsTrigger value="costEntry">Lançamento de Custos</TabsTrigger>
            </TabsList>
            <TabsContent value="receipts">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                    <CardTitle>Recebimento de Materiais</CardTitle>
                    <CardDescription>
                      Gerencie o recebimento de materiais das requisições, adicione valores das notas fiscais e realize a inspeção de qualidade. 
                      <strong>Os valores totais de cada requisição serão automaticamente lançados como custos nas OS vinculadas.</strong>
                    </CardDescription>
                    </div>
                    <Button variant="outline" onClick={fetchRequisitions} disabled={isLoadingRequisitions}>
                      {isLoadingRequisitions ? 'Carregando...' : '🔄 Atualizar'}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 space-y-2">
                        <Label htmlFor="receipt-search">Buscar no recebimento de materiais</Label>
                        <div className="relative max-w-2xl">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="receipt-search"
                                value={receiptSearchTerm}
                                onChange={(event) => setReceiptSearchTerm(event.target.value)}
                                placeholder="Buscar por OS, requisição, cliente, item, fornecedor ou NF..."
                                className="pl-9"
                            />
                        </div>
                        {receiptSearchTerm && (
                            <p className="text-xs text-muted-foreground">
                                {filteredReceiptRequisitions.length} de {requisitions.length} requisições encontradas
                            </p>
                        )}
                    </div>
                    {isLoadingRequisitions ? (
                        <Skeleton className="h-64 w-full" />
                    ) : filteredReceiptRequisitions.length > 0 ? (
                        <Accordion type="single" collapsible className="w-full">
                            {filteredReceiptRequisitions.map((req) => (
                                <AccordionItem value={req.id} key={req.id}>
                                    <AccordionTrigger className="hover:bg-muted/50 px-4">
                                        {(() => {
                                            const totalValue = req.items.reduce((sum, item) => sum + (item.invoiceItemValue || 0), 0);
                                            const itemsWithPrice = req.items.filter(item => item.invoiceItemValue && item.invoiceItemValue > 0).length;
                                            const progress = req.items.length > 0 ? Math.round((itemsWithPrice / req.items.length) * 100) : 0;
                                            
                                            return (
                                                <div className="flex-1 text-left">
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-bold text-primary">Requisição Nº {req.requisitionNumber}</span>
                                                        <span className="text-muted-foreground text-sm">Data: {safeFormatDate(req.date, 'dd/MM/yyyy')}</span>
                                                        {totalValue > 0 && (
                                                            <Badge variant="default" className="bg-green-600 text-white">
                                                                💰 {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                                        <span>
                                                            {(req.orderId || req.orderNumber || req.internalOS) ? 
                                                                (() => {
                                                                    const order = resolveLinkedOrder(req);
                                                                    const savedNumber = req.orderNumber || req.internalOS;
                                                                    return order
                                                                        ? `OS: ${order.internalOS} - ${order.customerName}`
                                                                        : savedNumber ? `OS: ${savedNumber}` : 'OS não encontrada';
                                                                })() : 'Sem OS vinculada'
                                                            }
                                                        </span>
                                                        <span>•</span>
                                                        <span>{req.items.length} itens</span>
                                                        <span>•</span>
                                                        <span className={`font-medium ${progress === 100 ? 'text-green-600' : progress > 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                                            {progress === 100 ? '✅ Completo' : progress > 0 ? `📊 ${progress}% precificado` : '⏳ Aguardando preços'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </AccordionTrigger>
                                    <AccordionContent className="p-2">
                                        {(() => {
                                            // Calcular valores da requisição
                                            const totalValue = req.items.reduce((sum, item) => sum + (item.invoiceItemValue || 0), 0);
                                            const itemsWithPrice = req.items.filter(item => item.invoiceItemValue && item.invoiceItemValue > 0).length;
                                            const totalItems = req.items.length;
                                            const progress = totalItems > 0 ? Math.round((itemsWithPrice / totalItems) * 100) : 0;
                                            const { totalWeightKg, averageCostPerKg } = requisitionFinancialSummary(req);
                                            
                                            return (
                                                <div className="mb-6">
                                                    {/* Resumo da OS */}
                                                    <div className="mb-4 p-4 bg-muted/30 rounded-lg">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                            <div>
                                                                <span className="font-semibold text-muted-foreground">OS Vinculada:</span>
                                                                <p className="font-medium">
                                                                    {(req.orderId || req.orderNumber || req.internalOS) ? 
                                                                        (() => {
                                                                            const order = resolveLinkedOrder(req);
                                                                            const savedNumber = req.orderNumber || req.internalOS;
                                                                            return order
                                                                                ? `${order.internalOS} - ${order.customerName}`
                                                                                : savedNumber || 'OS não encontrada';
                                                                        })() : 'Nenhuma OS vinculada'
                                                                    }
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-muted-foreground">Total de Itens:</span>
                                                                <p className="font-medium">{req.items.length}</p>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-muted-foreground">Status Geral:</span>
                                                                <p><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Resumo Financeiro da Requisição */}
                                                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                                            <h4 className="font-semibold text-blue-900 flex items-center gap-2">
                                                                💰 Resumo Financeiro da Requisição
                                                            </h4>
                                                            <div className="flex items-center gap-2">
                                                                <Button type="button" size="sm" variant="outline" onClick={() => exportRequisitionCostReport(req)}>
                                                                    <Download className="mr-2 h-4 w-4" /> Baixar custos da OS
                                                                </Button>
                                                                <Badge variant={progress === 100 ? "default" : progress > 0 ? "secondary" : "outline"} className="text-xs">
                                                                    {progress === 100 ? "✅ Completo" : progress > 0 ? `${progress}% Precificado` : "⏳ Aguardando"}
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                            <div className="bg-white p-3 rounded border">
                                                                <span className="text-xs text-muted-foreground block">Valor Total</span>
                                                                <span className={`text-lg font-bold ${totalValue > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                                                    {totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                </span>
                                                            </div>
                                                            
                                                            <div className="bg-white p-3 rounded border">
                                                                <span className="text-xs text-muted-foreground block">Itens Precificados</span>
                                                                <span className="text-lg font-bold text-blue-600">
                                                                    {itemsWithPrice} / {totalItems}
                                                                </span>
                                                            </div>
                                                            
                                                            <div className="bg-white p-3 rounded border">
                                                                <span className="text-xs text-muted-foreground block">Progresso</span>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                                        <div 
                                                                            className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : progress > 0 ? 'bg-blue-500' : 'bg-gray-300'}`}
                                                                            style={{ width: `${progress}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-sm font-medium">{progress}%</span>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="bg-white p-3 rounded border">
                                                                <span className="text-xs text-muted-foreground block">Custo Médio da Matéria-Prima</span>
                                                                <span className="text-lg font-bold text-purple-600">
                                                                    {averageCostPerKg.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/kg
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground block mt-1">
                                                                    {totalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg adquiridos
                                                                </span>
                                                            </div>
                                                        </div>
                                                        
                                                        {(req.orderId || req.orderNumber || req.internalOS) && totalValue > 0 && (
                                                            <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded text-sm text-green-800">
                                                                ✅ <strong>Este valor será automaticamente lançado como custo na OS {
                                                                    (() => {
                                                                        const order = resolveLinkedOrder(req);
                                                                        return order?.internalOS || req.orderNumber || req.internalOS || req.orderId;
                                                                    })()
                                                                }</strong>
                                                            </div>
                                                        )}
                                                        
                                                        {(req.orderId || req.orderNumber || req.internalOS) && totalValue === 0 && (
                                                            <div className="mt-3 p-2 bg-orange-100 border border-orange-300 rounded text-sm text-orange-800">
                                                                ⏳ Adicione os valores dos itens para que sejam lançados automaticamente na OS {
                                                                    (() => {
                                                                        const order = resolveLinkedOrder(req);
                                                                        return order?.internalOS || req.orderNumber || req.internalOS || req.orderId;
                                                                    })()
                                                                }
                                                            </div>
                                                        )}
                                                        
                                                        {!resolveLinkedOrder(req) && (
                                                            <div className="mt-3 space-y-3 rounded border border-red-300 bg-red-100 p-3 text-sm text-red-800">
                                                                <div>
                                                                    ⚠️ <strong>Problema de vinculação:</strong> {(req.orderId || req.orderNumber || req.internalOS)
                                                                        ? `A OS vinculada (${req.orderNumber || req.internalOS || `ID: ${req.orderId}`}) não foi encontrada.`
                                                                        : 'Esta requisição não possui uma OS vinculada.'}
                                                                    Selecione abaixo a OS correta para reparar permanentemente o vínculo.
                                                                </div>
                                                                <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_auto]">
                                                                    <div className="relative">
                                                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                                        <Input
                                                                            value={relinkSearchByRequisition[req.id] || ''}
                                                                            onChange={(event) => setRelinkSearchByRequisition(current => ({
                                                                                ...current,
                                                                                [req.id]: event.target.value,
                                                                            }))}
                                                                            placeholder="Buscar número da OS ou cliente..."
                                                                            className="border-red-200 bg-white pl-9 text-foreground"
                                                                        />
                                                                    </div>
                                                                    <Select
                                                                        value={selectedOrderByRequisition[req.id] || ''}
                                                                        onValueChange={(orderId) => setSelectedOrderByRequisition(current => ({
                                                                            ...current,
                                                                            [req.id]: orderId,
                                                                        }))}
                                                                    >
                                                                        <SelectTrigger className="border-red-200 bg-white text-foreground">
                                                                            <SelectValue placeholder="Selecione a OS correta" />
                                                                        </SelectTrigger>
                                                                        <SelectContent className="max-h-72">
                                                                            {orders
                                                                                .filter(order => {
                                                                                    const query = (relinkSearchByRequisition[req.id] || '').trim().toLocaleLowerCase('pt-BR');
                                                                                    if (!query) return true;
                                                                                    return order.internalOS.toLocaleLowerCase('pt-BR').includes(query) ||
                                                                                        order.customerName.toLocaleLowerCase('pt-BR').includes(query);
                                                                                })
                                                                                .slice(0, 100)
                                                                                .map(order => (
                                                                                    <SelectItem key={order.id} value={order.id}>
                                                                                        OS {order.internalOS} — {order.customerName}
                                                                                    </SelectItem>
                                                                                ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <Button
                                                                        type="button"
                                                                        onClick={() => handleRelinkRequisition(req)}
                                                                        disabled={!selectedOrderByRequisition[req.id] || relinkingRequisitionId === req.id}
                                                                        className="whitespace-nowrap"
                                                                    >
                                                                        <Link2 className="mr-2 h-4 w-4" />
                                                                        {relinkingRequisitionId === req.id ? 'Vinculando...' : 'Vincular OS'}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead>Material</TableHead>
                                                    <TableHead>Qtd</TableHead>
                                                    <TableHead>Peso</TableHead>
                                                    <TableHead>Valor (R$)</TableHead>
                                                    <TableHead>Fornecedor</TableHead>
                                                    <TableHead>NF</TableHead>
                                                    <TableHead>Entrada da NF</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Ações</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {req.items.map(item => (
                                                    <TableRow key={item.id} className={item.invoiceItemValue && item.invoiceItemValue > 0 ? 'bg-green-50 border-l-4 border-green-400' : ''}>
                                                        <TableCell className="font-medium">
                                                            <div>
                                                                <span>{item.description}</span>
                                                                {item.invoiceItemValue && item.invoiceItemValue > 0 && (
                                                                    <div className="text-xs text-green-600 mt-1">✓ Precificado</div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm font-medium whitespace-nowrap">
                                                            {resolveMaterialDescription(item)}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge variant="outline" className="text-xs">
                                                                {item.quantityRequested}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            {item.weight ? (
                                                                <span className="font-medium text-green-600">
                                                                    {item.weight} {item.weightUnit || 'kg'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-orange-500 text-sm">
                                                                    ⚠️ Não informado
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {item.invoiceItemValue && item.invoiceItemValue > 0 ? (
                                                                <div className="text-green-600 font-bold">
                                                                    {item.invoiceItemValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    {item.weight && (
                                                                        <div className="text-xs text-gray-500 font-normal">
                                                                            {(item.invoiceItemValue / item.weight).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{'/' + (item.weightUnit || 'kg')}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400 text-sm">
                                                                    Não informado
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-sm">{item.supplierName || '-'}</TableCell>
                                                        <TableCell className="text-sm">{item.invoiceNumber || '-'}</TableCell>
                                                        <TableCell className="text-sm whitespace-nowrap">
                                                            {safeFormatDate(item.deliveryReceiptDate, 'dd/MM/yyyy', 'Não informada')}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <Badge variant={getStatusVariant(item.status)} className="text-xs block text-center">
                                                                    {item.status}
                                                                </Badge>
                                                                <Badge variant={getStatusVariant(item.inspectionStatus)} className="text-xs block text-center">
                                                                    {item.inspectionStatus}
                                                                </Badge>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="outline" size="sm" onClick={() => handleOpenForm(item, req.id)}>
                                                                <FilePen className="mr-2 h-4 w-4" />
                                                                {item.invoiceItemValue && item.invoiceItemValue > 0 ? 'Editar' : 'Precificar'}
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-64 border-dashed border-2 rounded-lg">
                            <PackageSearch className="h-12 w-12 mb-4" />
                            <h3 className="text-lg font-semibold">
                                {receiptSearchTerm ? 'Nenhum resultado para esta busca' : 'Nenhuma Requisição Encontrada'}
                            </h3>
                            <p className="text-sm">
                                {receiptSearchTerm
                                    ? 'Tente pesquisar por outro número de OS, requisição, item ou fornecedor.'
                                    : 'Quando novas requisições de material forem criadas, elas aparecerão aqui.'}
                            </p>
                        </div>
                    )}
                  </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="suppliers">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Fornecedores</CardTitle>
                            <CardDescription>Cadastre e gerencie os fornecedores da sua empresa.</CardDescription>
                        </div>
                        <Button onClick={handleAddSupplierClick}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Adicionar Fornecedor
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {isLoadingSuppliers ? (
                            <Skeleton className="h-64 w-full" />
                        ) : (
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código</TableHead>
                                        <TableHead>Nome Fantasia</TableHead>
                                        <TableHead>CNPJ</TableHead>
                                        <TableHead>Segmento</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {suppliers.length > 0 ? (
                                        suppliers.map((supplier) => (
                                            <TableRow key={supplier.id}>
                                                <TableCell className="font-mono">{supplier.supplierCode || 'N/A'}</TableCell>
                                                <TableCell className="font-medium">{supplier.nomeFantasia || supplier.razaoSocial}</TableCell>
                                                <TableCell>{supplier.cnpj}</TableCell>
                                                <TableCell>{supplier.segment || '-'}</TableCell>
                                                <TableCell><Badge variant={getStatusVariant(supplier.status)}>{supplier.status}</Badge></TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button variant="ghost" size="icon" onClick={() => handleEditSupplierClick(supplier)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteSupplierClick(supplier)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">Nenhum fornecedor cadastrado.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>
            <TabsContent value="costEntry" className="space-y-4">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>
                                    {isEditingCost ? "Editar Lançamento de Custo" : "Lançamento de Custo na OS"}
                                </CardTitle>
                                <CardDescription>
                                    {isEditingCost 
                                        ? `Editando: ${editingCostEntry?.description || 'Lançamento selecionado'}`
                                        : "Registre custos de itens de almoxarifado, consumíveis ou outros serviços diretamente em uma Ordem de Serviço."
                                    }
                                </CardDescription>
                            </div>
                            {isEditingCost && (
                                <Button variant="outline" onClick={handleCancelEdit}>
                                    Cancelar Edição
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isEditingCost && (
                            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center gap-2 text-blue-800">
                                    <Pencil className="h-4 w-4" />
                                    <span className="font-semibold">Modo de Edição Ativo</span>
                                </div>
                                <p className="text-sm text-blue-600 mt-1">
                                    Você está editando o lançamento: <strong>{editingCostEntry?.description}</strong>
                                </p>
                                <p className="text-xs text-blue-500 mt-2">
                                    💡 Dica: Para lançamentos automáticos de materiais, você pode editar campos como o número do pedido de compra, mas valores serão recalculados automaticamente com base no recebimento.
                                </p>
                            </div>
                        )}
                        <Form {...costEntryForm}>
                            <form onSubmit={costEntryForm.handleSubmit(onCostEntrySubmit)} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField control={costEntryForm.control} name="orderId" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Ordem de Serviço (OS)</FormLabel>
                                            <div className="space-y-2">
                                                <Input
                                                    placeholder="🔍 Buscar OS por número ou cliente..."
                                                    value={osSearchTerm}
                                                    onChange={(e) => setOsSearchTerm(e.target.value)}
                                                    className="mb-2"
                                                    disabled={isEditingCost}
                                                />
                                                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEditingCost}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma OS" /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        {isLoadingOrders ? <SelectItem value="loading" disabled>Carregando...</SelectItem> : 
                                                        filteredOrders.length > 0 ? (
                                                            filteredOrders.map(o => <SelectItem key={o.id} value={o.id}>OS: {o.internalOS} - {o.customerName}</SelectItem>)
                                                        ) : (
                                                            <SelectItem value="no-results" disabled>Nenhuma OS encontrada</SelectItem>
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                                {isEditingCost && (
                                                    <p className="text-xs text-muted-foreground">
                                                        A OS não pode ser alterada durante a edição
                                                    </p>
                                                )}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={costEntryForm.control} name="description" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Descrição do Item/Serviço</FormLabel>
                                            <div className="space-y-3">
                                                <FormControl>
                                                    <Input 
                                                        placeholder="Digite livremente ou selecione da biblioteca abaixo" 
                                                        {...field} 
                                                        value={field.value ?? ''} 
                                                        disabled={isEditingCost && editingCostEntry?.isFromRequisition}
                                                    />
                                                </FormControl>
                                                {isEditingCost && editingCostEntry?.isFromRequisition && (
                                                    <p className="text-xs text-orange-600">
                                                        ⚠️ Descrição baseada na requisição (não editável)
                                                    </p>
                                                )}
                                                
                                                {!(isEditingCost && editingCostEntry?.isFromRequisition) && (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-sm font-medium">📚 Biblioteca de Insumos</label>
                                                            <Select onValueChange={handleInsumoSelect}>
                                                                <SelectTrigger className="mt-1">
                                                                    <SelectValue placeholder="Selecione da biblioteca" />
                                                                </SelectTrigger>
                                                                <SelectContent className="max-h-60">
                                                                    {Object.entries(insumosBiblioteca).map(([categoria, itens]) => (
                                                                        <div key={categoria}>
                                                                            <div className="sticky top-0 bg-background p-2 border-b">
                                                                                <div className="text-xs font-medium text-muted-foreground">
                                                                                    {categoria === 'MATERIAS_PRIMAS' && '🧱 MATÉRIAS PRIMAS'}
                                                                                    {categoria === 'FERRAMENTAS_CORTE' && '⚙️ FERRAMENTAS DE CORTE'}
                                                                                    {categoria === 'CONSUMIVEIS_USINAGEM' && '🔧 CONSUMÍVEIS USINAGEM'}
                                                                                    {categoria === 'FIXACAO' && '🔩 FIXAÇÃO'}
                                                                                    {categoria === 'SOLDAGEM' && '🔥 SOLDAGEM'}
                                                                                    {categoria === 'ACABAMENTO_PINTURA' && '🎨 ACABAMENTO E PINTURA'}
                                                                                    {categoria === 'LUBRIFICACAO' && '🛢️ LUBRIFICAÇÃO'}
                                                                                    {categoria === 'DISPOSITIVOS_FIXACAO' && '🗜️ DISPOSITIVOS DE FIXAÇÃO'}
                                                                                    {categoria === 'ELEMENTOS_MAQUINAS' && '⚙️ ELEMENTOS DE MÁQUINAS'}
                                                                                    {categoria === 'INSTRUMENTOS_MEDICAO' && '📏 INSTRUMENTOS DE MEDIÇÃO'}
                                                                                </div>
                                                                            </div>
                                                                            {itens.map((insumo: string) => (
                                                                                <SelectItem key={insumo} value={insumo}>{insumo}</SelectItem>
                                                                            ))}
                                                                        </div>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        
                                                        <div>
                                                            <label className="text-sm font-medium">🔧 Especificação</label>
                                                            <Input
                                                                placeholder="Ex: diâmetro 20mm, espessura 3mm"
                                                                value={itemSpecification}
                                                                onChange={(e) => handleSpecificationChange(e.target.value)}
                                                                className="mt-1"
                                                            />
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                Adicione detalhes técnicos do item
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {selectedInsumo && (
                                                    <div className="p-3 bg-muted/30 rounded-lg border-l-4 border-primary">
                                                        <div className="text-sm">
                                                            <span className="font-medium text-muted-foreground">Item selecionado:</span>
                                                            <p className="font-medium mt-1">{selectedInsumo}</p>
                                                            {itemSpecification && (
                                                                <p className="text-muted-foreground text-xs mt-1">
                                                                    Especificação: {itemSpecification}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <FormField control={costEntryForm.control} name="quantity" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Quantidade</FormLabel>
                                            <FormControl>
                                                <Input 
                                                    type="number" 
                                                    step="0.01" 
                                                    placeholder="1" 
                                                    {...field} 
                                                    value={field.value ?? ''} 
                                                    disabled={isEditingCost && editingCostEntry?.isFromRequisition}
                                                />
                                            </FormControl>
                                            {isEditingCost && editingCostEntry?.isFromRequisition && (
                                                <p className="text-xs text-orange-600">
                                                    ⚠️ Quantidade baseada na requisição (não editável)
                                                </p>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={costEntryForm.control} name="unitCost" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Custo Unitário (R$)</FormLabel>
                                            <FormControl>
                                                <Input 
                                                    type="number" 
                                                    step="0.01" 
                                                    placeholder="0.00" 
                                                    {...field} 
                                                    value={field.value ?? ''} 
                                                    disabled={isEditingCost && editingCostEntry?.isFromRequisition}
                                                />
                                            </FormControl>
                                            {isEditingCost && editingCostEntry?.isFromRequisition && (
                                                <p className="text-xs text-orange-600">
                                                    ⚠️ Custo calculado automaticamente (não editável)
                                                </p>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={costEntryForm.control} name="purchaseOrderNumber" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nº Pedido de Compra MECALD</FormLabel>
                                            <FormControl><Input placeholder="Ex: PC-2024-001" {...field} value={field.value ?? ''} /></FormControl>
                                            <FormDescription>Número do pedido interno da MECALD (opcional)</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <div className="flex justify-end gap-3">
                                    {isEditingCost && (
                                        <Button type="button" variant="outline" onClick={handleCancelEdit}>
                                            Cancelar
                                        </Button>
                                    )}
                                    <Button type="submit" disabled={costEntryForm.formState.isSubmitting}>
                                        {costEntryForm.formState.isSubmitting 
                                            ? (isEditingCost ? 'Salvando...' : 'Lançando...') 
                                            : (isEditingCost ? 'Salvar Alterações' : 'Lançar Custo')
                                        }
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                        <CardTitle>Custos Organizados por OS</CardTitle>
                        <CardDescription>
                            Visualize e gerencie todos os lançamentos de custos organizados por Ordem de Serviço. 
                            <strong>Os custos de materiais são automaticamente calculados a partir dos valores das requisições no painel de recebimento.</strong>
                        </CardDescription>
                        </div>
                                                <div className="flex items-center gap-3">
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isLoadingOrders ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                                <span>
                                     {isLoadingOrders ? 'Carregando dados...' : (lastUpdateTime ? `Atualizado às ${lastUpdateTime.toLocaleTimeString('pt-BR')}` : 'Sem dados')}
                                 </span>
                            </div>
                            <Button variant="outline" onClick={forceRefreshCosts} disabled={isLoadingOrders}>
                                {isLoadingOrders ? 'Carregando...' : '🔄 Atualizar'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoadingOrders ? <Skeleton className="h-48 w-full" /> : 
                        (() => {
                            const ordersWithCosts = (osSearchTerm ? filteredOrders : orders)
                                .filter(order => order.costEntries && order.costEntries.length > 0);
                            return ordersWithCosts.length > 0 ? (
                                <div className="space-y-4">
                                    {osSearchTerm && (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>🔍 Buscando por: "{osSearchTerm}"</span>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => setOsSearchTerm("")}
                                                className="h-auto p-1 text-xs"
                                            >
                                                Limpar busca
                                            </Button>
                                        </div>
                                    )}
                                    
                                    {/* Aviso se há requisições com valores que ainda não apareceram nos custos */}
                                    {(() => {
                                        const reqsWithValues = requisitions.filter(req =>
                                            (req.orderId || req.orderNumber || req.internalOS) && req.totalValue && req.totalValue > 0
                                        );
                                        const osWithoutCosts = reqsWithValues.filter(req => {
                                            const order = resolveLinkedOrder(req);
                                            const hasReqCost = order?.costEntries?.find((entry: any) => 
                                                entry.requisitionId === req.id && entry.totalCost > 0
                                            );
                                            return !hasReqCost;
                                        });
                                        
                                        if (osWithoutCosts.length > 0) {
                                            return (
                                                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                                                    ⚠️ <span className="font-medium">{osWithoutCosts.length} requisições</span> com valores não apareceram nos custos. 
                                                    <span className="text-orange-700"> A sincronização será automática em alguns instantes.</span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                    <Accordion type="single" collapsible className="w-full">
                                        {ordersWithCosts
                                    .map(order => {
                                        const totalCost = order.costEntries?.reduce((sum, entry) => sum + (entry.totalCost || 0), 0) || 0;
                                        const entriesCount = order.costEntries?.length || 0;
                                        
                                        return (
                                            <AccordionItem value={order.id} key={order.id}>
                                                <AccordionTrigger className="hover:bg-muted/50 px-4">
                                                    <div className="flex-1 text-left">
                                                        <div className="flex items-center gap-4">
                                                            <span className="font-bold text-primary">OS: {order.internalOS}</span>
                                                            <span className="text-muted-foreground">{order.customerName}</span>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleGenerateReport(order);
                                                                }}
                                                                className="ml-auto text-xs h-7 px-2"
                                                                title={(() => {
                                                                    const orderReqs = requisitions.filter(req => req.orderId === order.id);
                                                                    const hasValues = orderReqs.some(req => 
                                                                        req.items.some(item => 
                                                                            item.invoiceItemValue && item.invoiceItemValue > 0 && item.supplierName
                                                                        )
                                                                    );
                                                                    const totalItems = orderReqs.reduce((sum, req) => sum + req.items.length, 0);
                                                                    
                                                                    if (!hasValues && totalItems > 0) {
                                                                        return `Esta OS possui ${totalItems} itens em requisições, mas ainda não foram precificados`;
                                                                    } else if (!hasValues) {
                                                                        return "Esta OS não possui requisições de materiais";
                                                                    }
                                                                    return "Gerar relatório de recebimento de materiais por fornecedor";
                                                                })()}
                                                                disabled={(() => {
                                                                    const orderReqs = requisitions.filter(req => req.orderId === order.id);
                                                                    const hasValues = orderReqs.some(req => 
                                                                        req.items.some(item => 
                                                                            item.invoiceItemValue && item.invoiceItemValue > 0 && item.supplierName
                                                                        )
                                                                    );
                                                                    return !hasValues;
                                                                })()}
                                                            >
                                                                📊 Relatório
                                                            </Button>
                                                        </div>
                                                        <div className="flex items-center gap-6 mt-1 text-sm text-muted-foreground">
                                                            <span>{entriesCount} lançamento{entriesCount !== 1 ? 's' : ''}</span>
                                                            <span className="font-semibold text-green-600">
                                                                Total: {totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                            </span>
                                                            {(() => {
                                                                const orderReqs = requisitions.filter(req => req.orderId === order.id);
                                                                const materialsCount = orderReqs.reduce((sum, req) => 
                                                                    sum + req.items.filter(item => 
                                                                        item.invoiceItemValue && item.invoiceItemValue > 0 && item.supplierName
                                                                    ).length, 0
                                                                );
                                                                if (materialsCount > 0) {
                                                                    return (
                                                                        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                                                                            📦 {materialsCount} materiais recebidos
                                                                        </Badge>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="p-2">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Data</TableHead>
                                                                <TableHead>Descrição</TableHead>
                                                                <TableHead className="text-right">Qtd</TableHead>
                                                                <TableHead className="text-right">Valor Unit.</TableHead>
                                                                <TableHead className="text-right">Total</TableHead>
                                                                <TableHead>Lançado por / PC</TableHead>
                                                                <TableHead className="text-right">Ações</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {order.costEntries
                                                                ?.sort((a, b) => (b.entryDate?.getTime() || 0) - (a.entryDate?.getTime() || 0))
                                                                .map(entry => (
                                                                <TableRow key={entry.id}>
                                                                    <TableCell className="text-sm">
                                                                        {safeFormatDate(entry.entryDate, 'dd/MM/yyyy HH:mm', 'N/A')}
                                                                    </TableCell>
                                                                    <TableCell className="font-medium">
                                                                        <div>
                                                                            {entry.description}
                                                                                                                                                                                                                                 {entry.isFromRequisition && (
                                                                             <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                                                 <Badge variant="secondary" className="text-xs">
                                                                                     📋 Materiais (Auto)
                                                                                 </Badge>
                                                                                 {entry.sourceType === 'requisition_total' && (
                                                                                     <Badge variant="outline" className="text-xs text-blue-600">
                                                                                         💰 Valor do Recebimento
                                                                                     </Badge>
                                                                                 )}
                                                                                 {entry.isPending && (
                                                                                     <Badge variant="outline" className="text-xs text-orange-600">
                                                                                         ⏳ Aguardando preços
                                                                                     </Badge>
                                                                                 )}
                                                                                 {!entry.isPending && entry.completionPercentage && entry.completionPercentage < 100 && (
                                                                                     <Badge variant="outline" className="text-xs text-blue-600">
                                                                                         🔄 {entry.completionPercentage}% precificado
                                                                                     </Badge>
                                                                                 )}
                                                                                 {entry.completionPercentage === 100 && (
                                                                                     <Badge variant="default" className="text-xs text-green-600">
                                                                                         ✅ Completo
                                                                                     </Badge>
                                                                                 )}
                                                                                 {entry.lastPriceUpdate && (
                                                                                     <Badge variant="outline" className="text-xs text-gray-500">
                                                                                         🕒 {safeFormatDate(entry.lastPriceUpdate, 'dd/MM HH:mm')}
                                                                                     </Badge>
                                                                                 )}
                                                                             </div>
                                                                         )}
                                                                            {entry.items && entry.items.length > 0 && (
                                                                                <details className="mt-2">
                                                                                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-primary">
                                                                                        Ver {entry.items.length} item(ns) ↓
                                                                                    </summary>
                                                                                    <div className="mt-1 pl-2 border-l-2 border-muted">
                                                                                                                                                                                 {entry.items.map((item: any, idx: number) => (
                                                                                             <div key={idx} className={`text-xs py-1 px-2 rounded border-l-2 ${item.hasPricing ? 'border-green-400 bg-green-50' : 'border-orange-400 bg-orange-50'}`}>
                                                                                                 <div className="flex items-center gap-2">
                                                                                                     <span className={`w-2 h-2 rounded-full ${item.hasPricing ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                                                                                                     <span className="font-medium text-gray-800">{item.description}</span>
                                                                                                     {item.hasPricing && <span className="text-green-600 text-xs">✓</span>}
                                                                                                 </div>
                                                                                                 <div className="text-xs ml-4 mt-1">
                                                                                                     <span className="text-gray-600">Qtd: {item.quantity}</span>
                                                                                                     {item.weight && <span className="text-gray-600"> • Peso: {item.weight}{item.weightUnit}</span>}
                                                                                                     <br />
                                                                                                     <span className={`font-medium ${item.hasPricing ? 'text-green-700' : 'text-orange-600'}`}>
                                                                                                         Valor: {item.value?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'Não informado'}
                                                                                                     </span>
                                                                                                 </div>
                                                                                             </div>
                                                                                         ))}
                                                                                    </div>
                                                                                </details>
                                                                            )}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">{entry.quantity}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        {entry.unitCost?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-medium text-green-600">
                                                                        {entry.totalCost?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </TableCell>
                                                                    <TableCell className="text-sm text-muted-foreground">
                                                                        <div>
                                                                            <div>{entry.enteredBy}</div>
                                                                            {entry.purchaseOrderNumber && (
                                                                                <div className="text-xs text-blue-600 font-medium mt-1">
                                                                                    📋 PC: {entry.purchaseOrderNumber}
                                                                                </div>
                                                                            )}
                                                                            {entry.lastEditDate && (
                                                                                <div className="text-xs text-orange-600 mt-1">
                                                                                    ✏️ Editado: {safeFormatDate(entry.lastEditDate, 'dd/MM/yy HH:mm')}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            {/* Botão de Editar - disponível para todos os lançamentos */}
                                                                            <Button 
                                                                                variant="ghost" 
                                                                                size="icon" 
                                                                                className="text-blue-600 hover:text-blue-800" 
                                                                                onClick={() => handleEditCostEntryClick({...entry, orderId: order.id, internalOS: order.internalOS, customerName: order.customerName})}
                                                                                title={entry.isFromRequisition ? "Editar dados do lançamento (ex: nº pedido)" : "Editar lançamento"}
                                                                            >
                                                                                <Pencil className="h-4 w-4" />
                                                                            </Button>
                                                                            
                                                                            {/* Botão de Deletar - apenas para lançamentos manuais */}
                                                                            {!entry.isFromRequisition && (
                                                                                <Button 
                                                                                    variant="ghost" 
                                                                                    size="icon" 
                                                                                    className="text-destructive hover:text-destructive" 
                                                                                    onClick={() => handleDeleteCostEntryClick({...entry, orderId: order.id, internalOS: order.internalOS, customerName: order.customerName})}
                                                                                    title="Excluir lançamento"
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            )}
                                                                            
                                                                            {/* Badge para lançamentos automáticos */}
                                                                            {entry.isFromRequisition && (
                                                                                <Badge variant="outline" className="text-xs">
                                                                                    Auto
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </AccordionContent>
                                            </AccordionItem>
                                        );
                                    })}
                                    </Accordion>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-32 border-dashed border-2 rounded-lg">
                                    <PackageSearch className="h-8 w-8 mb-2" />
                                    <h3 className="font-semibold">
                                        {osSearchTerm ? `Nenhuma OS encontrada para "${osSearchTerm}"` : "Nenhum Custo Lançado"}
                                    </h3>
                                    <p className="text-sm">
                                        {osSearchTerm 
                                            ? "Tente buscar por outro termo ou limpe a busca para ver todas as OS."
                                            : "Quando custos forem lançados nas OS, eles aparecerão aqui organizados."
                                        }
                                    </p>
                                </div>
                            );
                        })()}
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-3xl"> {/* Aumentado para acomodar mais informações */}
            <DialogHeader>
                <DialogTitle>Atualizar Item de Requisição</DialogTitle>
                <DialogDescription>
                    {selectedItem?.description}
                </DialogDescription>
                
                {/* MELHORIA: Mostrar informações detalhadas do item para melhor identificação */}
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <span className="font-semibold text-blue-800">📏 Dimensão:</span>
                            <p className="font-medium">
                                {(() => {
                                    // Buscar dados completos do item na requisição original
                                    const fullReq = requisitions.find(r => r.id === selectedItem?.requisitionId);
                                    const fullItem = fullReq?.items.find(i => i.id === selectedItem?.id);
                                    return fullItem?.dimensao || 'Não especificada';
                                })()}
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-blue-800">🔧 Material:</span>
                            <p className="font-medium">
                                {(() => {
                                    const fullReq = requisitions.find(r => r.id === selectedItem?.requisitionId);
                                    const fullItem = fullReq?.items.find(i => i.id === selectedItem?.id);
                                    return fullItem?.material || 'Não especificado';
                                })()}
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-blue-800">📦 Código:</span>
                            <p className="font-medium">
                                {(() => {
                                    const fullReq = requisitions.find(r => r.id === selectedItem?.requisitionId);
                                    const fullItem = fullReq?.items.find(i => i.id === selectedItem?.id);
                                    return fullItem?.code || 'Não informado';
                                })()}
                            </p>
                        </div>
                    </div>
                    
                    {/* Mostrar quantidade solicitada */}
                    <div className="mt-3 pt-3 border-t border-blue-200">
                        <span className="font-semibold text-blue-800">📊 Quantidade Solicitada:</span>
                        <span className="ml-2 font-bold text-blue-900">
                            {selectedItem?.quantityRequested} {(() => {
                                const fullReq = requisitions.find(r => r.id === selectedItem?.requisitionId);
                                const fullItem = fullReq?.items.find(i => i.id === selectedItem?.id);
                                return fullItem?.unit || 'unidades';
                            })()}
                        </span>
                    </div>
                </div>
                
                <div className={`mt-3 p-3 rounded-lg border ${selectedItem?.weight ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">⚖️ Peso do Material:</span>
                        <span className="text-lg font-bold">
                            {selectedItem?.weight ? (
                                <span className="text-green-700">
                                    {selectedItem.weight} {selectedItem.weightUnit || 'kg'}
                                </span>
                            ) : (
                                <span className="text-orange-700">Não informado</span>
                            )}
                        </span>
                    </div>
                    
                    {selectedItem?.weight && selectedItem?.invoiceItemValue && selectedItem.weight > 0 && (
                        <div className="mt-2 text-sm text-green-600">
                            💰 Custo por {selectedItem.weightUnit || 'kg'}: {' '}
                            <span className="font-semibold">
                                {(selectedItem.invoiceItemValue / selectedItem.weight).toLocaleString('pt-BR', { 
                                    style: 'currency', 
                                    currency: 'BRL' 
                                })}
                            </span>
                        </div>
                    )}
                    
                    <div className="mt-2 text-xs">
                        {selectedItem?.weight ? (
                            <span className="text-green-600">✅ Peso cadastrado - Os custos serão calculados automaticamente</span>
                        ) : (
                            <span className="text-orange-600">⚠️ Informe o peso abaixo para cálculo automático do custo por unidade</span>
                        )}
                    </div>
                </div>
            </DialogHeader>
            <Form {...itemForm}>
                <form onSubmit={itemForm.handleSubmit(onItemSubmit)} className="space-y-6 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={itemForm.control} name="supplierName" render={({ field }) => (
                           <FormItem>
                               <FormLabel>Nome do Fornecedor</FormLabel>
                               <Select onValueChange={field.onChange} defaultValue={field.value}>
                                   <FormControl>
                                       <SelectTrigger>
                                           <SelectValue placeholder="Selecione um fornecedor" />
                                       </SelectTrigger>
                                   </FormControl>
                                   <SelectContent>
                                       {suppliers.map(s => <SelectItem key={s.id} value={s.nomeFantasia || s.razaoSocial || ''}>{s.nomeFantasia || s.razaoSocial || 'Fornecedor sem nome'}</SelectItem>)}
                                   </SelectContent>
                               </Select>
                               <FormMessage />
                           </FormItem>
                        )}/>
                        <FormField control={itemForm.control} name="deliveryReceiptDate" render={({ field }) => (
                            <FormItem className="flex flex-col"><FormLabel>Data de Entrega</FormLabel>
                                <Popover><PopoverTrigger asChild>
                                    <FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl>
                                </PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FormField control={itemForm.control} name="weight" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                    ⚖️ Peso do Material
                                    {!selectedItem?.weight && <span className="text-orange-500 text-xs">(Obrigatório)</span>}
                                </FormLabel>
                                <FormControl>
                                    <Input 
                                        type="number" 
                                        step="0.001" 
                                        placeholder={selectedItem?.weight ? selectedItem.weight.toString() : "Ex: 15.5"} 
                                        {...field} 
                                        value={field.value ?? ''} 
                                        className={!selectedItem?.weight && !field.value ? 'border-orange-300 focus:border-orange-500' : ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={itemForm.control} name="weightUnit" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Unidade</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || "kg"}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Unidade" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="kg">kg (quilograma)</SelectItem>
                                        <SelectItem value="g">g (grama)</SelectItem>
                                        <SelectItem value="t">t (tonelada)</SelectItem>
                                        <SelectItem value="m">m (metro)</SelectItem>
                                        <SelectItem value="m²">m² (metro quadrado)</SelectItem>
                                        <SelectItem value="m³">m³ (metro cúbico)</SelectItem>
                                        <SelectItem value="l">l (litro)</SelectItem>
                                        <SelectItem value="un">un (unidade)</SelectItem>
                                        <SelectItem value="pç">pç (peça)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={itemForm.control} name="invoiceItemValue" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                    💰 Valor do Item (R$)
                                    {!selectedItem?.invoiceItemValue && <span className="text-blue-500 text-xs">(Para cálculo de custo)</span>}
                                </FormLabel>
                                <FormControl>
                                    <Input 
                                        type="number" 
                                        step="0.01" 
                                        placeholder="0.00" 
                                        {...field} 
                                        value={field.value ?? ''} 
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={itemForm.control} name="invoiceNumber" render={({ field }) => (
                            <FormItem><FormLabel>Nota Fiscal</FormLabel><FormControl><Input placeholder="Nº da NF-e" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={itemForm.control} name="certificateNumber" render={({ field }) => (
                            <FormItem><FormLabel>Nº do Certificado</FormLabel><FormControl><Input placeholder="Certificado de qualidade/material" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <FormField control={itemForm.control} name="storageLocation" render={({ field }) => (
                            <FormItem><FormLabel>Local de Armazenamento</FormLabel><FormControl><Input placeholder="Ex: Prateleira A-10" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    <FormField control={itemForm.control} name="inspectionStatus" render={({ field }) => (
                        <FormItem><FormLabel>Status da Inspeção</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl>
                                <SelectTrigger><SelectValue placeholder="Selecione o status da inspeção" /></SelectTrigger>
                            </FormControl><SelectContent>
                                {inspectionStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                            </SelectContent></Select><FormMessage />
                        </FormItem>
                    )}/>
                    </div>
                    
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={itemForm.formState.isSubmitting}>
                            {itemForm.formState.isSubmitting ? "Salvando..." : "Salvar Atualizações"}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isSupplierFormOpen} onOpenChange={setIsSupplierFormOpen}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{selectedSupplier?.id ? `Editar Fornecedor: ${selectedSupplier.nomeFantasia || selectedSupplier.razaoSocial || ''}` : "Adicionar Novo Fornecedor"}</DialogTitle>
              <DialogDescription>Preencha os dados completos do fornecedor.</DialogDescription>
            </DialogHeader>
            <Form {...supplierForm}>
                <form onSubmit={supplierForm.handleSubmit(onSupplierSubmit)} className="flex-1 flex flex-col min-h-0">
                  <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
                    <TabsList>
                      <TabsTrigger value="general">Gerais</TabsTrigger>
                      <TabsTrigger value="contact">Contato e Endereço</TabsTrigger>
                      <TabsTrigger value="commercial">Comercial e Bancário</TabsTrigger>
                      <TabsTrigger value="docs">Documentos</TabsTrigger>
                    </TabsList>
                    <ScrollArea className="flex-1 mt-4 pr-6">
                      <TabsContent value="general" className="space-y-4">
                        <FormField control={supplierForm.control} name="status" render={({ field }) => (<FormItem><FormLabel>Status</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="razaoSocial" render={({ field }) => (<FormItem><FormLabel>Razão Social</FormLabel><FormControl><Input placeholder="Nome jurídico da empresa" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="nomeFantasia" render={({ field }) => (<FormItem><FormLabel>Nome Fantasia</FormLabel><FormControl><Input placeholder="Nome comercial (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="cnpj" render={({ field }) => (<FormItem><FormLabel>CNPJ</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <div className="grid md:grid-cols-2 gap-4">
                          <FormField control={supplierForm.control} name="inscricaoEstadual" render={({ field }) => (<FormItem><FormLabel>Inscrição Estadual</FormLabel><FormControl><Input placeholder="Opcional" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={supplierForm.control} name="inscricaoMunicipal" render={({ field }) => (<FormItem><FormLabel>Inscrição Municipal</FormLabel><FormControl><Input placeholder="Opcional" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                        <FormField control={supplierForm.control} name="segment" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Segmento</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione um segmento" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {segmentOptions.map(option => (
                                            <SelectItem key={option} value={option}>{option}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                         {selectedSupplier && (<div className="text-xs text-muted-foreground space-y-1 pt-4"><p>Código: {selectedSupplier.supplierCode}</p><p>Cadastrado em: {safeFormatDate(selectedSupplier.firstRegistrationDate, 'dd/MM/yyyy HH:mm', 'N/A')}</p><p>Última atualização: {safeFormatDate(selectedSupplier.lastUpdate, 'dd/MM/yyyy HH:mm', 'N/A')}</p></div>)}
                      </TabsContent>
                      <TabsContent value="contact" className="space-y-4">
                        <FormField control={supplierForm.control} name="salesContactName" render={({ field }) => (<FormItem><FormLabel>Nome do Responsável Comercial</FormLabel><FormControl><Input placeholder="Nome do contato" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <div className="grid md:grid-cols-2 gap-4">
                          <FormField control={supplierForm.control} name="telefone" render={({ field }) => (<FormItem><FormLabel>Telefone</FormLabel><FormControl><Input placeholder="(XX) XXXXX-XXXX" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={supplierForm.control} name="primaryEmail" render={({ field }) => (<FormItem><FormLabel>E-mail Principal</FormLabel><FormControl><Input placeholder="contato@fornecedor.com (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                        <FormField control={supplierForm.control} name="address.street" render={({ field }) => (<FormItem><FormLabel>Logradouro</FormLabel><FormControl><Input placeholder="Rua, Avenida..." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <div className="grid md:grid-cols-3 gap-4">
                          <FormField control={supplierForm.control} name="address.number" render={({ field }) => (<FormItem><FormLabel>Número</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={supplierForm.control} name="address.complement" render={({ field }) => (<FormItem><FormLabel>Complemento</FormLabel><FormControl><Input placeholder="Apto, Bloco, etc." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                           <FormField control={supplierForm.control} name="address.zipCode" render={({ field }) => (<FormItem><FormLabel>CEP</FormLabel><FormControl><Input placeholder="00000-000" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <FormField control={supplierForm.control} name="address.neighborhood" render={({ field }) => (<FormItem><FormLabel>Bairro</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={supplierForm.control} name="address.cityState" render={({ field }) => (<FormItem><FormLabel>Cidade / Estado</FormLabel><FormControl><Input placeholder="Ex: São Paulo / SP" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                      </TabsContent>
                      <TabsContent value="commercial" className="space-y-4">
                        <Card><CardHeader><CardTitle className="text-lg">Informações Comerciais</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <FormField control={supplierForm.control} name="commercialInfo.paymentTerms" render={({ field }) => (<FormItem><FormLabel>Condições de Pagamento</FormLabel><FormControl><Input placeholder="Ex: 28 DDL" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={supplierForm.control} name="commercialInfo.avgLeadTimeDays" render={({ field }) => (<FormItem><FormLabel>Prazo Médio de Entrega (dias)</FormLabel><FormControl><Input type="number" placeholder="Ex: 15" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={supplierForm.control} name="commercialInfo.shippingMethods" render={({ field }) => (<FormItem><FormLabel>Formas de Envio</FormLabel><FormControl><Input placeholder="Ex: Transportadora, Retirada" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={supplierForm.control} name="commercialInfo.shippingIncluded" render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        <div className="space-y-1 leading-none"><FormLabel>Frete incluso no preço?</FormLabel></div>
                                    </FormItem>
                                )}/>
                            </CardContent>
                        </Card>
                        <Card><CardHeader><CardTitle className="text-lg">Dados Bancários</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <FormField control={supplierForm.control} name="bankInfo.bank" render={({ field }) => (<FormItem><FormLabel>Banco</FormLabel><FormControl><Input placeholder="Nome do banco" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <FormField control={supplierForm.control} name="bankInfo.agency" render={({ field }) => (<FormItem><FormLabel>Agência</FormLabel><FormControl><Input placeholder="0000" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                                    <FormField control={supplierForm.control} name="bankInfo.accountNumber" render={({ field }) => (<FormItem><FormLabel>Conta Corrente</FormLabel><FormControl><Input placeholder="00000-0" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <FormField control={supplierForm.control} name="bankInfo.accountType" render={({ field }) => (<FormItem><FormLabel>Tipo de Conta</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger></FormControl><SelectContent><SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem><SelectItem value="Pessoa Física">Pessoa Física</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                                    <FormField control={supplierForm.control} name="bankInfo.pix" render={({ field }) => (<FormItem><FormLabel>Chave PIX</FormLabel><FormControl><Input placeholder="CNPJ, e-mail, etc." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                                </div>
                            </CardContent>
                        </Card>
                      </TabsContent>
                      <TabsContent value="docs" className="space-y-4">
                        <FormDescription>Anexe os documentos do fornecedor. Salve os arquivos em um serviço de nuvem (como Google Drive) e cole o link compartilhável aqui.</FormDescription>
                        <FormField control={supplierForm.control} name="documentation.contratoSocialUrl" render={({ field }) => (<FormItem><FormLabel>Link do Contrato Social</FormLabel><FormControl><Input placeholder="https:// (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.cartaoCnpjUrl" render={({ field }) => (<FormItem><FormLabel>Link do Cartão CNPJ</FormLabel><FormControl><Input placeholder="https:// (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.certidoesNegativasUrl" render={({ field }) => (<FormItem><FormLabel>Link das Certidões Negativas</FormLabel><FormControl><Input placeholder="https:// (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.isoCertificateUrl" render={({ field }) => (<FormItem><FormLabel>Link do Certificado ISO (se aplicável)</FormLabel><FormControl><Input placeholder="https:// (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.alvaraUrl" render={({ field }) => (<FormItem><FormLabel>Link do Alvará/Licença (se aplicável)</FormLabel><FormControl><Input placeholder="https:// (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                      </TabsContent>
                    </ScrollArea>
                  </Tabs>
                    <DialogFooter className="pt-4 border-t flex-shrink-0">
                        <Button type="button" variant="outline" onClick={() => setIsSupplierFormOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={supplierForm.formState.isSubmitting}>
                            {supplierForm.formState.isSubmitting ? "Salvando..." : (selectedSupplier?.id ? 'Salvar Alterações' : 'Adicionar Fornecedor')}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Isso excluirá permanentemente o fornecedor <span className="font-bold">{supplierToDelete?.nomeFantasia || supplierToDelete?.razaoSocial}</span>.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDeleteSupplier} className="bg-destructive hover:bg-destructive/90">
                    Sim, excluir
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteCostAlertOpen} onOpenChange={setIsDeleteCostAlertOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Isso excluirá permanentemente o lançamento de custo: <span className="font-bold">{costEntryToDelete?.description}</span> no valor de <span className="font-bold">{costEntryToDelete?.totalCost?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDeleteCostEntry} className="bg-destructive hover:bg-destructive/90">
                    Sim, excluir
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal do Relatório de Recebimento de Materiais */}
      <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    📊 Relatório de Recebimento de Materiais
                </DialogTitle>
                <DialogDescription>
                    {selectedOrderForReport && (
                        <>OS: {selectedOrderForReport.internalOS} - {selectedOrderForReport.customerName}</>
                    )}
                </DialogDescription>
            </DialogHeader>
            
            {selectedOrderForReport && (() => {
                const reportData = generateMaterialsReport(selectedOrderForReport);
                if (!reportData) return <div>Erro ao gerar dados do relatório</div>;
                
                return (
                    <div className="flex-1 flex flex-col min-h-0">
                        {/* Resumo Executivo */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600">
                                    {reportData.totalOrderCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                                <div className="text-sm text-muted-foreground">Total Gasto</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600">{reportData.totalSuppliers}</div>
                                <div className="text-sm text-muted-foreground">Fornecedores</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-600">{reportData.totalItemsReceived}</div>
                                <div className="text-sm text-muted-foreground">Itens Recebidos</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-orange-600">{reportData.requisitionsCount}</div>
                                <div className="text-sm text-muted-foreground">Requisições</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-teal-600">
                                    {reportData.totalWeight > 0 ? `${reportData.totalWeight.toFixed(2)} kg` : '-'}
                                </div>
                                <div className="text-sm text-muted-foreground">Peso Total</div>
                            </div>
                        </div>

                        {/* Resumo por Requisição */}
                        {reportData.requisitionSummary.length > 1 && (
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold mb-3">📋 Resumo por Requisição</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {reportData.requisitionSummary.map(req => (
                                        <div key={req.requisitionNumber} className="p-3 border rounded-lg bg-white">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-semibold text-primary">Req. {req.requisitionNumber}</span>
                                                <Badge variant="outline" className="text-xs">
                                                    {req.progress}%
                                                </Badge>
                                            </div>
                                            <div className="text-sm space-y-1">
                                                <div className="flex justify-between">
                                                    <span>Itens:</span>
                                                    <span>{req.itemsWithValue}/{req.totalItems}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Valor:</span>
                                                    <span className="font-semibold text-green-600">
                                                        {req.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {safeFormatDate(req.date, 'dd/MM/yyyy')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Lista de Fornecedores */}
                        <ScrollArea className="flex-1">
                            <div className="space-y-4">
                                {reportData.suppliers.map((supplier, index) => {
                                    const percentage = (supplier.totalCost / reportData.totalOrderCost) * 100;
                                    
                                    return (
                                        <Card key={supplier.supplierName} className="overflow-hidden">
                                            <CardHeader className="pb-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                            {index + 1}
                                                        </div>
                                                        <div>
                                                            <CardTitle className="text-lg">{supplier.supplierName}</CardTitle>
                                                            <div className="text-sm text-muted-foreground">
                                                                {supplier.items.length} ite{supplier.items.length !== 1 ? 'ns' : 'm'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xl font-bold text-green-600">
                                                            {supplier.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {percentage.toFixed(1)}% do total
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Barra de Progresso */}
                                                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                                    <div 
                                                        className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all" 
                                                        style={{ width: `${percentage}%` }}
                                                    ></div>
                                                </div>
                                            </CardHeader>
                                            
                                            <CardContent className="pt-0">
                                                                                                 <Table>
                                                     <TableHeader>
                                                         <TableRow>
                                                             <TableHead>Item</TableHead>
                                                             <TableHead>Material</TableHead>
                                                             <TableHead className="text-right">Qtd</TableHead>
                                                             <TableHead className="text-right">Peso</TableHead>
                                                             <TableHead className="text-right">Valor Unit.</TableHead>
                                                             <TableHead className="text-right">Total</TableHead>
                                                             <TableHead>NF</TableHead>
                                                             <TableHead>Entrada NF</TableHead>
                                                             <TableHead>Req.</TableHead>
                                                             <TableHead>Status</TableHead>
                                                         </TableRow>
                                                     </TableHeader>
                                                     <TableBody>
                                                         {supplier.items.map((item, itemIndex) => (
                                                             <TableRow key={itemIndex}>
                                                                 <TableCell className="font-medium">{item.description}</TableCell>
                                                                 <TableCell className="text-sm font-medium whitespace-nowrap">{item.material}</TableCell>
                                                                 <TableCell className="text-right">{item.quantity}</TableCell>
                                                                 <TableCell className="text-right text-sm">
                                                                     {item.weight ? `${item.weight} ${item.weightUnit || 'kg'}` : '-'}
                                                                 </TableCell>
                                                                 <TableCell className="text-right">
                                                                     {item.unitValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                 </TableCell>
                                                                 <TableCell className="text-right font-semibold text-green-600">
                                                                     {item.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                 </TableCell>
                                                                 <TableCell className="text-sm">{item.invoiceNumber || '-'}</TableCell>
                                                                 <TableCell className="text-sm whitespace-nowrap">
                                                                     {safeFormatDate(item.deliveryDate, 'dd/MM/yyyy', 'Não informada')}
                                                                 </TableCell>
                                                                 <TableCell className="text-sm">{item.requisitionNumber}</TableCell>
                                                                 <TableCell>
                                                                     <div className="space-y-1">
                                                                         {item.inspectionStatus && (
                                                                             <Badge variant={
                                                                                 item.inspectionStatus.includes('Aprovado') ? 'default' :
                                                                                 item.inspectionStatus.includes('Rejeitado') ? 'destructive' :
                                                                                 'secondary'
                                                                             } className="text-xs">
                                                                                 {item.inspectionStatus}
                                                                             </Badge>
                                                                         )}
                                                                     </div>
                                                                 </TableCell>
                                                             </TableRow>
                                                         ))}
                                                     </TableBody>
                                                 </Table>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </ScrollArea>

                        {/* Rodapé com ações */}
                        <div className="flex items-center justify-between pt-4 border-t">
                            <div className="text-xs text-muted-foreground">
                                Relatório gerado em: {safeFormatDate(reportData.reportDate, 'dd/MM/yyyy HH:mm')}
                            </div>
                            <div className="flex gap-2">
                                                                 <Button 
                                     variant="outline" 
                                     onClick={() => {
                                         // Gerar CSV
                                         const csvHeaders = ['Fornecedor', 'Item', 'Material', 'Quantidade', 'Peso', 'Unidade Peso', 'Valor Unitário', 'Valor Total', 'Nota Fiscal', 'Requisição', 'Entrada da NF', 'Status Inspeção', '% do Total'];
                                         const csvData = reportData.suppliers.flatMap(supplier => 
                                             supplier.items.map(item => {
                                                 const percentage = (item.totalValue / reportData.totalOrderCost) * 100;
                                                 return [
                                                     supplier.supplierName,
                                                     item.description,
                                                     item.material,
                                                     item.quantity.toString(),
                                                     item.weight?.toString() || '',
                                                     item.weightUnit || '',
                                                     item.unitValue.toFixed(2).replace('.', ','),
                                                     item.totalValue.toFixed(2).replace('.', ','),
                                                     item.invoiceNumber || '',
                                                     item.requisitionNumber,
                                                     item.deliveryDate ? safeFormatDate(item.deliveryDate, 'dd/MM/yyyy') : '',
                                                     item.inspectionStatus || '',
                                                     percentage.toFixed(2).replace('.', ',') + '%'
                                                 ];
                                             })
                                         );

                                         const csvContent = [
                                             csvHeaders.join(';'),
                                             ...csvData.map(row => row.join(';'))
                                         ].join('\n');

                                         // Adicionar BOM para caracteres especiais
                                         const BOM = '\uFEFF';
                                         const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
                                         const url = window.URL.createObjectURL(blob);
                                         const link = document.createElement('a');
                                         link.href = url;
                                         link.download = `relatorio_materiais_OS_${selectedOrderForReport.internalOS.replace('/', '_')}_${new Date().toISOString().split('T')[0]}.csv`;
                                         link.click();
                                         window.URL.revokeObjectURL(url);
                                     }}
                                 >
                                     📊 Exportar CSV
                                 </Button>
                                 <Button 
                                     variant="outline" 
                                     onClick={() => {
                                         const printWindow = window.open('', '_blank');
                                         if (printWindow) {
                                             printWindow.document.write(`
                                                 <html>
                                                     <head>
                                                         <title>Relatório - OS ${selectedOrderForReport.internalOS}</title>
                                                         <style>
                                                             body { font-family: Arial, sans-serif; margin: 20px; }
                                                             .header { text-align: center; margin-bottom: 30px; }
                                                             .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; text-align: center; }
                                                             .summary-item { border: 1px solid #ccc; padding: 15px; border-radius: 5px; }
                                                             .supplier { margin: 30px 0; border: 2px solid #ccc; padding: 15px; border-radius: 5px; }
                                                             .supplier-header { background-color: #f5f5f5; padding: 10px; margin: -15px -15px 15px -15px; border-radius: 5px 5px 0 0; }
                                                             table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                                                             th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                                                             th { background-color: #f8f9fa; font-weight: bold; }
                                                             .total { text-align: center; margin-top: 30px; font-size: 18px; font-weight: bold; }
                                                         </style>
                                                     </head>
                                                     <body>
                                                         <div class="header">
                                                             <h1>Relatório de Recebimento de Materiais</h1>
                                                             <h2>OS: ${selectedOrderForReport.internalOS} - ${selectedOrderForReport.customerName}</h2>
                                                             <p>Gerado em: ${safeFormatDate(reportData.reportDate, 'dd/MM/yyyy HH:mm')}</p>
                                                         </div>
                                                         <div class="summary">
                                                             <div class="summary-item">
                                                                 <h3 style="color: #059669; margin: 0;">${reportData.totalOrderCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h3>
                                                                 <p style="margin: 5px 0 0 0;">Total Gasto</p>
                                                             </div>
                                                             <div class="summary-item">
                                                                 <h3 style="color: #2563eb; margin: 0;">${reportData.totalSuppliers}</h3>
                                                                 <p style="margin: 5px 0 0 0;">Fornecedores</p>
                                                             </div>
                                                             <div class="summary-item">
                                                                 <h3 style="color: #7c3aed; margin: 0;">${reportData.totalItemsReceived}</h3>
                                                                 <p style="margin: 5px 0 0 0;">Itens Recebidos</p>
                                                             </div>
                                                             <div class="summary-item">
                                                                 <h3 style="color: #ea580c; margin: 0;">${reportData.requisitionsCount}</h3>
                                                                 <p style="margin: 5px 0 0 0;">Requisições</p>
                                                             </div>
                                                         </div>
                                                         ${reportData.suppliers.map((supplier, index) => {
                                                             const percentage = (supplier.totalCost / reportData.totalOrderCost) * 100;
                                                             return `
                                                                 <div class="supplier">
                                                                     <div class="supplier-header">
                                                                         <h3 style="margin: 0; display: flex; justify-content: space-between;">
                                                                             <span>${index + 1}. ${supplier.supplierName}</span>
                                                                             <span style="color: #059669;">${supplier.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${percentage.toFixed(1)}%)</span>
                                                                         </h3>
                                                                     </div>
                                                                     <table>
                                                                         <tr><th>Item</th><th>Material</th><th>Qtd</th><th>Peso</th><th>Valor Unit.</th><th>Valor Total</th><th>NF</th><th>Entrada NF</th><th>Req.</th><th>Status</th></tr>
                                                                         ${supplier.items.map(item => `
                                                                             <tr>
                                                                                 <td>${item.description}</td>
                                                                                 <td>${item.material}</td>
                                                                                 <td style="text-align: center;">${item.quantity}</td>
                                                                                 <td style="text-align: center;">${item.weight ? `${item.weight} ${item.weightUnit || 'kg'}` : '-'}</td>
                                                                                 <td style="text-align: right;">${item.unitValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                                                 <td style="text-align: right; font-weight: bold;">${item.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                                                 <td style="text-align: center;">${item.invoiceNumber || '-'}</td>
                                                                                 <td style="text-align: center;">${safeFormatDate(item.deliveryDate, 'dd/MM/yyyy', 'Não informada')}</td>
                                                                                 <td style="text-align: center;">${item.requisitionNumber}</td>
                                                                                 <td style="text-align: center; font-size: 11px;">${item.inspectionStatus || '-'}</td>
                                                                             </tr>
                                                                         `).join('')}
                                                                     </table>
                                                                 </div>
                                                             `;
                                                         }).join('')}
                                                         <div class="total">
                                                             <p>TOTAL GERAL: ${reportData.totalOrderCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                                         </div>
                                                     </body>
                                                 </html>
                                             `);
                                             printWindow.document.close();
                                             printWindow.print();
                                         }
                                     }}
                                 >
                                     🖨️ Imprimir
                                 </Button>
                                <Button variant="outline" onClick={() => setIsReportModalOpen(false)}>
                                    Fechar
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </DialogContent>
      </Dialog>
    </>
    );
    } catch (error) {
        console.error("Erro crítico na renderização da página:", error);
        return (
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Centro de Custos</h1>
                </div>
                <div className="flex flex-col items-center justify-center text-center text-destructive h-64 border-dashed border-2 rounded-lg">
                    <h3 className="text-lg font-semibold">Erro ao carregar a página</h3>
                    <p className="text-sm">Ocorreu um erro inesperado. Recarregue a página para tentar novamente.</p>
                    <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
                        🔄 Recarregar Página
                    </Button>
                </div>
            </div>
        );
    }
}

