
"use client";

import { useState, useEffect } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
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
import { Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";


type OrderItem = {
    id?: string;
    code?: string;
    description: string;
    quantity: number;
    unitPrice: number;
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
    totalValue: number;
    status: string;
    createdAt: Timestamp;
};

const getStatusProps = (status: string): { variant: "default" | "secondary" | "destructive" | "outline", icon: React.ElementType, label: string, colorClass: string } => {
    const lowerStatus = status.toLowerCase();
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
    return { variant: "outline", icon: Package, label: status, colorClass: "" };
};

function OrdersTable({ orders, onOrderClick }: { orders: Order[]; onOrderClick: (order: Order) => void; }) {
    if (orders.length === 0) {
        return (
             <Table>
                <TableBody>
                    <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
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
                    <TableHead className="w-[180px] text-right">Valor Total</TableHead>
                    <TableHead className="w-[200px]">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {orders.map((order) => {
                    const statusProps = getStatusProps(order.status || '');
                    return (
                        <TableRow key={order.id} onClick={() => onOrderClick(order)} className="cursor-pointer">
                            <TableCell className="font-medium">{order.quotationNumber || 'N/A'}</TableCell>
                            <TableCell>{order.customer?.name || 'N/A'}</TableCell>
                            <TableCell>{order.createdAt ? format(order.createdAt.toDate(), "dd/MM/yyyy") : 'N/A'}</TableCell>
                            <TableCell className="text-right">
                                {(order.totalValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
            const querySnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
            const ordersList = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data
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
                                                    const statusProps = getStatusProps(selectedOrder.status || '');
                                                    return (
                                                        <Badge variant={statusProps.variant} className={statusProps.colorClass}>
                                                             <statusProps.icon className="mr-2 h-4 w-4" />
                                                             {statusProps.label}
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-muted-foreground">Data do Pedido</span>
                                                <span>{selectedOrder.createdAt ? format(selectedOrder.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'N/A'}</span>
                                            </div>
                                             <div className="flex justify-between items-center">
                                                <span className="font-medium text-muted-foreground">Orçamento de Origem</span>
                                                <span>Nº {selectedOrder.quotationNumber}</span>
                                            </div>
                                            <div className="flex justify-between items-center font-bold text-lg">
                                                <span className="font-medium text-muted-foreground">Valor Total</span>
                                                <span className="text-primary">{(selectedOrder.totalValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
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
                                                        <TableHead className="text-right w-[120px]">Valor Unit.</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {(selectedOrder.items || []).map((item, index) => (
                                                        <TableRow key={item.id || index}>
                                                            <TableCell className="font-medium">
                                                                {item.description}
                                                                {item.code && <span className="block text-xs text-muted-foreground">Cód: {item.code}</span>}
                                                            </TableCell>
                                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                                            <TableCell className="text-right">{(item.unitPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                        </TableRow>
                                                    ))}
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
