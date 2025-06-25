
"use client";

import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle, Weight, CalendarDays } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";


type OrderItem = {
    id?: string;
    code?: string;
    description: string;
    quantity: number;
    unitPrice: number; // Kept for data model integrity
    unitWeight?: number;
    taxRate?: number;
    leadTimeDays?: number;
    notes?: string;
};

type Order = {
    id: string;
    quotationId: string;
    quotationNumber: number;
    customer: {
        id: string;
        name: string;
    };
    items: OrderItem[];
    totalValue: number; // Kept for data model integrity
    totalWeight: number; // New calculated field
    status: string;
    createdAt: Date;
    deliveryDate?: Date;
};

// Helper function to calculate total weight
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
                        <TableCell colSpan={6} className="h-24 text-center">
                            Nenhum pedido encontrado.
                        </TableCell>
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
    const [searchQuery, setSearchQuery] = useState("");
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();

    const fetchOrders = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            // Step 1: Fetch all products to create a weight reference map.
            const productsSnapshot = await getDocs(collection(db, "companies", "mecald", "products"));
            const productsMap = new Map<string, { unitWeight: number }>();
            productsSnapshot.forEach(doc => {
                // The document ID is the product code.
                productsMap.set(doc.id, { unitWeight: doc.data().unitWeight || 0 });
            });

            // Step 2: Fetch all orders.
            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
            const ordersList = querySnapshot.docs.map(doc => {
                const data = doc.data();
                
                const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date());
                const deliveryDate = data.deliveryDate?.toDate ? data.deliveryDate.toDate() : undefined;
                
                // Step 3: Enrich items with weight from the product catalog for consistency.
                const enrichedItems = (data.items || []).map((item: OrderItem) => {
                    const currentWeight = Number(item.unitWeight) || 0;
                    const hasCode = item.code && typeof item.code === 'string' && item.code.trim() !== '';

                    // If weight is zero and a valid code exists, look it up in the product catalog.
                    if (currentWeight === 0 && hasCode) {
                        const productCode = item.code.trim(); // Use trimmed code for lookup.
                        const productData = productsMap.get(productCode);
                        
                        if (productData) {
                            const catalogWeight = Number(productData.unitWeight) || 0;
                            if (catalogWeight > 0) {
                                // Return a new item object with the weight from the catalog.
                                return { ...item, unitWeight: catalogWeight };
                            }
                        }
                    }
                    
                    // If no enrichment happened, return the original item.
                    return item;
                });
                
                // Normalize customer data
                let customerInfo = { id: '', name: 'Cliente não informado' };
                if (data.customer && typeof data.customer === 'object' && data.customer.name) {
                    customerInfo = { id: data.customer.id || '', name: data.customer.name };
                } else if (typeof data.customerName === 'string') {
                    customerInfo = { id: data.customerId || '', name: data.customerName };
                } else if (typeof data.customer === 'string') { 
                    customerInfo = { id: '', name: data.customer };
                }

                // Normalize order number
                const orderNum = data.orderNumber || data.quotationNumber || 0;

                return {
                    id: doc.id,
                    quotationId: data.quotationId || '',
                    quotationNumber: orderNum,
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
        setIsSheetOpen(true);
    };

    const filteredOrders = orders.filter(order => {
        const query = searchQuery.toLowerCase();
        const customerName = order.customer?.name?.toLowerCase() || '';
        const status = order.status?.toLowerCase() || '';
        const quotationNumber = order.quotationNumber?.toString() || '';

        return (
            quotationNumber.includes(query) ||
            customerName.includes(query) ||
            status.includes(query)
        );
    });

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight font-headline">Pedidos de Produção</h1>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nº, cliente ou status..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-64"
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
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : (
                           <OrdersTable orders={filteredOrders} onOrderClick={handleViewOrder} />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent className="w-full sm:max-w-2xl">
                    {selectedOrder && (
                        <>
                            <SheetHeader className="mb-4">
                                <SheetTitle className="font-headline text-2xl">Pedido Nº {selectedOrder.quotationNumber}</SheetTitle>
                                <SheetDescription>
                                    Cliente: <span className="font-medium text-foreground">{selectedOrder.customer?.name || 'N/A'}</span>
                                </SheetDescription>
                            </SheetHeader>
                            <ScrollArea className="h-[calc(100vh-8rem)] pr-6">
                                <div className="space-y-6">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Detalhes do Pedido</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3 text-sm">
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-muted-foreground">Status</span>
                                                {(() => {
                                                    const statusProps = getStatusProps(selectedOrder.status);
                                                    return (
                                                        <Badge variant={statusProps.variant} className={statusProps.colorClass}>
                                                             <statusProps.icon className="mr-2 h-4 w-4" />
                                                             {statusProps.label}
                                                        </Badge>
                                                    );
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
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-muted-foreground">Orçamento de Origem</span>
                                                <span>Nº {selectedOrder.quotationNumber}</span>
                                            </div>
                                            <div className="flex justify-between items-center font-bold text-lg">
                                                <span className="font-medium text-muted-foreground flex items-center"><Weight className="mr-2 h-5 w-5"/>Peso Total</span>
                                                <span className="text-primary">{(selectedOrder.totalWeight || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Itens do Pedido</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Descrição</TableHead>
                                                        <TableHead className="text-center w-[80px]">Qtd.</TableHead>
                                                        <TableHead className="text-right w-[120px]">Peso Unit.</TableHead>
                                                        <TableHead className="text-right w-[120px]">Peso Total</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {(selectedOrder.items || []).map((item, index) => {
                                                        const itemTotalWeight = (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0);
                                                        return(
                                                            <TableRow key={item.id || index}>
                                                                <TableCell className="font-medium">
                                                                    {item.description}
                                                                    {item.code && <span className="block text-xs text-muted-foreground">Cód: {item.code}</span>}
                                                                </TableCell>
                                                                <TableCell className="text-center">{item.quantity}</TableCell>
                                                                <TableCell className="text-right">{(Number(item.unitWeight) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</TableCell>
                                                                <TableCell className="text-right font-medium">{itemTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</TableCell>
                                                            </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                </div>
                            </ScrollArea>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}
