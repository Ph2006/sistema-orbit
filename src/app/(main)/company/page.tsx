"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import Image from "next/image";
import { PlusCircle, Pencil, Trash2, Settings, Activity, AlertCircle, CheckCircle, UserX, Calendar } from "lucide-react";

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

// Schemas
const companySchema = z.object({
  nomeFantasia: z.string().min(3, "O nome fantasia é obrigatório."),
  cnpj: z.string().min(14, "O CNPJ deve ser válido."),
  inscricaoEstadual: z.string().optional(),
  email: z.string().email("O e-mail é inválido."),
  celular: z.string().min(10, "O celular deve ser válido."),
  endereco: z.string().min(10, "O endereço é obrigatório."),
  website: z.string().url("O site deve ser uma URL válida.").optional(),
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

// Types
type CompanyData = z.infer<typeof companySchema> & { logo?: { preview?: string } };
type TeamMember = z.infer<typeof teamMemberSchema>;
type Resource = z.infer<typeof resourceSchema>;

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

  // useEffect
  useEffect(() => {
    if (!authLoading && user) {
      fetchCompanyData();
      fetchTeamData();
      fetchResourcesData();
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
      const dataToSave = {
        ...values,
        logo: {
          preview: logoPreview,
        },
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
                  <Button onClick={handleAddResourceClick}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Recurso
                  </Button>
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
    </>
  );
}
