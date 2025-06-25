
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isToday, isPast, endOfDay, isFuture } from "date-fns";
import { FileDown, AlertTriangle, CalendarCheck, CalendarClock, Cpu, ListTree, CheckCircle, Clock, PlusCircle, Trash2, Pencil } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


type Task = {
  orderId: string;
  quotationNumber: number;
  internalOS: string;
  customerName: string;
  itemName: string;
  itemQuantity: number;
  itemWeight: number;
  stageName: string;
  startDate: Date | null;
  dueDate: Date | null;
  status: string;
  responsible: string; 
  isOverdue: boolean;
};

type CompanyData = {
    nomeFantasia?: string;
    logo?: { preview?: string };
};

const resourceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3, "O nome do recurso é obrigatório."),
  type: z.enum(["Máquina", "Equipe", "Ferramenta", "Outro"], { required_error: "Selecione um tipo." }),
});

type Resource = z.infer<typeof resourceSchema> & { id: string };


export default function TasksPage() {
  const [todaysTasks, setTodaysTasks] = useState<Task[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [futureTasks, setFutureTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);
  const [isDeleteResourceAlertOpen, setIsDeleteResourceAlertOpen] = useState(false);

  const resourceForm = useForm<z.infer<typeof resourceSchema>>({
    resolver: zodResolver(resourceSchema),
    defaultValues: { name: "", type: "Máquina" },
  });

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const allTasks: Task[] = [];

      ordersSnapshot.forEach(orderDoc => {
        const orderData = orderDoc.data();
        (orderData.items || []).forEach((item: any) => {
          (item.productionPlan || []).forEach((stage: any) => {
            const completedDate = stage.completedDate?.toDate ? stage.completedDate.toDate() : null;
            const startDate = stage.startDate?.toDate ? stage.startDate.toDate() : null;
            
            if (stage.status !== 'Concluído') {
                allTasks.push({
                    orderId: orderDoc.id,
                    quotationNumber: orderData.quotationNumber || 0,
                    internalOS: orderData.internalOS || 'N/A',
                    customerName: orderData.customer?.name || 'N/A',
                    itemName: item.description,
                    itemQuantity: item.quantity || 0,
                    itemWeight: (item.quantity || 0) * (item.unitWeight || 0),
                    stageName: stage.stageName,
                    startDate: startDate,
                    dueDate: completedDate,
                    status: stage.status,
                    responsible: 'Não atribuído',
                    isOverdue: completedDate ? isPast(endOfDay(completedDate)) : false,
                });
            }
          });
        });
      });
      
      const filteredTodaysTasks = allTasks.filter(task => 
        !task.isOverdue && ((task.dueDate && isToday(task.dueDate)) || (task.startDate && isToday(task.startDate)))
      ).sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));

      const filteredOverdueTasks = allTasks.filter(task => task.isOverdue)
                                       .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));
      
      const filteredFutureTasks = allTasks.filter(task => 
        !task.isOverdue && (
            (task.dueDate && isFuture(endOfDay(task.dueDate))) || 
            (task.startDate && isFuture(endOfDay(task.startDate)) && !isToday(task.startDate))
        )
      ).sort((a, b) => (a.startDate?.getTime() || 0) - (b.startDate?.getTime() || 0));

      setTodaysTasks(filteredTodaysTasks);
      setOverdueTasks(filteredOverdueTasks);
      setFutureTasks(filteredFutureTasks);

    } catch (error) {
      console.error("Error fetching tasks: ", error);
      toast({
        variant: "destructive",
        title: "Erro ao buscar tarefas",
        description: "Não foi possível carregar a lista de tarefas.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchResources = async () => {
    try {
        const resourceDocRef = doc(db, "companies", "mecald", "settings", "resources");
        const docSnap = await getDoc(resourceDocRef);
        if (docSnap.exists()) {
            setResources(docSnap.data().items || []);
        } else {
            setResources([]);
            // Initialize document if it doesn't exist
            await setDoc(resourceDocRef, { items: [] });
        }
    } catch (error) {
        console.error("Error fetching resources:", error);
        toast({ variant: "destructive", title: "Erro ao buscar recursos" });
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchTasks();
      fetchResources();
    }
  }, [user, authLoading]);

  const onResourceSubmit = async (values: z.infer<typeof resourceSchema>) => {
    const resourceDocRef = doc(db, "companies", "mecald", "settings", "resources");
    try {
        if (selectedResource) { // Editing existing resource
            const currentResources = [...resources];
            const index = currentResources.findIndex(r => r.id === selectedResource.id);
            if (index > -1) {
                currentResources[index] = { ...selectedResource, ...values };
                await updateDoc(resourceDocRef, { items: currentResources });
                toast({ title: "Recurso atualizado!" });
            }
        } else { // Adding new resource
            const newResource = { ...values, id: Date.now().toString() };
            await updateDoc(resourceDocRef, { items: arrayUnion(newResource) });
            toast({ title: "Recurso adicionado!" });
        }
        resourceForm.reset({ name: "", type: "Máquina" });
        setIsResourceDialogOpen(false);
        setSelectedResource(null);
        await fetchResources();
    } catch (error) {
        console.error("Error saving resource:", error);
        toast({ variant: "destructive", title: "Erro ao salvar recurso" });
    }
  };
  
  const handleAddResourceClick = () => {
      setSelectedResource(null);
      resourceForm.reset({ name: "", type: "Máquina" });
      setIsResourceDialogOpen(true);
  };

  const handleEditResourceClick = (resource: Resource) => {
      setSelectedResource(resource);
      resourceForm.reset(resource);
      setIsResourceDialogOpen(true);
  };

  const handleDeleteResourceClick = (resource: Resource) => {
      setResourceToDelete(resource);
      setIsDeleteResourceAlertOpen(true);
  };

  const handleConfirmDeleteResource = async () => {
    if (!resourceToDelete) return;
    const resourceDocRef = doc(db, "companies", "mecald", "settings", "resources");
    try {
        await updateDoc(resourceDocRef, { items: arrayRemove(resourceToDelete) });
        toast({ title: "Recurso removido!" });
        setIsDeleteResourceAlertOpen(false);
        setResourceToDelete(null);
        await fetchResources();
    } catch (error) {
        console.error("Error deleting resource:", error);
        toast({ variant: "destructive", title: "Erro ao remover recurso" });
    }
  };

  const handleExportPDF = async () => {
    toast({ title: "Gerando relatório PDF..." });
    try {
        const companyRef = doc(db, "companies", "mecald", "settings", "company");
        const docSnap = await getDoc(companyRef);
        const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};

        const docPdf = new jsPDF();
        const pageWidth = docPdf.internal.pageSize.width;
        let y = 15;

        docPdf.setFontSize(16).setFont(undefined, 'bold');
        docPdf.text(companyData.nomeFantasia || 'Relatório de Tarefas', pageWidth / 2, y, { align: 'center' });
        y += 8;
        docPdf.setFontSize(12).setFont(undefined, 'normal');
        docPdf.text(`Relatório de Tarefas - ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth / 2, y, { align: 'center' });
        y += 15;

        const tableHead = [['Pedido / OS', 'Cliente', 'Item / Etapa', 'Data Prevista', 'Responsável']];
        const addSection = (title: string, tasks: Task[], color: [number, number, number] | undefined = undefined) => {
            if (tasks.length > 0) {
                docPdf.setFontSize(12).setFont(undefined, 'bold').text(title, 15, y);
                y += 7;
                const body = tasks.map(task => [
                    `Nº ${task.quotationNumber}\nOS: ${task.internalOS}`,
                    task.customerName,
                    `${task.itemName}\n • ${task.stageName}\nQtd: ${task.itemQuantity} | Peso: ${task.itemWeight.toLocaleString('pt-BR')} kg`,
                    task.dueDate ? format(task.dueDate, 'dd/MM/yy') : (task.startDate ? `Início ${format(task.startDate, 'dd/MM/yy')}` : 'N/A'),
                    task.responsible
                ]);
                autoTable(docPdf, { startY: y, head: tableHead, body: body, headStyles: { fillColor: color } });
                y = (docPdf as any).lastAutoTable.finalY + 10;
            }
        };

        addSection("Tarefas Atrasadas", overdueTasks, [220, 53, 69]);
        addSection("Tarefas para Hoje", todaysTasks, [37, 99, 235]);
        addSection("Próximas Tarefas", futureTasks);
        
        docPdf.save(`Relatorio_Tarefas_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
        console.error("Error generating PDF:", error);
        toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    }
  };

  const renderTable = (tasks: Task[], emptyMessage: string) => {
    if (isLoading) {
        return <Skeleton className="h-48 w-full" />;
    }
    if (tasks.length === 0) {
        return <p className="text-center text-muted-foreground py-10">{emptyMessage}</p>;
    }
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[100px]">Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Item / Etapa de Fabricação</TableHead>
                    <TableHead className="w-[150px]">Data Prevista</TableHead>
                    <TableHead className="w-[150px]">Responsável</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {tasks.map((task, index) => (
                    <TableRow key={`${task.orderId}-${task.itemName}-${task.stageName}-${index}`} className={task.isOverdue ? "bg-destructive/10" : ""}>
                        <TableCell className="font-medium">Nº {task.quotationNumber}</TableCell>
                        <TableCell>{task.customerName}</TableCell>
                        <TableCell>
                            <div className="font-medium">{task.itemName}</div>
                            <div className="text-muted-foreground text-sm">&bull; {task.stageName}</div>
                            <div className="text-muted-foreground text-xs mt-1 flex gap-x-4 gap-y-1 flex-wrap">
                                <span>OS: <span className="font-semibold text-foreground/90">{task.internalOS}</span></span>
                                <span>Qtd: <span className="font-semibold text-foreground/90">{task.itemQuantity}</span></span>
                                <span>Peso: <span className="font-semibold text-foreground/90">{task.itemWeight.toLocaleString('pt-BR')} kg</span></span>
                            </div>
                        </TableCell>
                        <TableCell>
                          {task.dueDate ? format(task.dueDate, 'dd/MM/yyyy') : 
                           (task.startDate ? `Início ${format(task.startDate, 'dd/MM/yyyy')}`: 'A definir')}
                        </TableCell>
                        <TableCell>{task.responsible}</TableCell>
                        <TableCell>
                            <Badge variant={task.isOverdue ? "destructive" : "secondary"}>{task.status}</Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
  };
  
  const allocatedResources = Math.min(resources.length, Math.floor(resources.length * 0.8));
  const idleResources = resources.length - allocatedResources;

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Tarefas e Recursos</h1>
          <Button onClick={handleExportPDF} disabled={isLoading || (todaysTasks.length === 0 && overdueTasks.length === 0 && futureTasks.length === 0)}>
            <FileDown className="mr-2 h-4 w-4" />
            Exportar Relatório PDF
          </Button>
        </div>

        <Tabs defaultValue="today" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overdue">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Atrasadas ({overdueTasks.length})
              </TabsTrigger>
              <TabsTrigger value="today">
                  <CalendarCheck className="mr-2 h-4 w-4" />
                  Hoje ({todaysTasks.length})
              </TabsTrigger>
              <TabsTrigger value="future">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Futuras ({futureTasks.length})
              </TabsTrigger>
              <TabsTrigger value="resources">
                  <Cpu className="mr-2 h-4 w-4" />
                  Recursos ({resources.length})
              </TabsTrigger>
          </TabsList>
          
          <TabsContent value="today">
              <Card>
                  <CardHeader>
                      <CardTitle>Tarefas Agendadas para Hoje</CardTitle>
                      <CardDescription>Etapas de fabricação com data de início ou conclusão para o dia de hoje.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      {renderTable(todaysTasks, "Nenhuma tarefa agendada para hoje.")}
                  </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="overdue">
               <Card>
                  <CardHeader>
                      <CardTitle>Tarefas com Prazo Expirado</CardTitle>
                      <CardDescription>Etapas de fabricação que não foram concluídas na data prevista.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      {renderTable(overdueTasks, "Nenhuma tarefa atrasada. Bom trabalho!")}
                  </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="future">
               <Card>
                  <CardHeader>
                      <CardTitle>Próximas Tarefas</CardTitle>
                      <CardDescription>Visão das tarefas agendadas para os próximos dias para planejamento e antecipação.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      {renderTable(futureTasks, "Nenhuma tarefa futura agendada.")}
                  </CardContent>
              </Card>
          </TabsContent>

          <TabsContent value="resources" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                  <StatCard title="Total de Recursos" value={resources.length.toString()} icon={ListTree} description="Recursos totais cadastrados na empresa." />
                  <StatCard title="Recursos Alocados" value={allocatedResources.toString()} icon={CheckCircle} description="Simulação de recursos em uso atualmente." />
                  <StatCard title="Recursos Ociosos" value={idleResources.toString()} icon={Clock} description="Simulação de recursos disponíveis para alocação." />
              </div>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Gestão de Recursos</CardTitle>
                      <CardDescription>Cadastre as máquinas, equipes e ferramentas da sua operação.</CardDescription>
                    </div>
                    <Button onClick={handleAddResourceClick}>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Adicionar Recurso
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome do Recurso</TableHead>
                          <TableHead className="w-[180px]">Tipo</TableHead>
                          <TableHead className="w-[100px] text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center"><Skeleton className="h-10 w-full" /></TableCell>
                          </TableRow>
                        ) : resources.length > 0 ? (
                          resources.map((resource) => (
                            <TableRow key={resource.id}>
                              <TableCell className="font-medium">{resource.name}</TableCell>
                              <TableCell>{resource.type}</TableCell>
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
                            <TableCell colSpan={3} className="h-24 text-center">Nenhum recurso cadastrado.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
              </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isResourceDialogOpen} onOpenChange={setIsResourceDialogOpen}>
        <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedResource ? 'Editar Recurso' : 'Adicionar Novo Recurso'}</DialogTitle>
              <DialogDescription>
                {selectedResource ? 'Atualize os dados do recurso.' : 'Preencha os dados do novo recurso para cadastrá-lo.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...resourceForm}>
              <form onSubmit={resourceForm.handleSubmit(onResourceSubmit)} className="space-y-4 pt-4">
                <FormField control={resourceForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Recurso</FormLabel>
                    <FormControl><Input placeholder="Ex: Torno CNC, Equipe de Montagem" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={resourceForm.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Recurso</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione um tipo" /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="Máquina">Máquina</SelectItem>
                            <SelectItem value="Equipe">Equipe</SelectItem>
                            <SelectItem value="Ferramenta">Ferramenta</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsResourceDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit">{selectedResource ? 'Salvar Alterações' : 'Adicionar Recurso'}</Button>
                </DialogFooter>
              </form>
            </Form>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={isDeleteResourceAlertOpen} onOpenChange={setIsDeleteResourceAlertOpen}>
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
