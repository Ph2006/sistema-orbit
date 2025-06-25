
"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle, Weight, CalendarDays, Edit } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const orderItemSchema = z.object({
    id: z.string().optional(),
    code: z.string().optional(),
    product_code: z.string().optional(),
    description: z.string().min(1, "A descrição é obrigatória."),
    quantity: z.coerce.number().min(0, "A quantidade não pode ser negativa."),
    unitWeight: z.coerce.number().min(0, "O peso não pode ser negativo.").optional(),
});

const orderSchema = z.object({
  id: z.string(),
  internalOS: z.string().optional(),
  items: z.array(orderItemSchema),
});

type OrderItem = z.infer<typeof orderItemSchema>;

type Order = {
    id: string;
    quotationId: string;
    quotationNumber: number;
    internalOS?: string;
    customer: {
        id: string;
        name: string;
    };
    items: OrderItem[];
    totalValue: number;
    totalWeight: number;
    status: string;
    createdAt: Date;
    deliveryDate?: Date;
};

const calculateTotalWeight = (items: OrderItem[]): number => {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((acc, item) => {
        const quantity = Number(item.quantity) || 0;
        const unitWeight = Number(item.unitWeight) || 0;
        return acc + (quantity * unitWeight);
    }, 0);
};

const getStatusProps = (status: string): { variant: "default" | "secondary" | "destructive" | "outline", icon: React.ElementType, label: string, colorClass: string } => {
    const lowerStatus = status ? status.toLowerCase() : '';
    if (lowerStatus.includes("produção") && !lowerStatus.includes("aguardando")) {
        return { variant: "default", icon: PlayCircle, label: "Em Produção", colorClass: "" };
    }
    if (lowerStatus.includes("aguardando")) {
        return { variant: "secondary", icon: Hourglass, label: "Aguardando Produção", colorClass: "" };
    }
    if (lowerStatus.includes("concluído")) {
        return { variant: "default", icon: CheckCircle, label: "Concluído", colorClass: "bg-green-600 hover:bg-green-600/90" };
    }
    if (lowerStatus.includes("cancelado")) {
        return { variant: "destructive", icon: XCircle, label: "Cancelado", colorClass: "" };
    }
    return { variant: "outline", icon: Package, label: status || "Não definido", colorClass: "" };
};

function OrdersTable({ orders, onOrderClick }: { orders: Order[]; onOrderClick: (order: Order) => void; }) {
    if (orders.length === 0) {
        return (
             <Table>
                <TableBody>
                    <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">Nenhum pedido encontrado.</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        );
    }
    
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[120px]">Nº Pedido</TableHead>
                    <TableHead className="w-[150px]">OS Interna</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="w-[120px]">Data Criação</TableHead>
                    <TableHead className="w-[120px]">Data Entrega</TableHead>
                    <TableHead className="w-[180px] text-right">Peso Total</TableHead>
                    <TableHead className="w-[200px]">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {orders.map((order) => {
                    const statusProps = getStatusProps(order.status);
                    return (
                        <TableRow key={order.id} onClick={() => onOrderClick(order)} className="cursor-pointer">
                            <TableCell className="font-medium">{order.quotationNumber || 'N/A'}</TableCell>
                            <TableCell className="font-medium">{order.internalOS || 'N/A'}</TableCell>
                            <TableCell>{order.customer?.name || 'Cliente não informado'}</TableCell>
                            <TableCell>{order.createdAt ? format(order.createdAt, "dd/MM/yyyy") : 'N/A'}</TableCell>
                            <TableCell>{order.deliveryDate ? format(order.deliveryDate, "dd/MM/yyyy") : 'A definir'}</TableCell>
                            <TableCell className="text-right font-medium">
                                {(order.totalWeight || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                            </TableCell>
                            <TableCell>
                                <Badge variant={statusProps.variant} className={statusProps.colorClass}>
                                    <statusProps.icon className="mr-2 h-4 w-4" />
                                    {statusProps.label}
                                </Badge>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();

    const form = useForm<z.infer<typeof orderSchema>>({
        resolver: zodResolver(orderSchema),
    });

    const { fields } = useFieldArray({
        control: form.control,
        name: "items"
    });

    const fetchOrders = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const productsSnapshot = await getDocs(collection(db, "companies", "mecald", "products"));
            const productsMap = new Map<string, { unitWeight: number }>();
            productsSnapshot.forEach(doc => {
                const productCode = (doc.id || '').trim().toUpperCase();
                if (productCode) {
                    productsMap.set(productCode, { unitWeight: doc.data().unitWeight || 0 });
                }
            });

            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
            const ordersList = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date());
                const deliveryDate = data.deliveryDate?.toDate ? data.deliveryDate.toDate() : undefined;
                
                const enrichedItems = (data.items || []).map((item: any, index: number) => {
                    const itemCode = item.code || item.product_code || '';
                    const enrichedItem = { 
                        ...item, 
                        id: item.id || `${doc.id}-${index}`,
                        code: itemCode,
                    };
                    delete enrichedItem.product_code;

                    enrichedItem.unitWeight = Number(enrichedItem.unitWeight) || 0;

                    if (enrichedItem.unitWeight === 0) {
                        const productCodeToSearch = (itemCode).trim().toUpperCase();
                        if (productCodeToSearch) {
                            const productData = productsMap.get(productCodeToSearch);
                            if (productData && productData.unitWeight) {
                                enrichedItem.unitWeight = Number(productData.unitWeight) || 0;
                            }
                        }
                    }
                    return enrichedItem;
                });
                
                let customerInfo = { id: '', name: 'Cliente não informado' };
                if (data.customer && typeof data.customer === 'object' && data.customer.name) {
                    customerInfo = { id: data.customer.id || '', name: data.customer.name };
                } else if (typeof data.customerName === 'string') {
                    customerInfo = { id: data.customerId || '', name: data.customerName };
                } else if (typeof data.customer === 'string') { 
                    customerInfo = { id: '', name: data.customer };
                }

                const orderNum = data.orderNumber || data.quotationNumber || 0;

                return {
                    id: doc.id,
                    quotationId: data.quotationId || '',
                    quotationNumber: orderNum,
                    internalOS: data.internalOS || '',
                    customer: customerInfo,
                    items: enrichedItems,
                    totalValue: data.totalValue || 0,
                    status: data.status || 'Status não definido',
                    createdAt: createdAtDate,
                    deliveryDate: deliveryDate,
                    totalWeight: calculateTotalWeight(enrichedItems),
                } as Order;
            }).sort((a, b) => (b.quotationNumber || 0) - (a.quotationNumber || 0));
            
            setOrders(ordersList);
        } catch (error) {
            console.error("Error fetching orders:", error);
            toast({
                variant: "destructive",
                title: "Erro ao buscar pedidos",
                description: "Ocorreu um erro ao carregar a lista de pedidos.",
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && user) {
            fetchOrders();
        }
    }, [user, authLoading]);

    const handleViewOrder = (order: Order) => {
        setSelectedOrder(order);
        form.reset(order);
        setIsEditing(false);
        setIsSheetOpen(true);
    };

    const onOrderSubmit = async (values: z.infer<typeof orderSchema>) => {
        if (!selectedOrder) return;
    
        try {
            const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
            
            const updatedItems = values.items.map(item => {
                const itemCode = item.code || item.product_code || '';
                const cleanItem = { ...item, code: itemCode };
                delete (cleanItem as any).product_code;
    
                return {
                    ...cleanItem,
                    unitWeight: Number(item.unitWeight) || 0,
                    quantity: Number(item.quantity) || 0,
                };
            });
    
            const totalWeight = calculateTotalWeight(updatedItems);
            
            const dataToSave = {
                items: updatedItems,
                totalWeight: totalWeight,
                internalOS: values.internalOS,
            };
    
            await updateDoc(orderRef, dataToSave);
    
            toast({
                title: "Pedido atualizado!",
                description: "Os dados do pedido foram salvos com sucesso.",
            });
    
            const updatedOrderInState = {
                ...selectedOrder,
                ...dataToSave,
            };
            setSelectedOrder(updatedOrderInState);
            form.reset(updatedOrderInState);
    
            setIsEditing(false);
            await fetchOrders();
        } catch (error) {
            console.error("Error updating order:", error);
            toast({
                variant: "destructive",
                title: "Erro ao salvar",
                description: "Não foi possível atualizar o pedido.",
            });
        }
    };

    const filteredOrders = useMemo(() => orders.filter(order => {
        const query = searchQuery.toLowerCase();
        const customerName = order.customer?.name?.toLowerCase() || '';
        const status = order.status?.toLowerCase() || '';
        const quotationNumber = order.quotationNumber?.toString() || '';
        const internalOS = order.internalOS?.toLowerCase() || '';

        return (
            quotationNumber.includes(query) ||
            customerName.includes(query) ||
            status.includes(query) ||
            internalOS.includes(query)
        );
    }), [orders, searchQuery]);
    
    const watchedItems = form.watch("items");
    const currentTotalWeight = useMemo(() => calculateTotalWeight(watchedItems || []), [watchedItems]);

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Pedidos de Produção</h1>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nº, OS, cliente ou status..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-80"
                        />
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Pedidos</CardTitle>
                        <CardDescription>Acompanhe todos os pedidos de produção aprovados.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
                            </div>
                        ) : (
                           <OrdersTable orders={filteredOrders} onOrderClick={handleViewOrder} />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Sheet open={isSheetOpen} onOpenChange={(open) => { setIsSheetOpen(open); if (!open) setIsEditing(false); }}>
                <SheetContent className="w-full sm:max-w-3xl">
                    {selectedOrder && (
                        <>
                            <SheetHeader>
                                <SheetTitle className="font-headline text-2xl">Pedido Nº {selectedOrder.quotationNumber}</SheetTitle>
                                <SheetDescription>
                                    Cliente: <span className="font-medium text-foreground">{selectedOrder.customer?.name || 'N/A'}</span>
                                </SheetDescription>
                            </SheetHeader>
                            
                            {isEditing ? (
                                // EDIT VIEW
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onOrderSubmit)} className="flex flex-col h-[calc(100%-4rem)]">
                                        <ScrollArea className="flex-1 pr-6 -mr-6 py-6">
                                            <div className="space-y-6">
                                                <Card className="p-4 bg-secondary/50">
                                                    <FormField control={form.control} name="internalOS" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>OS Interna</FormLabel>
                                                            <FormControl><Input placeholder="Ex: OS-2024-123" {...field} value={field.value ?? ''} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>
                                                </Card>
                                                <Card>
                                                    <CardHeader><CardTitle>Itens do Pedido (Editável)</CardTitle></CardHeader>
                                                    <CardContent className="space-y-4">
                                                        {fields.map((field, index) => (
                                                            <Card key={field.id} className="p-4 bg-secondary">
                                                                <div className="space-y-4">
                                                                    <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Descrição do Item {index + 1}</FormLabel>
                                                                            <FormControl><Textarea placeholder="Descrição completa do item" {...field} /></FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}/>
                                                                    <div className="grid grid-cols-3 gap-4">
                                                                         <FormField control={form.control} name={`items.${index}.code`} render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel>Código</FormLabel>
                                                                                <FormControl><Input placeholder="Cód. Produto" {...field} value={field.value || ''} /></FormControl>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )}/>
                                                                         <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel>Quantidade</FormLabel>
                                                                                <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )}/>
                                                                         <FormField control={form.control} name={`items.${index}.unitWeight`} render={({ field }) => (
                                                                            <FormItem>
                                                                                <FormLabel>Peso Unit. (kg)</FormLabel>
                                                                                <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                                                                                <FormMessage />
                                                                            </FormItem>
                                                                        )}/>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        ))}
                                                    </CardContent>
                                                </Card>
                                            </div>
                                        </ScrollArea>
                                        <SheetFooter className="py-4 border-t">
                                            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancelar</Button>
                                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                                {form.formState.isSubmitting ? "Salvando..." : "Salvar Alterações"}
                                            </Button>
                                        </SheetFooter>
                                    </form>
                                </Form>
                            ) : (
                                // READ-ONLY VIEW
                                <>
                                    <ScrollArea className="h-[calc(100vh-12rem)]">
                                        <div className="space-y-6 py-6 pr-6">
                                            <Card>
                                                <CardHeader><CardTitle>Detalhes do Pedido</CardTitle></CardHeader>
                                                <CardContent className="space-y-3 text-sm">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground">OS Interna</span>
                                                        <span className="font-semibold text-primary">{selectedOrder.internalOS || 'Não definida'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground">Status</span>
                                                        {(() => {
                                                            const statusProps = getStatusProps(selectedOrder.status);
                                                            return <Badge variant={statusProps.variant} className={statusProps.colorClass}><statusProps.icon className="mr-2 h-4 w-4" />{statusProps.label}</Badge>;
                                                        })()}
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground flex items-center"><CalendarDays className="mr-2 h-4 w-4" />Data do Pedido</span>
                                                        <span>{selectedOrder.createdAt ? format(selectedOrder.createdAt, 'dd/MM/yyyy') : 'N/A'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-muted-foreground flex items-center"><CalendarDays className="mr-2 h-4 w-4" />Data de Entrega</span>
                                                        <span>{selectedOrder.deliveryDate ? format(selectedOrder.deliveryDate, 'dd/MM/yyyy') : 'A definir'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center font-bold text-lg">
                                                        <span className="font-medium text-muted-foreground flex items-center"><Weight className="mr-2 h-5 w-5"/>Peso Total</span>
                                                        <span className="text-primary">{selectedOrder.totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader><CardTitle>Itens do Pedido</CardTitle></CardHeader>
                                                <CardContent>
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Descrição</TableHead>
                                                                <TableHead className="text-center w-[80px]">Qtd.</TableHead>
                                                                <TableHead className="text-right w-[120px]">Peso Unit.</TableHead>
                                                                <TableHead className="text-right w-[150px]">Peso Total</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {selectedOrder.items.map((item, index) => (
                                                                <TableRow key={index}>
                                                                    <TableCell className="font-medium">
                                                                        {item.description}
                                                                        {(item.code || item.product_code) && <span className="block text-xs text-muted-foreground">Cód: {item.code || item.product_code}</span>}
                                                                    </TableCell>
                                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                                    <TableCell className="text-right">{(Number(item.unitWeight) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</TableCell>
                                                                    <TableCell className="text-right font-semibold">{( (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0) ).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </ScrollArea>
                                    <SheetFooter className="pt-4 pr-6 border-t">
                                        <Button onClick={() => setIsEditing(true)}>
                                            <Edit className="mr-2 h-4 w-4" />
                                            Editar Pedido
                                        </Button>
                                    </SheetFooter>
                                </>
                            )}
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}
