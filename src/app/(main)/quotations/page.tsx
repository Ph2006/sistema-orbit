
"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Search, Pencil, Trash2, CalendarIcon, X, PackagePlus } from "lucide-react";
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

const itemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(3, "A descrição é obrigatória."),
  quantity: z.coerce.number().min(1, "A quantidade deve ser pelo menos 1."),
  unitPrice: z.coerce.number().min(0, "O preço não pode ser negativo."),
});

const quotationSchema = z.object({
  customer: z.object({
    id: z.string({ required_error: "Selecione um cliente." }),
    name: z.string(),
  }),
  status: z.enum(["Aguardando Aprovação", "Enviado", "Aprovado", "Reprovado", "Informativo"], { required_error: "Selecione um status." }),
  validity: z.date({ required_error: "A data de validade é obrigatória." }),
  paymentTerms: z.string().min(3, "As condições de pagamento são obrigatórias."),
  deliveryTime: z.string().min(3, "O prazo de entrega é obrigatório."),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, "Adicione pelo menos um item ao orçamento."),
});

type Quotation = z.infer<typeof quotationSchema> & { id: string, createdAt: Timestamp, number: number };
type Customer = { id: string, nomeFantasia: string };

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
            items: [{ description: "", quantity: 1, unitPrice: 0 }],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

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
                'approved': 'Aprovado',
                'aprovado': 'Aprovado',
                'awaiting approval': 'Aguardando Aprovação',
                'aguardando aprovação': 'Aguardando Aprovação',
                'pending': 'Aguardando Aprovação',
                'pendente': 'Aguardando Aprovação',
                'rejected': 'Reprovado',
                'reprovado': 'Reprovado',
                'recusado': 'Reprovado',
                'cancelado': 'Reprovado',
                'sent': 'Enviado',
                'enviado': 'Enviado',
                'informative': 'Informativo',
                'informativo': 'Informativo',
            };

            return translations[lowerCaseStatus] || originalStatus;
        };

        try {
            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "quotations"));
            const quotationsList = querySnapshot.docs.map(doc => {
                const data = doc.data();

                let finalItems = data.items || [];
                if ((!finalItems || finalItems.length === 0) && Array.isArray(data.includedServices) && data.includedServices.length > 0) {
                    finalItems = data.includedServices.map((service: string) => ({
                        description: service,
                        quantity: 1,
                        unitPrice: 0,
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
            let dataToSave: any = {
                ...values,
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
            status: "Aguardando Aprovação",
            validity: new Date(new Date().setDate(new Date().getDate() + 15)),
            paymentTerms: "A combinar",
            deliveryTime: "A combinar",
            notes: "",
            items: [{ description: "", quantity: 1, unitPrice: 0 }],
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
            totalValue: calculateTotal(quotation.items),
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
            case "Informativo": return "outline";
            default: return "outline";
        }
    };

    const calculateTotal = (items: z.infer<typeof itemSchema>[]) => {
        return items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
    };

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
                                                    {calculateTotal(q.items).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
                            <ScrollArea className="h-[70vh] pr-6">
                                <div className="space-y-6 p-1">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <FormField control={form.control} name="customer" render={({ field }) => (
                                            <FormItem className="md:col-span-2"><FormLabel>Cliente</FormLabel>
                                                <Select onValueChange={(value) => {
                                                    const selectedCustomer = customers.find(c => c.id === value);
                                                    field.onChange({ id: value, name: selectedCustomer?.nomeFantasia || '' });
                                                }} defaultValue={field.value?.id}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger></FormControl>
                                                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.nomeFantasia}</SelectItem>)}</SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={form.control} name="status" render={({ field }) => (
                                            <FormItem><FormLabel>Status</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um status" /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Aguardando Aprovação">Aguardando Aprovação</SelectItem>
                                                        <SelectItem value="Enviado">Enviado</SelectItem>
                                                        <SelectItem value="Aprovado">Aprovado</SelectItem>
                                                        <SelectItem value="Reprovado">Reprovado</SelectItem>
                                                        <SelectItem value="Informativo">Informativo</SelectItem>
                                                    </SelectContent>
                                                </Select><FormMessage />
                                            </FormItem>
                                        )} />
                                    </div>
                                    
                                    <Card>
                                        <CardHeader><CardTitle>Itens do Orçamento</CardTitle></CardHeader>
                                        <CardContent className="space-y-4">
                                            {fields.map((field, index) => (
                                                <div key={field.id} className="grid grid-cols-[1fr_100px_150px_40px] gap-2 items-start">
                                                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                                        <FormItem><FormLabel className={cn(index !== 0 && "sr-only")}>Descrição</FormLabel><FormControl><Input placeholder="Descrição do item" {...field} /></FormControl><FormMessage /></FormItem>
                                                    )}/>
                                                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                                                        <FormItem><FormLabel className={cn(index !== 0 && "sr-only")}>Qtd.</FormLabel><FormControl><Input type="number" placeholder="Qtd." {...field} /></FormControl><FormMessage /></FormItem>
                                                    )}/>
                                                     <FormField control={form.control} name={`items.${index}.unitPrice`} render={({ field }) => (
                                                        <FormItem><FormLabel className={cn(index !== 0 && "sr-only")}>Preço Unit.</FormLabel><FormControl><Input type="number" placeholder="Preço" {...field} /></FormControl><FormMessage /></FormItem>
                                                    )}/>
                                                    <Button type="button" variant="ghost" size="icon" className="mt-8 text-destructive hover:text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                                </div>
                                            ))}
                                            <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Item
                                            </Button>
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
                                        <FormItem><FormLabel>Observações</FormLabel><FormControl><Textarea placeholder="Observações adicionais, detalhes técnicos, etc." {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                    )}/>
                                </div>
                            </ScrollArea>
                            <DialogFooter className="pt-6">
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? "Salvando..." : "Salvar Orçamento"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            <Sheet open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
                <SheetContent className="w-full sm:max-w-2xl">
                    {selectedQuotation && (
                        <>
                        <SheetHeader>
                            <SheetTitle className="font-headline">Orçamento Nº {selectedQuotation.number}</SheetTitle>
                            <SheetDescription>
                                Cliente: {selectedQuotation.customer.name}
                            </SheetDescription>
                        </SheetHeader>
                        <ScrollArea className="h-[calc(100vh-12rem)]">
                            <div className="space-y-6 py-6 pr-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Detalhes do Orçamento</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Status</span>
                                            <Badge variant={getStatusVariant(selectedQuotation.status)}>{selectedQuotation.status}</Badge>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Data de Criação</span>
                                            <span className="text-sm">{format(selectedQuotation.createdAt.toDate(), "dd/MM/yyyy")}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Validade</span>
                                            <span className="text-sm">{format(selectedQuotation.validity, "dd/MM/yyyy")}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Cond. Pagamento</span>
                                            <span className="text-sm">{selectedQuotation.paymentTerms}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-muted-foreground">Prazo de Entrega</span>
                                            <span className="text-sm">{selectedQuotation.deliveryTime}</span>
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
                                                    <TableHead className="text-right w-[120px]">Subtotal</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {selectedQuotation.items.map((item, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell className="font-medium">{item.description}</TableCell>
                                                        <TableCell className="text-center">{item.quantity}</TableCell>
                                                        <TableCell className="text-right">{item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                        <TableCell className="text-right">{(item.quantity * item.unitPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        <Separator className="my-4" />
                                        <div className="flex justify-end items-center gap-4 text-lg font-bold pr-4">
                                            <span>Total:</span>
                                            <span>
                                                {calculateTotal(selectedQuotation.items).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>

                                {selectedQuotation.notes && (
                                    <Card>
                                        <CardHeader><CardTitle>Observações</CardTitle></CardHeader>
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
