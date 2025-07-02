"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
    PlusCircle, Pencil, Trash2, Phone, AlertCircle, 
    CheckCircle, Clock, AlertTriangle, FileText, User
} from "lucide-react";

// === TIPOS E INTERFACES ===
type OrderInfo = { 
    id: string; 
    number: string; 
    customerId: string; 
    customerName: string;
    projectName?: string;
    items: { id: string; description: string; code?: string; quantity?: number }[] 
};

type TeamMember = { 
    id: string; 
    name: string 
};

// === SCHEMAS ===
const engineeringTicketSchema = z.object({
    id: z.string().optional(),
    ticketNumber: z.string().optional(),
    title: z.string().min(10, "O título deve ter pelo menos 10 caracteres."),
    description: z.string().min(20, "A descrição deve ter pelo menos 20 caracteres."),
    orderId: z.string().min(1, "O pedido é obrigatório."),
    itemId: z.string().optional(),
    priority: z.enum(["Baixa", "Média", "Alta", "Crítica"]),
    category: z.enum([
        "Alteração de Desenho",
        "Esclarecimento Técnico", 
        "Problema de Fabricação",
        "Revisão de Especificação",
        "Solicitação de Procedimento",
        "Não Conformidade",
        "Melhoria de Processo",
        "Outro"
    ]),
    status: z.enum(["Aberto", "Em Análise", "Aguardando Cliente", "Resolvido", "Fechado"]),
    requestedBy: z.string().min(1, "O solicitante é obrigatório."),
    assignedTo: z.string().optional(),
    createdDate: z.date(),
    dueDate: z.date().optional().nullable(),
    resolvedDate: z.date().optional().nullable(),
    resolution: z.string().optional(),
    comments: z.array(z.object({
        id: z.string(),
        author: z.string(),
        content: z.string(),
        timestamp: z.date(),
        type: z.enum(["comment", "status_change", "assignment"])
    })).optional(),
});

type EngineeringTicket = z.infer<typeof engineeringTicketSchema> & { 
    id: string; 
    itemName?: string;
};

// === COMPONENTE PRINCIPAL ===
interface OrderEngineeringTicketsProps {
    selectedOrder: OrderInfo | null;
    teamMembers: TeamMember[];
    user: any;
    toast: any;
    isLoading: boolean;
}

export default function OrderEngineeringTickets({ 
    selectedOrder, 
    teamMembers, 
    user, 
    toast,
    isLoading: parentLoading 
}: OrderEngineeringTicketsProps) {
    const [tickets, setTickets] = useState<EngineeringTicket[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<EngineeringTicket | null>(null);
    const [ticketToDelete, setTicketToDelete] = useState<EngineeringTicket | null>(null);
    const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

    // Form
    const form = useForm<z.infer<typeof engineeringTicketSchema>>({
        resolver: zodResolver(engineeringTicketSchema),
        defaultValues: {
            title: "",
            description: "",
            orderId: selectedOrder?.id || "",
            priority: "Média",
            category: "Esclarecimento Técnico",
            status: "Aberto",
            requestedBy: user?.displayName || "",
            createdDate: new Date(),
            comments: [],
        },
    });

    // === DATA FETCHING ===
    const fetchTicketsForOrder = async () => {
        if (!selectedOrder?.id) return;
        
        setIsLoading(true);
        try {
            const ticketsQuery = query(
                collection(db, "companies", "mecald", "engineeringTickets"),
                where("orderId", "==", selectedOrder.id),
                orderBy("createdDate", "desc")
            );
            
            const ticketsSnapshot = await getDocs(ticketsQuery);
            
            const ticketsList = ticketsSnapshot.docs.map(doc => {
                const data = doc.data();
                const item = selectedOrder.items.find(i => i.id === data.itemId);
                
                return {
                    id: doc.id,
                    ...data,
                    createdDate: data.createdDate.toDate(),
                    dueDate: data.dueDate?.toDate() || null,
                    resolvedDate: data.resolvedDate?.toDate() || null,
                    comments: (data.comments || []).map((comment: any) => ({
                        ...comment,
                        timestamp: comment.timestamp.toDate(),
                    })),
                    itemName: item?.description || 'N/A',
                } as EngineeringTicket;
            });
            
            setTickets(ticketsList);
        } catch (error) {
            console.error("Error fetching tickets for order:", error);
            toast({ variant: "destructive", title: "Erro ao buscar chamados" });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedOrder?.id && !parentLoading) {
            fetchTicketsForOrder();
        }
    }, [selectedOrder?.id, parentLoading]);

    // === SUBMIT HANDLERS ===
    const onSubmit = async (values: z.infer<typeof engineeringTicketSchema>) => {
        try {
            if (!selectedOrder) {
                toast({ variant: "destructive", title: "Erro: Nenhum pedido selecionado" });
                return;
            }

            const dataToSave = {
                ...values,
                orderId: selectedOrder.id, // Força o ID do pedido atual
                createdDate: Timestamp.fromDate(values.createdDate),
                dueDate: values.dueDate ? Timestamp.fromDate(values.dueDate) : null,
                resolvedDate: values.resolvedDate ? Timestamp.fromDate(values.resolvedDate) : null,
                comments: values.comments || [],
            };

            if (selectedTicket) {
                // Adicionar comentário de alteração
                const changeComment = {
                    id: Date.now().toString(),
                    author: user?.displayName || "Sistema",
                    content: `Chamado atualizado`,
                    timestamp: Timestamp.fromDate(new Date()),
                    type: "status_change",
                };
                
                dataToSave.comments = [...(selectedTicket.comments || []), changeComment];
                
                await updateDoc(doc(db, "companies", "mecald", "engineeringTickets", selectedTicket.id), dataToSave);
                toast({ title: "Chamado atualizado com sucesso!" });
            } else {
                // Gerar número do ticket
                const currentYear = new Date().getFullYear();
                const allTicketsSnapshot = await getDocs(collection(db, "companies", "mecald", "engineeringTickets"));
                const ticketCount = allTicketsSnapshot.docs.filter(doc => 
                    doc.data().ticketNumber?.startsWith(`ENG-${currentYear}`)
                ).length;
                const ticketNumber = `ENG-${currentYear}-${(ticketCount + 1).toString().padStart(4, '0')}`;
                
                dataToSave.ticketNumber = ticketNumber;
                
                // Comentário inicial
                const initialComment = {
                    id: Date.now().toString(),
                    author: user?.displayName || "Sistema",
                    content: `Chamado criado para o pedido ${selectedOrder.number}`,
                    timestamp: Timestamp.fromDate(new Date()),
                    type: "comment",
                };
                
                dataToSave.comments = [initialComment];
                
                await addDoc(collection(db, "companies", "mecald", "engineeringTickets"), dataToSave);
                toast({ title: "Chamado de engenharia criado!" });
            }
            
            setIsFormOpen(false);
            await fetchTicketsForOrder();
        } catch (error) {
            console.error("Error saving ticket:", error);
            toast({ variant: "destructive", title: "Erro ao salvar chamado" });
        }
    };

    // === UTILITY FUNCTIONS ===
    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case "Crítica": return "destructive";
            case "Alta": return "destructive";
            case "Média": return "secondary";
            case "Baixa": return "outline";
            default: return "outline";
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Aberto": return "destructive";
            case "Em Análise": return "secondary";
            case "Aguardando Cliente": return "outline";
            case "Resolvido": return "default";
            case "Fechado": return "outline";
            default: return "outline";
        }
    };

    const getPriorityIcon = (priority: string) => {
        switch (priority) {
            case "Crítica": return <AlertTriangle className="h-4 w-4 text-red-600" />;
            case "Alta": return <AlertCircle className="h-4 w-4 text-orange-600" />;
            case "Média": return <Clock className="h-4 w-4 text-yellow-600" />;
            case "Baixa": return <CheckCircle className="h-4 w-4 text-green-600" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    // === HANDLERS ===
    const handleNewTicket = () => {
        if (!selectedOrder) return;
        
        setSelectedTicket(null);
        form.reset({
            title: "",
            description: "",
            orderId: selectedOrder.id,
            priority: "Média",
            category: "Esclarecimento Técnico",
            status: "Aberto",
            requestedBy: user?.displayName || "",
            createdDate: new Date(),
            comments: [],
        });
        setIsFormOpen(true);
    };

    const handleEditTicket = (ticket: EngineeringTicket) => {
        setSelectedTicket(ticket);
        form.reset({
            ...ticket,
            dueDate: ticket.dueDate || null,
            resolvedDate: ticket.resolvedDate || null,
        });
        setIsFormOpen(true);
    };

    const handleDeleteTicket = (ticket: EngineeringTicket) => {
        setTicketToDelete(ticket);
        setIsDeleteAlertOpen(true);
    };

    const confirmDelete = async () => {
        if (!ticketToDelete) return;
        try {
            await deleteDoc(doc(db, "companies", "mecald", "engineeringTickets", ticketToDelete.id));
            toast({ title: "Chamado excluído com sucesso!" });
            setIsDeleteAlertOpen(false);
            await fetchTicketsForOrder();
        } catch (error) {
            console.error("Error deleting ticket:", error);
            toast({ variant: "destructive", title: "Erro ao excluir chamado" });
        }
    };

    if (!selectedOrder) {
        return (
            <Card>
                <CardContent className="p-8">
                    <div className="text-center text-muted-foreground">
                        <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Selecione um pedido para ver os chamados de engenharia</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // === RENDER ===
    return (
        <Card>
            <CardHeader className="flex-row justify-between items-center">
                <div>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Phone className="h-5 w-5 text-primary" />
                        Chamados de Engenharia
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Pedido: {selectedOrder.number} - {selectedOrder.customerName}
                    </p>
                </div>
                <Button size="sm" onClick={handleNewTicket}>
                    <PlusCircle className="mr-2 h-4 w-4"/>
                    Novo Chamado
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-20 w-full"/>
                        <Skeleton className="h-40 w-full"/>
                    </div>
                ) : (
                    <>
                        {/* Estatísticas rápidas */}
                        {tickets.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                <div className="text-center p-3 bg-muted/30 rounded-lg">
                                    <div className="text-2xl font-bold">{tickets.length}</div>
                                    <div className="text-xs text-muted-foreground">Total</div>
                                </div>
                                <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                                    <div className="text-2xl font-bold text-red-600">
                                        {tickets.filter(t => t.status === "Aberto").length}
                                    </div>
                                    <div className="text-xs text-red-600">Abertos</div>
                                </div>
                                <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                    <div className="text-2xl font-bold text-yellow-600">
                                        {tickets.filter(t => t.status === "Em Análise").length}
                                    </div>
                                    <div className="text-xs text-yellow-600">Em Análise</div>
                                </div>
                                <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                                    <div className="text-2xl font-bold text-green-600">
                                        {tickets.filter(t => t.status === "Resolvido").length}
                                    </div>
                                    <div className="text-xs text-green-600">Resolvidos</div>
                                </div>
                            </div>
                        )}

                        {/* Tabela de chamados */}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Número</TableHead>
                                    <TableHead>Título</TableHead>
                                    <TableHead>Prioridade</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Criado</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tickets.length > 0 ? (
                                    tickets.map((ticket) => (
                                        <TableRow key={ticket.id}>
                                            <TableCell className="font-mono text-sm">
                                                {ticket.ticketNumber}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium text-sm">{ticket.title}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {ticket.category}
                                                        {ticket.itemName && ticket.itemName !== 'N/A' && (
                                                            <> • {ticket.itemName}</>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getPriorityColor(ticket.priority)} className="gap-1 text-xs">
                                                    {getPriorityIcon(ticket.priority)}
                                                    {ticket.priority}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusColor(ticket.status)} className="text-xs">
                                                    {ticket.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {format(ticket.createdDate, 'dd/MM/yy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEditTicket(ticket)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive"
                                                    onClick={() => handleDeleteTicket(ticket)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Phone className="h-8 w-8 text-muted-foreground" />
                                                <div>
                                                    <div className="font-medium">Nenhum chamado encontrado</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        Clique em "Novo Chamado" para criar um chamado técnico
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </>
                )}
            </CardContent>

            {/* Modal do formulário */}
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {selectedTicket ? "Editar Chamado" : "Novo Chamado de Engenharia"}
                        </DialogTitle>
                        <DialogDescription>
                            Pedido: {selectedOrder.number} - {selectedOrder.customerName}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            {/* Informações básicas */}
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Título do Chamado</FormLabel>
                                        <FormControl>
                                            <Input 
                                                placeholder="Descreva resumidamente o problema ou solicitação"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="category"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Categoria</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="Alteração de Desenho">Alteração de Desenho</SelectItem>
                                                    <SelectItem value="Esclarecimento Técnico">Esclarecimento Técnico</SelectItem>
                                                    <SelectItem value="Problema de Fabricação">Problema de Fabricação</SelectItem>
                                                    <SelectItem value="Revisão de Especificação">Revisão de Especificação</SelectItem>
                                                    <SelectItem value="Solicitação de Procedimento">Solicitação de Procedimento</SelectItem>
                                                    <SelectItem value="Não Conformidade">Não Conformidade</SelectItem>
                                                    <SelectItem value="Melhoria de Processo">Melhoria de Processo</SelectItem>
                                                    <SelectItem value="Outro">Outro</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                
                                <FormField
                                    control={form.control}
                                    name="priority"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Prioridade</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="Baixa">Baixa</SelectItem>
                                                    <SelectItem value="Média">Média</SelectItem>
                                                    <SelectItem value="Alta">Alta</SelectItem>
                                                    <SelectItem value="Crítica">Crítica</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Item relacionado */}
                            <FormField
                                control={form.control}
                                name="itemId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Item Relacionado (Opcional)</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione um item do pedido" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="">Nenhum item específico</SelectItem>
                                                {selectedOrder.items.map(item => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.code ? `[${item.code}] ` : ''}{item.description}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Descrição */}
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição Detalhada</FormLabel>
                                        <FormControl>
                                            <Textarea 
                                                placeholder="Descreva detalhadamente o problema, solicitação ou dúvida técnica..."
                                                className="min-h-[100px]"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Seja específico sobre o problema, incluindo contexto, impacto e urgência.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Status e responsável (apenas para edição) */}
                            {selectedTicket && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                                    <FormField
                                        control={form.control}
                                        name="status"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Status</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Aberto">Aberto</SelectItem>
                                                        <SelectItem value="Em Análise">Em Análise</SelectItem>
                                                        <SelectItem value="Aguardando Cliente">Aguardando Cliente</SelectItem>
                                                        <SelectItem value="Resolvido">Resolvido</SelectItem>
                                                        <SelectItem value="Fechado">Fechado</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="assignedTo"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Responsável</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Atribuir a..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="">Não atribuído</SelectItem>
                                                        {teamMembers.map(member => (
                                                            <SelectItem key={member.id} value={member.name}>
                                                                {member.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}

                            {/* Resolução (apenas para tickets resolvidos) */}
                            {selectedTicket && (form.watch("status") === "Resolvido" || form.watch("status") === "Fechado") && (
                                <FormField
                                    control={form.control}
                                    name="resolution"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Resolução</FormLabel>
                                            <FormControl>
                                                <Textarea 
                                                    placeholder="Descreva como o problema foi resolvido ou a solicitação atendida..."
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit">
                                    {selectedTicket ? "Atualizar Chamado" : "Criar Chamado"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Alert de confirmação de exclusão */}
            <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir o chamado "{ticketToDelete?.ticketNumber}"?
                            Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
