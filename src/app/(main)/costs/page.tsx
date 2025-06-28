
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, Timestamp, getDoc, addDoc, deleteDoc, setDoc, arrayUnion } from "firebase/firestore";
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
  id: z.string().optional(),
  supplierCode: z.string().optional(),
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().min(14, "CNPJ inválido.").max(18, "CNPJ inválido."),
  inscricaoEstadual: z.string().optional(),
  inscricaoMunicipal: z.string().optional(),
  segment: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["ativo", "inativo"]).default("ativo"),
  telefone: z.string().optional(),
  primaryEmail: z.string().email("E-mail inválido.").optional(),
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
    shippingIncluded: z.boolean().default(false),
  }).optional(),
  documentation: z.object({
    contratoSocialUrl: z.string().url().optional().or(z.literal('')),
    cartaoCnpjUrl: z.string().url().optional().or(z.literal('')),
    certidoesNegativasUrl: z.string().url().optional().or(z.literal('')),
    isoCertificateUrl: z.string().url().optional().or(z.literal('')),
    alvaraUrl: z.string().url().optional().or(z.literal('')),
  }).optional(),
  firstRegistrationDate: z.date().optional(),
  lastUpdate: z.date().optional(),
});

const costEntrySchema = z.object({
  orderId: z.string({ required_error: "Selecione uma Ordem de Serviço." }),
  description: z.string().min(3, "A descrição é obrigatória."),
  quantity: z.coerce.number().min(0.01, "A quantidade deve ser maior que zero."),
  unitCost: z.coerce.number().min(0.01, "O custo unitário deve ser maior que zero."),
});

type CostEntryData = z.infer<typeof costEntrySchema>;

type Supplier = z.infer<typeof supplierSchema>;
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


export default function CostsPage() {
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [recentCostEntries, setRecentCostEntries] = useState<any[]>([]);
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

    const itemForm = useForm<ItemUpdateData>({
        resolver: zodResolver(itemUpdateSchema),
    });

    const supplierForm = useForm<Supplier>({
        resolver: zodResolver(supplierSchema),
        defaultValues: {
            status: 'ativo',
            address: {},
            bankInfo: {},
            commercialInfo: {},
            documentation: {},
        }
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
                    date: data.date.toDate(),
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
                        deliveryReceiptDate: item.deliveryReceiptDate?.toDate() || null,
                        inspectionStatus: item.inspectionStatus || "Pendente",
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
            const suppliersList: Supplier[] = suppliersSnapshot.docs.map(d => ({ 
              ...d.data(), 
              id: d.id,
              firstRegistrationDate: d.data().firstRegistrationDate?.toDate(),
              lastUpdate: d.data().lastUpdate?.toDate(),
            }) as Supplier);
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
                        costEntries: data.costEntries || [],
                    };
                });
            setOrders(ordersList);

            const allEntries = ordersList.flatMap(order => 
                (order.costEntries || []).map((entry: any) => ({
                    ...entry,
                    orderId: order.id,
                    internalOS: order.internalOS,
                    customerName: order.customerName,
                    entryDate: entry.entryDate?.toDate(),
                }))
            ).sort((a, b) => b.entryDate?.getTime() - a.entryDate?.getTime());

            setRecentCostEntries(allEntries);

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

            toast({ title: "Item atualizado com sucesso!" });
            setIsFormOpen(false);
            await fetchRequisitions();
        } catch (error: any) {
            console.error("Error updating item:", error);
            toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
        }
    };
    
    const onSupplierSubmit = async (values: Supplier) => {
        try {
            const finalNomeFantasia = values.nomeFantasia || values.razaoSocial || '';
            const razaoSocial = values.razaoSocial || '';

            const dataToSave: any = {
                ...values,
                razaoSocial: razaoSocial,
                nomeFantasia: finalNomeFantasia,
                lastUpdate: Timestamp.now(),
            };
            dataToSave.name = finalNomeFantasia;


            if (!dataToSave.supplierCode) {
                const highestCode = suppliers.reduce((max, s) => {
                    const codeNum = parseInt(s.supplierCode || "0", 10);
                    return !isNaN(codeNum) && codeNum > max ? codeNum : max;
                }, 0);
                dataToSave.supplierCode = (highestCode + 1).toString().padStart(5, '0');
            }

            if (selectedSupplier?.id) { 
                const { id, ...updateData } = dataToSave;
                await setDoc(doc(db, "companies", "mecald", "suppliers", selectedSupplier.id), updateData, { merge: true });
                toast({ title: "Fornecedor atualizado com sucesso!" });
            } else { 
                dataToSave.firstRegistrationDate = Timestamp.now();
                await addDoc(collection(db, "companies", "mecald", "suppliers"), dataToSave);
                toast({ title: "Fornecedor adicionado com sucesso!" });
            }
            setIsSupplierFormOpen(false);
            await fetchSuppliers();
        } catch (error) {
            console.error("Error saving supplier:", error);
            toast({ variant: "destructive", title: "Erro ao salvar fornecedor" });
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
            await fetchOrders();
        } catch (error) {
            console.error("Error adding cost entry:", error);
            toast({ variant: "destructive", title: "Erro ao lançar custo." });
        }
    };

    const handleAddSupplierClick = () => {
        setSelectedSupplier(null);
        supplierForm.reset({ status: 'ativo', address: {}, bankInfo: {}, commercialInfo: {}, documentation: {} });
        setIsSupplierFormOpen(true);
    };

    const handleEditSupplierClick = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        supplierForm.reset(supplier);
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

    return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Centro de Custos</h1>
        </div>
        <Tabs defaultValue="receipts" className="space-y-4">
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
                                            <span className="font-bold text-primary">Requisição Nº {req.requisitionNumber}</span>
                                            <span className="text-muted-foreground text-sm ml-4">Data: {format(req.date, 'dd/MM/yyyy')}</span>
                                        </div>
                                        <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-2">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead>Status</TableHead>
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
                                                <TableCell className="font-mono">{supplier.supplierCode}</TableCell>
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
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma OS" /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {isLoadingOrders ? <SelectItem value="loading" disabled>Carregando...</SelectItem> : 
                                                    orders.map(o => <SelectItem key={o.id} value={o.id}>OS: {o.internalOS} - {o.customerName}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                    <FormField control={costEntryForm.control} name="description" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Descrição do Item/Serviço</FormLabel>
                                            <FormControl><Input placeholder="Ex: Eletrodo 7018, Disco de corte" {...field} value={field.value ?? ''} /></FormControl>
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
                        <CardTitle>Custos Lançados Recentemente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingOrders ? <Skeleton className="h-48 w-full" /> : 
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>OS</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Custo Total</TableHead>
                                    <TableHead>Lançado por</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentCostEntries.length > 0 ? (
                                    recentCostEntries.slice(0, 10).map(entry => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{entry.entryDate ? format(entry.entryDate, 'dd/MM/yyyy HH:mm') : 'N/A'}</TableCell>
                                            <TableCell>{entry.internalOS}</TableCell>
                                            <TableCell>{entry.description}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                {entry.totalCost?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </TableCell>
                                            <TableCell>{entry.enteredBy}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">Nenhum custo lançado ainda.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        }
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
                                       {suppliers.map(s => <SelectItem key={s.id!} value={s.nomeFantasia || s.razaoSocial!}>{s.nomeFantasia || s.razaoSocial}</SelectItem>)}
                                   </SelectContent>
                               </Select>
                               <FormMessage />
                           </FormItem>
                        )}/>
                        <FormField control={itemForm.control} name="deliveryReceiptDate" render={({ field }) => (
                            <FormItem className="flex flex-col"><FormLabel>Data de Entrega</FormLabel>
                                <Popover><PopoverTrigger asChild>
                                    <FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl>
                                </PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={itemForm.control} name="invoiceNumber" render={({ field }) => (
                            <FormItem><FormLabel>Nota Fiscal</FormLabel><FormControl><Input placeholder="Nº da NF-e" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={itemForm.control} name="invoiceItemValue" render={({ field }) => (
                            <FormItem><FormLabel>Valor do Item (R$)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={itemForm.control} name="certificateNumber" render={({ field }) => (
                            <FormItem><FormLabel>Nº do Certificado</FormLabel><FormControl><Input placeholder="Certificado de qualidade/material" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                         <FormField control={itemForm.control} name="storageLocation" render={({ field }) => (
                            <FormItem><FormLabel>Local de Armazenamento</FormLabel><FormControl><Input placeholder="Ex: Prateleira A-10" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>

                    <FormField control={itemForm.control} name="inspectionStatus" render={({ field }) => (
                        <FormItem><FormLabel>Status da Inspeção</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl>
                                <SelectTrigger><SelectValue placeholder="Selecione o status da inspeção" /></SelectTrigger>
                            </FormControl><SelectContent>
                                {inspectionStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                            </SelectContent></Select><FormMessage />
                        </FormItem>
                    )}/>
                    
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
        <DialogContent className="max-w-4xl h-[90vh]">
            <DialogHeader>
              <DialogTitle>{selectedSupplier ? `Editar Fornecedor: ${selectedSupplier.nomeFantasia || selectedSupplier.razaoSocial}` : "Adicionar Novo Fornecedor"}</DialogTitle>
              <DialogDescription>Preencha os dados completos do fornecedor.</DialogDescription>
            </DialogHeader>
            <Form {...supplierForm}>
                <form onSubmit={supplierForm.handleSubmit(onSupplierSubmit)} className="flex flex-col h-full">
                  <Tabs defaultValue="general" className="flex-grow flex flex-col">
                    <TabsList>
                      <TabsTrigger value="general">Gerais</TabsTrigger>
                      <TabsTrigger value="contact">Contato e Endereço</TabsTrigger>
                      <TabsTrigger value="commercial">Comercial e Bancário</TabsTrigger>
                      <TabsTrigger value="docs">Documentos</TabsTrigger>
                    </TabsList>
                    <ScrollArea className="flex-grow mt-4 pr-6">
                      <TabsContent value="general" className="space-y-4">
                        <FormField control={supplierForm.control} name="status" render={({ field }) => (<FormItem><FormLabel>Status</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent></Select><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="razaoSocial" render={({ field }) => (<FormItem><FormLabel>Razão Social</FormLabel><FormControl><Input placeholder="Nome jurídico da empresa" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="nomeFantasia" render={({ field }) => (<FormItem><FormLabel>Nome Fantasia</FormLabel><FormControl><Input placeholder="Nome comercial (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="cnpj" render={({ field }) => (<FormItem><FormLabel>CNPJ</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <div className="grid md:grid-cols-2 gap-4">
                          <FormField control={supplierForm.control} name="inscricaoEstadual" render={({ field }) => (<FormItem><FormLabel>Inscrição Estadual</FormLabel><FormControl><Input placeholder="Opcional" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={supplierForm.control} name="inscricaoMunicipal" render={({ field }) => (<FormItem><FormLabel>Inscrição Municipal</FormLabel><FormControl><Input placeholder="Opcional" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                         <div className="grid md:grid-cols-2 gap-4">
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
                          <FormField control={supplierForm.control} name="category" render={({ field }) => (<FormItem><FormLabel>Categoria</FormLabel><FormControl><Input placeholder="Ex: Matéria-prima, Serviço" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                         {selectedSupplier && (<div className="text-xs text-muted-foreground space-y-1 pt-4"><p>Código: {selectedSupplier.supplierCode}</p><p>Cadastrado em: {selectedSupplier.firstRegistrationDate ? format(selectedSupplier.firstRegistrationDate, 'dd/MM/yyyy HH:mm') : 'N/A'}</p><p>Última atualização: {selectedSupplier.lastUpdate ? format(selectedSupplier.lastUpdate, 'dd/MM/yyyy HH:mm') : 'N/A'}</p></div>)}
                      </TabsContent>
                      <TabsContent value="contact" className="space-y-4">
                        <FormField control={supplierForm.control} name="salesContactName" render={({ field }) => (<FormItem><FormLabel>Nome do Responsável Comercial</FormLabel><FormControl><Input placeholder="Nome do contato" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <div className="grid md:grid-cols-2 gap-4">
                          <FormField control={supplierForm.control} name="telefone" render={({ field }) => (<FormItem><FormLabel>Telefone</FormLabel><FormControl><Input placeholder="(XX) XXXXX-XXXX" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={supplierForm.control} name="primaryEmail" render={({ field }) => (<FormItem><FormLabel>E-mail Principal</FormLabel><FormControl><Input type="email" placeholder="contato@fornecedor.com" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
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
                        <FormField control={supplierForm.control} name="documentation.contratoSocialUrl" render={({ field }) => (<FormItem><FormLabel>Link do Contrato Social</FormLabel><FormControl><Input type="url" placeholder="https://" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.cartaoCnpjUrl" render={({ field }) => (<FormItem><FormLabel>Link do Cartão CNPJ</FormLabel><FormControl><Input type="url" placeholder="https://" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.certidoesNegativasUrl" render={({ field }) => (<FormItem><FormLabel>Link das Certidões Negativas</FormLabel><FormControl><Input type="url" placeholder="https://" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.isoCertificateUrl" render={({ field }) => (<FormItem><FormLabel>Link do Certificado ISO (se aplicável)</FormLabel><FormControl><Input type="url" placeholder="https://" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={supplierForm.control} name="documentation.alvaraUrl" render={({ field }) => (<FormItem><FormLabel>Link do Alvará/Licença (se aplicável)</FormLabel><FormControl><Input type="url" placeholder="https://" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)}/>
                      </TabsContent>
                    </ScrollArea>
                  </Tabs>
                    <DialogFooter className="pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => setIsSupplierFormOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={supplierForm.formState.isSubmitting}>
                            {supplierForm.formState.isSubmitting ? "Salvando..." : (selectedSupplier ? 'Salvar Alterações' : 'Adicionar Fornecedor')}
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
    </>
    );
}
