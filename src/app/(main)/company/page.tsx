"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import Image from "next/image";
import { PlusCircle, Pencil, Trash2, Settings, Activity, AlertCircle, CheckCircle, UserX, Calendar, Download, FileText, Clock, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";

// Schemas
const companySchema = z.object({
  nomeFantasia: z.string().min(3, "O nome fantasia é obrigatório."),
  cnpj: z.string().min(14, "O CNPJ deve ser válido."),
  inscricaoEstadual: z.string().optional().or(z.literal("")),
  email: z.string().email("O e-mail é inválido."),
  celular: z.string().min(10, "O celular deve ser válido."),
  endereco: z.string().min(10, "O endereço é obrigatório."),
  website: z.string().url("O site deve ser uma URL válida.").optional().or(z.literal("")),
  capacidadeInstalada: z.number().positive("A capacidade deve ser maior que 0.").optional(),
  metaMensal: z.number().positive("A meta deve ser maior que 0.").optional(),
});

const teamMemberSchema = z.object({
    id: z.string(),
    name: z.string().min(3, { message: "O nome é obrigatório." }),
    position: z.string().min(2, { message: "O cargo é obrigatório." }),
    email: z.string().email({ message: "O e-mail é inválido." }),
    phone: z.string().min(10, { message: "O telefone deve ser válido." }),
    permission: z.enum(["admin", "user"], { required_error: "Selecione uma permissão." }),
    updatedAt: z.any().optional(),
});

const resourceSchema = z.object({
    id: z.string(),
    name: z.string().min(3, { message: "O nome do recurso é obrigatório." }),
    type: z.enum(["maquina", "equipamento", "veiculo", "ferramenta", "espaco", "mao_de_obra"], { required_error: "Selecione um tipo." }),
    description: z.string().optional(),
    capacity: z.number().min(1, { message: "A capacidade deve ser maior que 0." }),
    status: z.enum(["disponivel", "ocupado", "manutencao", "inativo", "ausente", "ferias"], { required_error: "Selecione um status." }),
    location: z.string().optional(),
    serialNumber: z.string().optional(),
    acquisitionDate: z.string().optional(),
    maintenanceDate: z.string().optional(),
    absenceStartDate: z.string().optional(),
    absenceEndDate: z.string().optional(),
    absenceReason: z.string().optional(),
    updatedAt: z.any().optional(),
});

const overtimeSchema = z.object({
    id: z.string(),
    osNumber: z.string().min(1, { message: "Selecione uma OS." }),
    date: z.string().min(1, { message: "A data é obrigatória." }),
    startTime: z.string().min(1, { message: "O horário de entrada é obrigatório." }),
    endTime: z.string().min(1, { message: "O horário de saída é obrigatório." }),
    resources: z.array(z.string()).min(1, { message: "Selecione pelo menos um recurso." }),
    teamLeaders: z.array(z.string()).min(1, { message: "Selecione pelo menos um líder." }),
    observations: z.string().optional(),
    approvedBy: z.string().optional(),
    approvedAt: z.any().optional(),
    status: z.enum(["pendente", "aprovado", "rejeitado"]).default("pendente"),
    createdAt: z.any().optional(),
    updatedAt: z.any().optional(),
});

// Types
type CompanyData = z.infer<typeof companySchema> & { logo?: { preview?: string } };
type TeamMember = z.infer<typeof teamMemberSchema>;
type Resource = z.infer<typeof resourceSchema>;
type OvertimeRelease = z.infer<typeof overtimeSchema>;

interface OrderService {
  id: string;
  numeroOS: string;
  nomeCliente: string;
  status?: string;
}

export default function CompanyPage() {
  // Estados gerais
  const [isLoading, setIsLoading] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Estados da equipe
  const [isTeamLoading, setIsTeamLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isTeamFormOpen, setIsTeamFormOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);

  // Estados dos recursos
  const [isResourcesLoading, setIsResourcesLoading] = useState(true);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isResourceFormOpen, setIsResourceFormOpen] = useState(false);
  const [isResourceDeleteAlertOpen, setIsResourceDeleteAlertOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);

  // Estados de horas extras
  const [isOvertimeLoading, setIsOvertimeLoading] = useState(true);
  const [overtimeReleases, setOvertimeReleases] = useState<OvertimeRelease[]>([]);
  const [isOvertimeFormOpen, setIsOvertimeFormOpen] = useState(false);
  const [isOvertimeDeleteAlertOpen, setIsOvertimeDeleteAlertOpen] = useState(false);
  const [selectedOvertime, setSelectedOvertime] = useState<OvertimeRelease | null>(null);
  const [overtimeToDelete, setOvertimeToDelete] = useState<OvertimeRelease | null>(null);
  const [orderServices, setOrderServices] = useState<OrderService[]>([]);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [selectedLeaders, setSelectedLeaders] = useState<string[]>([]);

  // Forms
  const companyForm = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      nomeFantasia: "",
      cnpj: "",
      inscricaoEstadual: "",
      email: "",
      celular: "",
      endereco: "",
      website: "",
      capacidadeInstalada: undefined,
      metaMensal: undefined,
    },
  });

  const teamForm = useForm<TeamMember>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: {
        id: "",
        name: "",
        position: "",
        email: "",
        phone: "",
        permission: "user",
    }
  });

  const resourceForm = useForm<Resource>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
        id: "",
        name: "",
        type: "maquina",
        description: "",
        capacity: 1,
        status: "disponivel",
        location: "",
        serialNumber: "",
        acquisitionDate: "",
        maintenanceDate: "",
        absenceStartDate: "",
        absenceEndDate: "",
        absenceReason: "",
    }
  });

  const overtimeForm = useForm<OvertimeRelease>({
    resolver: zodResolver(overtimeSchema),
    defaultValues: {
        id: "",
        osNumber: "",
        date: "",
        startTime: "",
        endTime: "",
        resources: [],
        teamLeaders: [],
        observations: "",
        status: "pendente",
    }
  });

  // Funções de busca de dados
  const fetchCompanyData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as CompanyData;
        companyForm.reset(data);
        if (data.logo?.preview) {
          setLogoPreview(data.logo.preview);
        }
      } else {
        toast({
          variant: "destructive",
          title: "Documento não encontrado",
          description: "Não foi possível encontrar os dados da empresa no Firestore.",
        });
      }
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar dados",
        description: "Ocorreu um erro ao carregar as informações da empresa.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTeamData = async () => {
    if (!user) return;
    setIsTeamLoading(true);
    try {
        const teamRef = doc(db, "companies", "mecald", "settings", "team");
        const docSnap = await getDoc(teamRef);
        if (docSnap.exists()) {
            setTeamMembers(docSnap.data().members || []);
        }
    } catch (error) {
        console.error("Error fetching team data:", error);
        toast({
            variant: "destructive",
            title: "Erro ao buscar equipe",
            description: "Ocorreu um erro ao carregar os membros da equipe.",
        });
    } finally {
        setIsTeamLoading(false);
    }
  };

  const fetchResourcesData = async () => {
    if (!user) return;
    setIsResourcesLoading(true);
    try {
        const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
        const docSnap = await getDoc(resourcesRef);
        if (docSnap.exists()) {
            setResources(docSnap.data().resources || []);
        }
    } catch (error) {
        console.error("Error fetching resources data:", error);
        toast({
            variant: "destructive",
            title: "Erro ao buscar recursos",
            description: "Ocorreu um erro ao carregar os recursos produtivos.",
        });
    } finally {
        setIsResourcesLoading(false);
    }
  };

  const fetchOvertimeData = async () => {
    if (!user) return;
    setIsOvertimeLoading(true);
    try {
        const overtimeRef = doc(db, "companies", "mecald", "settings", "overtime");
        const docSnap = await getDoc(overtimeRef);
        if (docSnap.exists()) {
            setOvertimeReleases(docSnap.data().releases || []);
        }
    } catch (error) {
        console.error("Error fetching overtime data:", error);
        toast({
            variant: "destructive",
            title: "Erro ao buscar horas extras",
            description: "Ocorreu um erro ao carregar as liberações de horas extras.",
        });
    } finally {
        setIsOvertimeLoading(false);
    }
  };

  const fetchOrderServices = async () => {
    if (!user) return;
    try {
        const osCollection = collection(db, "companies", "mecald", "ordersOfService");
        const querySnapshot = await getDocs(osCollection);
        const osList: OrderService[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            osList.push({
                id: doc.id,
                numeroOS: data.numeroOS || "",
                nomeCliente: data.nomeCliente || "",
                status: data.status || "",
            });
        });
        setOrderServices(osList);
    } catch (error) {
        console.error("Error fetching order services:", error);
    }
  };

  // useEffect
  useEffect(() => {
    if (!authLoading && user) {
      fetchCompanyData();
      fetchTeamData();
      fetchResourcesData();
      fetchOvertimeData();
      fetchOrderServices();
    }
  }, [user, authLoading]);

  // Funções auxiliares
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      disponivel: "bg-green-100 text-green-800 hover:bg-green-100",
      ocupado: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
      manutencao: "bg-red-100 text-red-800 hover:bg-red-100",
      inativo: "bg-gray-100 text-gray-800 hover:bg-gray-100",
      ausente: "bg-orange-100 text-orange-800 hover:bg-orange-100",
      ferias: "bg-blue-100 text-blue-800 hover:bg-blue-100"
    };
    
    const labels = {
      disponivel: "Disponível",
      ocupado: "Ocupado",
      manutencao: "Manutenção",
      inativo: "Inativo",
      ausente: "Ausente",
      ferias: "Férias"
    };

    const icons = {
      disponivel: <CheckCircle className="h-3 w-3 mr-1" />,
      ocupado: <Activity className="h-3 w-3 mr-1" />,
      manutencao: <Settings className="h-3 w-3 mr-1" />,
      inativo: <AlertCircle className="h-3 w-3 mr-1" />,
      ausente: <UserX className="h-3 w-3 mr-1" />,
      ferias: <Calendar className="h-3 w-3 mr-1" />
    };

    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {icons[status as keyof typeof icons]}
        {labels[status as keyof typeof labels]}
      </Badge>
    );
  };

  const getOvertimeStatusBadge = (status: string) => {
    const variants = {
      pendente: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
      aprovado: "bg-green-100 text-green-800 hover:bg-green-100",
      rejeitado: "bg-red-100 text-red-800 hover:bg-red-100"
    };
    
    const labels = {
      pendente: "Pendente",
      aprovado: "Aprovado",
      rejeitado: "Rejeitado"
    };

    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {labels[status as keyof typeof labels]}
      </Badge>
    );
  };

  const calculateOvertimeHours = (startTime: string, endTime: string) => {
    if (!startTime || !endTime) return 0;
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    const diffMinutes = endMinutes - startMinutes;
    return (diffMinutes / 60).toFixed(2);
  };

  const getResourceStats = () => {
    const total = resources.length;
    const available = resources.filter(r => r.status === 'disponivel').length;
    const occupied = resources.filter(r => r.status === 'ocupado').length;
    const maintenance = resources.filter(r => r.status === 'manutencao').length;
    const inactive = resources.filter(r => r.status === 'inativo').length;
    const absent = resources.filter(r => r.status === 'ausente').length;
    const vacation = resources.filter(r => r.status === 'ferias').length;
    
    // Recursos efetivamente disponíveis (não incluindo ausentes e férias no cálculo de ociosidade)
    const activeResources = resources.filter(r => !['ausente', 'ferias', 'inativo'].includes(r.status)).length;
    const idleRate = activeResources > 0 ? (available / activeResources) * 100 : 0;
    
    return { total, available, occupied, maintenance, inactive, absent, vacation, activeResources, idleRate };
  };

  // Função para exportar recursos com tarefas diárias
  const exportResourcesWithTasks = () => {
    // Criar cabeçalho da planilha
    const headers = [
      'Nome do Recurso',
      'Tipo',
      'Status',
      'Capacidade',
      'Localização',
      'Número de Série',
      'Tarefa Diária Planejada',
      'Horário de Início',
      'Horário de Término',
      'Responsável',
      'Observações'
    ];

    // Converter dados dos recursos
    const csvData = resources.map(resource => [
      resource.name,
      resource.type === 'mao_de_obra' ? 'Mão de Obra' : 
      resource.type.charAt(0).toUpperCase() + resource.type.slice(1),
      resource.status === 'disponivel' ? 'Disponível' :
      resource.status === 'ocupado' ? 'Ocupado' :
      resource.status === 'manutencao' ? 'Manutenção' :
      resource.status === 'ausente' ? 'Ausente' :
      resource.status === 'ferias' ? 'Férias' :
      resource.status === 'inativo' ? 'Inativo' : resource.status,
      resource.capacity,
      resource.location || '',
      resource.serialNumber || '',
      '', // Campo vazio para tarefa diária
      '', // Campo vazio para horário início
      '', // Campo vazio para horário término
      '', // Campo vazio para responsável
      ''  // Campo vazio para observações
    ]);

    // Combinar cabeçalho com dados
    const allData = [headers, ...csvData];

    // Converter para CSV
    const csvContent = allData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    // Criar e fazer download do arquivo
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Nome do arquivo com data atual
    const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    link.setAttribute('download', `recursos-tarefas-diarias-${today}.csv`);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exportação realizada!",
      description: "Lista de recursos com campos para tarefas diárias foi baixada.",
    });
  };

  // Função para exportar recursos em PDF com cabeçalho da empresa
  const exportResourcesToPDF = async () => {
    // Buscar dados da empresa
    let companyData = null;
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      if (docSnap.exists()) {
        companyData = docSnap.data();
      }
    } catch (error) {
      console.error("Error fetching company data for PDF:", error);
    }

    const stats = getResourceStats();

    // Criar conteúdo HTML para o PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Lista de Recursos Produtivos - Tarefas Diárias</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            font-size: 12px;
            color: #333;
          }
          
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e5e7eb;
          }
          
          .company-info {
            flex: 1;
          }
          
          .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 5px;
          }
          
          .company-details {
            font-size: 11px;
            color: #6b7280;
            line-height: 1.4;
          }
          
          .logo-section {
            width: 80px;
            height: 80px;
            background: #f3f4f6;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #9ca3af;
          }
          
          .report-title {
            text-align: center;
            margin: 30px 0;
          }
          
          .report-title h1 {
            font-size: 20px;
            font-weight: bold;
            color: #1f2937;
            margin: 0 0 5px 0;
          }
          
          .report-date {
            font-size: 11px;
            color: #6b7280;
          }
          
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 15px;
            margin: 20px 0;
          }
          
          .stat-card {
            background: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            border-left: 4px solid #e5e7eb;
          }
          
          .stat-card.available { border-left-color: #10b981; }
          .stat-card.occupied { border-left-color: #f59e0b; }
          .stat-card.maintenance { border-left-color: #ef4444; }
          .stat-card.absent { border-left-color: #f97316; }
          .stat-card.idle { border-left-color: #3b82f6; }
          
          .stat-number {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .stat-label {
            font-size: 10px;
            color: #6b7280;
            text-transform: uppercase;
          }
          
          .table-container {
            margin-top: 20px;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          
          th, td {
            border: 1px solid #e5e7eb;
            padding: 8px;
            text-align: left;
            font-size: 10px;
          }
          
          th {
            background-color: #f9fafb;
            font-weight: bold;
            color: #374151;
          }
          
          .task-column {
            width: 150px;
            background-color: #fef9e7;
          }
          
          .time-column {
            width: 80px;
            background-color: #fef9e7;
          }
          
          .responsible-column {
            width: 100px;
            background-color: #fef9e7;
          }
          
          .observations-column {
            width: 120px;
            background-color: #fef9e7;
          }
          
          .status-badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: bold;
          }
          
          .status-disponivel { background-color: #d1fae5; color: #065f46; }
          .status-ocupado { background-color: #fef3c7; color: #92400e; }
          .status-manutencao { background-color: #fee2e2; color: #991b1b; }
          .status-ausente { background-color: #fed7aa; color: #9a3412; }
          .status-ferias { background-color: #dbeafe; color: #1e40af; }
          .status-inativo { background-color: #f3f4f6; color: #374151; }
          
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #9ca3af;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
          }
          
          .instructions {
            background-color: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          
          .instructions h3 {
            margin: 0 0 10px 0;
            font-size: 12px;
            color: #1e40af;
          }
          
          .instructions ul {
            margin: 0;
            padding-left: 20px;
            font-size: 10px;
            color: #1e40af;
          }
          
          .instructions li {
            margin-bottom: 5px;
          }
          
          @media print {
            body { margin: 0; }
            .header { margin-bottom: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">
            <div class="company-name">${companyData?.nomeFantasia || 'Nome da Empresa'}</div>
            <div class="company-details">
              ${companyData?.cnpj ? `CNPJ: ${companyData.cnpj}<br>` : ''}
              ${companyData?.inscricaoEstadual ? `I.E.: ${companyData.inscricaoEstadual}<br>` : ''}
              ${companyData?.email ? `E-mail: ${companyData.email}<br>` : ''}
              ${companyData?.celular ? `Telefone: ${companyData.celular}<br>` : ''}
              ${companyData?.endereco ? `${companyData.endereco}` : ''}
            </div>
          </div>
          <div class="logo-section">
            ${companyData?.logo?.preview ? 
              `<img src="${companyData.logo.preview}" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;">` : 
              'LOGO'
            }
          </div>
        </div>
        
        <div class="report-title">
          <h1>Lista de Recursos Produtivos - Tarefas Diárias</h1>
          <div class="report-date">Gerado em: ${new Date().toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card available">
            <div class="stat-number" style="color: #10b981;">${stats.available}</div>
            <div class="stat-label">Disponíveis</div>
          </div>
          <div class="stat-card occupied">
            <div class="stat-number" style="color: #f59e0b;">${stats.occupied}</div>
            <div class="stat-label">Ocupados</div>
          </div>
          <div class="stat-card maintenance">
            <div class="stat-number" style="color: #ef4444;">${stats.maintenance}</div>
            <div class="stat-label">Manutenção</div>
          </div>
          <div class="stat-card absent">
            <div class="stat-number" style="color: #f97316;">${stats.absent + stats.vacation}</div>
            <div class="stat-label">Ausentes/Férias</div>
          </div>
          <div class="stat-card idle">
            <div class="stat-number" style="color: #3b82f6;">${Math.round(stats.idleRate)}%</div>
            <div class="stat-label">Taxa Ociosidade</div>
          </div>
        </div>
        
        <div class="instructions">
          <h3>📋 Instruções para Preenchimento</h3>
          <ul>
            <li><strong>Tarefa Diária:</strong> Descreva a atividade específica planejada para cada recurso</li>
            <li><strong>Horários:</strong> Defina início e término das atividades</li>
            <li><strong>Responsável:</strong> Indique quem será responsável pela execução</li>
            <li><strong>Observações:</strong> Anote informações relevantes, impedimentos ou observações</li>
          </ul>
        </div>
        
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width: 120px;">Recurso</th>
                <th style="width: 80px;">Tipo</th>
                <th style="width: 60px;">Status</th>
                <th style="width: 40px;">Cap.</th>
                <th style="width: 80px;">Localização</th>
                <th class="task-column">Tarefa Diária Planejada</th>
                <th class="time-column">Início</th>
                <th class="time-column">Término</th>
                <th class="responsible-column">Responsável</th>
                <th class="observations-column">Observações</th>
              </tr>
            </thead>
            <tbody>
              ${resources.map(resource => `
                <tr>
                  <td style="font-weight: bold;">${resource.name}</td>
                  <td>${resource.type === 'mao_de_obra' ? 'Mão de Obra' : 
                       resource.type.charAt(0).toUpperCase() + resource.type.slice(1)}</td>
                  <td>
                    <span class="status-badge status-${resource.status}">
                      ${resource.status === 'disponivel' ? 'Disponível' :
                        resource.status === 'ocupado' ? 'Ocupado' :
                        resource.status === 'manutencao' ? 'Manutenção' :
                        resource.status === 'ausente' ? 'Ausente' :
                        resource.status === 'ferias' ? 'Férias' :
                        resource.status === 'inativo' ? 'Inativo' : resource.status}
                    </span>
                  </td>
                  <td style="text-align: center;">${resource.capacity}</td>
                  <td>${resource.location || '-'}</td>
                  <td class="task-column" style="border-right: 2px solid #fbbf24;"></td>
                  <td class="time-column"></td>
                  <td class="time-column"></td>
                  <td class="responsible-column"></td>
                  <td class="observations-column"></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <p>Este documento foi gerado automaticamente pelo sistema de gestão de recursos produtivos.</p>
          <p>Para dúvidas ou sugestões, entre em contato: ${companyData?.email || 'contato@empresa.com'}</p>
        </div>
      </body>
      </html>
    `;

    // Criar e abrir nova janela para impressão/PDF
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      // Aguardar carregamento e imprimir
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
      toast({
        title: "PDF sendo gerado!",
        description: "Uma nova janela foi aberta para geração do PDF. Use Ctrl+P ou Cmd+P para salvar.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
        description: "Não foi possível abrir a janela de impressão. Verifique se pop-ups estão habilitados.",
      });
    }
  };

  const exportOvertimeToPDF = async (overtime: OvertimeRelease) => {
    let companyData = null;
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      if (docSnap.exists()) {
        companyData = docSnap.data();
      }
    } catch (error) {
      console.error("Error fetching company data for PDF:", error);
    }

    const os = orderServices.find(o => o.id === overtime.osNumber);
    const selectedResourcesList = resources.filter(r => overtime.resources.includes(r.id));
    const selectedLeadersList = teamMembers.filter(m => overtime.teamLeaders.includes(m.id));
    const hours = calculateOvertimeHours(overtime.startTime, overtime.endTime);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Liberação de Horas Extras</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            font-size: 12px;
            color: #333;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e5e7eb;
          }
          .company-info { flex: 1; }
          .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 5px;
          }
          .company-details {
            font-size: 11px;
            color: #6b7280;
            line-height: 1.4;
          }
          .logo-section {
            width: 80px;
            height: 80px;
            background: #f3f4f6;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .report-title {
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background: #fef3c7;
            border-radius: 8px;
            border: 2px solid #f59e0b;
          }
          .report-title h1 {
            font-size: 22px;
            font-weight: bold;
            color: #92400e;
            margin: 0 0 5px 0;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin: 20px 0;
          }
          .info-card {
            background: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
          }
          .info-card h3 {
            margin: 0 0 10px 0;
            font-size: 12px;
            color: #1f2937;
            font-weight: bold;
          }
          .info-card p {
            margin: 5px 0;
            font-size: 11px;
            color: #4b5563;
          }
          .label { font-weight: bold; color: #1f2937; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 10px;
            text-align: left;
            font-size: 11px;
          }
          th {
            background-color: #f3f4f6;
            font-weight: bold;
            color: #374151;
          }
          .section-title {
            font-size: 14px;
            font-weight: bold;
            color: #1f2937;
            margin: 30px 0 15px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #e5e7eb;
          }
          .approval-section {
            margin-top: 60px;
            padding: 20px;
            background: #f0fdf4;
            border: 2px solid #10b981;
            border-radius: 8px;
          }
          .signature-box {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #374151;
          }
          .signature-box p {
            margin: 5px 0;
            font-size: 11px;
            text-align: center;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 10px;
            color: #9ca3af;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">
            <div class="company-name">${companyData?.nomeFantasia || 'Nome da Empresa'}</div>
            <div class="company-details">
              ${companyData?.cnpj ? `CNPJ: ${companyData.cnpj}<br>` : ''}
              ${companyData?.email ? `E-mail: ${companyData.email}<br>` : ''}
              ${companyData?.celular ? `Telefone: ${companyData.celular}` : ''}
            </div>
          </div>
          <div class="logo-section">
            ${companyData?.logo?.preview ? 
              `<img src="${companyData.logo.preview}" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;">` : 
              'LOGO'
            }
          </div>
        </div>
        
        <div class="report-title">
          <h1>🕐 AUTORIZAÇÃO DE HORAS EXTRAS</h1>
          <div style="font-size: 12px; color: #92400e; font-weight: bold;">Documento Oficial de Liberação</div>
        </div>
        
        <div class="info-grid">
          <div class="info-card">
            <h3>📋 Informações da Ordem de Serviço</h3>
            <p><span class="label">Número da OS:</span> ${os?.numeroOS || 'N/A'}</p>
            <p><span class="label">Cliente:</span> ${os?.nomeCliente || 'N/A'}</p>
          </div>
          
          <div class="info-card" style="border-left-color: #f59e0b;">
            <h3>📅 Informações de Data e Horário</h3>
            <p><span class="label">Data:</span> ${new Date(overtime.date).toLocaleDateString('pt-BR')}</p>
            <p><span class="label">Entrada:</span> ${overtime.startTime}</p>
            <p><span class="label">Saída:</span> ${overtime.endTime}</p>
            <p><span class="label">Total:</span> <strong>${hours} horas</strong></p>
          </div>
        </div>
        
        <h2 class="section-title">👷 Recursos Alocados (${selectedResourcesList.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Capacidade</th>
              <th>Localização</th>
            </tr>
          </thead>
          <tbody>
            ${selectedResourcesList.map(r => `
              <tr>
                <td><strong>${r.name}</strong></td>
                <td>${r.type === 'mao_de_obra' ? 'Mão de Obra' : r.type}</td>
                <td>${r.capacity}</td>
                <td>${r.location || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <h2 class="section-title">👥 Líderes Responsáveis (${selectedLeadersList.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo</th>
              <th>E-mail</th>
              <th>Telefone</th>
            </tr>
          </thead>
          <tbody>
            ${selectedLeadersList.map(l => `
              <tr>
                <td><strong>${l.name}</strong></td>
                <td>${l.position}</td>
                <td>${l.email}</td>
                <td>${l.phone}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        ${overtime.observations ? `
          <h2 class="section-title">📝 Observações</h2>
          <div class="info-card">
            <p>${overtime.observations}</p>
          </div>
        ` : ''}
        
        <div class="approval-section">
          <h3 style="margin: 0 0 20px 0; font-size: 14px; color: #065f46; font-weight: bold;">✅ APROVAÇÃO DO GERENTE</h3>
          <p style="margin: 0 0 10px 0; font-size: 11px;">
            Eu, na qualidade de gestor responsável, <strong>AUTORIZO</strong> a realização das horas extras descritas neste documento.
          </p>
          <div class="signature-box">
            <p>_______________________________________</p>
            <p><strong>Assinatura do Gerente Responsável</strong></p>
            <p>Nome: _________________________________</p>
            <p>Data: _____ / _____ / _________</p>
          </div>
        </div>
        
        <div class="footer">
          <p><strong>Gerado em ${new Date().toLocaleString('pt-BR')}</strong></p>
          <p>Para dúvidas: ${companyData?.email || 'contato@empresa.com'}</p>
        </div>
      </body>
      </html>
    `;

    // Criar e abrir nova janela para impressão/PDF
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      // Aguardar carregamento e imprimir
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
      toast({ title: "PDF sendo gerado!", description: "Uma nova janela foi aberta para geração do PDF." });
    }
  };

  // Funções de submit
  const onCompanySubmit = async (values: z.infer<typeof companySchema>) => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Erro de Autenticação",
        description: "Você precisa estar logado para salvar as alterações.",
      });
      return;
    }
    
    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      
      // Limpar campos vazios e converter números
      const dataToSave = {
        nomeFantasia: values.nomeFantasia,
        cnpj: values.cnpj,
        inscricaoEstadual: values.inscricaoEstadual || "",
        email: values.email,
        celular: values.celular,
        endereco: values.endereco,
        website: values.website || "",
        capacidadeInstalada: values.capacidadeInstalada || null,
        metaMensal: values.metaMensal || null,
        logo: {
          preview: logoPreview,
        },
        updatedAt: new Date(),
      };
      
      await setDoc(companyRef, dataToSave, { merge: true });
      
      toast({
        title: "Dados atualizados!",
        description: "As informações da empresa foram salvas com sucesso.",
      });
    } catch (error) {
      console.error("Error saving company data: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao salvar os dados. Tente novamente.",
      });
    }
  };

  const onTeamSubmit = async (values: TeamMember) => {
    const teamRef = doc(db, "companies", "mecald", "settings", "team");
    const memberData = { ...values, updatedAt: new Date() };

    try {
        if (selectedMember) {
            const updatedMembers = teamMembers.map(m => m.id === selectedMember.id ? memberData : m);
            await updateDoc(teamRef, { members: updatedMembers });
            toast({ title: "Membro atualizado!", description: "Os dados do membro da equipe foram atualizados." });
        } else {
            const newMember = { ...memberData, id: Date.now().toString() };
            await updateDoc(teamRef, { members: arrayUnion(newMember) });
            toast({ title: "Membro adicionado!", description: "Novo membro adicionado à equipe." });
        }
        teamForm.reset();
        setIsTeamFormOpen(false);
        setSelectedMember(null);
        await fetchTeamData();
    } catch (error) {
        console.error("Error saving team member:", error);
        toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar os dados do membro." });
    }
  };

  const onResourceSubmit = async (values: Resource) => {
    const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
    const resourceData = { ...values, updatedAt: new Date() };

    try {
        if (selectedResource) {
            const updatedResources = resources.map(r => r.id === selectedResource.id ? resourceData : r);
            await updateDoc(resourcesRef, { resources: updatedResources });
            toast({ title: "Recurso atualizado!", description: "Os dados do recurso foram atualizados." });
        } else {
            const newResource = { ...resourceData, id: Date.now().toString() };
            await updateDoc(resourcesRef, { resources: arrayUnion(newResource) });
            toast({ title: "Recurso adicionado!", description: "Novo recurso produtivo adicionado." });
        }
        resourceForm.reset();
        setIsResourceFormOpen(false);
        setSelectedResource(null);
        await fetchResourcesData();
    } catch (error) {
        console.error("Error saving resource:", error);
        toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar os dados do recurso." });
    }
  };

  const onOvertimeSubmit = async (values: OvertimeRelease) => {
    const overtimeRef = doc(db, "companies", "mecald", "settings", "overtime");
    const overtimeData = { 
      ...values, 
      resources: selectedResources,
      teamLeaders: selectedLeaders,
      createdAt: new Date(),
      updatedAt: new Date() 
    };

    try {
        if (selectedOvertime) {
            const updatedReleases = overtimeReleases.map(o => o.id === selectedOvertime.id ? overtimeData : o);
            await updateDoc(overtimeRef, { releases: updatedReleases });
            toast({ title: "Liberação atualizada!", description: "Os dados da liberação de horas extras foram atualizados." });
        } else {
            const newRelease = { ...overtimeData, id: Date.now().toString() };
            await updateDoc(overtimeRef, { releases: arrayUnion(newRelease) });
            toast({ title: "Liberação criada!", description: "Nova liberação de horas extras criada com sucesso." });
        }
        overtimeForm.reset();
        setIsOvertimeFormOpen(false);
        setSelectedOvertime(null);
        setSelectedResources([]);
        setSelectedLeaders([]);
        await fetchOvertimeData();
    } catch (error) {
        console.error("Error saving overtime:", error);
        toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar a liberação de horas extras." });
    }
  };

  // Handlers de ações
  const handleAddMemberClick = () => {
    setSelectedMember(null);
    teamForm.reset({ id: "", name: "", position: "", email: "", phone: "", permission: "user" });
    setIsTeamFormOpen(true);
  };

  const handleEditMemberClick = (member: TeamMember) => {
    setSelectedMember(member);
    teamForm.reset(member);
    setIsTeamFormOpen(true);
  };

  const handleDeleteMemberClick = (member: TeamMember) => {
    setMemberToDelete(member);
    setIsDeleteAlertOpen(true);
  };

  const handleAddResourceClick = () => {
    setSelectedResource(null);
    resourceForm.reset({ 
        id: "", 
        name: "", 
        type: "maquina", 
        description: "", 
        capacity: 1, 
        status: "disponivel", 
        location: "", 
        serialNumber: "", 
        acquisitionDate: "", 
        maintenanceDate: "",
        absenceStartDate: "",
        absenceEndDate: "",
        absenceReason: ""
    });
    setIsResourceFormOpen(true);
  };

  const handleEditResourceClick = (resource: Resource) => {
    setSelectedResource(resource);
    resourceForm.reset(resource);
    setIsResourceFormOpen(true);
  };

  const handleDeleteResourceClick = (resource: Resource) => {
    setResourceToDelete(resource);
    setIsResourceDeleteAlertOpen(true);
  };

  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete) return;
    const teamRef = doc(db, "companies", "mecald", "settings", "team");
    try {
        const memberToRemove = teamMembers.find(m => m.id === memberToDelete.id);
        if (memberToRemove) {
            await updateDoc(teamRef, { members: arrayRemove(memberToRemove) });
            toast({ title: "Membro removido!", description: "O membro foi removido da equipe." });
        }
        setMemberToDelete(null);
        setIsDeleteAlertOpen(false);
        await fetchTeamData();
    } catch (error) {
        console.error("Error deleting team member:", error);
        toast({ variant: "destructive", title: "Erro ao remover", description: "Não foi possível remover o membro da equipe." });
    }
  };

  const handleConfirmDeleteResource = async () => {
    if (!resourceToDelete) return;
    const resourcesRef = doc(db, "companies", "mecald", "settings", "resources");
    try {
        const resourceToRemove = resources.find(r => r.id === resourceToDelete.id);
        if (resourceToRemove) {
            await updateDoc(resourcesRef, { resources: arrayRemove(resourceToRemove) });
            toast({ title: "Recurso removido!", description: "O recurso foi removido." });
        }
        setResourceToDelete(null);
        setIsResourceDeleteAlertOpen(false);
        await fetchResourcesData();
    } catch (error) {
        console.error("Error deleting resource:", error);
        toast({ variant: "destructive", title: "Erro ao remover", description: "Não foi possível remover o recurso." });
    }
  };

  const handleAddOvertimeClick = () => {
    setSelectedOvertime(null);
    setSelectedResources([]);
    setSelectedLeaders([]);
    overtimeForm.reset({ 
        id: "", 
        osNumber: "", 
        date: "", 
        startTime: "", 
        endTime: "", 
        resources: [],
        teamLeaders: [],
        observations: "",
        status: "pendente"
    });
    setIsOvertimeFormOpen(true);
  };

  const handleEditOvertimeClick = (overtime: OvertimeRelease) => {
    setSelectedOvertime(overtime);
    setSelectedResources(overtime.resources);
    setSelectedLeaders(overtime.teamLeaders);
    overtimeForm.reset(overtime);
    setIsOvertimeFormOpen(true);
  };

  const handleDeleteOvertimeClick = (overtime: OvertimeRelease) => {
    setOvertimeToDelete(overtime);
    setIsOvertimeDeleteAlertOpen(true);
  };

  const handleApproveOvertime = async (overtime: OvertimeRelease) => {
    const overtimeRef = doc(db, "companies", "mecald", "settings", "overtime");
    try {
        const updatedRelease = { 
          ...overtime, 
          status: "aprovado" as const,
          approvedBy: user?.email || "Gerente",
          approvedAt: new Date(),
          updatedAt: new Date()
        };
        const updatedReleases = overtimeReleases.map(o => o.id === overtime.id ? updatedRelease : o);
        await updateDoc(overtimeRef, { releases: updatedReleases });
        toast({ title: "Liberação aprovada!", description: "A liberação de horas extras foi aprovada com sucesso." });
        await fetchOvertimeData();
    } catch (error) {
        console.error("Error approving overtime:", error);
        toast({ variant: "destructive", title: "Erro ao aprovar", description: "Não foi possível aprovar a liberação." });
    }
  };

  const handleConfirmDeleteOvertime = async () => {
    if (!overtimeToDelete) return;
    const overtimeRef = doc(db, "companies", "mecald", "settings", "overtime");
    try {
        const overtimeToRemove = overtimeReleases.find(o => o.id === overtimeToDelete.id);
        if (overtimeToRemove) {
            await updateDoc(overtimeRef, { releases: arrayRemove(overtimeToRemove) });
            toast({ title: "Liberação removida!", description: "A liberação de horas extras foi removida." });
        }
        setOvertimeToDelete(null);
        setIsOvertimeDeleteAlertOpen(false);
        await fetchOvertimeData();
    } catch (error) {
        console.error("Error deleting overtime:", error);
        toast({ variant: "destructive", title: "Erro ao remover", description: "Não foi possível remover a liberação." });
    }
  };

  // Variáveis calculadas
  const stats = getResourceStats();
  const isLoadingPage = isLoading || authLoading;

  // Watch do status do recurso para mostrar/ocultar campos de ausência
  const watchedStatus = resourceForm.watch("status");

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Empresa e Equipe</h1>
        </div>
        
        <Tabs defaultValue="company" className="space-y-4">
          <TabsList>
            <TabsTrigger value="company">Dados da Empresa</TabsTrigger>
            <TabsTrigger value="team">Equipe</TabsTrigger>
            <TabsTrigger value="resources">Recursos Produtivos</TabsTrigger>
            <TabsTrigger value="overtime">
              <Clock className="h-4 w-4 mr-2" />
              Horas Extras
            </TabsTrigger>
          </TabsList>

          {/* ABA EMPRESA */}
          <TabsContent value="company">
            {isLoadingPage ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
                <div className="md:col-span-1 space-y-4">
                  <Skeleton className="h-8 w-1/4" />
                  <Skeleton className="aspect-square w-full rounded-md" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="md:col-span-2">
                  <Skeleton className="h-96 w-full" />
                </div>
              </div>
            ) : (
              <Form {...companyForm}>
                <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 flex flex-col items-center text-center">
                      <h3 className="text-lg font-medium mb-4">Logotipo da Empresa</h3>
                      <Card className="w-full max-w-xs aspect-square flex items-center justify-center overflow-hidden mb-4">
                        <Image
                          src={logoPreview || "https://placehold.co/300x300.png"}
                          alt="Logotipo da empresa"
                          width={300}
                          height={300}
                          className="object-contain"
                          data-ai-hint="logo"
                        />
                      </Card>
                      <FormControl>
                        <Input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleFileChange} 
                          className="cursor-pointer"
                        />
                      </FormControl>
                    </div>

                    <div className="lg:col-span-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>Informações de Contato e Fiscais</CardTitle>
                          <CardDescription>
                            Mantenha os dados da sua empresa sempre atualizados.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-6">
                          <FormField
                            control={companyForm.control}
                            name="nomeFantasia"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nome Fantasia</FormLabel>
                                <FormControl>
                                  <Input placeholder="Nome comercial da empresa" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid md:grid-cols-2 gap-6">
                            <FormField
                              control={companyForm.control}
                              name="cnpj"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>CNPJ</FormLabel>
                                  <FormControl>
                                    <Input placeholder="00.000.000/0000-00" {...field} value={field.value ?? ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={companyForm.control}
                              name="inscricaoEstadual"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Inscrição Estadual</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Opcional" {...field} value={field.value ?? ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="grid md:grid-cols-2 gap-6">
                            <FormField
                              control={companyForm.control}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>E-mail</FormLabel>
                                  <FormControl>
                                    <Input type="email" placeholder="contato@suaempresa.com" {...field} value={field.value ?? ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={companyForm.control}
                              name="celular"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Celular / WhatsApp</FormLabel>
                                  <FormControl>
                                    <Input placeholder="(XX) XXXXX-XXXX" {...field} value={field.value ?? ''} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={companyForm.control}
                            name="website"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Website</FormLabel>
                                <FormControl>
                                  <Input type="url" placeholder="https://suaempresa.com" {...field} value={field.value ?? ''}/>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid md:grid-cols-2 gap-6">
                            <FormField
                              control={companyForm.control}
                              name="capacidadeInstalada"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Capacidade Instalada Mensal (kg)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      min="0" 
                                      step="0.01"
                                      placeholder="Ex: 50000" 
                                      {...field} 
                                      value={field.value ?? ''} 
                                      onChange={e => field.onChange(parseFloat(e.target.value) || undefined)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <p className="text-xs text-muted-foreground">
                                    Capacidade máxima de produção mensal da empresa (em kg)
                                  </p>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={companyForm.control}
                              name="metaMensal"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Meta Mensal de Produção (kg)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      min="0" 
                                      step="0.01"
                                      placeholder="Ex: 35000" 
                                      {...field} 
                                      value={field.value ?? ''} 
                                      onChange={e => field.onChange(parseFloat(e.target.value) || undefined)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                  <p className="text-xs text-muted-foreground">
                                    Meta de produção mensal que a empresa deseja atingir (em kg)
                                  </p>
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={companyForm.control}
                            name="endereco"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Endereço Completo</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Rua, Número, Bairro, Cidade - Estado, CEP"
                                    className="min-h-[100px]"
                                    {...field}
                                    value={field.value ?? ''}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button type="submit" size="lg" disabled={companyForm.formState.isSubmitting}>
                      {companyForm.formState.isSubmitting ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </TabsContent>

          {/* ABA EQUIPE */}
          <TabsContent value="team">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Membros da Equipe</CardTitle>
                  <CardDescription>Gerencie os membros da sua equipe e suas permissões de acesso.</CardDescription>
                </div>
                <Button onClick={handleAddMemberClick}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Adicionar Membro
                </Button>
              </CardHeader>
              <CardContent>
                {isTeamLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Permissão</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamMembers.length > 0 ? (
                        teamMembers.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">{member.name}</TableCell>
                            <TableCell>{member.position}</TableCell>
                            <TableCell>{member.email}</TableCell>
                            <TableCell>{member.phone}</TableCell>
                            <TableCell className="capitalize">{member.permission}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleEditMemberClick(member)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteMemberClick(member)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center h-24">Nenhum membro na equipe.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA RECURSOS PRODUTIVOS */}
          <TabsContent value="resources">
            <div className="space-y-6">
              {/* Dashboard de Ocupação Atualizado */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total de Recursos</CardTitle>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.total}</div>
                    <p className="text-xs text-muted-foreground">recursos cadastrados</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Disponíveis</CardTitle>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats.available}</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.activeResources > 0 ? Math.round((stats.available / stats.activeResources) * 100) : 0}% dos ativos
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Em Manutenção</CardTitle>
                    <Settings className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats.maintenance}</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.total > 0 ? Math.round((stats.maintenance / stats.total) * 100) : 0}% do total
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ausentes/Férias</CardTitle>
                    <UserX className="h-4 w-4 text-orange-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">{stats.absent + stats.vacation}</div>
                    <p className="text-xs text-muted-foreground">
                      não computados na ociosidade
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taxa de Ociosidade</CardTitle>
                    <Activity className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{Math.round(stats.idleRate)}%</div>
                    <p className="text-xs text-muted-foreground">recursos ativos ociosos</p>
                  </CardContent>
                </Card>
              </div>

              {/* Gráfico de Ocupação Atualizado */}
              <Card>
                <CardHeader>
                  <CardTitle>Distribuição dos Recursos</CardTitle>
                  <CardDescription>Status atual dos recursos produtivos (ausentes/férias não afetam ociosidade)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center">
                        <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
                        Disponíveis
                      </span>
                      <span>{stats.available} / {stats.total}</span>
                    </div>
                    <Progress value={stats.total > 0 ? (stats.available / stats.total) * 100 : 0} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center">
                        <Activity className="h-3 w-3 mr-1 text-yellow-600" />
                        Ocupados
                      </span>
                      <span>{stats.occupied} / {stats.total}</span>
                    </div>
                    <Progress value={stats.total > 0 ? (stats.occupied / stats.total) * 100 : 0} className="h-2 [&>div]:bg-yellow-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center">
                        <Settings className="h-3 w-3 mr-1 text-red-600" />
                        Em Manutenção
                      </span>
                      <span>{stats.maintenance} / {stats.total}</span>
                    </div>
                    <Progress value={stats.total > 0 ? (stats.maintenance / stats.total) * 100 : 0} className="h-2 [&>div]:bg-red-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center">
                        <UserX className="h-3 w-3 mr-1 text-orange-600" />
                        Ausentes
                      </span>
                      <span>{stats.absent} / {stats.total}</span>
                    </div>
                    <Progress value={stats.total > 0 ? (stats.absent / stats.total) * 100 : 0} className="h-2 [&>div]:bg-orange-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1 text-blue-600" />
                        Férias
                      </span>
                      <span>{stats.vacation} / {stats.total}</span>
                    </div>
                    <Progress value={stats.total > 0 ? (stats.vacation / stats.total) * 100 : 0} className="h-2 [&>div]:bg-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center">
                        <AlertCircle className="h-3 w-3 mr-1 text-gray-600" />
                        Inativos
                      </span>
                      <span>{stats.inactive} / {stats.total}</span>
                    </div>
                    <Progress value={stats.total > 0 ? (stats.inactive / stats.total) * 100 : 0} className="h-2 [&>div]:bg-gray-500" />
                  </div>
                  {stats.activeResources > 0 && (
                    <div className="pt-4 border-t">
                      <div className="text-sm text-muted-foreground mb-2">
                        <strong>Recursos Ativos:</strong> {stats.activeResources} (excluindo ausentes, férias e inativos)
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <strong>Taxa de Ociosidade Real:</strong> {Math.round(stats.idleRate)}% dos recursos ativos estão disponíveis
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tabela de Recursos */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Recursos Produtivos</CardTitle>
                    <CardDescription>Gerencie os recursos produtivos da sua empresa.</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={exportResourcesWithTasks} disabled={resources.length === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar CSV
                    </Button>
                    <Button variant="outline" onClick={exportResourcesToPDF} disabled={resources.length === 0}>
                      <FileText className="mr-2 h-4 w-4" />
                      Exportar PDF
                    </Button>
                    <Button onClick={handleAddResourceClick}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Adicionar Recurso
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isResourcesLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Capacidade</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Localização</TableHead>
                          <TableHead>Período</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resources.length > 0 ? (
                          resources.map((resource) => (
                            <TableRow key={resource.id}>
                              <TableCell className="font-medium">{resource.name}</TableCell>
                              <TableCell className="capitalize">
                                {resource.type === 'mao_de_obra' ? 'Mão de Obra' : resource.type}
                              </TableCell>
                              <TableCell>{resource.capacity}</TableCell>
                              <TableCell>{getStatusBadge(resource.status)}</TableCell>
                              <TableCell>{resource.location || "-"}</TableCell>
                              <TableCell>
                                {(resource.status === 'ausente' || resource.status === 'ferias') && resource.absenceStartDate && resource.absenceEndDate ? (
                                  <div className="text-xs">
                                    <div>{new Date(resource.absenceStartDate).toLocaleDateString('pt-BR')} até</div>
                                    <div>{new Date(resource.absenceEndDate).toLocaleDateString('pt-BR')}</div>
                                  </div>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => handleEditResourceClick(resource)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteResourceClick(resource)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center h-24">Nenhum recurso cadastrado.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ABA HORAS EXTRAS - NOVA */}
          <TabsContent value="overtime">
            <div className="space-y-6">
              {/* Cards de Resumo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total de Liberações</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overtimeReleases.length}</div>
                    <p className="text-xs text-muted-foreground">liberações cadastradas</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pendentes de Aprovação</CardTitle>
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">
                      {overtimeReleases.filter(o => o.status === 'pendente').length}
                    </div>
                    <p className="text-xs text-muted-foreground">aguardando aprovação</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Aprovadas</CardTitle>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {overtimeReleases.filter(o => o.status === 'aprovado').length}
                    </div>
                    <p className="text-xs text-muted-foreground">liberações aprovadas</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabela de Liberações */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Liberações de Horas Extras</CardTitle>
                    <CardDescription>Gerencie as autorizações de horas extras da sua equipe.</CardDescription>
                  </div>
                  <Button onClick={handleAddOvertimeClick}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nova Liberação
                  </Button>
                </CardHeader>
                <CardContent>
                  {isOvertimeLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>OS</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Horário</TableHead>
                          <TableHead>Horas</TableHead>
                          <TableHead>Recursos</TableHead>
                          <TableHead>Líderes</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overtimeReleases.length > 0 ? (
                          overtimeReleases.map((overtime) => {
                            const os = orderServices.find(o => o.id === overtime.osNumber);
                            const hours = calculateOvertimeHours(overtime.startTime, overtime.endTime);
                            return (
                              <TableRow key={overtime.id}>
                                <TableCell className="font-medium">
                                  {os?.numeroOS || 'N/A'}
                                  <div className="text-xs text-muted-foreground">{os?.nomeCliente}</div>
                                </TableCell>
                                <TableCell>{new Date(overtime.date).toLocaleDateString('pt-BR')}</TableCell>
                                <TableCell>
                                  <div className="text-xs">
                                    <div>{overtime.startTime} - {overtime.endTime}</div>
                                  </div>
                                </TableCell>
                                <TableCell className="font-bold">{hours}h</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{overtime.resources.length} recursos</Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{overtime.teamLeaders.length} líderes</Badge>
                                </TableCell>
                                <TableCell>{getOvertimeStatusBadge(overtime.status)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {overtime.status === 'pendente' && (
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="text-green-600 hover:text-green-700"
                                        onClick={() => handleApproveOvertime(overtime)}
                                        title="Aprovar"
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => exportOvertimeToPDF(overtime)}
                                      title="Exportar PDF"
                                    >
                                      <FileText className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => handleEditOvertimeClick(overtime)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="text-destructive hover:text-destructive" 
                                      onClick={() => handleDeleteOvertimeClick(overtime)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center h-24">
                              Nenhuma liberação de horas extras cadastrada.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* DIALOGS E MODAIS */}

      {/* Dialog para Membros da Equipe */}
      <Dialog open={isTeamFormOpen} onOpenChange={setIsTeamFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedMember ? "Editar Membro" : "Adicionar Membro"}</DialogTitle>
            <DialogDescription>
              {selectedMember ? "Atualize os dados do membro da equipe." : "Preencha as informações do novo membro."}
            </DialogDescription>
          </DialogHeader>
          <Form {...teamForm}>
            <form onSubmit={teamForm.handleSubmit(onTeamSubmit)} className="space-y-4">
              <FormField control={teamForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do membro" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={teamForm.control} name="position" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cargo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Vendedor, Gerente" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={teamForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@dominio.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={teamForm.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input placeholder="(XX) XXXXX-XXXX" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={teamForm.control} name="permission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissão</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o nível de acesso" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="user">Usuário</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={teamForm.formState.isSubmitting}>
                  {teamForm.formState.isSubmitting ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog para Recursos */}
      <Dialog open={isResourceFormOpen} onOpenChange={setIsResourceFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedResource ? "Editar Recurso" : "Adicionar Recurso"}</DialogTitle>
            <DialogDescription>
              {selectedResource ? "Atualize os dados do recurso produtivo." : "Preencha as informações do novo recurso."}
            </DialogDescription>
          </DialogHeader>
          <Form {...resourceForm}>
            <form onSubmit={resourceForm.handleSubmit(onResourceSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={resourceForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Recurso</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Soldador Especializado, Máquina CNC" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={resourceForm.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="maquina">Máquina</SelectItem>
                        <SelectItem value="equipamento">Equipamento</SelectItem>
                        <SelectItem value="veiculo">Veículo</SelectItem>
                        <SelectItem value="ferramenta">Ferramenta</SelectItem>
                        <SelectItem value="espaco">Espaço</SelectItem>
                        <SelectItem value="mao_de_obra">Mão de Obra</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={resourceForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Ex: Soldador com 10 anos de experiência, certificado em solda TIG" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={resourceForm.control} name="capacity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacidade</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" placeholder="1" {...field} onChange={e => field.onChange(parseInt(e.target.value) || 1)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={resourceForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="disponivel">Disponível</SelectItem>
                        <SelectItem value="ocupado">Ocupado</SelectItem>
                        <SelectItem value="manutencao">Manutenção</SelectItem>
                        <SelectItem value="ausente">Ausente</SelectItem>
                        <SelectItem value="ferias">Férias</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              
              {/* Campos condicionais para ausência/férias */}
              {(watchedStatus === 'ausente' || watchedStatus === 'ferias') && (
                <div className="space-y-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h4 className="font-medium text-orange-800 flex items-center">
                    {watchedStatus === 'ferias' ? <Calendar className="h-4 w-4 mr-2" /> : <UserX className="h-4 w-4 mr-2" />}
                    Informações de {watchedStatus === 'ferias' ? 'Férias' : 'Ausência'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={resourceForm.control} name="absenceStartDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={resourceForm.control} name="absenceEndDate" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Retorno</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={resourceForm.control} name="absenceReason" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motivo {watchedStatus === 'ferias' ? '(Opcional)' : ''}</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder={watchedStatus === 'ferias' 
                            ? "Ex: Férias anuais, descanso..." 
                            : "Ex: Licença médica, treinamento, viagem de trabalho..."
                          } 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="text-sm text-orange-700 bg-orange-100 p-3 rounded">
                    <strong>Importante:</strong> Recursos em {watchedStatus === 'ferias' ? 'férias' : 'ausência'} não são contabilizados no cálculo de ociosidade da empresa.
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={resourceForm.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Localização</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Galpão A, Setor 2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={resourceForm.control} name="serialNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de Série</FormLabel>
                    <FormControl>
                      <Input placeholder="Número de série ou patrimônio" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={resourceForm.control} name="acquisitionDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Aquisição</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={resourceForm.control} name="maintenanceDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Última Manutenção</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={resourceForm.formState.isSubmitting}>
                  {resourceForm.formState.isSubmitting ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Alert Dialog para Exclusão de Membros */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o membro <span className="font-bold">{memberToDelete?.name}</span> da equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteMember} className="bg-destructive hover:bg-destructive/90">
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog para Exclusão de Recursos */}
      <AlertDialog open={isResourceDeleteAlertOpen} onOpenChange={setIsResourceDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o recurso <span className="font-bold">{resourceToDelete?.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteResource} className="bg-destructive hover:bg-destructive/90">
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para Horas Extras */}
      <Dialog open={isOvertimeFormOpen} onOpenChange={setIsOvertimeFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedOvertime ? "Editar Liberação de Horas Extras" : "Nova Liberação de Horas Extras"}
            </DialogTitle>
            <DialogDescription>
              {selectedOvertime 
                ? "Atualize os dados da liberação de horas extras." 
                : "Preencha as informações para criar uma nova liberação de horas extras."}
            </DialogDescription>
          </DialogHeader>
          <Form {...overtimeForm}>
            <form onSubmit={overtimeForm.handleSubmit(onOvertimeSubmit)} className="space-y-6">
              {/* Informações Básicas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField 
                  control={overtimeForm.control} 
                  name="osNumber" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ordem de Serviço</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma OS" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {orderServices.map((os) => (
                            <SelectItem key={os.id} value={os.id}>
                              {os.numeroOS} - {os.nomeCliente}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
                
                <FormField 
                  control={overtimeForm.control} 
                  name="date" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField 
                  control={overtimeForm.control} 
                  name="startTime" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário de Entrada</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
                
                <FormField 
                  control={overtimeForm.control} 
                  name="endTime" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horário de Saída</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
              </div>

              {/* Seleção de Recursos */}
              <div className="space-y-3">
                <FormLabel>Recursos Alocados *</FormLabel>
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                  {resources.filter(r => r.type === 'mao_de_obra').length > 0 ? (
                    resources.filter(r => r.type === 'mao_de_obra').map((resource) => (
                      <div key={resource.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`resource-${resource.id}`}
                          checked={selectedResources.includes(resource.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedResources([...selectedResources, resource.id]);
                            } else {
                              setSelectedResources(selectedResources.filter(id => id !== resource.id));
                            }
                          }}
                        />
                        <label
                          htmlFor={`resource-${resource.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {resource.name}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({resource.status})
                          </span>
                        </label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum recurso de mão de obra disponível.</p>
                  )}
                </div>
                {selectedResources.length === 0 && (
                  <p className="text-sm text-destructive">Selecione pelo menos um recurso.</p>
                )}
              </div>

              {/* Seleção de Líderes */}
              <div className="space-y-3">
                <FormLabel>Líderes Responsáveis *</FormLabel>
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                  {teamMembers.length > 0 ? (
                    teamMembers.map((member) => (
                      <div key={member.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`leader-${member.id}`}
                          checked={selectedLeaders.includes(member.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedLeaders([...selectedLeaders, member.id]);
                            } else {
                              setSelectedLeaders(selectedLeaders.filter(id => id !== member.id));
                            }
                          }}
                        />
                        <label
                          htmlFor={`leader-${member.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {member.name}
                          <span className="text-xs text-muted-foreground ml-2">
                            ({member.position})
                          </span>
                        </label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum membro da equipe disponível.</p>
                  )}
                </div>
                {selectedLeaders.length === 0 && (
                  <p className="text-sm text-destructive">Selecione pelo menos um líder.</p>
                )}
              </div>

              {/* Observações */}
              <FormField 
                control={overtimeForm.control} 
                name="observations" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Informações adicionais sobre a liberação de horas extras..."
                        className="min-h-[100px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} 
              />

              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={overtimeForm.formState.isSubmitting || selectedResources.length === 0 || selectedLeaders.length === 0}
                >
                  {overtimeForm.formState.isSubmitting ? "Salvando..." : "Salvar Liberação"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog para Exclusão de Horas Extras */}
      <AlertDialog open={isOvertimeDeleteAlertOpen} onOpenChange={setIsOvertimeDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente a liberação de horas extras 
              {overtimeToDelete && (
                <span className="font-bold">
                  {' '}da OS {orderServices.find(o => o.id === overtimeToDelete.osNumber)?.numeroOS}
                </span>
              )}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDeleteOvertime} 
              className="bg-destructive hover:bg-destructive/90"
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
