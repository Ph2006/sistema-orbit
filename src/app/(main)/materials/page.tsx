
"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";

// Imports from shadcn/ui and lucide-react
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle, Trash2, FileSignature } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Schemas
const materialItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(3, "Descrição obrigatória."),
  quantity: z.coerce.number().min(0.1, "Qtd. deve ser maior que 0."),
  unit: z.string().min(1, "Unidade obrigatória (ex: m, kg, pç)."),
  notes: z.string().optional(),
});

const requisitionSchema = z.object({
  orderId: z.string(),
  materials: z.array(materialItemSchema),
  cuttingPlan: z.string().optional(),
});

type MaterialItem = z.infer<typeof materialItemSchema>;
type RequisitionData = z.infer<typeof requisitionSchema>;
type Order = {
  id: string;
  quotationNumber: string;
  customerName: string;
  status: string;
  deliveryDate?: Date;
  items: any[];
};

// Main Component
export default function MaterialsPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRequisitionOpen, setIsRequisitionOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const { user, loading: authLoading } = useAuth();
    const { toast } = useToast();

    const form = useForm<RequisitionData>({
        resolver: zodResolver(requisitionSchema),
        defaultValues: {
            orderId: "",
            materials: [],
            cuttingPlan: "",
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "materials"
    });

    const fetchOrders = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const ordersSnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
            
            const ordersList: Order[] = ordersSnapshot.docs
                .filter(doc => doc.data().status !== 'Concluído' && doc.data().status !== 'Cancelado')
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        quotationNumber: data.quotationNumber || 'N/A',
                        customerName: data.customer?.name || data.customerName || 'N/A',
                        status: data.status || 'N/A',
                        deliveryDate: data.deliveryDate?.toDate(),
                        items: data.items || [],
                    };
                })
                .sort((a, b) => {
                    const dateA = a.deliveryDate ? a.deliveryDate.getTime() : 0;
                    const dateB = b.deliveryDate ? b.deliveryDate.getTime() : 0;
                    return dateA - dateB;
                });
            
            setOrders(ordersList);

        } catch (error) {
            console.error("Error fetching orders:", error);
            toast({ variant: "destructive", title: "Erro ao carregar pedidos", description: "Não foi possível buscar os pedidos de produção." });
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        if (user && !authLoading) {
            fetchOrders();
        }
    }, [user, authLoading]);

    const handleManageRequisition = async (order: Order) => {
        setSelectedOrder(order);
        
        try {
            const requisitionRef = doc(db, "companies", "mecald", "materialRequisitions", order.id);
            const requisitionSnap = await getDoc(requisitionRef);

            if (requisitionSnap.exists()) {
                const data = requisitionSnap.data() as RequisitionData;
                form.reset(data);
            } else {
                const defaultMaterials = order.items.map((item, index) => ({
                    id: `${order.id}-mat-${index}`,
                    description: `Material para: ${item.description}`,
                    quantity: item.quantity,
                    unit: 'pç',
                    notes: `Ref. item cód: ${item.code || 'N/A'}`,
                }));
                form.reset({
                    orderId: order.id,
                    materials: defaultMaterials,
                    cuttingPlan: "Plano de corte a ser definido.",
                });
            }
            setIsRequisitionOpen(true);
        } catch (error) {
            console.error("Error handling requisition:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível abrir a requisição." });
        }
    };

    const onSubmit = async (values: RequisitionData) => {
        if (!selectedOrder) return;
        try {
            const requisitionRef = doc(db, "companies", "mecald", "materialRequisitions", selectedOrder.id);
            await setDoc(requisitionRef, { ...values, orderId: selectedOrder.id }, { merge: true });
            
            toast({ title: "Requisição salva!", description: `A requisição para o pedido ${selectedOrder.quotationNumber} foi salva com sucesso.` });
            setIsRequisitionOpen(false);
        } catch (error) {
            console.error("Error saving requisition:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar os dados da requisição." });
        }
    };

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Requisição de Materiais e Plano de Corte</h1>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Pedidos de Produção Ativos</CardTitle>
                        <CardDescription>
                            Gerencie a lista de materiais e o plano de corte para cada pedido de produção.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-64 w-full" />
                        ) : (
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nº Pedido</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Data de Entrega</TableHead>
                                        <TableHead>Status do Pedido</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length > 0 ? (
                                        orders.map(order => (
                                            <TableRow key={order.id}>
                                                <TableCell className="font-medium">{order.quotationNumber}</TableCell>
                                                <TableCell>{order.customerName}</TableCell>
                                                <TableCell>{order.deliveryDate ? format(order.deliveryDate, 'dd/MM/yyyy') : 'A definir'}</TableCell>
                                                <TableCell>
                                                    <span className="text-sm">{order.status}</span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button onClick={() => handleManageRequisition(order)}>
                                                        <FileSignature className="mr-2 h-4 w-4" />
                                                        Gerenciar Requisição
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">Nenhum pedido de produção ativo encontrado.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isRequisitionOpen} onOpenChange={setIsRequisitionOpen}>
                <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Requisição - Pedido Nº {selectedOrder?.quotationNumber}</DialogTitle>
                        <DialogDescription>Gerencie a lista de materiais e o plano de corte para este pedido.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col min-h-0">
                            <Tabs defaultValue="materials" className="flex-grow flex flex-col min-h-0">
                                <TabsList>
                                    <TabsTrigger value="materials">Lista de Materiais</TabsTrigger>
                                    <TabsTrigger value="cuttingPlan">Plano de Corte</TabsTrigger>
                                </TabsList>
                                <div className="flex-grow mt-4 overflow-hidden">
                                    <ScrollArea className="h-full pr-6">
                                        <TabsContent value="materials">
                                            <Card>
                                                <CardHeader>
                                                    <Button type="button" size="sm" variant="outline"
                                                        onClick={() => append({ description: "", quantity: 1, unit: "pç", notes: "" })}>
                                                        <PlusCircle className="mr-2 h-4 w-4" />
                                                        Adicionar Material
                                                    </Button>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                    {fields.map((field, index) => (
                                                        <Card key={field.id} className="p-4 bg-secondary/50 relative">
                                                            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive"
                                                                onClick={() => remove(index)}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                            <div className="space-y-4">
                                                                <FormField control={form.control} name={`materials.${index}.description`} render={({ field }) => (
                                                                    <FormItem><FormLabel>Descrição do Material</FormLabel><FormControl><Input placeholder="Ex: Chapa de Aço 1/4, Tubo 2 polegadas" {...field} /></FormControl><FormMessage /></FormItem>
                                                                )} />
                                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                                    <FormField control={form.control} name={`materials.${index}.quantity`} render={({ field }) => (
                                                                        <FormItem><FormLabel>Quantidade</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                    <FormField control={form.control} name={`materials.${index}.unit`} render={({ field }) => (
                                                                        <FormItem><FormLabel>Unidade</FormLabel><FormControl><Input placeholder="kg, m, pç" {...field} /></FormControl><FormMessage /></FormItem>
                                                                    )} />
                                                                </div>
                                                                <FormField control={form.control} name={`materials.${index}.notes`} render={({ field }) => (
                                                                    <FormItem><FormLabel>Observações</FormLabel><FormControl><Input placeholder="Detalhes adicionais (opcional)" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                                                                )} />
                                                            </div>
                                                        </Card>
                                                    ))}
                                                    {fields.length === 0 && <p className="text-center text-muted-foreground p-4">Nenhum material adicionado.</p>}
                                                </CardContent>
                                            </Card>
                                        </TabsContent>
                                        <TabsContent value="cuttingPlan">
                                            <Card>
                                                <CardHeader><CardTitle>Detalhes do Plano de Corte</CardTitle></CardHeader>
                                                <CardContent>
                                                    <FormField control={form.control} name="cuttingPlan" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Instruções e Detalhes</FormLabel>
                                                            <FormControl>
                                                                <Textarea placeholder="Descreva o aproveitamento de chapas, sobras, sequência de corte, etc." 
                                                                    className="min-h-[400px]" {...field} value={field.value ?? ''} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </CardContent>
                                            </Card>
                                        </TabsContent>
                                    </ScrollArea>
                                </div>
                            </Tabs>
                            <DialogFooter className="pt-6 border-t mt-4 flex-shrink-0">
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting ? "Salvando..." : "Salvar Requisição"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}
