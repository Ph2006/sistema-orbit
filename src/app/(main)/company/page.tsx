
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import Image from "next/image";
import { PlusCircle, Pencil, Trash2 } from "lucide-react";

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


const companySchema = z.object({
  nomeFantasia: z.string().min(3, "O nome fantasia é obrigatório."),
  cnpj: z.string().min(14, "O CNPJ deve ser válido."),
  inscricaoEstadual: z.string().optional(),
  email: z.string().email("O e-mail é inválido."),
  celular: z.string().min(10, "O celular deve ser válido."),
  endereco: z.string().min(10, "O endereço é obrigatório."),
});

type CompanyData = z.infer<typeof companySchema> & { logo?: { preview?: string } };

const teamMemberSchema = z.object({
    id: z.string(),
    name: z.string().min(3, { message: "O nome é obrigatório." }),
    position: z.string().min(2, { message: "O cargo é obrigatório." }),
    email: z.string().email({ message: "O e-mail é inválido." }),
    phone: z.string().min(10, { message: "O telefone deve ser válido." }),
    permission: z.enum(["admin", "user"], { required_error: "Selecione uma permissão." }),
    updatedAt: z.any().optional(),
});

type TeamMember = z.infer<typeof teamMemberSchema>;


export default function CompanyPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isTeamLoading, setIsTeamLoading] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isTeamFormOpen, setIsTeamFormOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);

  const companyForm = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      nomeFantasia: "",
      cnpj: "",
      inscricaoEstadual: "",
      email: "",
      celular: "",
      endereco: "",
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
  }

  useEffect(() => {
    if (!authLoading && user) {
      fetchCompanyData();
      fetchTeamData();
    }
  }, [user, authLoading]);

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

  const isLoadingPage = isLoading || authLoading;

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
            </TabsList>
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
        </Tabs>
      </div>

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
                        <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome do membro" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={teamForm.control} name="position" render={({ field }) => (
                        <FormItem><FormLabel>Cargo</FormLabel><FormControl><Input placeholder="Ex: Vendedor, Gerente" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={teamForm.control} name="email" render={({ field }) => (
                        <FormItem><FormLabel>E-mail</FormLabel><FormControl><Input type="email" placeholder="email@dominio.com" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={teamForm.control} name="phone" render={({ field }) => (
                        <FormItem><FormLabel>Telefone</FormLabel><FormControl><Input placeholder="(XX) XXXXX-XXXX" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={teamForm.control} name="permission" render={({ field }) => (
                        <FormItem><FormLabel>Permissão</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Selecione o nível de acesso" /></SelectTrigger></FormControl>
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
    </>
  );
}

    