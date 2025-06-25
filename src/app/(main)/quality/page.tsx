
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Pencil, Trash2, CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";

// Schemas
const nonConformanceSchema = z.object({
  id: z.string().optional(),
  date: z.date({ required_error: "A data é obrigatória." }),
  orderId: z.string({ required_error: "Selecione um pedido." }),
  item: z.object({
      id: z.string({ required_error: "Selecione um item." }),
      description: z.string(),
  }),
  description: z.string().min(10, "A descrição detalhada é obrigatória (mín. 10 caracteres)."),
  type: z.enum(["Interna", "Reclamação de Cliente"], { required_error: "Selecione o tipo de não conformidade." }),
  status: z.enum(["Aberta", "Em Análise", "Concluída"]),
});

type NonConformance = z.infer<typeof nonConformanceSchema> & { id: string, orderNumber: string, customerName: string };
type OrderInfo = { id: string, number: string, customerId: string, customerName: string, items: { id: string, description: string }[] };

// Main Component
export default function QualityPage() {
  const [reports, setReports] = useState<NonConformance[]>([]);
  const [orders, setOrders] = useState<OrderInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedReport, setSelectedReport] = useState<NonConformance | null>(null);
  const [reportToDelete, setReportToDelete] = useState<NonConformance | null>(null);

  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof nonConformanceSchema>>({
    resolver: zodResolver(nonConformanceSchema),
    defaultValues: {
      date: new Date(),
      status: "Aberta",
    },
  });

  const fetchAllData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const ordersList: OrderInfo[] = ordersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          number: data.quotationNumber || data.orderNumber || 'N/A',
          customerId: data.customer?.id || data.customerId || '',
          customerName: data.customer?.name || data.customerName || 'N/A',
          items: (data.items || []).map((item: any, index: number) => ({
            id: item.id || `${doc.id}-${index}`,
            description: item.description,
          })),
        };
      });
      setOrders(ordersList);

      const reportsSnapshot = await getDocs(collection(db, "companies", "mecald", "qualityReports"));
      const reportsList = reportsSnapshot.docs.map(doc => {
        const data = doc.data();
        const order = ordersList.find(o => o.id === data.orderId);
        return {
          id: doc.id,
          date: data.date.toDate(),
          orderId: data.orderId,
          orderNumber: order?.number || 'N/A',
          item: { id: data.itemId, description: data.itemDescription },
          customerName: order?.customerName || 'N/A',
          description: data.description,
          type: data.type,
          status: data.status,
        } as NonConformance;
      });
      setReports(reportsList.sort((a, b) => b.date.getTime() - a.date.getTime()));
    } catch (error) {
      console.error("Error fetching quality data:", error);
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: "Não foi possível carregar os relatórios de qualidade." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      fetchAllData();
    }
  }, [user, authLoading]);

  const onSubmit = async (values: z.infer<typeof nonConformanceSchema>) => {
    try {
      const order = orders.find(o => o.id === values.orderId);
      if (!order) {
        toast({ variant: "destructive", title: "Erro", description: "Pedido selecionado não encontrado." });
        return;
      }
      
      const dataToSave = {
        date: Timestamp.fromDate(values.date),
        orderId: values.orderId,
        itemId: values.item.id,
        itemDescription: values.item.description,
        customerId: order.customerId,
        customerName: order.customerName,
        description: values.description,
        type: values.type,
        status: values.status,
      };

      if (selectedReport) {
        await updateDoc(doc(db, "companies", "mecald", "qualityReports", selectedReport.id), dataToSave);
        toast({ title: "Relatório atualizado com sucesso!" });
      } else {
        await addDoc(collection(db, "companies", "mecald", "qualityReports"), dataToSave);
        toast({ title: "Relatório de não conformidade criado!" });
      }

      setIsFormOpen(false);
      await fetchAllData();
    } catch (error) {
      console.error("Error saving report:", error);
      toast({ variant: "destructive", title: "Erro ao salvar relatório" });
    }
  };

  const handleAddClick = () => {
    setSelectedReport(null);
    form.reset({ date: new Date(), status: "Aberta", type: "Interna" });
    setIsFormOpen(true);
  };

  const handleEditClick = (report: NonConformance) => {
    setSelectedReport(report);
    form.reset({
        ...report,
        item: { id: report.item.id, description: report.item.description }
    });
    setIsFormOpen(true);
  };
  
  const handleDeleteClick = (report: NonConformance) => {
    setReportToDelete(report);
    setIsDeleting(true);
  };

  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;
    try {
      await deleteDoc(doc(db, "companies", "mecald", "qualityReports", reportToDelete.id));
      toast({ title: "Relatório excluído!" });
      setIsDeleting(false);
      await fetchAllData();
    } catch (error) {
      toast({ variant: "destructive", title: "Erro ao excluir relatório" });
    }
  };

  const watchedOrderId = form.watch("orderId");
  const availableItems = useMemo(() => {
    if (!watchedOrderId) return [];
    return orders.find(o => o.id === watchedOrderId)?.items || [];
  }, [watchedOrderId, orders]);
  
  useEffect(() => {
      form.setValue('item', {id: '', description: ''});
  }, [watchedOrderId, form]);

  const getStatusVariant = (status: string) => {
      switch (status) {
          case 'Aberta': return 'destructive';
          case 'Em Análise': return 'secondary';
          case 'Concluída': return 'default';
          default: return 'outline';
      }
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Controle de Qualidade</h1>
          <Button onClick={handleAddClick}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Registrar Não Conformidade
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Relatórios de Não Conformidade (RNC)</CardTitle>
            <CardDescription>
              Gerencie todas as não conformidades internas e reclamações de clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
                <Skeleton className="h-64 w-full" />
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.length > 0 ? (
                  reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>{format(report.date, 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{report.orderNumber}</TableCell>
                      <TableCell>{report.customerName}</TableCell>
                      <TableCell>{report.item.description}</TableCell>
                      <TableCell>{report.type}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(report.status)}>{report.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(report)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteClick(report)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      Nenhum relatório de não conformidade encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>{selectedReport ? "Editar Relatório" : "Registrar Não Conformidade"}</DialogTitle>
                  <DialogDescription>Preencha os detalhes para registrar o ocorrido.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                        <FormField control={form.control} name="date" render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Data da Ocorrência</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                                {field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha uma data</span>}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="orderId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Pedido</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione um pedido" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {orders.map(o => <SelectItem key={o.id} value={o.id}>Nº {o.number} - {o.customerName}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                         <FormField control={form.control} name="item" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Item Afetado</FormLabel>
                                <Select onValueChange={value => {
                                    const selectedItem = availableItems.find(i => i.id === value);
                                    if (selectedItem) field.onChange(selectedItem);
                                }} value={field.value?.id || ""}>
                                    <FormControl><SelectTrigger disabled={!watchedOrderId}><SelectValue placeholder="Selecione um item do pedido" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {availableItems.map(i => <SelectItem key={i.id} value={i.id}>{i.description}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="type" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Não Conformidade</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Interna">Interna</SelectItem>
                                        <SelectItem value="Reclamação de Cliente">Reclamação de Cliente</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="description" render={({ field }) => (
                          <FormItem><FormLabel>Descrição da Ocorrência</FormLabel><FormControl><Textarea placeholder="Detalhe o que aconteceu, peças envolvidas, etc." {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                         <FormField control={form.control} name="status" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Status</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Aberta">Aberta</SelectItem>
                                        <SelectItem value="Em Análise">Em Análise</SelectItem>
                                        <SelectItem value="Concluída">Concluída</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}/>
                      <DialogFooter>
                          <Button type="submit">Salvar</Button>
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
                Esta ação não pode ser desfeita. Isso excluirá permanentemente o relatório de não conformidade.
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
