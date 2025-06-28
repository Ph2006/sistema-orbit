
"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Edit, PackageSearch, FilePen } from "lucide-react";
import { cn } from "@/lib/utils";

const inspectionStatuses = ["Pendente", "Aprovado", "Aprovado com ressalvas", "Rejeitado"] as const;

const itemUpdateSchema = z.object({
  supplierName: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceItemValue: z.coerce.number().optional(),
  certificateNumber: z.string().optional(),
  storageLocation: z.string().optional(),
  deliveryReceiptDate: z.date().optional().nullable(),
  inspectionStatus: z.enum(inspectionStatuses).optional(),
});

type ItemUpdateData = z.infer<typeof itemUpdateSchema>;

const requisitionItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantityRequested: z.number(),
  status: z.string(),
  supplierName: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceItemValue: z.number().optional(),
  certificateNumber: z.string().optional(),
  storageLocation: z.string().optional(),
  deliveryReceiptDate: z.date().optional().nullable(),
  inspectionStatus: z.enum(inspectionStatuses).optional(),
});

type RequisitionItem = z.infer<typeof requisitionItemSchema>;

type Requisition = {
  id: string;
  requisitionNumber: string;
  date: Date;
  status: string;
  orderId?: string;
  items: RequisitionItem[];
};

type ItemForUpdate = RequisitionItem & { requisitionId: string };

export default function CostsPage() {
    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<ItemForUpdate | null>(null);
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();

    const form = useForm<ItemUpdateData>({
        resolver: zodResolver(itemUpdateSchema),
    });

    const fetchRequisitions = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const reqsSnapshot = await getDocs(collection(db, "companies", "mecald", "materialRequisitions"));
            const reqsList: Requisition[] = reqsSnapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    requisitionNumber: data.requisitionNumber || 'N/A',
                    date: data.date.toDate(),
                    status: data.status,
                    orderId: data.orderId,
                    items: (data.items || []).map((item: any, index: number): RequisitionItem => ({
                        id: item.id || `${d.id}-${index}`,
                        description: item.description,
                        quantityRequested: item.quantityRequested,
                        status: item.status || "Pendente",
                        supplierName: item.supplierName || "",
                        invoiceNumber: item.invoiceNumber || "",
                        invoiceItemValue: item.invoiceItemValue || undefined,
                        certificateNumber: item.certificateNumber || "",
                        storageLocation: item.storageLocation || "",
                        deliveryReceiptDate: item.deliveryReceiptDate?.toDate() || null,
                        inspectionStatus: item.inspectionStatus || "Pendente",
                    })),
                };
            });
            setRequisitions(reqsList.sort((a, b) => b.date.getTime() - a.date.getTime()));
        } catch (error) {
            console.error("Error fetching requisitions:", error);
            toast({ variant: "destructive", title: "Erro ao buscar requisições" });
        } finally {
            setIsLoading(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (!authLoading && user) {
            fetchRequisitions();
        }
    }, [user, authLoading, fetchRequisitions]);

    const handleOpenForm = (item: RequisitionItem, requisitionId: string) => {
        setSelectedItem({ ...item, requisitionId });
        form.reset({
            supplierName: item.supplierName,
            invoiceNumber: item.invoiceNumber,
            invoiceItemValue: item.invoiceItemValue,
            certificateNumber: item.certificateNumber,
            storageLocation: item.storageLocation,
            deliveryReceiptDate: item.deliveryReceiptDate,
            inspectionStatus: item.inspectionStatus,
        });
        setIsFormOpen(true);
    };

    const onSubmit = async (values: ItemUpdateData) => {
        if (!selectedItem) return;

        try {
            const reqRef = doc(db, "companies", "mecald", "materialRequisitions", selectedItem.requisitionId);
            const reqSnap = await getDoc(reqRef);
            if (!reqSnap.exists()) {
                throw new Error("Requisição não encontrada.");
            }

            const reqData = reqSnap.data();
            const items = reqData.items || [];
            const itemIndex = items.findIndex((i: any) => i.id === selectedItem.id);

            if (itemIndex === -1) {
                throw new Error("Item não encontrado na requisição.");
            }

            const updatedItem = {
                ...items[itemIndex],
                ...values,
                deliveryReceiptDate: values.deliveryReceiptDate ? Timestamp.fromDate(values.deliveryReceiptDate) : null,
            };

            if (values.inspectionStatus === "Aprovado" || values.inspectionStatus === "Aprovado com ressalvas") {
                updatedItem.status = "Inspecionado e Aprovado";
            } else if (values.inspectionStatus === "Rejeitado") {
                updatedItem.status = "Inspecionado e Rejeitado";
            } else if (values.deliveryReceiptDate) {
                updatedItem.status = "Recebido (Aguardando Inspeção)";
            }

            const updatedItems = [...items];
            updatedItems[itemIndex] = updatedItem;

            await updateDoc(reqRef, { items: updatedItems });

            toast({ title: "Item atualizado com sucesso!" });
            setIsFormOpen(false);
            await fetchRequisitions();
        } catch (error: any) {
            console.error("Error updating item:", error);
            toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message });
        }
    };

    const getStatusVariant = (status?: string) => {
        if (!status) return "outline";
        const lowerStatus = status.toLowerCase();
        if (lowerStatus.includes("aprovado")) return "default";
        if (lowerStatus.includes("rejeitado")) return "destructive";
        if (lowerStatus.includes("recebido")) return "secondary";
        return "outline";
    };

    return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-headline">Centro de Custos e Recebimento</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Recebimento de Materiais</CardTitle>
            <CardDescription>
              Gerencie o recebimento de materiais das requisições, atualize informações de nota fiscal e realize a inspeção de qualidade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
                <Skeleton className="h-64 w-full" />
            ) : requisitions.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                    {requisitions.map((req) => (
                        <AccordionItem value={req.id} key={req.id}>
                            <AccordionTrigger className="hover:bg-muted/50 px-4">
                                <div className="flex-1 text-left">
                                    <span className="font-bold text-primary">Requisição Nº {req.requisitionNumber}</span>
                                    <span className="text-muted-foreground text-sm ml-4">Data: {format(req.date, 'dd/MM/yyyy')}</span>
                                </div>
                                <Badge variant={getStatusVariant(req.status)}>{req.status}</Badge>
                            </AccordionTrigger>
                            <AccordionContent className="p-2">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Fornecedor</TableHead>
                                            <TableHead>Nota Fiscal</TableHead>
                                            <TableHead>Inspeção</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {req.items.map(item => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.description}</TableCell>
                                                <TableCell><Badge variant={getStatusVariant(item.status)}>{item.status}</Badge></TableCell>
                                                <TableCell>{item.supplierName || '-'}</TableCell>
                                                <TableCell>{item.invoiceNumber || '-'}</TableCell>
                                                <TableCell><Badge variant={getStatusVariant(item.inspectionStatus)}>{item.inspectionStatus}</Badge></TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => handleOpenForm(item, req.id)}>
                                                        <FilePen className="mr-2 h-4 w-4" />
                                                        Atualizar
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-64 border-dashed border-2 rounded-lg">
                    <PackageSearch className="h-12 w-12 mb-4" />
                    <h3 className="text-lg font-semibold">Nenhuma Requisição Encontrada</h3>
                    <p className="text-sm">Quando novas requisições de material forem criadas, elas aparecerão aqui.</p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle>Atualizar Item de Requisição</DialogTitle>
                <DialogDescription>
                    {selectedItem?.description}
                </DialogDescription>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="supplierName" render={({ field }) => (
                            <FormItem><FormLabel>Nome do Fornecedor</FormLabel><FormControl><Input placeholder="Fornecedor do material" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={form.control} name="deliveryReceiptDate" render={({ field }) => (
                            <FormItem className="flex flex-col"><FormLabel>Data de Entrega</FormLabel>
                                <Popover><PopoverTrigger asChild>
                                    <FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yyyy") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl>
                                </PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} /></PopoverContent></Popover>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                            <FormItem><FormLabel>Nota Fiscal</FormLabel><FormControl><Input placeholder="Nº da NF-e" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={form.control} name="invoiceItemValue" render={({ field }) => (
                            <FormItem><FormLabel>Valor do Item (R$)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={form.control} name="certificateNumber" render={({ field }) => (
                            <FormItem><FormLabel>Nº do Certificado</FormLabel><FormControl><Input placeholder="Certificado de qualidade/material" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                         <FormField control={form.control} name="storageLocation" render={({ field }) => (
                            <FormItem><FormLabel>Local de Armazenamento</FormLabel><FormControl><Input placeholder="Ex: Prateleira A-10" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                        )}/>
                    </div>

                    <FormField control={form.control} name="inspectionStatus" render={({ field }) => (
                        <FormItem><FormLabel>Status da Inspeção</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}><FormControl>
                                <SelectTrigger><SelectValue placeholder="Selecione o status da inspeção" /></SelectTrigger>
                            </FormControl><SelectContent>
                                {inspectionStatuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                            </SelectContent></Select><FormMessage />
                        </FormItem>
                    )}/>
                    
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting ? "Salvando..." : "Salvar Atualizações"}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
        </DialogContent>
      </Dialog>
    </>
    );
}
