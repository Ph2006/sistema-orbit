
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, setDoc, addDoc, Timestamp, getDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";
import { ptBR } from 'date-fns/locale';

// Imports from shadcn/ui and lucide-react
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Trash2, FileSignature, Search, CalendarIcon, Copy, FileClock, Hourglass, CheckCircle, PackageCheck, Ban, FileUp, History, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatCard } from "@/components/dashboard/stat-card";
import { cn } from "@/lib/utils";

// Schemas
const requisitionItemSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  material: z.string().optional(),
  dimensao: z.string().optional(),
  pesoUnitario: z.coerce.number().min(0).optional(),
  description: z.string().min(3, "Descrição obrigatória."),
  quantityRequested: z.coerce.number().min(0.1, "Qtd. deve ser maior que 0."),
  quantityFulfilled: z.coerce.number().min(0).optional().default(0),
  unit: z.string().min(1, "Unidade obrigatória (ex: m, kg, pç)."),
  neededDate: z.date().optional().nullable(),
  notes: z.string().optional(),
});

const requisitionSchema = z.object({
  id: z.string().optional(),
  requisitionNumber: z.string().optional(),
  date: z.date(),
  status: z.enum(["Pendente", "Aprovada", "Reprovada", "Atendida Parcialmente", "Atendida Totalmente", "Cancelada"]),
  requestedBy: z.string().min(1, "Selecione o responsável"),
  department: z.string().optional(),
  orderId: z.string().optional(),
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
type OrderInfo = { id: string; internalOS: string; };
type TeamMember = { id: string; name: string };

const RequisitionStatus: Requisition['status'][] = ["Pendente", "Aprovada", "Reprovada", "Atendida Parcialmente", "Atendida Totalmente", "Cancelada"];

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

    const form = useForm<Requisition>({
        resolver: zodResolver(requisitionSchema),
        defaultValues: {
            date: new Date(),
            status: "Pendente",
            items: [],
            history: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

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

            // ORDERS
            const ordersDataList = ordersSnapshot.docs
              .map(doc => {
                  const data = doc.data();
                  if (['Concluído', 'Cancelado'].includes(data.status) || !data.internalOS) {
                      return null;
                  }
                  
                  return {
                      id: doc.id,
                      internalOS: data.internalOS.toString(),
                  };
              })
              .filter((order): order is OrderInfo => order !== null);
            setOrders(ordersDataList);

            // TEAM
            if (teamSnapshot.exists()) {
                const teamData = teamSnapshot.data();
                if (teamData && Array.isArray(teamData.members)) {
                     const membersList = teamData.members
                        .filter((m: any) => m && m.name)
                        .map((m: any) => ({
                          id: m.id?.toString() || m.name,
                          name: m.name,
                        }));
                    setTeam(membersList);
                }
            }
            
            // REQUISITIONS
            const reqsList: Requisition[] = reqsSnapshot.docs.map(d => {
                const data = d.data();
                return {
                    ...data,
                    id: d.id,
                    date: data.date.toDate(),
                    approval: data.approval ? {
                        ...data.approval,
                        approvalDate: data.approval.approvalDate?.toDate() || null,
                    } : {},
                    items: data.items.map((item: any) => ({...item, neededDate: item.neededDate?.toDate() || null})),
                    history: (data.history || []).map((h: any) => ({...h, timestamp: h.timestamp.toDate()}))
                } as Requisition
            });
            setRequisitions(reqsList.sort((a, b) => b.date.getTime() - a.date.getTime()));
            
        } catch (error: any) {
            console.error("Error fetching data:", error);
            let description = "Não foi possível buscar os dados do sistema. Tente recarregar a página.";
            if (error.code === 'permission-denied') {
                description = "Permissão negada. Verifique as regras de segurança do seu Firestore e se você está autenticado corretamente.";
            }
            toast({ variant: "destructive", title: "Erro ao Carregar Dados", description: description, duration: 8000 });
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

    const handleOpenForm = (requisition: Requisition | null = null) => {
        setSelectedRequisition(requisition);
        if (requisition) {
            form.reset(requisition);
        } else {
            form.reset({
                date: new Date(),
                status: "Pendente",
                items: [],
                history: [],
                requestedBy: user?.displayName || user?.email || undefined
            });
        }
        setIsFormOpen(true);
    };

    const handleDelete = (requisition: Requisition) => {
        setRequisitionToDelete(requisition);
        setIsDeleting(true);
    };

    const confirmDelete = async () => {
        if (!requisitionToDelete?.id) return;
        try {
            await deleteDoc(doc(db, "companies", "mecald", "materialRequisitions", requisitionToDelete.id));
            toast({ title: "Requisição excluída!", description: "A requisição foi removida com sucesso." });
            await fetchData();
        } catch (error) {
            toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível remover a requisição." });
        } finally {
            setIsDeleting(false);
        }
    };

    const onSubmit = async (values: Requisition) => {
        try {
            const dataToSave: any = {
                ...values,
                date: Timestamp.fromDate(values.date),
                history: [
                    ...(values.history || []),
                    {
                        timestamp: new Date(),
                        user: user?.email || "Sistema",
                        action: selectedRequisition ? "Edição" : "Criação",
                        details: `Requisição ${selectedRequisition ? 'editada' : 'criada'}.`
                    }
                ].map(h => ({...h, timestamp: Timestamp.fromDate(h.timestamp)})),
                items: values.items.map(item => ({
                    ...item,
                    neededDate: item.neededDate ? Timestamp.fromDate(item.neededDate) : null,
                })),
                approval: values.approval ? {
                    ...values.approval,
                    approvalDate: values.approval.approvalDate ? Timestamp.fromDate(values.approval.approvalDate) : null
                } : null
            };

            if (selectedRequisition?.id) {
                await setDoc(doc(db, "companies", "mecald", "materialRequisitions", selectedRequisition.id), dataToSave);
                toast({ title: "Requisição atualizada!", description: "As alterações foram salvas com sucesso." });
            } else {
                const highestNumber = requisitions.length > 0 ? Math.max(...requisitions.map(r => parseInt(r.requisitionNumber || "0"))) : 0;
                dataToSave.requisitionNumber = (highestNumber + 1).toString().padStart(5, '0');
                await addDoc(collection(db, "companies", "mecald", "materialRequisitions"), dataToSave);
                toast({ title: "Requisição criada!", description: "A nova requisição foi salva." });
            }

            setIsFormOpen(false);
            await fetchData();
        } catch (error) {
            console.error("Error saving requisition:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Ocorreu um erro ao salvar os dados da requisição." });
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
                                            <TableCell colSpan={6} className="h-24 text-center">Nenhuma requisição encontrada.</TableCell>
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
                                    <TabsTrigger value="items">Itens Solicitados</TabsTrigger>
                                    <TabsTrigger value="approval">Aprovação</TabsTrigger>
                                    <TabsTrigger value="history">Histórico</TabsTrigger>
                                </TabsList>
                                <div className="flex-grow mt-4 overflow-hidden">
                                <ScrollArea className="h-full pr-6">
                                <TabsContent value="details" className="space-y-6">
                                  <Card>
                                    <CardHeader><CardTitle>1. Identificação da Requisição</CardTitle></CardHeader>
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
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardHeader><CardTitle>7. Comentários e Anexos</CardTitle></CardHeader>
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
                                        <CardHeader className="flex flex-row justify-between items-center">
                                            <CardTitle>2. Detalhamento dos Itens Solicitados</CardTitle>
                                            <Button type="button" size="sm" variant="outline"
                                                onClick={() => append({ description: "", quantityRequested: 1, unit: "", material: "", dimensao: "", pesoUnitario: 0 })}>
                                                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Item
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {fields.map((field, index) => (
                                                <Card key={field.id} className="p-4 bg-muted/30 relative">
                                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                                    <div className="space-y-4">
                                                        <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                                            <FormItem><FormLabel>Descrição do Item</FormLabel><FormControl><Input placeholder="Ex: Chapa de Aço 1/4" {...field} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <FormField control={form.control} name={`items.${index}.code`} render={({ field }) => (
                                                                <FormItem><FormLabel>Código</FormLabel><FormControl><Input placeholder="Opcional" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name={`items.${index}.material`} render={({ field }) => (
                                                                <FormItem><FormLabel>Material</FormLabel><FormControl><Input placeholder="Ex: Aço 1020" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                            )} />
                                                            <FormField control={form.control} name={`items.${index}.dimensao`} render={({ field }) => (
                                                                <FormItem><FormLabel>Dimensão</FormLabel><FormControl><Input placeholder="Ex: 1/2'' x 1.200 x 3.000mm" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                            )} />
                                                        </div>
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                            <FormField control={form.control} name={`items.${index}.quantityRequested`} render={({ field }) => (
                                                                <FormItem><FormLabel>Qtd. Solicitada</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                                            )} />
                                                             <FormField control={form.control} name={`items.${index}.unit`} render={({ field }) => (
                                                                <FormItem><FormLabel>Unidade</FormLabel><FormControl><Input placeholder="kg, m, pç" {...field} /></FormControl><FormMessage /></FormItem>
                                                            )} />
                                                             <FormField control={form.control} name={`items.${index}.pesoUnitario`} render={({ field }) => (
                                                                <FormItem><FormLabel>Peso Unit. (kg)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                            )} />
                                                            {selectedRequisition && (
                                                                <FormField control={form.control} name={`items.${index}.quantityFulfilled`} render={({ field }) => (
                                                                    <FormItem><FormLabel>Qtd. Atendida</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                                                )} />
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <FormField control={form.control} name={`items.${index}.neededDate`} render={({ field }) => (
                                                                <FormItem className="flex flex-col"><FormLabel>Data de Necessidade</FormLabel>
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
                                                        </div>
                                                        <FormField control={form.control} name={`items.${index}.notes`} render={({ field }) => (
                                                            <FormItem><FormLabel>Observações do Item</FormLabel><FormControl><Input placeholder="Ex: Certificado de qualidade, norma específica" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                        <div className="flex justify-end gap-4 text-sm mt-2">
                                                            <Button type="button" variant="link" size="sm" className="h-auto p-0">Verificar Estoque</Button>
                                                            <Button type="button" variant="link" size="sm" className="h-auto p-0">Gerar Pedido de Compra</Button>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                            {fields.length === 0 && <p className="text-center text-muted-foreground p-4">Nenhum material adicionado.</p>}
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                                <TabsContent value="approval" className="space-y-6">
                                    <Card>
                                        <CardHeader><CardTitle>4. Autorização e Aprovação</CardTitle></CardHeader>
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
                                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent>
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
                                                    ))}
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
                            <DialogFooter className="pt-6 border-t mt-4 flex-shrink-0">
                                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? "Salvando..." : (selectedRequisition ? "Salvar Alterações" : "Criar Requisição")}
                                </Button>
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
