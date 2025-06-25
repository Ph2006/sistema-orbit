
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Search, Pencil, Trash2, CalendarIcon, X, PackagePlus, Percent, DollarSign, FileText } from "lucide-react";
import { useAuth } from "../layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/dashboard/stat-card";

const itemSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  description: z.string().min(3, "A descrição é obrigatória."),
  quantity: z.coerce.number().min(1, "A quantidade deve ser pelo menos 1."),
  unitPrice: z.coerce.number().min(0, "O preço não pode ser negativo."),
  unitWeight: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).optional(),
  leadTimeDays: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

const quotationSchema = z.object({
  customer: z.object({
    id: z.string({ required_error: "Selecione um cliente." }),
    name: z.string(),
  }),
  buyerName: z.string().optional(),
  status: z.enum(["Aguardando Aprovação", "Enviado", "Aprovado", "Reprovado", "Informativo", "Expirado"], { required_error: "Selecione um status." }),
  validity: z.date({ required_error: "A data de validade é obrigatória." }),
  paymentTerms: z.string().min(3, "As condições de pagamento são obrigatórias."),
  deliveryTime: z.string().min(3, "O prazo de entrega é obrigatório."),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Adicione pelo menos um item ao orçamento."),
});

type Quotation = z.infer<typeof quotationSchema> & { id: string, createdAt: Timestamp, number: number };
type Customer = { id: string, nomeFantasia: string };
type Item = z.infer<typeof itemSchema>;


const calculateItemTotals = (item: Item | any) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const taxRate = Number(item.taxRate) || 0;

    const totalPrice = quantity * unitPrice;
    const taxAmount = totalPrice * (taxRate / 100);
    const totalWithTax = totalPrice + taxAmount;
    
    return { totalPrice, taxAmount, totalWithTax };
};

const calculateGrandTotal = (items: Item[] | any[]) => {
    if (!items) return 0;
    return items.reduce((acc, item) => {
        const { totalWithTax } = calculateItemTotals(item);
        return acc + totalWithTax;
    }, 0);
};

const ItemFormCard = ({ index, control, remove, watchedItems }: { index: number, control: any, remove: (index: number) => void, watchedItems: any[] }) => {
    const currentItem = watchedItems[index] || {};
    const { totalPrice, taxAmount, totalWithTax } = calculateItemTotals(currentItem);

    return (
        <Card className="p-4 relative">
            <div className="flex justify-between items-start mb-4">
                <h4 className="font-semibold text-md pt-2">Item {index + 1}</h4>
                <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive -mt-2 -mr-2" onClick={() => remove(index)}>
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <div className="space-y-4">
                <FormField control={control} name={`items.${index}.description`} render={({ field }) => (
                    <FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea placeholder="Descrição completa do item, serviço ou produto" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField control={control} name={`items.${index}.code`} render={({ field }) => (
                        <FormItem><FormLabel>Código</FormLabel><FormControl><Input placeholder="Cód. do produto" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name={`items.${index}.quantity`} render={({ field }) => (
                        <FormItem><FormLabel>Quantidade</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name={`items.${index}.unitPrice`} render={({ field }) => (
                        <FormItem><FormLabel>Preço Unit. (R$)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                     <FormField control={control} name={`items.${index}.taxRate`} render={({ field }) => (
                        <FormItem><FormLabel>Imposto (%)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )}/>
                </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField control={control} name={`items.${index}.unitWeight`} render={({ field }) => (
                        <FormItem><FormLabel>Peso Unit. (kg)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={control} name={`items.${index}.leadTimeDays`} render={({ field }) => (
                        <FormItem><FormLabel>Prazo (dias)</FormLabel><FormControl><Input type="number" placeholder="Ex: 15" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )}/>
                 </div>
                 <FormField control={control} name={`items.${index}.notes`} render={({ field }) => (
                    <FormItem><FormLabel>Notas do Item</FormLabel><FormControl><Input placeholder="Observações específicas para este item" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                )}/>
                <Separator />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                    <div>
                        <span className="text-muted-foreground">Subtotal: </span>
                        <span className="font-medium">{totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                     <div>
                        <span className="text-muted-foreground">Valor Imposto: </span>
                        <span className="font-medium">{taxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                     <div>
                        <span className="text-muted-foreground">Total do Item: </span>
                        <span className="font-bold text-primary">{totalWithTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                </div>
            </div>
        </Card>
    );
};


export default function QuotationsPage() {
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
    const [quotationToDelete, setQuotationToDelete] = useState<Quotation | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const form = useForm<z.infer<typeof quotationSchema>>({
        resolver: zodResolver(quotationSchema),
        defaultValues: {
            status: "Aguardando Aprovação",
            items: [],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });
    
    const watchedItems = form.watch("items");
    const grandTotal = useMemo(() => calculateGrandTotal(watchedItems), [watchedItems]);


    const fetchCustomers = async () => {
        if (!user) return;
        try {
          const querySnapshot = await getDocs(collection(db, "companies", "mecald", "customers"));
          const customersList = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            nomeFantasia: doc.data().nomeFantasia || doc.data().name || "Cliente sem nome",
          })) as Customer[];
          setCustomers(customersList);
        } catch (error) {
          console.error("Error fetching customers:", error);
        }
    };
    
    const fetchQuotations = async () => {
        if (!user) return;
        setIsLoading(true);

        const mapStatus = (status?: string): string => {
            const originalStatus = status?.trim();
            if (!originalStatus) {
                return "Aguardando Aprovação";
            }
            const lowerCaseStatus = originalStatus.toLowerCase();

            const translations: { [key: string]: string } = {
                'approved': 'Aprovado', 'aprovado': 'Aprovado',
                'awaiting approval': 'Aguardando Aprovação', 'aguardando aprovação': 'Aguardando Aprovação',
                'pending': 'Aguardando Aprovação', 'pendente': 'Aguardando Aprovação',
                'rejected': 'Reprovado', 'reprovado': 'Reprovado', 'recusado': 'Reprovado', 'cancelado': 'Reprovado',
                'sent': 'Enviado', 'enviado': 'Enviado',
                'informative': 'Informativo', 'informativo': 'Informativo',
                'expired': 'Expirado', 'expirado': 'Expirado',
            };

            return translations[lowerCaseStatus] || originalStatus;
        };

        try {
            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "quotations"));
            const quotationsList = querySnapshot.docs.map(doc => {
                const data = doc.data();

                let finalItems = (data.items || []).map((item: any) => ({
                    id: item.id || undefined,
                    code: item.code || '',
                    description: item.description || '',
                    quantity: item.quantity || 1,
                    unitPrice: item.unitPrice || 0,
                    unitWeight: item.unitWeight || 0,
                    taxRate: item.taxRate || 0,
                    leadTimeDays: item.leadTimeDays || undefined,
                    notes: item.notes || '',
                }));

                if (finalItems.length === 0 && Array.isArray(data.includedServices) && data.includedServices.length > 0) {
                    finalItems = data.includedServices.map((service: string) => ({
                        description: service,
                        quantity: 1,
                        unitPrice: 0,
                        code: '', unitWeight: 0, taxRate: 0, notes: ''
                    }));
                }

                if (finalItems.length === 0) {
                    finalItems.push({ description: "Nenhum item/serviço especificado", quantity: 1, unitPrice: 0 });
                }

                const getCreatedAt = () => {
                    if (!data.createdAt) return Timestamp.now();
                    if (data.createdAt.toDate) return data.createdAt;
                    if (typeof data.createdAt === 'string') return Timestamp.fromDate(new Date(data.createdAt));
                    return Timestamp.now();
                }

                const getValidity = () => {
                    if (data.validity?.toDate) return data.validity.toDate();
                    if (data.expiresAt) return new Date(data.expiresAt);
                    return new Date();
                }

                return {
                    id: doc.id,
                    number: data.number || 0,
                    customer: { 
                        id: data.customerId || (data.customer?.id || ''), 
                        name: data.customerName || (data.customer?.name || 'N/A') 
                    },
                    buyerName: data.buyerName || '',
                    status: mapStatus(data.status),
                    validity: getValidity(),
                    paymentTerms: data.paymentTerms || 'A combinar',
                    deliveryTime: data.deliveryTerms || data.deliveryTime || 'A combinar',
                    notes: data.notes || '',
                    items: finalItems,
                    createdAt: getCreatedAt(),
                } as Quotation;
            });
            setQuotations(quotationsList.sort((a, b) => (b.number || 0) - (a.number || 0)));
        } catch (error) {
            console.error("Error fetching quotations:", error);
            toast({
                variant: "destructive",
                title: "Erro ao buscar orçamentos",
                description: "Ocorreu um erro ao carregar os dados. Verifique o console para mais detalhes.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && user) {
            fetchCustomers();
            fetchQuotations();
        }
    }, [user, authLoading]);
    
    const onSubmit = async (values: z.infer<typeof quotationSchema>) => {
        try {
            const itemsWithTotals = values.items.map(item => {
                const { totalPrice, taxAmount, totalWithTax } = calculateItemTotals(item);
                return { ...item, totalPrice, taxAmount, totalWithTax, totalWeight: (item.quantity || 0) * (item.unitWeight || 0) };
            });

            let dataToSave: any = {
                ...values,
                items: itemsWithTotals,
                customerName: values.customer.name,
                customerId: values.customer.id,
                updatedAt: Timestamp.now(),
            };
            // @ts-ignore
            delete dataToSave.customer;

            if (selectedQuotation) {
                dataToSave.createdAt = selectedQuotation.createdAt;
                dataToSave.number = selectedQuotation.number;
                const quotationRef = doc(db, "companies", "mecald", "quotations", selectedQuotation.id);
                await updateDoc(quotationRef, dataToSave);
                toast({ title: "Orçamento atualizado!" });
            } else {
                const highestNumber = quotations.length > 0
                    ? Math.max(...quotations.map(q => q.number || 0))
                    : 0;
                dataToSave.number = highestNumber + 1;
                dataToSave.createdAt = Timestamp.now();
                await addDoc(collection(db, "companies", "mecald", "quotations"), dataToSave);
                toast({ title: "Orçamento criado!" });
            }
            form.reset();
            setIsFormOpen(false);
            setSelectedQuotation(null);
            await fetchQuotations();
        } catch (error) {
            console.error("Error saving quotation: ", error);
            toast({ variant: "destructive", title: "Erro ao salvar" });
        }
    };
    
    const handleAddClick = () => {
        setSelectedQuotation(null);
        form.reset({
            customer: undefined,
            buyerName: "",
            status: "Aguardando Aprovação",
            validity: new Date(new Date().setDate(new Date().getDate() + 15)),
            paymentTerms: "A combinar",
            deliveryTime: "A combinar",
            notes: "",
            items: [{ description: "", quantity: 1, unitPrice: 0, code: '', unitWeight: 0, taxRate: 0, notes: '' }],
        });
        setIsFormOpen(true);
    };

    const handleEditClick = (quotation: Quotation) => {
        setSelectedQuotation(quotation);
        form.reset({
            ...quotation,
            validity: quotation.validity instanceof Date ? quotation.validity : (quotation.validity as any).toDate(),
        });
        setIsFormOpen(true);
    };
    
    const handleDeleteClick = (quotation: Quotation) => {
        setQuotationToDelete(quotation);
        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!quotationToDelete) return;
        try {
            await deleteDoc(doc(db, "companies", "mecald", "quotations", quotationToDelete.id));
            toast({ title: "Orçamento excluído!" });
            setQuotationToDelete(null);
            setIsDeleteDialogOpen(false);
            await fetchQuotations();
        } catch (error) {
            toast({ variant: "destructive", title: "Erro ao excluir" });
        }
    };
    
    const handleViewQuotation = (quotation: Quotation) => {
        setSelectedQuotation(quotation);
        setIsViewSheetOpen(true);
    };

    const handleGenerateOrder = async (quotation: Quotation) => {
        if (!quotation) return;

        const orderData = {
            quotationId: quotation.id,
            quotationNumber: quotation.number,
            customer: quotation.customer,
            items: quotation.items,
            totalValue: calculateGrandTotal(quotation.items),
            status: "Aguardando Produção", // Initial status for a production order
            createdAt: Timestamp.now(),
        };

        try {
            await addDoc(collection(db, "companies", "mecald", "orders"), orderData);
            toast({
                title: "Pedido gerado com sucesso!",
                description: `O pedido para o orçamento Nº ${quotation.number} foi criado.`,
            });
            setIsViewSheetOpen(false);
            router.push('/orders');
        } catch (error) {
            console.error("Error generating order:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar pedido",
                description: "Ocorreu um erro ao criar o pedido. Tente novamente.",
            });
        }
    };
    
    const filteredQuotations = quotations.filter((q) => {
        const query = searchQuery.toLowerCase();
        return (
            (q.number?.toString() || '').toLowerCase().includes(query) ||
            q.customer.name.toLowerCase().includes(query) ||
            q.status.toLowerCase().includes(query)
        );
    });

    const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
        switch (status) {
            case "Aprovado": return "default";
            case "Aguardando Aprovação": return "secondary";
            case "Enviado": return "secondary";
            case "Reprovado": return "destructive";
            case "Expirado": return "destructive";
            case "Informativo": return "outline";
            default: return "outline";
        }
    };

    const dashboardStats = useMemo(() => {
        if (!quotations || quotations.length === 0) {
            return { approvalRate: 0, issuedValue: 0, approvedValue: 0, totalCount: 0 };
        }

        const relevantQuotations = quotations.filter(q => q.status !== "Informativo");
        const approvedQuotations = relevantQuotations.filter(q => q.status === "Aprovado");

        const totalCount = relevantQuotations.length;
        const approvedCount = approvedQuotations.length;
        const approvalRate = totalCount > 0 ? (approvedCount / totalCount) * 100 : 0;

        const issuedValue = relevantQuotations.reduce((acc, q) => acc + calculateGrandTotal(q.items), 0);
        const approvedValue = approvedQuotations.reduce((acc, q) => acc + calculateGrandTotal(q.items), 0);

        return { approvalRate, issuedValue, approvedValue, totalCount };
    }, [quotations]);

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Orçamentos</h1>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar orçamento..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                        </div>
                        <Button onClick={handleAddClick}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Novo Orçamento
                        </Button>
                    </div>
                </div>

                <div className="mb-4 grid gap-4 md:grid-cols-3">
                    <StatCard
                        title="Taxa de Aprovação"
                        value={`${dashboardStats.approvalRate.toFixed(1)}%`}
                        icon={Percent}
                        description={`Baseado em ${dashboardStats.totalCount} orçamentos válidos`}
                    />
                    <StatCard
                        title="Valor Emitido (Total)"
                        value={dashboardStats.issuedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        icon={FileText}
                        description="Soma de todos os orçamentos válidos"
                    />
                    <StatCard
                        title="Valor Aprovado"
                        value={dashboardStats.approvedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        icon={DollarSign}
                        description="Soma de todos os orçamentos aprovados"
                    />
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Orçamentos</CardTitle>
                        <CardDescription>Crie e gerencie os orçamentos para seus clientes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[120px]">Nº Orçamento</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead className="w-[120px]">Criação</TableHead>
                                        <TableHead className="w-[150px]">Valor Total</TableHead>
                                        <TableHead className="w-[180px]">Status</TableHead>
                                        <TableHead className="w-[100px] text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredQuotations.length > 0 ? (
                                        filteredQuotations.map((q) => (
                                            <TableRow key={q.id} onClick={() => handleViewQuotation(q)} className="cursor-pointer">
                                                <TableCell className="font-medium">{q.number}</TableCell>
                                                <TableCell>{q.customer.name}</TableCell>
                                                <TableCell>{format(q.createdAt.toDate(), "dd/MM/yyyy")}</TableCell>
                                                <TableCell>
                                                    {calculateGrandTotal(q.items).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={getStatusVariant(q.status)}>{q.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEditClick(q); }}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteClick(q); }}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-24">Nenhum orçamento encontrado.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{selectedQuotation ? "Editar Orçamento" : "Novo Orçamento"}</DialogTitle>
                        <DialogDescription>Preencha os detalhes do orçamento.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)}>
                            <ScrollArea className="h-[75vh] pr-6">
                                <div className="space-y-6 p-1">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <FormField control={form.control} name="customer" render={({ field }) => (
                                            <FormItem><FormLabel>Cliente</FormLabel>
                                                <Select onValueChange={(value) => {
                                                    const selectedCustomer = customers.find(c => c.id === value);
                                                    field.onChange({ id: value, name: selectedCustomer?.nomeFantasia || '' });
                                                }} defaultValue={field.value?.id}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger></FormControl>
                                                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}</SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="buyerName" render={({ field }) => (
                                            <FormItem><FormLabel>Nome do Comprador</FormLabel><FormControl><Input placeholder="Contato que solicitou" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem>
                                        )}/>
                                        <FormField control={form.control} name="status" render={({ field }) => (
                                            <FormItem><FormLabel>Status</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Aguardando Aprovação">Aguardando Aprovação</SelectItem>
                                                        <SelectItem value="Enviado">Enviado</SelectItem>
                                                        <SelectItem value="Aprovado">Aprovado</SelectItem>
                                                        <SelectItem value="Reprovado">Reprovado</SelectItem>
                                                        <SelectItem value="Expirado">Expirado</SelectItem>
                                                        <SelectItem value="Informativo">Informativo</SelectItem>
                                                    </SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                    
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between">
                                            <CardTitle>Itens do Orçamento</CardTitle>
                                            <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", quantity: 1, unitPrice: 0, code: '', unitWeight: 0, taxRate: 0, notes: '' })}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Item
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {fields.map((field, index) => (
                                                <ItemFormCard key={field.id} index={index} control={form.control} remove={remove} watchedItems={watchedItems} />
                                            ))}
                                            {fields.length > 0 && (
                                                <>
                                                    <Separator className="my-4" />
                                                    <div className="flex justify-end items-center gap-4 text-lg font-bold pr-4">
                                                        <span>Total Geral:</span>
                                                        <span className="text-primary">
                                                            {grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                                            <FormItem><FormLabel>Condições de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                        <FormField control={form.control} name="deliveryTime" render={({ field }) => (
                                            <FormItem><FormLabel>Prazo de Entrega</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )}/>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name="validity" render={({ field }) => (
                                            <FormItem className="flex flex-col"><FormLabel>Validade da Proposta</FormLabel>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <FormControl>
                                                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                            </Button>
                                                        </FormControl>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0" align="start">
                                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                                    </PopoverContent>
                                                </Popover><FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                     <FormField control={form.control} name="notes" render={({ field }) => (
                                        <FormItem><FormLabel>Observações Gerais</FormLabel><FormControl><Textarea placeholder="Observações adicionais, detalhes técnicos, etc." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                </div>
                            </ScrollArea>
                            <DialogFooter className="pt-6 border-t">
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? "Salvando..." : "Salvar Orçamento"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Sheet open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
                <SheetContent className="w-full sm:max-w-3xl">
                    {selectedQuotation && (
                        <>
                        <SheetHeader>
                            <SheetTitle className="font-headline text-2xl">Orçamento Nº {selectedQuotation.number}</SheetTitle>
                            <SheetDescription>
                                Cliente: <span className="font-medium text-foreground">{selectedQuotation.customer.name}</span>
                                {selectedQuotation.buyerName && ` | Comprador: `}
                                {selectedQuotation.buyerName && <span className="font-medium text-foreground">{selectedQuotation.buyerName}</span>}
                            </SheetDescription>
                        </SheetHeader>
                        <ScrollArea className="h-[calc(100vh-12rem)]">
                            <div className="space-y-6 py-6 pr-6">
                                <Card>
                                    <CardHeader><CardTitle>Detalhes do Orçamento</CardTitle></CardHeader>
                                    <CardContent className="space-y-3 text-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Status</span>
                                            <Badge variant={getStatusVariant(selectedQuotation.status)}>{selectedQuotation.status}</Badge>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Data de Criação</span>
                                            <span>{format(selectedQuotation.createdAt.toDate(), "dd/MM/yyyy")}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Validade</span>
                                            <span>{format(selectedQuotation.validity, "dd/MM/yyyy")}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Cond. Pagamento</span>
                                            <span>{selectedQuotation.paymentTerms}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-muted-foreground">Prazo de Entrega</span>
                                            <span>{selectedQuotation.deliveryTime}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                                
                                <Card>
                                    <CardHeader><CardTitle>Itens e Valores</CardTitle></CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Descrição</TableHead>
                                                    <TableHead className="text-center w-[60px]">Qtd.</TableHead>
                                                    <TableHead className="text-right w-[120px]">Valor Unit.</TableHead>
                                                    <TableHead className="text-right w-[150px]">Subtotal c/ Imposto</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {selectedQuotation.items.map((item, index) => {
                                                    const { totalWithTax } = calculateItemTotals(item);
                                                    return (
                                                        <TableRow key={index}>
                                                            <TableCell className="font-medium">
                                                                {item.description}
                                                                {item.code && <span className="block text-xs text-muted-foreground">Cód: {item.code}</span>}
                                                            </TableCell>
                                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                                            <TableCell className="text-right">{item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                            <TableCell className="text-right font-semibold">{totalWithTax.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                            </TableBody>
                                        </Table>
                                        <Separator className="my-4" />
                                        <div className="flex justify-end items-center gap-4 text-xl font-bold pr-4">
                                            <span>Total Geral:</span>
                                            <span className="text-primary">
                                                {calculateGrandTotal(selectedQuotation.items).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>

                                {selectedQuotation.notes && (
                                    <Card>
                                        <CardHeader><CardTitle>Observações Gerais</CardTitle></CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedQuotation.notes}</p>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </ScrollArea>
                        <SheetFooter className="pt-4 pr-6 border-t">
                            {selectedQuotation.status === 'Aprovado' && (
                                <Button onClick={() => handleGenerateOrder(selectedQuotation)} className="w-full sm:w-auto">
                                    <PackagePlus className="mr-2 h-4 w-4" />
                                    Gerar Pedido de Produção
                                </Button>
                            )}
                        </SheetFooter>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação não pode ser desfeita. Isso excluirá permanentemente o orçamento.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
                        Sim, excluir
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
