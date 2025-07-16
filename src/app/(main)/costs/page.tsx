"use client";

import React from "react";
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, Timestamp, getDoc, addDoc, deleteDoc, setDoc, arrayUnion, arrayRemove, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";

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
import { CalendarIcon, PackageSearch, FilePen, PlusCircle, Pencil, Trash2 } from "lucide-react";
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
  items: RequisitionItem[];
};

type ItemForUpdate = RequisitionItem & { requisitionId: string };
type OrderInfo = { id: string; internalOS: string; customerName: string; costEntries?: any[] };

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
    const [osSearchTerm, setOsSearchTerm] = useState("");
    const [selectedInsumo, setSelectedInsumo] = useState("");
    const [itemSpecification, setItemSpecification] = useState("");
    const [activeTab, setActiveTab] = useState("receipts");
    const [recentlyUpdatedItem, setRecentlyUpdatedItem] = useState<ItemForUpdate | null>(null);

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

    const fetchRequisitions = useCallback(async () => {
        if (!user) return;
        setIsLoadingRequisitions(true);
        try {
            const reqsSnapshot = await getDocs(collection(db, "companies", "mecald", "materialRequisitions"));
            const reqsList: Requisition[] = reqsSnapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    requisitionNumber: data.requisitionNumber || 'N/A',
                    date: data.date?.toDate ? data.date.toDate() : (data.date ? new Date(data.date) : new Date()),
                    status: data.status,
                    orderId: data.orderId,
                    items: (data.items || []).map((item: any, index: number): RequisitionItem => ({
                        id: item.id || `${d.id}-${index}`,
                        description: item.description,
                        quantityRequested: item.quantityRequested,
                        status: item.status || "Pendente",
                        supplierName: item.supplierName || "",
                        invoiceNumber: item.invoiceNumber || "",
                        invoiceItemValue: item.invoiceItemValue || undefined,
                        certificateNumber: item.certificateNumber || "",
                        storageLocation: item.storageLocation || "",
                        deliveryReceiptDate: item.deliveryReceiptDate?.toDate ? item.deliveryReceiptDate.toDate() : (item.deliveryReceiptDate ? new Date(item.deliveryReceiptDate) : null),
                        inspectionStatus: item.inspectionStatus || "Pendente",
                        weight: item.weight || undefined,
                        weightUnit: item.weightUnit || "kg",
                    })),
                };
            });
            setRequisitions(reqsList.sort((a, b) => b.date.getTime() - a.date.getTime()));
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
                firstRegistrationDate: data.firstRegistrationDate?.toDate ? data.firstRegistrationDate.toDate() : (data.firstRegistrationDate ? new Date(data.firstRegistrationDate) : undefined),
                lastUpdate: data.lastUpdate?.toDate ? data.lastUpdate.toDate() : (data.lastUpdate ? new Date(data.lastUpdate) : undefined),
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
        setIsLoadingOrders(true);
        try {
            const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
            const ordersList: OrderInfo[] = ordersSnapshot.docs
                .filter(doc => !['Concluído', 'Cancelado'].includes(doc.data().status))
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        internalOS: data.internalOS || 'N/A',
                        customerName: data.customer?.name || data.customerName || 'Cliente Desconhecido',
                        costEntries: (data.costEntries || []).map((entry: any) => ({
                            ...entry,
                            entryDate: entry.entryDate?.toDate ? entry.entryDate.toDate() : (entry.entryDate ? new Date(entry.entryDate) : undefined),
                        })),
                    };
                });
            setOrders(ordersList);



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

    const handleOpenForm = (item: RequisitionItem, requisitionId: string) => {
        setSelectedItem({ ...item, requisitionId });
        itemForm.reset({
            supplierName: item.supplierName,
            invoiceNumber: item.invoiceNumber,
            invoiceItemValue: item.invoiceItemValue,
            certificateNumber: item.certificateNumber,
            storageLocation: item.storageLocation,
            deliveryReceiptDate: item.deliveryReceiptDate,
            inspectionStatus: item.inspectionStatus,
            weight: item.weight,
            weightUnit: item.weightUnit || "kg",
        });
        setIsFormOpen(true);
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

            await updateDoc(reqRef, { items: updatedItems });

            // Preparar dados para auto-preenchimento no lançamento de custos
            const itemForCost = { ...selectedItem, ...values };
            setRecentlyUpdatedItem(itemForCost);

            toast({ 
                title: "Item atualizado com sucesso!", 
                description: "Agora você pode lançar os custos na aba 'Lançamento de Custos'." 
            });
            setIsFormOpen(false);
            await fetchRequisitions();
            
            // Redirecionar para a aba de lançamento de custos
            setActiveTab("costEntry");
            
        } catch (error: any) {
            console.error("Error updating item:", error);
            toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
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
        const orderRef = doc(db, "companies", "mecald", "orders", values.orderId);
        const costEntry = {
            id: Date.now().toString(),
            description: values.description,
            quantity: values.quantity,
            unitCost: values.unitCost,
            totalCost: values.quantity * values.unitCost,
            entryDate: Timestamp.now(),
            enteredBy: user?.email || 'Sistema',
        };
        try {
            await updateDoc(orderRef, {
                costEntries: arrayUnion(costEntry)
            });
            toast({ title: "Custo lançado!", description: `O custo foi adicionado à OS selecionada.` });
            costEntryForm.reset();
            setOsSearchTerm("");
            setSelectedInsumo("");
            setItemSpecification("");
            await fetchOrders();
        } catch (error) {
            console.error("Error adding cost entry:", error);
            toast({ variant: "destructive", title: "Erro ao lançar custo." });
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

    // Função para usar dados do item recém-atualizado
    const useRecentlyUpdatedItem = () => {
        if (!recentlyUpdatedItem) return;
        
        // Encontrar a requisição e a OS correspondente
        const requisition = requisitions.find(req => req.id === recentlyUpdatedItem.requisitionId);
        const relatedOrder = requisition?.orderId ? orders.find(o => o.id === requisition.orderId) : null;
        
        if (relatedOrder) {
            costEntryForm.setValue('orderId', relatedOrder.id);
            setOsSearchTerm(`${relatedOrder.internalOS} - ${relatedOrder.customerName}`);
        }
        
        costEntryForm.setValue('description', recentlyUpdatedItem.description);
        costEntryForm.setValue('quantity', recentlyUpdatedItem.quantityRequested);
        
        // Calcular custo unitário baseado no peso e valor da nota fiscal
        if (recentlyUpdatedItem.invoiceItemValue && recentlyUpdatedItem.weight && recentlyUpdatedItem.weight > 0) {
            const unitCost = recentlyUpdatedItem.invoiceItemValue / recentlyUpdatedItem.weight;
            costEntryForm.setValue('unitCost', parseFloat(unitCost.toFixed(4)));
        } else if (recentlyUpdatedItem.invoiceItemValue) {
            costEntryForm.setValue('unitCost', recentlyUpdatedItem.invoiceItemValue);
        }
        
        setRecentlyUpdatedItem(null);
        
        toast({
            title: "Dados preenchidos automaticamente!",
            description: "Os dados do item recém-atualizado foram carregados. Confira e ajuste se necessário."
        });
    };

    // Chamar auto-preenchimento quando mudar para aba de custos
    useEffect(() => {
        if (activeTab === "costEntry" && recentlyUpdatedItem) {
            setTimeout(() => useRecentlyUpdatedItem(), 500);
        }
    }, [activeTab, recentlyUpdatedItem]);

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
                  <CardHeader>
                    <CardTitle>Recebimento de Materiais</CardTitle>
                    <CardDescription>
                      Gerencie o recebimento de materiais das requisições, atualize informações de nota fiscal e realize a inspeção de qualidade.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingRequisitions ? (
                        <Skeleton className="h-64 w-full" />
                    ) : requisitions.length > 0 ? (
                        <Accordion type="single" collapsible className="w-full">
                            {requisitions.map((req) => (
                                <AccordionItem value={req.id} key={req.id}>
                                    <AccordionTrigger className="hover:bg-muted/50 px-4">
                                        <div className="flex-1 text-left">
                                            <div className="flex items-center gap-4">
                                                <span className="font-bold text-primary">Requisição Nº {req.requisitionNumber}</span>
                                                <span className="text-muted-foreground text-sm">Data: {format(req.date, 'dd/MM/yyyy')}</span>
                                            </div>
                                            <div className="text-sm text-muted-foreground mt-1">
                                                {req.orderId ? 
                                                    (() => {
                                                        const order = orders.find(o => o.id === req.orderId);
                                                        return order ? `OS: ${order.internalOS} - ${order.customerName}` : 'OS não encontrada';
                                                    })() : 'Sem OS vinculada'
                                                } • {req.items.length} itens
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-2">
                                        <div className="mb-4 p-4 bg-muted/30 rounded-lg">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                <div>
                                                    <span className="font-semibold text-muted-foreground">OS Vinculada:</span>
                                                    <p className="font-medium">
                                                        {req.orderId ? 
                                                            (() => {
                                                                const order = orders.find(o => o.id === req.orderId);
                                                                return order ? `${order.internalOS} - ${order.customerName}` : 'OS não encontrada';
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
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead>Peso</TableHead>
                                                    <TableHead>Fornecedor</TableHead>
                                                    <TableHead>Nota Fiscal</TableHead>
                                                    <TableHead>Inspeção</TableHead>
                                                    <TableHead className="text-right">Ações</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {req.items.map(item => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">{item.description}</TableCell>
                                                        <TableCell><Badge variant={getStatusVariant(item.status)}>{item.status}</Badge></TableCell>
                                                        <TableCell>
                                                            {item.weight ? `${item.weight} ${item.weightUnit || 'kg'}` : '-'}
                                                        </TableCell>
                                                        <TableCell>{item.supplierName || '-'}</TableCell>
                                                        <TableCell>{item.invoiceNumber || '-'}</TableCell>
                                                        <TableCell><Badge variant={getStatusVariant(item.inspectionStatus)}>{item.inspectionStatus}</Badge></TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="outline" size="sm" onClick={() => handleOpenForm(item, req.id)}>
                                                                <FilePen className="mr-2 h-4 w-4" />
                                                                Atualizar
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
                            <h3 className="text-lg font-semibold">Nenhuma Requisição Encontrada</h3>
                            <p className="text-sm">Quando novas requisições de material forem criadas, elas aparecerão aqui.</p>
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
                {recentlyUpdatedItem && (
                    <Card className="border-primary/50 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="text-primary flex items-center gap-2">
                                ✨ Item Recém-Atualizado Disponível
                            </CardTitle>
                            <CardDescription>
                                O item "{recentlyUpdatedItem.description}" foi atualizado e está pronto para lançamento de custos.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <Button onClick={useRecentlyUpdatedItem} variant="default">
                                    📋 Usar Dados do Item
                                </Button>
                                <Button 
                                    onClick={() => setRecentlyUpdatedItem(null)} 
                                    variant="outline"
                                    size="sm"
                                >
                                    Dispensar
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
                <Card>
                    <CardHeader>
                        <CardTitle>Lançamento de Custo na OS</CardTitle>
                        <CardDescription>
                            Registre custos de itens de almoxarifado, consumíveis ou outros serviços diretamente em uma Ordem de Serviço.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
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
                                                />
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={costEntryForm.control} name="description" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Descrição do Item/Serviço</FormLabel>
                                            <div className="space-y-3">
                                                <FormControl><Input placeholder="Digite livremente ou selecione da biblioteca abaixo" {...field} value={field.value ?? ''} /></FormControl>
                                                
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormField control={costEntryForm.control} name="quantity" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Quantidade</FormLabel>
                                            <FormControl><Input type="number" step="0.01" placeholder="1" {...field} value={field.value ?? ''} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={costEntryForm.control} name="unitCost" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Custo Unitário (R$)</FormLabel>
                                            <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                </div>
                                <div className="flex justify-end">
                                    <Button type="submit" disabled={costEntryForm.formState.isSubmitting}>
                                        {costEntryForm.formState.isSubmitting ? 'Lançando...' : 'Lançar Custo'}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Custos Organizados por OS</CardTitle>
                        <CardDescription>
                            Visualize e gerencie todos os lançamentos de custos organizados por Ordem de Serviço.
                        </CardDescription>
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
                                                        </div>
                                                        <div className="flex items-center gap-6 mt-1 text-sm text-muted-foreground">
                                                            <span>{entriesCount} lançamento{entriesCount !== 1 ? 's' : ''}</span>
                                                            <span className="font-semibold text-green-600">
                                                                Total: {totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                            </span>
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
                                                                <TableHead>Lançado por</TableHead>
                                                                <TableHead className="text-right">Ações</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {order.costEntries
                                                                ?.sort((a, b) => (b.entryDate?.getTime() || 0) - (a.entryDate?.getTime() || 0))
                                                                .map(entry => (
                                                                <TableRow key={entry.id}>
                                                                    <TableCell className="text-sm">
                                                                        {entry.entryDate ? format(entry.entryDate, 'dd/MM/yyyy HH:mm') : 'N/A'}
                                                                    </TableCell>
                                                                    <TableCell className="font-medium">{entry.description}</TableCell>
                                                                    <TableCell className="text-right">{entry.quantity}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        {entry.unitCost?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-medium text-green-600">
                                                                        {entry.totalCost?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                                    </TableCell>
                                                                    <TableCell className="text-sm text-muted-foreground">{entry.enteredBy}</TableCell>
                                                                    <TableCell className="text-right">
                                                                        <Button 
                                                                            variant="ghost" 
                                                                            size="icon" 
                                                                            className="text-destructive hover:text-destructive" 
                                                                            onClick={() => handleDeleteCostEntryClick({...entry, orderId: order.id, internalOS: order.internalOS, customerName: order.customerName})}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
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
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>Atualizar Item de Requisição</DialogTitle>
                <DialogDescription>
                    {selectedItem?.description}
                </DialogDescription>
                {selectedItem?.weight && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-800">
                            <span className="font-semibold">⚖️ Peso do Material:</span>
                            <span className="text-lg font-bold">
                                {selectedItem.weight} {selectedItem.weightUnit || 'kg'}
                            </span>
                        </div>
                        {selectedItem.invoiceItemValue && selectedItem.weight > 0 && (
                            <div className="mt-2 text-sm text-blue-600">
                                💰 Custo por {selectedItem.weightUnit || 'kg'}: {' '}
                                <span className="font-semibold">
                                    {(selectedItem.invoiceItemValue / selectedItem.weight).toLocaleString('pt-BR', { 
                                        style: 'currency', 
                                        currency: 'BRL' 
                                    })}
                                </span>
                            </div>
                        )}
                    </div>
                )}
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
                                <FormLabel>Peso do Material</FormLabel>
                                <FormControl>
                                    <Input 
                                        type="number" 
                                        step="0.001" 
                                        placeholder="0.000" 
                                        {...field} 
                                        value={field.value ?? ''} 
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={itemForm.control} name="weightUnit" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Unidade</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || "kg"}>
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
                            <FormItem><FormLabel>Valor do Item (R$)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
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
                            {itemForm.formState.isSubmitting ? "Salvando..." : "Salvar e Ir para Custos"}
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
                         {selectedSupplier && (<div className="text-xs text-muted-foreground space-y-1 pt-4"><p>Código: {selectedSupplier.supplierCode}</p><p>Cadastrado em: {selectedSupplier.firstRegistrationDate ? format(selectedSupplier.firstRegistrationDate, 'dd/MM/yyyy HH:mm') : 'N/A'}</p><p>Última atualização: {selectedSupplier.lastUpdate ? format(selectedSupplier.lastUpdate, 'dd/MM/yyyy HH:mm') : 'N/A'}</p></div>)}
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
    </>
    );
}
