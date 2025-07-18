
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PlusCircle, Search, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "../layout";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogTrigger,
  DialogFooter,
  DialogClose,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const customerSchema = z.object({
  razaoSocial: z.string().min(3, { message: "A razão social é obrigatória." }),
  nomeFantasia: z.string().min(3, { message: "O nome fantasia é obrigatório." }),
  cnpjCpf: z.string().min(11, { message: "O CNPJ/CPF deve ser válido." }),
  inscricaoEstadual: z.string().optional(),
  inscricaoMunicipal: z.string().optional(),
  tipoCliente: z.enum(["Pessoa Jurídica", "Pessoa Física"], {
    required_error: "Selecione o tipo de cliente.",
  }),
  contatoPrincipal: z.string().min(3, { message: "O nome do contato é obrigatório." }),
  emailComercial: z.string().email({ message: "O e-mail comercial é inválido." }),
  telefone: z.string().min(10, { message: "O telefone deve ser válido." }),
});

type Customer = z.infer<typeof customerSchema> & { id: string };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const form = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      razaoSocial: "",
      nomeFantasia: "",
      cnpjCpf: "",
      inscricaoEstadual: "",
      inscricaoMunicipal: "",
      contatoPrincipal: "",
      emailComercial: "",
      telefone: "",
    },
  });

  const fetchCustomers = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "customers"));
      const customersList = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          razaoSocial: data.razaoSocial || data.name || "Razão Social não informada",
          nomeFantasia: data.nomeFantasia || data.name || "Cliente sem nome",
          cnpjCpf: data.cnpjCpf || data.cnpj || "",
          inscricaoEstadual: data.inscricaoEstadual || "",
          inscricaoMunicipal: data.inscricaoMunicipal || "",
          tipoCliente: data.tipoCliente || "Pessoa Jurídica",
          contatoPrincipal: data.contatoPrincipal || data.contactPerson || "",
          emailComercial: data.emailComercial || data.email || "",
          telefone: data.telefone || data.phone || "",
        } as Customer;
      });
      setCustomers(customersList);
    } catch (error: any) {
      console.error("Detailed error fetching customers: ", error);
      let description = "Ocorreu um erro ao buscar os dados.";
      if (error.code === 'permission-denied') {
        description = "Erro de permissão. Verifique as regras de segurança do seu Firestore e atualize a página.";
      }
      toast({
        variant: "destructive",
        title: "Erro ao buscar clientes",
        description: description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchCustomers();
    }
  }, [user, authLoading]);

  const onSubmit = async (values: z.infer<typeof customerSchema>) => {
    try {
      if (selectedCustomer) {
        const customerRef = doc(db, "companies", "mecald", "customers", selectedCustomer.id);
        await updateDoc(customerRef, values);
        toast({ title: "Cliente atualizado!", description: "Os dados do cliente foram atualizados." });
      } else {
        await addDoc(collection(db, "companies", "mecald", "customers"), values);
        toast({ title: "Cliente adicionado!", description: "O novo cliente foi adicionado com sucesso." });
      }
      form.reset();
      setIsFormOpen(false);
      setSelectedCustomer(null);
      await fetchCustomers();
    } catch (error) {
      console.error("Error saving customer: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao salvar cliente",
        description: "Ocorreu um erro ao salvar o cliente. Tente novamente.",
      });
    }
  };

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewSheetOpen(true);
  };

  const handleAddClick = () => {
    setSelectedCustomer(null);
    form.reset();
    setIsFormOpen(true);
  };
  
  const handleEditClick = (customer: Customer) => {
    setSelectedCustomer(customer);
    form.reset(customer);
    setIsFormOpen(true);
  };
  
  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await deleteDoc(doc(db, "companies", "mecald", "customers", customerToDelete.id));
      toast({ title: "Cliente excluído!", description: "O cliente foi removido do sistema." });
      setCustomerToDelete(null);
      setIsDeleteDialogOpen(false);
      await fetchCustomers();
    } catch (error) {
      console.error("Error deleting customer: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir cliente",
        description: "Não foi possível remover o cliente. Tente novamente.",
      });
    }
  };
  
  const filteredCustomers = customers.filter((customer) => {
    const query = searchQuery.toLowerCase();
    return (
      customer.nomeFantasia.toLowerCase().includes(query) ||
      customer.razaoSocial.toLowerCase().includes(query) ||
      customer.cnpjCpf.toLowerCase().includes(query) ||
      customer.contatoPrincipal.toLowerCase().includes(query)
    );
  });

  const PageContent = () => {
    if (isLoading || authLoading) {
      return (
        <div className="space-y-4 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }

    if (filteredCustomers.length > 0) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome Fantasia / Razão Social</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="w-[200px]">CNPJ/CPF</TableHead>
              <TableHead className="w-[100px] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((customer) => (
              <TableRow key={customer.id} onClick={() => handleViewCustomer(customer)} className="cursor-pointer">
                <TableCell className="font-medium">{customer.nomeFantasia}</TableCell>
                <TableCell>{customer.contatoPrincipal}</TableCell>
                <TableCell>{customer.telefone}</TableCell>
                <TableCell>{customer.cnpjCpf}</TableCell>
                <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEditClick(customer); }}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Editar</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteClick(customer); }}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir</span>
                        </Button>
                    </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    return (
      <div className="text-center text-muted-foreground py-8">
        <p>Nenhum cliente encontrado.</p>
        <p className="text-sm">Tente refinar sua busca ou adicione um novo cliente.</p>
      </div>
    );
  };

  const DetailItem = ({ label, value }: { label: string, value?: string | null }) => (
    <div className="grid grid-cols-[150px_1fr] items-center">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "-"}</span>
    </div>
  );

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Clientes</h1>
            <div className="flex items-center gap-2">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar cliente..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                 </div>
                 <Button onClick={handleAddClick}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Adicionar Cliente
                 </Button>
            </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Lista de Clientes</CardTitle>
            <CardDescription>
              Aqui estão todos os clientes cadastrados no sistema. Clique em um cliente para ver os detalhes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PageContent />
          </CardContent>
        </Card>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedCustomer ? "Editar Cliente" : "Adicionar Novo Cliente"}</DialogTitle>
            <DialogDescription>
              {selectedCustomer ? "Altere os dados abaixo para atualizar o cliente." : "Preencha os campos abaixo para cadastrar um novo cliente."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <ScrollArea className="h-96 w-full pr-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="tipoCliente"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Cliente</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione Pessoa Física ou Jurídica" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
                            <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="razaoSocial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Razão Social</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome jurídico da empresa" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
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
                  <FormField
                    control={form.control}
                    name="cnpjCpf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CNPJ / CPF</FormLabel>
                        <FormControl>
                          <Input placeholder="00.000.000/0000-00" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="inscricaoEstadual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inscrição Estadual (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Número da Inscrição Estadual" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="inscricaoMunicipal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inscrição Municipal (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Número da Inscrição Municipal" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contatoPrincipal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contato Principal</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome da pessoa de contato" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emailComercial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail Comercial</FormLabel>
                        <FormControl>
                          <Input placeholder="contato@empresa.com" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telefone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone / WhatsApp</FormLabel>
                        <FormControl>
                          <Input placeholder="(XX) XXXXX-XXXX" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </ScrollArea>
              <DialogFooter className="pt-6">
                 <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Salvando..." : (selectedCustomer ? "Salvar Alterações" : "Salvar Cliente")}
                 </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <Sheet open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-headline">{selectedCustomer?.nomeFantasia}</SheetTitle>
            <SheetDescription>
              Detalhes completos do cliente.
            </SheetDescription>
          </SheetHeader>
          {selectedCustomer && (
            <div className="space-y-3 py-6">
              <DetailItem label="Tipo de Cliente" value={selectedCustomer.tipoCliente} />
              <DetailItem label="Razão Social" value={selectedCustomer.razaoSocial} />
              <DetailItem label="Nome Fantasia" value={selectedCustomer.nomeFantasia} />
              <DetailItem label="CNPJ/CPF" value={selectedCustomer.cnpjCpf} />
              <DetailItem label="Inscrição Estadual" value={selectedCustomer.inscricaoEstadual} />
              <DetailItem label="Inscrição Municipal" value={selectedCustomer.inscricaoMunicipal} />
              <DetailItem label="Contato Principal" value={selectedCustomer.contatoPrincipal} />
              <DetailItem label="E-mail Comercial" value={selectedCustomer.emailComercial} />
              <DetailItem label="Telefone" value={selectedCustomer.telefone} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso excluirá permanentemente o cliente <span className="font-bold">{customerToDelete?.nomeFantasia}</span> do sistema.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">
                Sim, excluir cliente
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
