"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp, query, where, orderBy, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format, differenceInDays } from "date-fns";
import { jsPDF } from "jspdf";
import 'jspdf-autotable';

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
    CheckCircle, Clock, AlertTriangle, FileText, User,
    Download, FileDown, Printer, ChevronDown, BarChart
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
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

// === FUNÇÃO PARA EXPORTAR CSV ===
const downloadCSV = (data: any[], filename: string) => {
    const csvContent = "\uFEFF" + data.map(row => 
        Object.values(row).map(field => {
            const stringField = String(field || '');
            if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
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
    const [error, setError] = useState<string | null>(null);

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
        if (!selectedOrder?.id) {
            console.log("❌ Nenhum pedido selecionado");
            setTickets([]);
            setIsLoading(false);
            return;
        }
        
        console.log("=== BUSCANDO CHAMADOS ===");
        console.log("🎯 Pedido:", selectedOrder.number, "| ID:", selectedOrder.id);
        
        setIsLoading(true);
        
        try {
            const ticketsQuery = query(
                collection(db, "companies", "mecald", "engineeringTickets"),
                where("orderId", "==", selectedOrder.id)
            );
            
            const snapshot = await getDocs(ticketsQuery);
            console.log(`📊 Encontrados: ${snapshot.docs.length} chamados`);
            
            if (snapshot.empty) {
                console.log("ℹ️ Nenhum chamado para este pedido");
                setTickets([]);
                setIsLoading(false);
                return;
            }
            
            const ticketsList = snapshot.docs.map(doc => {
                const data = doc.data();
                const item = selectedOrder.items.find(i => i.id === data.itemId);
                
                console.log(`📋 Ticket: ${data.ticketNumber || doc.id.slice(0, 8)}`);
                
                return {
                    id: doc.id,
                    ticketNumber: data.ticketNumber || `ENG-${doc.id.slice(0, 6)}`,
                    title: data.title || "Sem título",
                    description: data.description || "",
                    orderId: data.orderId,
                    itemId: data.itemId || "",
                    priority: data.priority || "Média",
                    category: data.category || "Esclarecimento Técnico",
                    status: data.status || "Aberto",
                    requestedBy: data.requestedBy || "Usuário",
                    assignedTo: data.assignedTo || "",
                    createdDate: data.createdDate?.toDate ? data.createdDate.toDate() : new Date(),
                    dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : null,
                    resolvedDate: data.resolvedDate?.toDate ? data.resolvedDate.toDate() : null,
                    resolution: data.resolution || "",
                    comments: (data.comments || []).map((comment: any) => ({
                        ...comment,
                        timestamp: comment.timestamp?.toDate ? comment.timestamp.toDate() : new Date(),
                    })),
                    itemName: item?.description || 'N/A',
                } as EngineeringTicket;
            });
            
            ticketsList.sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime());
            
            console.log(`✅ ${ticketsList.length} chamados processados`);
            setTickets(ticketsList);
            
        } catch (error) {
            console.error("❌ Erro:", error);
            toast({ 
                variant: "destructive", 
                title: "Erro ao carregar chamados",
                description: "Verifique o console para detalhes"
            });
            setTickets([]);
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
        console.log("🚀 === INICIANDO onSubmit ===");
        console.log("📝 Valores do formulário:", values);
        console.log("📋 Pedido selecionado:", selectedOrder);
        console.log("👤 Usuário:", user);

        try {
            if (!selectedOrder) {
                console.error("❌ Erro: Nenhum pedido selecionado");
                toast({ variant: "destructive", title: "Erro: Nenhum pedido selecionado" });
                return;
            }

            console.log("✅ Pedido OK, preparando dados...");

            const dataToSave = {
                ...values,
                orderId: selectedOrder.id,
                createdDate: Timestamp.fromDate(values.createdDate),
                dueDate: values.dueDate ? Timestamp.fromDate(values.dueDate) : null,
                resolvedDate: values.resolvedDate ? Timestamp.fromDate(values.resolvedDate) : null,
                comments: values.comments || [],
            };

            console.log("💾 Dados preparados:", dataToSave);

            if (selectedTicket) {
                console.log("📝 Atualizando ticket existente...");
                
                const changeComment = {
                    id: Date.now().toString(),
                    author: user?.displayName || "Sistema",
                    content: `Chamado atualizado`,
                    timestamp: Timestamp.fromDate(new Date()),
                    type: "status_change",
                };
                
                dataToSave.comments = [...(selectedTicket.comments || []), changeComment];
                
                await updateDoc(doc(db, "companies", "mecald", "engineeringTickets", selectedTicket.id), dataToSave);
                console.log("✅ Ticket atualizado com sucesso");
                toast({ title: "Chamado atualizado com sucesso!" });
            } else {
                console.log("🆕 Criando novo ticket...");
                
                // Gerar número do ticket
                const currentYear = new Date().getFullYear();
                console.log("📊 Buscando tickets existentes...");
                
                const allTicketsSnapshot = await getDocs(collection(db, "companies", "mecald", "engineeringTickets"));
                console.log("📋 Tickets encontrados:", allTicketsSnapshot.docs.length);
                
                const ticketCount = allTicketsSnapshot.docs.filter(doc => 
                    doc.data().ticketNumber?.startsWith(`ENG-${currentYear}`)
                ).length;
                
                const ticketNumber = `ENG-${currentYear}-${(ticketCount + 1).toString().padStart(4, '0')}`;
                console.log("🎫 Número gerado:", ticketNumber);
                
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
                
                console.log("💾 Salvando no Firebase...");
                
                const docRef = await addDoc(collection(db, "companies", "mecald", "engineeringTickets"), dataToSave);
                console.log("✅ Documento criado com ID:", docRef.id);
                toast({ title: "Chamado de engenharia criado!" });
            }
            
            console.log("🔄 Fechando modal e atualizando lista...");
            setIsFormOpen(false);
            await fetchTicketsForOrder();
            console.log("✅ Processo concluído!");
            
        } catch (error) {
            console.error("💥 Erro ao salvar ticket:", error);
            toast({ variant: "destructive", title: "Erro ao salvar chamado", description: error.message });
        }
    };

    // === EXPORT FUNCTIONS ===
    const generateTicketPDF = async (ticket: EngineeringTicket) => {
        try {
            // Buscar dados da empresa
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const companySnap = await getDoc(companyRef);
            const companyData: CompanyData = companySnap.exists() ? companySnap.data() as any : {};

            const docPdf = new jsPDF();
            const pageWidth = docPdf.internal.pageSize.width;
            const pageHeight = docPdf.internal.pageSize.height;
            let y = 15;

            // Header com logo
            if (companyData.logo?.preview) {
                try {
                    docPdf.addImage(companyData.logo.preview, 'PNG', 15, y, 30, 15);
                } catch(e) {
                    console.error("Erro ao adicionar logo:", e);
                }
            }

            // Título
            docPdf.setFontSize(16).setFont(undefined, 'bold');
            docPdf.text(`Chamado de Engenharia Nº ${ticket.ticketNumber}`, pageWidth / 2, y + 8, { align: 'center' });
            y += 25;

            // Informações gerais
            const generalInfo = [
                ['Pedido:', selectedOrder?.number || 'N/A', 'Data de Abertura:', format(ticket.createdDate, 'dd/MM/yyyy HH:mm')],
                ['Cliente:', selectedOrder?.customerName || 'N/A', 'Categoria:', ticket.category],
                ['Item:', ticket.itemName || 'N/A', 'Prioridade:', ticket.priority],
                ['Solicitante:', ticket.requestedBy, 'Status:', ticket.status],
                ['Responsável:', ticket.assignedTo || 'Não atribuído', 'Prazo:', ticket.dueDate ? format(ticket.dueDate, 'dd/MM/yyyy') : 'Não definido']
            ];

            (docPdf as any).autoTable({
                startY: y,
                theme: 'plain',
                styles: { fontSize: 10 },
                body: generalInfo,
            });

            y = (docPdf as any).lastAutoTable.finalY + 10;

            // Título do problema
            docPdf.setFontSize(12).setFont(undefined, 'bold');
            docPdf.text('Título do Problema:', 15, y);
            y += 7;
            docPdf.setFontSize(10).setFont(undefined, 'normal');
            const titleLines = docPdf.splitTextToSize(ticket.title, pageWidth - 30);
            docPdf.text(titleLines, 15, y);
            y += titleLines.length * 5 + 10;

            // Descrição
            docPdf.setFontSize(12).setFont(undefined, 'bold');
            docPdf.text('Descrição Detalhada:', 15, y);
            y += 7;
            docPdf.setFontSize(10).setFont(undefined, 'normal');
            const descLines = docPdf.splitTextToSize(ticket.description, pageWidth - 30);
            docPdf.text(descLines, 15, y);
            y += descLines.length * 5 + 10;

            // Resolução (se houver)
            if (ticket.resolution) {
                if (y > pageHeight - 40) {
                    docPdf.addPage();
                    y = 20;
                }
                docPdf.setFontSize(12).setFont(undefined, 'bold');
                docPdf.text('Resolução:', 15, y);
                y += 7;
                docPdf.setFontSize(10).setFont(undefined, 'normal');
                const resLines = docPdf.splitTextToSize(ticket.resolution, pageWidth - 30);
                docPdf.text(resLines, 15, y);
                y += resLines.length * 5 + 10;
            }

            // Comentários
            if (ticket.comments && ticket.comments.length > 0) {
                if (y > pageHeight - 60) {
                    docPdf.addPage();
                    y = 20;
                }
                docPdf.setFontSize(12).setFont(undefined, 'bold');
                docPdf.text('Histórico de Comentários:', 15, y);
                y += 10;

                ticket.comments.forEach((comment) => {
                    if (y > pageHeight - 30) {
                        docPdf.addPage();
                        y = 20;
                    }
                    docPdf.setFontSize(9).setFont(undefined, 'bold');
                    docPdf.text(`${comment.author} - ${format(comment.timestamp, 'dd/MM/yyyy HH:mm')}:`, 15, y);
                    y += 5;
                    docPdf.setFont(undefined, 'normal');
                    const commentLines = docPdf.splitTextToSize(comment.content, pageWidth - 30);
                    docPdf.text(commentLines, 15, y);
                    y += commentLines.length * 4 + 8;
                });
            }

            // Footer
            const pageCount = docPdf.internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                docPdf.setPage(i);
                docPdf.setFontSize(8).setFont(undefined, 'normal');
                docPdf.text('ENG-TICKET-001.REV0', 15, pageHeight - 10);
                docPdf.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
            }

            docPdf.save(`Chamado_${ticket.ticketNumber}.pdf`);
            toast({ title: "PDF do chamado gerado com sucesso!" });

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            toast({ variant: "destructive", title: "Erro ao gerar PDF do chamado" });
        }
    };

    const generatePdfReport = async () => {
        try {
            if (!selectedOrder) return;

            // Buscar dados da empresa
            const companyRef = doc(db, "companies", "mecald", "settings", "company");
            const companySnap = await getDoc(companyRef);
            const companyData: CompanyData = companySnap.exists() ? companySnap.data() as any : {};

            const doc = new jsPDF('landscape'); // Formato paisagem
            const pageWidth = doc.internal.pageSize.width;
            const pageHeight = doc.internal.pageSize.height;
            
            // Header com logo
            if (companyData.logo?.preview) {
                try {
                    doc.addImage(companyData.logo.preview, 'PNG', 15, 15, 30, 15);
                } catch(e) {
                    console.error("Erro ao adicionar logo:", e);
                }
            }
            
            // Título
            doc.setFontSize(18);
            doc.text('Relatório de Chamados de Engenharia', pageWidth / 2, 23, { align: 'center' });
            
            // Informações do pedido
            doc.setFontSize(12);
            doc.text(`Pedido: ${selectedOrder.number}`, 15, 40);
            doc.text(`Cliente: ${selectedOrder.customerName}`, 15, 47);
            doc.text(`Data do relatório: ${format(new Date(), 'dd/MM/yyyy')}`, 15, 54);
            
            // Estatísticas
            const openTickets = tickets.filter(t => t.status === "Aberto").length;
            const inProgressTickets = tickets.filter(t => t.status === "Em Análise").length;
            const resolvedTickets = tickets.filter(t => t.status === "Resolvido").length;
            const closedTickets = tickets.filter(t => t.status === "Fechado").length;
            const waitingTickets = tickets.filter(t => t.status === "Aguardando Cliente").length;
            
            doc.text('Resumo:', 15, 65);
            doc.text(`Total de chamados: ${tickets.length}`, 20, 72);
            doc.text(`Abertos: ${openTickets}`, 20, 79);
            doc.text(`Em análise: ${inProgressTickets}`, 20, 86);
            doc.text(`Aguardando cliente: ${waitingTickets}`, 20, 93);
            doc.text(`Resolvidos: ${resolvedTickets}`, 20, 100);
            doc.text(`Fechados: ${closedTickets}`, 20, 107);
            
            // Tempo médio de resolução
            const resolvedOrClosedTickets = tickets.filter(
                t => (t.status === "Resolvido" || t.status === "Fechado") && t.resolvedDate
            );
            
            if (resolvedOrClosedTickets.length > 0) {
                const totalDays = resolvedOrClosedTickets.reduce((acc, ticket) => {
                    if (ticket.resolvedDate) {
                        const diffDays = differenceInDays(ticket.resolvedDate, ticket.createdDate);
                        return acc + diffDays;
                    }
                    return acc;
                }, 0);
                
                const avgResolutionTime = totalDays / resolvedOrClosedTickets.length;
                doc.text(`Tempo médio de resolução: ${avgResolutionTime.toFixed(1)} dias`, 20, 114);
            }
            
            // Tabela de chamados com mais colunas
            const tableData = tickets.map(ticket => {
                const daysToClose = ticket.resolvedDate 
                    ? differenceInDays(ticket.resolvedDate, ticket.createdDate)
                    : ticket.dueDate 
                        ? differenceInDays(new Date(), ticket.createdDate)
                        : '-';
                
                return [
                    ticket.ticketNumber,
                    ticket.title.substring(0, 30) + (ticket.title.length > 30 ? '...' : ''),
                    ticket.category.substring(0, 15),
                    ticket.status,
                    ticket.priority,
                    ticket.requestedBy.substring(0, 15),
                    ticket.assignedTo?.substring(0, 15) || 'Não atribuído',
                    format(ticket.createdDate, 'dd/MM/yy'),
                    ticket.dueDate ? format(ticket.dueDate, 'dd/MM/yy') : '-',
                    ticket.resolvedDate ? format(ticket.resolvedDate, 'dd/MM/yy') : '-',
                    daysToClose.toString()
                ];
            });
            
            // Configuração da tabela
            (doc as any).autoTable({
                startY: 125,
                head: [['Número', 'Título', 'Categoria', 'Status', 'Prioridade', 'Solicitante', 'Responsável', 'Abertura', 'Prazo', 'Encerramento', 'Dias']],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [66, 66, 66], textColor: 255 },
                alternateRowStyles: { fillColor: [240, 240, 240] },
                styles: { fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 25 }, // Número
                    1: { cellWidth: 35 }, // Título
                    2: { cellWidth: 25 }, // Categoria
                    3: { cellWidth: 20 }, // Status
                    4: { cellWidth: 20 }, // Prioridade
                    5: { cellWidth: 25 }, // Solicitante
                    6: { cellWidth: 25 }, // Responsável
                    7: { cellWidth: 20 }, // Abertura
                    8: { cellWidth: 20 }, // Prazo
                    9: { cellWidth: 20 }, // Encerramento
                    10: { cellWidth: 15 }, // Dias
                },
            });
            
            // Footer
            const pageCount = doc.internal.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8).setFont(undefined, 'normal');
                doc.text('ENG-REP-001.REV0', 15, pageHeight - 10);
                doc.text(`Página ${i} de ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
            }
            
            doc.save(`Relatório-Chamados-Pedido-${selectedOrder.number}.pdf`);
            
            toast({ 
                title: "Relatório gerado com sucesso",
                description: "O download do PDF foi iniciado"
            });
        } catch (error) {
            console.error("Erro ao gerar relatório:", error);
            toast({ 
                variant: "destructive", 
                title: "Erro ao gerar relatório",
                description: "Verifique o console para detalhes"
            });
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

    // === EXPORTAÇÃO CSV NATIVA ===
    const csvData = useMemo(() => {
        const headers = ['Número', 'Título', 'Categoria', 'Item', 'Prioridade', 'Status', 'Solicitante', 'Responsável', 'Data de Abertura', 'Prazo', 'Data de Resolução', 'Descrição', 'Resolução'];
        
        const rows = tickets.map(ticket => ({
            'Número': ticket.ticketNumber,
            'Título': ticket.title,
            'Categoria': ticket.category,
            'Item': ticket.itemName,
            'Prioridade': ticket.priority,
            'Status': ticket.status,
            'Solicitante': ticket.requestedBy,
            'Responsável': ticket.assignedTo || 'Não atribuído',
            'Data de Abertura': format(ticket.createdDate, 'dd/MM/yyyy HH:mm'),
            'Prazo': ticket.dueDate ? format(ticket.dueDate, 'dd/MM/yyyy') : 'Não definido',
            'Data de Resolução': ticket.resolvedDate ? format(ticket.resolvedDate, 'dd/MM/yyyy') : 'Não resolvido',
            'Descrição': ticket.description,
            'Resolução': ticket.resolution || 'Não resolvido'
        }));

        return [headers.join(','), ...rows.map(row => 
            headers.map(header => {
                const value = row[header as keyof typeof row] || '';
                const stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(',')
        )].join('\n');
    }, [tickets]);

    const handleExportCSV = () => {
        if (!selectedOrder) return;
        
        const blob = new Blob(['\uFEFF' + csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `chamados-pedido-${selectedOrder.number}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            toast({ 
                title: "CSV exportado com sucesso",
                description: "O download foi iniciado"
            });
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
                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Download className="mr-2 h-4 w-4"/>
                                Exportar
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56">
                            <DropdownMenuLabel>Opções de Exportação</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem onClick={handleExportCSV}>
                                    <FileDown className="mr-2 h-4 w-4" />
                                    <span>Exportar para CSV</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={generatePdfReport}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    <span>Gerar Relatório PDF</span>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <Button size="sm" onClick={handleNewTicket}>
                        <PlusCircle className="mr-2 h-4 w-4"/>
                        Novo Chamado
                    </Button>
                </div>
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
                                                    onClick={() => generateTicketPDF(ticket)}
                                                    title="Exportar PDF"
                                                >
                                                    <FileDown className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEditTicket(ticket)}
                                                    title="Editar"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive"
                                                    onClick={() => handleDeleteTicket(ticket)}
                                                    title="Excluir"
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
                                                <SelectItem value="none">Nenhum item específico</SelectItem>
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
                                                        <SelectItem value="none">Não atribuído</SelectItem>
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
