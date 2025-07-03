"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  where,
  orderBy,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format, differenceInDays } from "date-fns";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlusCircle,
  Pencil,
  Trash2,
  Phone,
  AlertCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  User,
  Download,
  FileDown,
  Printer,
  ChevronDown,
  BarChart,
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

// === TYPES AND INTERFACES ===
type OrderInfo = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  projectName?: string;
  items: {
    id: string;
    description: string;
    code?: string;
    quantity?: number;
  }[];
};

type TeamMember = {
  id: string;
  name: string;
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
  description: z
    .string()
    .min(20, "A descrição deve ter pelo menos 20 caracteres."),
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
    "Outro",
  ]),
  status: z.enum([
    "Aberto",
    "Em Análise",
    "Aguardando Cliente",
    "Resolvido",
    "Fechado",
  ]),
  requestedBy: z.string().min(1, "O solicitante é obrigatório."),
  assignedTo: z.string().optional(),
  createdDate: z.date(),
  dueDate: z.date().optional().nullable(),
  resolvedDate: z.date().optional().nullable(),
  resolution: z.string().optional(),
  comments: z
    .array(
      z.object({
        id: z.string(),
        author: z.string(),
        content: z.string(),
        timestamp: z.date(),
        type: z.enum(["comment", "status_change", "assignment"]),
      })
    )
    .optional(),
});

type EngineeringTicket = z.infer<typeof engineeringTicketSchema> & {
  id: string;
  itemName?: string;
};

// === CSV EXPORT FUNCTION ===
const downloadCSV = (data: any[], filename: string) => {
  const csvContent =
    "\uFEFF" +
    data
      .map((row) =>
        Object.values(row)
          .map((field) => {
            const stringField = String(field || "");
            if (
              stringField.includes(",") ||
              stringField.includes('"') ||
              stringField.includes("\n")
            ) {
              return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
          })
          .join(",")
      )
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// === MAIN COMPONENT ===
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
  isLoading: parentLoading,
}: OrderEngineeringTicketsProps) {
  const [tickets, setTickets] = useState<EngineeringTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<EngineeringTicket | null>(
    null
  );
  const [ticketToDelete, setTicketToDelete] = useState<EngineeringTicket | null>(
    null
  );
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form configuration
  const form = useForm<z.infer<typeof engineeringTicketSchema>>({
    resolver: zodResolver(engineeringTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      orderId: selectedOrder?.id || "",
      itemId: "",
      priority: "Média",
      category: "Esclarecimento Técnico",
      status: "Aberto",
      requestedBy: user?.displayName || user?.email || "",
      assignedTo: "",
      createdDate: new Date(),
      dueDate: null,
      resolvedDate: null,
      resolution: "",
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

      const ticketsList = snapshot.docs.map((doc) => {
        const data = doc.data();
        const item = selectedOrder.items.find((i) => i.id === data.itemId);

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
          createdDate: data.createdDate?.toDate
            ? data.createdDate.toDate()
            : new Date(),
          dueDate: data.dueDate?.toDate ? data.dueDate.toDate() : null,
          resolvedDate: data.resolvedDate?.toDate
            ? data.resolvedDate.toDate()
            : null,
          resolution: data.resolution || "",
          comments: (data.comments || []).map((comment: any) => ({
            ...comment,
            timestamp: comment.timestamp?.toDate
              ? comment.timestamp.toDate()
              : new Date(),
          })),
          itemName: item?.description || "N/A",
        } as EngineeringTicket;
      });

      ticketsList.sort(
        (a, b) => b.createdDate.getTime() - a.createdDate.getTime()
      );

      console.log(`✅ ${ticketsList.length} chamados processados`);
      setTickets(ticketsList);
    } catch (error) {
      console.error("❌ Erro:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar chamados",
        description: "Verifique o console para detalhes",
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

  // 🔧 DEBUG: Função para testar permissões do Firebase
  const testFirebaseConnection = async () => {
    try {
      console.log("🔍 Testando conexão com Firebase...");
      console.log("👤 Usuário atual:", user);
      
      // Teste de leitura
      const testQuery = query(
        collection(db, "companies", "mecald", "engineeringTickets"),
        where("orderId", "==", "test")
      );
      const testSnapshot = await getDocs(testQuery);
      console.log("✅ Leitura OK - Documentos encontrados:", testSnapshot.docs.length);
      
      return true;
    } catch (error) {
      console.error("❌ Erro na conexão Firebase:", error);
      return false;
    }
  };

  // Executar teste na inicialização (apenas para debug)
  useEffect(() => {
    if (user && selectedOrder) {
      testFirebaseConnection();
    }
  }, [user, selectedOrder]);

  // === SUBMIT HANDLERS ===
  const onSubmit = async (values: z.infer<typeof engineeringTicketSchema>) => {
    console.log("🚀 === INICIANDO onSubmit ===");
    console.log("📝 Valores do formulário:", values);
    console.log("📋 Pedido selecionado:", selectedOrder);
    console.log("👤 Usuário:", user);

    try {
      if (!selectedOrder) {
        console.error("❌ Erro: Nenhum pedido selecionado");
        toast({
          variant: "destructive",
          title: "Erro: Nenhum pedido selecionado",
        });
        return;
      }

      if (!values.title || values.title.length < 10) {
        toast({
          variant: "destructive",
          title: "Erro: Título deve ter pelo menos 10 caracteres",
        });
        return;
      }

      if (!values.description || values.description.length < 20) {
        toast({
          variant: "destructive",
          title: "Erro: Descrição deve ter pelo menos 20 caracteres",
        });
        return;
      }

      if (!values.requestedBy) {
        toast({
          variant: "destructive",
          title: "Erro: Solicitante é obrigatório",
        });
        return;
      }

      console.log("✅ Validações OK, preparando dados...");

      // Prepare data for saving
      const dataToSave: any = {
        title: values.title,
        description: values.description,
        orderId: selectedOrder.id,
        itemId: values.itemId && values.itemId !== "none" ? values.itemId : null,
        priority: values.priority,
        category: values.category,
        status: values.status,
        requestedBy: values.requestedBy,
        assignedTo:
          values.assignedTo && values.assignedTo !== "none"
            ? values.assignedTo
            : null,
        createdDate: Timestamp.fromDate(values.createdDate),
        dueDate: values.dueDate ? Timestamp.fromDate(values.dueDate) : null,
        resolvedDate: values.resolvedDate
          ? Timestamp.fromDate(values.resolvedDate)
          : null,
        resolution: values.resolution || null,
        comments: values.comments || [],
      };

      console.log("💾 Dados preparados:", dataToSave);

      if (selectedTicket) {
        console.log("📝 Atualizando ticket existente...");

        // 🔧 CORREÇÃO: Atualizar data de resolução quando status muda para Resolvido/Fechado
        const statusChanged = selectedTicket.status !== values.status;
        if (
          statusChanged &&
          (values.status === "Resolvido" || values.status === "Fechado")
        ) {
          dataToSave.resolvedDate = Timestamp.fromDate(new Date());
          console.log("📅 Data de resolução atualizada:", new Date());
        }
        
        // Se o status mudou de Resolvido/Fechado para outro, limpar data de resolução
        if (
          statusChanged &&
          (selectedTicket.status === "Resolvido" || selectedTicket.status === "Fechado") &&
          values.status !== "Resolvido" && values.status !== "Fechado"
        ) {
          dataToSave.resolvedDate = null;
          console.log("📅 Data de resolução removida");
        }

        const changeComment = {
          id: Date.now().toString(),
          author: user?.displayName || "Sistema",
          content: `Chamado atualizado - Status: ${values.status}`,
          timestamp: Timestamp.fromDate(new Date()),
          type: "status_change",
        };

        dataToSave.comments = [
          ...(selectedTicket.comments || []),
          changeComment,
        ];

        await updateDoc(
          doc(db, "companies", "mecald", "engineeringTickets", selectedTicket.id),
          dataToSave
        );
        console.log("✅ Ticket atualizado com sucesso");
        toast({ title: "Chamado atualizado com sucesso!" });
      } else {
        console.log("🆕 Criando novo ticket...");

        try {
          // Generate ticket number
          const currentYear = new Date().getFullYear();
          console.log("📊 Buscando tickets existentes...");

          const allTicketsSnapshot = await getDocs(
            collection(db, "companies", "mecald", "engineeringTickets")
          );
          console.log("📋 Tickets encontrados:", allTicketsSnapshot.docs.length);

          const existingTickets = allTicketsSnapshot.docs
            .map((doc) => doc.data().ticketNumber)
            .filter((num) => num && num.startsWith(`ENG-${currentYear}`));

          const ticketCount = existingTickets.length;
          const ticketNumber = `ENG-${currentYear}-${(ticketCount + 1)
            .toString()
            .padStart(3, "0")}`;
          console.log("🎫 Número gerado:", ticketNumber);

          dataToSave.ticketNumber = ticketNumber;

          // 🔧 CORREÇÃO: Garantir que campos obrigatórios estejam presentes
          if (!dataToSave.requestedBy) {
            dataToSave.requestedBy = user?.displayName || user?.email || "Usuário";
          }

          // Initial comment
          const initialComment = {
            id: Date.now().toString(),
            author: user?.displayName || user?.email || "Sistema",
            content: `Chamado criado para o pedido ${selectedOrder.number}`,
            timestamp: Timestamp.fromDate(new Date()),
            type: "comment",
          };

          dataToSave.comments = [initialComment];

          console.log("💾 Salvando no Firebase...");
          console.log("💾 Dados finais:", dataToSave);

          const docRef = await addDoc(
            collection(db, "companies", "mecald", "engineeringTickets"),
            dataToSave
          );
          console.log("✅ Documento criado com ID:", docRef.id);
          toast({ title: "Chamado de engenharia criado com sucesso!" });
        } catch (createError) {
          console.error("💥 Erro específico na criação:", createError);
          throw createError;
        }
      }

      console.log("🔄 Fechando modal e atualizando lista...");
      setIsFormOpen(false);
      setSelectedTicket(null);
      form.reset();
      await fetchTicketsForOrder();
      console.log("✅ Processo concluído!");
    } catch (error) {
      console.error("💥 Erro ao salvar ticket:", error);
      console.error("💥 Stack trace:", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar chamado",
        description:
          typeof error === "object" && error !== null && "message" in error
            ? (error as Error).message
            : "Erro desconhecido. Verifique o console para detalhes.",
      });
    }
  };

  // === EXPORT FUNCTIONS ===
  const generateTicketPDF = async (ticket: EngineeringTicket) => {
    try {
      // Fetch company data
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const companySnap = await getDoc(companyRef);
      const companyData: CompanyData = companySnap.exists()
        ? (companySnap.data() as any)
        : {};

      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.width;
      const pageHeight = docPdf.internal.pageSize.height;
      let y = 15;

      // Header with logo
      if (companyData.logo?.preview) {
        try {
          docPdf.addImage(companyData.logo.preview, "PNG", 15, y, 30, 15);
        } catch (e) {
          console.error("Erro ao adicionar logo:", e);
        }
      }

      // Title
      docPdf.setFontSize(16).setFont(undefined, "bold");
      docPdf.text(
        `Chamado para Engenharia Nº ${ticket.ticketNumber}`,
        pageWidth / 2,
        y + 8,
        { align: "center" }
      );
      y += 30;

      // 1. Ticket Identification
      docPdf.setFontSize(14).setFont(undefined, "bold");
      docPdf.text("1. Identificação do Chamado", 15, y);
      y += 10;

      const identificationData = [
        ["Código do Chamado", ticket.ticketNumber],
        ["Data de Abertura", format(ticket.createdDate, "dd/MM/yyyy HH:mm")],
        ["Pedido / OS", selectedOrder?.number || "N/A"],
        ["Cliente", selectedOrder?.customerName || "N/A"],
        ["Item Relacionado", ticket.itemName || "N/A"],
        [
          "Código do Item",
          selectedOrder?.items.find((i) => i.id === ticket.itemId)?.code ||
            "N/A",
        ],
      ];

      (docPdf as any).autoTable({
        startY: y,
        theme: "grid",
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
        body: identificationData,
      });

      y = (docPdf as any).lastAutoTable.finalY + 15;

      // 2. Request Details
      docPdf.setFontSize(14).setFont(undefined, "bold");
      docPdf.text("2. Detalhes da Solicitação", 15, y);
      y += 10;

      const detailsData = [
        ["Departamento Solicitante", "Qualidade"],
        ["Responsável pela Abertura", ticket.requestedBy],
        ["Categoria do Problema", ticket.category],
        ["Prioridade", ticket.priority],
        ["Status Atual", ticket.status],
        ["Responsável Engenharia", ticket.assignedTo || "Não atribuído"],
      ];

      (docPdf as any).autoTable({
        startY: y,
        theme: "grid",
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
        body: detailsData,
      });

      y = (docPdf as any).lastAutoTable.finalY + 15;

      // 3. Detailed Problem Description
      if (y > pageHeight - 60) {
        docPdf.addPage();
        y = 20;
      }
      docPdf.setFontSize(14).setFont(undefined, "bold");
      docPdf.text("3. Descrição Detalhada do Problema", 15, y);
      y += 10;
      docPdf.setFontSize(10).setFont(undefined, "normal");
      const descLines = docPdf.splitTextToSize(
        ticket.description,
        pageWidth - 30
      );
      docPdf.text(descLines, 15, y);
      y += descLines.length * 5 + 20;

      // 5. Metrics and Resolution
      if (y > pageHeight - 80) {
        docPdf.addPage();
        y = 20;
      }
      docPdf.setFontSize(14).setFont(undefined, "bold");
      docPdf.text("5. Métricas e Resolução", 15, y);
      y += 10;

      // Calculate days stopped
      const currentDate = new Date();
      const daysElapsed = ticket.resolvedDate
        ? differenceInDays(ticket.resolvedDate, ticket.createdDate)
        : differenceInDays(currentDate, ticket.createdDate);

      const metricsData = [
        ["Tempo Total Parado", `${daysElapsed} dias`],
        [
          "Data de Resolução",
          ticket.resolvedDate
            ? format(ticket.resolvedDate, "dd/MM/yyyy")
            : "Não resolvido",
        ],
        [
          "Cronograma Pausado",
          ticket.status === "Aberto" || ticket.status === "Em Análise"
            ? "Sim"
            : "Não",
        ],
      ];

      (docPdf as any).autoTable({
        startY: y,
        theme: "grid",
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
        body: metricsData,
      });

      y = (docPdf as any).lastAutoTable.finalY + 15;

      // Resolution (if available)
      if (ticket.resolution) {
        if (y > pageHeight - 60) {
          docPdf.addPage();
          y = 20;
        }
        docPdf.setFontSize(14).setFont(undefined, "bold");
        docPdf.text("4. Resolução Implementada", 15, y);
        y += 10;
        docPdf.setFontSize(10).setFont(undefined, "normal");
        const resLines = docPdf.splitTextToSize(
          ticket.resolution,
          pageWidth - 30
        );
        docPdf.text(resLines, 15, y);
        y += resLines.length * 5 + 15;
      }

      // Comments
      if (ticket.comments && ticket.comments.length > 0) {
        if (y > pageHeight - 60) {
          docPdf.addPage();
          y = 20;
        }
        docPdf.setFontSize(12).setFont(undefined, "bold");
        docPdf.text("Histórico de Comentários:", 15, y);
        y += 10;

        ticket.comments.forEach((comment) => {
          if (y > pageHeight - 30) {
            docPdf.addPage();
            y = 20;
          }
          docPdf.setFontSize(9).setFont(undefined, "bold");
          docPdf.text(
            `${comment.author} - ${format(
              comment.timestamp,
              "dd/MM/yyyy HH:mm"
            )}:`,
            15,
            y
          );
          y += 5;
          docPdf.setFont(undefined, "normal");
          const commentLines = docPdf.splitTextToSize(
            comment.content,
            pageWidth - 30
          );
          docPdf.text(commentLines, 15, y);
          y += commentLines.length * 4 + 8;
        });
      }

      // Footer
      const pageCount = docPdf.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        docPdf.setPage(i);
        docPdf.setFontSize(8).setFont(undefined, "normal");
        docPdf.text("ENG-TICKET-001.REV0", 15, pageHeight - 10);
        docPdf.text(
          `Página ${i} de ${pageCount}`,
          pageWidth - 15,
          pageHeight - 10,
          { align: "right" }
        );
      }

      docPdf.save(`Chamado_${ticket.ticketNumber}.pdf`);
      toast({ title: "PDF do chamado gerado com sucesso!" });
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF do chamado",
      });
    }
  };

  const generatePdfReport = async () => {
    try {
      if (!selectedOrder) return;

      // Fetch company data
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const companySnap = await getDoc(companyRef);
      const companyData: CompanyData = companySnap.exists()
        ? (companySnap.data() as any)
        : {};

      const pdfDoc = new jsPDF("landscape");
      const pageWidth = pdfDoc.internal.pageSize.width;
      const pageHeight = pdfDoc.internal.pageSize.height;

      // Header with logo
      if (companyData.logo?.preview) {
        try {
          pdfDoc.addImage(companyData.logo.preview, "PNG", 15, 15, 30, 15);
        } catch (e) {
          console.error("Erro ao adicionar logo:", e);
        }
      }

      // Title
      pdfDoc.setFontSize(18);
      pdfDoc.text(
        "Relatório de Chamados de Engenharia",
        pageWidth / 2,
        23,
        { align: "center" }
      );

      // Order information
      pdfDoc.setFontSize(12);
      pdfDoc.text(`Pedido: ${selectedOrder.number}`, 15, 40);
      pdfDoc.text(`Cliente: ${selectedOrder.customerName}`, 15, 47);
      pdfDoc.text(
        `Data do relatório: ${format(new Date(), "dd/MM/yyyy")}`,
        15,
        54
      );

      // Statistics
      const openTickets = tickets.filter((t) => t.status === "Aberto").length;
      const inProgressTickets = tickets.filter(
        (t) => t.status === "Em Análise"
      ).length;
      const resolvedTickets = tickets.filter(
        (t) => t.status === "Resolvido"
      ).length;
      const closedTickets = tickets.filter((t) => t.status === "Fechado").length;
      const waitingTickets = tickets.filter(
        (t) => t.status === "Aguardando Cliente"
      ).length;

      pdfDoc.text("Resumo:", 15, 65);
      pdfDoc.text(`Total de chamados: ${tickets.length}`, 20, 72);
      pdfDoc.text(`Abertos: ${openTickets}`, 20, 79);
      pdfDoc.text(`Em análise: ${inProgressTickets}`, 20, 86);
      pdfDoc.text(`Aguardando cliente: ${waitingTickets}`, 20, 93);
      pdfDoc.text(`Resolvidos: ${resolvedTickets}`, 20, 100);
      pdfDoc.text(`Fechados: ${closedTickets}`, 20, 107);

      // Average resolution time
      const resolvedOrClosedTickets = tickets.filter(
        (t) =>
          (t.status === "Resolvido" || t.status === "Fechado") &&
          t.resolvedDate
      );

      if (resolvedOrClosedTickets.length > 0) {
        const totalDays = resolvedOrClosedTickets.reduce((acc, ticket) => {
          if (ticket.resolvedDate) {
            const diffDays = differenceInDays(
              ticket.resolvedDate,
              ticket.createdDate
            );
            return acc + diffDays;
          }
          return acc;
        }, 0);

        const avgResolutionTime = totalDays / resolvedOrClosedTickets.length;
        pdfDoc.text(
          `Tempo médio de resolução: ${avgResolutionTime.toFixed(1)} dias`,
          20,
          114
        );
      }

      // Tickets table with more columns
      const tableData = tickets.map((ticket) => {
        // 🔧 CORREÇÃO: Usar a data de resolução real quando disponível
        const daysToClose = ticket.resolvedDate
          ? differenceInDays(ticket.resolvedDate, ticket.createdDate)
          : differenceInDays(new Date(), ticket.createdDate);
        
        // 🔧 CORREÇÃO: Mostrar data de conclusão correta
        const conclusionDate = ticket.resolvedDate 
          ? format(ticket.resolvedDate, "dd/MM/yy")
          : (ticket.status === "Resolvido" || ticket.status === "Fechado") 
            ? format(new Date(), "dd/MM/yy") 
            : "-";

        return [
          ticket.ticketNumber,
          ticket.title.substring(0, 30) +
            (ticket.title.length > 30 ? "..." : ""),
          ticket.category.substring(0, 15),
          ticket.status,
          ticket.priority,
          ticket.requestedBy.substring(0, 15),
          ticket.assignedTo?.substring(0, 15) || "Não atribuído",
          format(ticket.createdDate, "dd/MM/yy"),
          ticket.dueDate ? format(ticket.dueDate, "dd/MM/yy") : "-",
          conclusionDate,
          daysToClose.toString(),
        ];
      });

      // Table configuration
      (pdfDoc as any).autoTable({
        startY: 125,
        head: [
          [
            "Número",
            "Título",
            "Categoria",
            "Status",
            "Prioridade",
            "Solicitante",
            "Responsável",
            "Abertura",
            "Prazo",
            "Encerramento",
            "Dias",
          ],
        ],
        body: tableData,
        theme: "grid",
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
      const pageCount = pdfDoc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdfDoc.setPage(i);
        pdfDoc.setFontSize(8).setFont(undefined, "normal");
        pdfDoc.text("ENG-REP-001.REV0", 15, pageHeight - 10);
        pdfDoc.text(
          `Página ${i} de ${pageCount}`,
          pageWidth - 15,
          pageHeight - 10,
          { align: "right" }
        );
      }

      pdfDoc.save(`Relatório-Chamados-Pedido-${selectedOrder.number}.pdf`);

      toast({
        title: "Relatório gerado com sucesso",
        description: "O download do PDF foi iniciado",
      });
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar relatório",
        description: "Verifique o console para detalhes",
      });
    }
  };

  const confirmDelete = async () => {
    if (!ticketToDelete) return;
    try {
      await deleteDoc(
        doc(db, "companies", "mecald", "engineeringTickets", ticketToDelete.id)
      );
      toast({ title: "Chamado excluído com sucesso!" });
      setIsDeleteAlertOpen(false);
      await fetchTicketsForOrder();
    } catch (error) {
      console.error("Error deleting ticket:", error);
      toast({ variant: "destructive", title: "Erro ao excluir chamado" });
    }
  };

  // === NATIVE CSV EXPORT ===
  const csvData = useMemo(() => {
    const headers = [
      "Número",
      "Título",
      "Categoria",
      "Item",
      "Prioridade",
      "Status",
      "Solicitante",
      "Responsável",
      "Data de Abertura",
      "Prazo",
      "Data de Resolução",
      "Descrição",
      "Resolução",
    ];

    const rows = tickets.map((ticket) => {
      // 🔧 CORREÇÃO: Usar data de resolução real quando disponível
      const resolutionDate = ticket.resolvedDate
        ? format(ticket.resolvedDate, "dd/MM/yyyy")
        : (ticket.status === "Resolvido" || ticket.status === "Fechado")
          ? "Resolvido sem data registrada"
          : "Não resolvido";

      return {
        Número: ticket.ticketNumber,
        Título: ticket.title,
        Categoria: ticket.category,
        Item: ticket.itemName,
        Prioridade: ticket.priority,
        Status: ticket.status,
        Solicitante: ticket.requestedBy,
        Responsável: ticket.assignedTo || "Não atribuído",
        "Data de Abertura": format(ticket.createdDate, "dd/MM/yyyy HH:mm"),
        Prazo: ticket.dueDate
          ? format(ticket.dueDate, "dd/MM/yyyy")
          : "Não definido",
        "Data de Resolução": resolutionDate,
        Descrição: ticket.description,
        Resolução: ticket.resolution || "Não resolvido",
      };
    });

    return [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header as keyof typeof row] || "";
            const stringValue = String(value);
            if (
              stringValue.includes(",") ||
              stringValue.includes('"') ||
              stringValue.includes("\n")
            ) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(",")
      ),
    ].join("\n");
  }, [tickets]);

  const handleExportCSV = () => {
    if (!selectedOrder) return;

    const blob = new Blob(["\uFEFF" + csvData], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `chamados-pedido-${selectedOrder.number}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "CSV exportado com sucesso",
        description: "O download foi iniciado",
      });
    }
  };

  // === UTILITY FUNCTIONS ===
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Crítica":
        return "destructive";
      case "Alta":
        return "destructive";
      case "Média":
        return "secondary";
      case "Baixa":
        return "outline";
      default:
        return "outline";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Aberto":
        return "destructive";
      case "Em Análise":
        return "secondary";
      case "Aguardando Cliente":
        return "outline";
      case "Resolvido":
        return "default";
      case "Fechado":
        return "outline";
      default:
        return "outline";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "Crítica":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "Alta":
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case "Média":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "Baixa":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // === HANDLERS ===
  const handleNewTicket = () => {
    if (!selectedOrder) return;

    setSelectedTicket(null);
    
    // 🔧 CORREÇÃO: Reset mais completo do formulário
    const defaultValues = {
      title: "",
      description: "",
      orderId: selectedOrder.id,
      itemId: "",
      priority: "Média" as const,
      category: "Esclarecimento Técnico" as const,
      status: "Aberto" as const,
      requestedBy: user?.displayName || user?.email || "",
      assignedTo: "",
      createdDate: new Date(),
      dueDate: null,
      resolvedDate: null,
      resolution: "",
      comments: [],
    };
    
    form.reset(defaultValues);
    console.log("🔄 Formulário resetado com valores:", defaultValues);
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
                <Download className="mr-2 h-4 w-4" />
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
            <PlusCircle className="mr-2 h-4 w-4" />
            Novo Chamado
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            {/* Quick statistics */}
            {tickets.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold">{tickets.length}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-2xl font-bold text-red-600">
                    {tickets.filter((t) => t.status === "Aberto").length}
                  </div>
                  <div className="text-xs text-red-600">Abertos</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="text-2xl font-bold text-yellow-600">
                    {tickets.filter((t) => t.status === "Em Análise").length}
                  </div>
                  <div className="text-xs text-yellow-600">Em Análise</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-2xl font-bold text-green-600">
                    {tickets.filter((t) => t.status === "Resolvido").length}
                  </div>
                  <div className="text-xs text-green-600">Resolvidos</div>
                </div>
              </div>
            )}

            {/* Tickets table */}
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
                          <div className="font-medium text-sm">
                            {ticket.title}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ticket.category}
                            {ticket.itemName && ticket.itemName !== "N/A" && (
                              <> • {ticket.itemName}</>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getPriorityColor(ticket.priority)}
                          className="gap-1 text-xs"
                        >
                          {getPriorityIcon(ticket.priority)}
                          {ticket.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getStatusColor(ticket.status)}
                          className="text-xs"
                        >
                          {ticket.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(ticket.createdDate, "dd/MM/yy")}
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
                          <div className="font-medium">
                            Nenhum chamado encontrado
                          </div>
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

      {/* Form modal */}
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
              {/* Basic information */}
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alteração de Desenho">
                            Alteração de Desenho
                          </SelectItem>
                          <SelectItem value="Esclarecimento Técnico">
                            Esclarecimento Técnico
                          </SelectItem>
                          <SelectItem value="Problema de Fabricação">
                            Problema de Fabricação
                          </SelectItem>
                          <SelectItem value="Revisão de Especificação">
                            Revisão de Especificação
                          </SelectItem>
                          <SelectItem value="Solicitação de Procedimento">
                            Solicitação de Procedimento
                          </SelectItem>
                          <SelectItem value="Não Conformidade">
                            Não Conformidade
                          </SelectItem>
                          <SelectItem value="Melhoria de Processo">
                            Melhoria de Processo
                          </SelectItem>
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
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

              {/* Related item */}
              <FormField
                control={form.control}
                name="itemId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Relacionado (Opcional)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um item do pedido" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">
                          Nenhum item específico
                        </SelectItem>
                        {selectedOrder.items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.code ? `[${item.code}] ` : ""}
                            {item.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
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
                      Seja específico sobre o problema, incluindo contexto,
                      impacto e urgência.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status and assignee (only for editing) */}
              {selectedTicket && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Aberto">Aberto</SelectItem>
                            <SelectItem value="Em Análise">Em Análise</SelectItem>
                            <SelectItem value="Aguardando Cliente">
                              Aguardando Cliente
                            </SelectItem>
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
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Atribuir a..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Não atribuído</SelectItem>
                            {teamMembers.map((member) => (
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

              {/* Resolution (only for resolved tickets) */}
              {selectedTicket &&
                (form.watch("status") === "Resolvido" ||
                  form.watch("status") === "Fechado") && (
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsFormOpen(false)}
                >
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

      {/* Delete confirmation alert */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o chamado "
              {ticketToDelete?.ticketNumber}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
