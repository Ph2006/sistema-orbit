"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, updateDoc, getDoc, Timestamp, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../layout";
import { format, isSameDay, addDays, isWeekend } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// UI COMPONENTS
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

// ICONS
import { 
  Search, Package, CheckCircle, XCircle, Hourglass, PlayCircle, Weight, 
  CalendarDays, Edit, X, CalendarIcon, Truck, AlertTriangle, FolderGit2, 
  FileText, File, ClipboardCheck, Palette, ListChecks, GanttChart, 
  Trash2, Copy, ClipboardPaste, ReceiptText, CalendarClock, ClipboardList, 
  PlusCircle, XCircle as XCircleIcon, ArrowDown, CalendarCheck 
} from "lucide-react";

// TYPES & SCHEMAS
export const productionStageSchema = z.object({
  stageName: z.string(),
  status: z.string(),
  startDate: z.date().nullable().optional(),
  completedDate: z.date().nullable().optional(),
  durationDays: z.coerce.number().min(0).optional(),
});

export const orderItemSchema = z.object({
  id: z.string().optional(),
  code: z.string().optional(),
  product_code: z.string().optional(),
  description: z.string().min(1, "A descrição é obrigatória."),
  quantity: z.coerce.number().min(0, "A quantidade não pode ser negativa."),
  unitWeight: z.coerce.number().min(0, "O peso não pode ser negativo.").optional(),
  productionPlan: z.array(productionStageSchema).optional(),
  itemDeliveryDate: z.date().nullable().optional(),
  shippingList: z.string().optional(),
  invoiceNumber: z.string().optional(),
  shippingDate: z.date().nullable().optional(),
});

export const orderStatusEnum = z.enum([
  "Aguardando Produção",
  "Em Produção", 
  "Pronto para Entrega",
  "Concluído",
  "Cancelado",
  "Atrasado",
]);

export const customerInfoSchema = z.object({
  id: z.string({ required_error: "Selecione um cliente." }),
  name: z.string(),
});

export const orderSchema = z.object({
  id: z.string(),
  customer: customerInfoSchema,
  quotationNumber: z.string().optional(),
  internalOS: z.string().optional(),
  projectName: z.string().optional(),
  status: orderStatusEnum,
  deliveryDate: z.date().nullable().optional(),
  items: z.array(orderItemSchema),
  driveLink: z.string().url({ message: "Por favor, insira uma URL válida." }).optional().or(z.literal('')),
  documents: z.object({
    drawings: z.boolean().default(false),
    inspectionTestPlan: z.boolean().default(false),
    paintPlan: z.boolean().default(false),
  }).optional(),
});

export type ProductionStage = z.infer<typeof productionStageSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type CustomerInfo = { id: string; name: string };

export type CompanyData = {
  nomeFantasia?: string;
  logo?: { preview?: string };
  endereco?: string;
  cnpj?: string;
  email?: string;
  celular?: string;
  website?: string;
};

export type Order = {
  id: string;
  quotationId: string;
  quotationNumber: string;
  internalOS?: string;
  projectName?: string;
  customer: CustomerInfo;
  items: OrderItem[];
  totalValue: number;
  totalWeight: number;
  status: string;
  createdAt: Date;
  deliveryDate?: Date;
  driveLink?: string;
  documents: {
    drawings: boolean;
    inspectionTestPlan: boolean;
    paintPlan: boolean;
  };
};

// CONSTANTS & UTILITIES
export const brazilianHolidays = [
  new Date(2024, 0, 1), // Confraternização Universal
  new Date(2024, 1, 13), // Carnaval
  new Date(2024, 2, 29), // Sexta-feira Santa
  new Date(2024, 3, 21), // Tiradentes
  new Date(2024, 4, 1), // Dia do Trabalho
  new Date(2024, 4, 30), // Corpus Christi
  new Date(2024, 8, 7), // Independência do Brasil
  new Date(2024, 9, 12), // Nossa Senhora Aparecida
  new Date(2024, 10, 2), // Finados
  new Date(2024, 10, 15), // Proclamação da República
  new Date(2024, 11, 25), // Natal
  new Date(2025, 0, 1), // Confraternização Universal
  new Date(2025, 2, 4), // Carnaval
  new Date(2025, 3, 18), // Sexta-feira Santa
  new Date(2025, 3, 21), // Tiradentes
  new Date(2025, 4, 1), // Dia do Trabalho
  new Date(2025, 5, 19), // Corpus Christi
  new Date(2025, 8, 7), // Independência do Brasil
  new Date(2025, 9, 12), // Nossa Senhora Aparecida
  new Date(2025, 10, 2), // Finados
  new Date(2025, 10, 15), // Proclamação da República
  new Date(2025, 11, 25), // Natal
];

export const isHoliday = (date: Date): boolean => {
  return brazilianHolidays.some(holiday => isSameDay(date, holiday));
};

export const isBusinessDay = (date: Date): boolean => {
  return !isWeekend(date) && !isHoliday(date);
};

export const addBusinessDaysDecimal = (startDate: Date, days: number): Date => {
  let currentDate = new Date(startDate);
  let daysAdded = 0;

  if (days === 0) {
    return currentDate;
  }

  if (days > 0) {
    while (daysAdded < days) {
      currentDate = addDays(currentDate, 1);
      if (isBusinessDay(currentDate)) {
        daysAdded++;
      }
    }
  } else {
    while (daysAdded > days) {
      currentDate = addDays(currentDate, -1);
      if (isBusinessDay(currentDate)) {
        daysAdded--;
      }
    }
  }
  return currentDate;
};

export const getNextBusinessDay = (date: Date): Date => {
  let nextDay = addDays(date, 1);
  while (!isBusinessDay(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
};

export const calculateTotalWeight = (items: OrderItem[]): number => {
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity) || 0;
    const unitWeight = Number(item.unitWeight) || 0;
    return total + (quantity * unitWeight);
  }, 0);
};

// CUSTOM HOOKS
const useOrders = (user: any, authLoading: boolean) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const { toast } = useToast();

  const fetchOrders = React.useCallback(async () => {
    setLoadingOrders(true);
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
      const ordersData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          deliveryDate: data.deliveryDate?.toDate ? data.deliveryDate.toDate() : undefined,
          items: data.items.map((item: any) => ({
            ...item,
            itemDeliveryDate: item.itemDeliveryDate?.toDate ? item.itemDeliveryDate.toDate() : undefined,
            shippingDate: item.shippingDate?.toDate ? item.shippingDate.toDate() : undefined,
            productionPlan: (item.productionPlan || []).map((stage: any) => ({
              ...stage,
              startDate: stage.startDate?.toDate ? stage.startDate.toDate() : undefined,
              completedDate: stage.completedDate?.toDate ? stage.completedDate.toDate() : undefined,
            })),
          })),
        } as Order;
      });
      setOrders(ordersData);
      return ordersData;
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar pedidos",
        description: "Não foi possível carregar os pedidos do banco de dados.",
      });
      return [];
    } finally {
      setLoadingOrders(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchOrders();
    }
  }, [user, authLoading, fetchOrders]);

  const updateOrder = async (orderId: string, values: any) => {
    try {
      const orderRef = doc(db, "companies", "mecald", "orders", orderId);
      const itemsToSave = values.items.map((formItem: OrderItem) => {
        const originalItem = orders.find(o => o.id === orderId)?.items.find(i => i.id === formItem.id);
        const planToSave = originalItem?.productionPlan?.map(p => ({
          ...p,
          startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : p.startDate,
          completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : p.completedDate,
        })) || [];

        return {
          ...formItem,
          itemDeliveryDate: formItem.itemDeliveryDate ? Timestamp.fromDate(new Date(formItem.itemDeliveryDate)) : null,
          shippingDate: formItem.shippingDate ? Timestamp.fromDate(new Date(formItem.shippingDate)) : null,
          productionPlan: planToSave,
        };
      });

      const totalWeight = calculateTotalWeight(itemsToSave);
      
      const dataToSave = {
        customer: values.customer,
        customerId: values.customer.id,
        customerName: values.customer.name,
        internalOS: values.internalOS,
        projectName: values.projectName,
        quotationNumber: values.quotationNumber,
        deliveryDate: values.deliveryDate ? Timestamp.fromDate(new Date(values.deliveryDate)) : null,
        status: values.status,
        driveLink: values.driveLink,
        documents: values.documents,
        items: itemsToSave,
        totalWeight: totalWeight,
      };

      await updateDoc(orderRef, dataToSave);
      toast({ title: "Pedido atualizado!", description: "Os dados do pedido foram salvos com sucesso." });
      await fetchOrders();
      return true;
    } catch (error) {
      console.error("Error updating order:", error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível atualizar o pedido." });
      return false;
    }
  };

  const deleteOrder = async (orderId: string) => {
    try {
      await deleteDoc(doc(db, "companies", "mecald", "orders", orderId));
      toast({ title: "Pedido excluído!", description: "O pedido foi removido do sistema." });
      await fetchOrders();
      return true;
    } catch (error) {
      console.error("Error deleting order: ", error);
      toast({ variant: "destructive", title: "Erro ao excluir pedido", description: "Não foi possível remover o pedido. Tente novamente." });
      return false;
    }
  };

  return { orders, loadingOrders, fetchOrders, updateOrder, deleteOrder };
};

const useCustomers = (user: any, authLoading: boolean) => {
  const [customers, setCustomers] = useState<{id: string; name: string}[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const { toast } = useToast();

  const fetchCustomers = React.useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const querySnapshot = await getDocs(collection(db, "companies", "mecald", "customers"));
      const customersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
      }));
      setCustomers(customersData);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar clientes",
        description: "Não foi possível carregar a lista de clientes.",
      });
    } finally {
      setLoadingCustomers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchCustomers();
    }
  }, [user, authLoading, fetchCustomers]);

  return { customers, loadingCustomers, fetchCustomers };
};

const useProductionProgress = () => {
  const [itemToTrack, setItemToTrack] = useState<OrderItem | null>(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [editedPlan, setEditedPlan] = useState<ProductionStage[]>([]);
  const [isFetchingPlan, setIsFetchingPlan] = useState(false);
  const [newStageNameForPlan, setNewStageNameForPlan] = useState("");
  const [progressClipboard, setProgressClipboard] = useState<OrderItem | null>(null);

  const { toast } = useToast();

  const openProgressModal = React.useCallback(async (item: OrderItem) => {
    setItemToTrack(item);
    setIsProgressModalOpen(true);
    setEditedPlan([]);
    setIsFetchingPlan(true);

    try {
      let productTemplateMap = new Map<string, number>();
      if (item.code) {
        const productRef = doc(db, "companies", "mecald", "products", item.code);
        const productSnap = await getDoc(productRef);
        if (productSnap.exists()) {
          const template = productSnap.data().productionPlanTemplate || [];
          template.forEach((stage: any) => {
            productTemplateMap.set(stage.stageName, stage.durationDays || 0);
          });
        }
      }

      let finalPlan: ProductionStage[];

      if (item.productionPlan && item.productionPlan.length > 0) {
        finalPlan = item.productionPlan.map(stage => ({
          ...stage,
          startDate: stage.startDate ? new Date(stage.startDate) : null,
          completedDate: stage.completedDate ? new Date(stage.completedDate) : null,
          durationDays: stage.durationDays ?? productTemplateMap.get(stage.stageName) ?? 0,
        }));
      } else {
        finalPlan = Array.from(productTemplateMap.entries()).map(([stageName, durationDays]) => ({
          stageName,
          durationDays,
          status: "Pendente",
          startDate: null,
          completedDate: null,
        }));
      }
      setEditedPlan(finalPlan);

    } catch(error) {
      console.error("Error preparing production plan:", error);
      toast({ variant: "destructive", title: "Erro ao carregar plano", description: "Não foi possível carregar os dados do plano." });
      setEditedPlan([]);
    } finally {
      setIsFetchingPlan(false);
    }
  }, [toast]);

  const saveProgress = React.useCallback(async (selectedOrder: Order, item: OrderItem, currentEditedPlan: ProductionStage[], fetchOrders: () => Promise<Order[]>, setSelectedOrder: (order: Order) => void, formReset: (data: any) => void) => {
    if (!selectedOrder || !item) return;

    try {
      const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
      const currentOrderSnap = await getDoc(orderRef);
      if (!currentOrderSnap.exists()) {
        throw new Error("Pedido não encontrado no banco de dados.");
      }
      const currentOrderData = currentOrderSnap.data();

      const itemsForFirestore = currentOrderData.items.map((orderItem: any) => {
        let planForFirestore: any[];

        if (orderItem.id === item.id) {
          planForFirestore = currentEditedPlan.map(p => ({
            ...p,
            startDate: p.startDate ? Timestamp.fromDate(new Date(p.startDate)) : null,
            completedDate: p.completedDate ? Timestamp.fromDate(new Date(p.completedDate)) : null,
          }));
        } else {
          planForFirestore = (orderItem.productionPlan || []).map((p: any) => ({
            ...p,
            startDate: p.startDate && !(p.startDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.startDate)) : p.startDate,
            completedDate: p.completedDate && !(p.completedDate instanceof Timestamp) ? Timestamp.fromDate(new Date(p.completedDate)) : p.completedDate,
          }));
        }
        const { id, product_code, ...restOfItem } = orderItem as any;
        return {...restOfItem, id: orderItem.id, productionPlan: planForFirestore };
      });

      await updateDoc(orderRef, { items: itemsForFirestore });

      const updatedItemsForCheck = itemsForFirestore.map((item: any) => ({
        ...item,
        productionPlan: (item.productionPlan || []).map((p: any) => ({
          ...p,
          startDate: p.startDate?.toDate ? p.startDate.toDate() : p.startDate,
          completedDate: p.completedDate?.toDate ? p.completedDate.toDate() : p.completedDate,
        }))
      }));
      
      const allItemsCompleted = updatedItemsForCheck.every(
        (item: any) => {
          if (item.productionPlan && item.productionPlan.length > 0) {
              return item.productionPlan.every((p: any) => p.status === 'Concluído');
          }
          return true;
        }
      );

      if (allItemsCompleted && selectedOrder.status !== 'Concluído') {
        await updateDoc(orderRef, { status: "Concluído" });
        toast({ 
          title: "Pedido Concluído!", 
          description: "Todos os itens foram finalizados e o status do pedido foi atualizado automaticamente." 
        });
      } else {
        toast({ title: "Progresso salvo!", description: "As etapas de produção foram atualizadas." });
      }
      
      setIsProgressModalOpen(false);
      setItemToTrack(null);

      const allOrders = await fetchOrders();
      const updatedOrderInList = allOrders.find(o => o.id === selectedOrder.id);
      if (updatedOrderInList) {
        setSelectedOrder(updatedOrderInList);
          formReset({
          ...updatedOrderInList,
          status: updatedOrderInList.status as any,
        });
      }

    } catch (error) {
      console.error("Error saving progress:", error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o progresso do item." });
    }
  }, [toast]);

  const handlePlanChange = React.useCallback((stageIndex: number, field: 'startDate' | 'completedDate' | 'durationDays', value: any) => {
    setEditedPlan(prevPlan => {
      let newPlan = JSON.parse(JSON.stringify(prevPlan));
      const currentStage = newPlan[stageIndex];

      if (field === 'startDate' || field === 'completedDate') {
        currentStage[field] = value ? new Date(value) : null;
      } else if (field === 'durationDays') {
        const numValue = value === '' ? undefined : Number(value);
        currentStage[field] = numValue;
      }

      if (field === 'startDate' && currentStage.startDate) {
        const duration = Number(currentStage.durationDays) || 1;
        if (duration < 1) {
          currentStage.completedDate = new Date(currentStage.startDate);
        } else if (duration === 1) {
          currentStage.completedDate = new Date(currentStage.startDate);
        } else {
          currentStage.completedDate = addBusinessDaysDecimal(currentStage.startDate, duration - 1);
        }
        for (let i = stageIndex + 1; i < newPlan.length; i++) {
          const stage = newPlan[i];
          const previousStage = newPlan[i - 1];
          if (previousStage.completedDate) {
            stage.startDate = getNextBusinessDay(previousStage.completedDate);
            const stageDuration = Number(stage.durationDays) || 1;
            if (stageDuration < 1) {
              stage.completedDate = new Date(stage.startDate);
            } else if (stageDuration === 1) {
              stage.completedDate = new Date(stage.startDate);
            } else {
              stage.completedDate = addBusinessDaysDecimal(stage.startDate, stageDuration - 1);
            }
          } else {
            stage.startDate = null;
            stage.completedDate = null;
          }
        }
      } else if (field === 'completedDate' && currentStage.completedDate) {
        const duration = Number(currentStage.durationDays) || 1;
        if (duration <= 1) {
          currentStage.startDate = new Date(currentStage.completedDate);
        } else {
          const daysToSubtract = duration - 1;
          currentStage.startDate = addBusinessDaysDecimal(currentStage.completedDate, -daysToSubtract);
        }
        for (let i = stageIndex + 1; i < newPlan.length; i++) {
          const stage = newPlan[i];
          const previousStage = newPlan[i - 1];
          if (previousStage.completedDate) {
            stage.startDate = getNextBusinessDay(previousStage.completedDate);
            const stageDuration = Number(stage.durationDays) || 1;
            if (stageDuration < 1) {
              stage.completedDate = new Date(stage.startDate);
            } else if (stageDuration === 1) {
              stage.completedDate = new Date(stage.startDate);
            } else {
              stage.completedDate = addBusinessDaysDecimal(stage.startDate, stageDuration - 1);
            }
          } else {
            stage.startDate = null;
            stage.completedDate = null;
          }
        }
      } else if (field === 'durationDays') {
        if (currentStage.startDate) {
          const duration = Number(currentStage.durationDays) || 1;
          if (duration < 1) {
            currentStage.completedDate = new Date(currentStage.startDate);
          } else if (duration === 1) {
            currentStage.completedDate = new Date(currentStage.startDate);
          } else {
            currentStage.completedDate = addBusinessDaysDecimal(currentStage.startDate, duration - 1);
          }
          for (let i = stageIndex + 1; i < newPlan.length; i++) {
            const stage = newPlan[i];
            const previousStage = newPlan[i - 1];
            if (previousStage.completedDate) {
              stage.startDate = getNextBusinessDay(previousStage.completedDate);
              const stageDuration = Number(stage.durationDays) || 1;
              if (stageDuration < 1) {
                stage.completedDate = new Date(stage.startDate);
              } else if (stageDuration === 1) {
                stage.completedDate = new Date(stage.startDate);
              } else {
                stage.completedDate = addBusinessDaysDecimal(stage.startDate, stageDuration - 1);
              }
            } else {
              stage.startDate = null;
              stage.completedDate = null;
            }
          }
        }
      }
      
      if (field === 'startDate' && !value) {
        for (let i = stageIndex; i < newPlan.length; i++) {
          newPlan[i].startDate = null;
          newPlan[i].completedDate = null;
        }
      }
      return newPlan;
    });
  }, []);

  const addStageToPlan = React.useCallback(() => {
    const trimmedName = newStageNameForPlan.trim();
    if (!trimmedName) {
      toast({
        variant: "destructive",
        title: "Nome da etapa inválido",
        description: "O nome da etapa não pode estar em branco.",
      });
      return;
    }
    const newStage: ProductionStage = {
      stageName: trimmedName,
      status: "Pendente",
      startDate: null,
      completedDate: null,
      durationDays: 0,
    };
    setEditedPlan(prev => [...prev, newStage]);
    setNewStageNameForPlan("");
  }, [newStageNameForPlan, toast]);

  const removeStageFromPlan = React.useCallback((indexToRemove: number) => {
    setEditedPlan(prev => prev.filter((_, index) => index !== indexToRemove));
  }, []);

  const copyProgress = React.useCallback((itemToCopy: OrderItem) => {
    setProgressClipboard(itemToCopy);
    toast({
      title: "Progresso copiado!",
      description: `Selecione 'Colar' no item de destino para aplicar as etapas de "${itemToCopy.description}".`,
    });
  }, [toast]);

  const cancelCopy = React.useCallback(() => {
    setProgressClipboard(null);
  }, []);

  const pasteProgress = React.useCallback(async (targetItem: OrderItem, selectedOrder: Order, fetchOrders: () => Promise<Order[]>, setSelectedOrder: (order: Order) => void, formReset: (data: any) => void) => {
    if (!progressClipboard || !selectedOrder) {
      toast({ variant: "destructive", title: "Erro", description: "Nenhum progresso na área de transferência." });
      return;
    }

    try {
      const sourceProductionPlan = progressClipboard.productionPlan || [];
      
      const updatedItems = selectedOrder.items.map(item => {
        if (item.id === targetItem.id) {
          const newPlan = JSON.parse(JSON.stringify(sourceProductionPlan));
          return { ...item, productionPlan: newPlan };
        }
        return item;
      });

      const itemsForFirestore = updatedItems.map(item => {
        const planForFirestore = (item.productionPlan || []).map(p => ({
          ...p,
          startDate: p.startDate ? Timestamp.fromDate(new Date(p.startDate)) : null,
          completedDate: p.completedDate ? Timestamp.fromDate(new Date(p.completedDate)) : null,
        }));
        
        return {
          ...item,
          productionPlan: planForFirestore,
          itemDeliveryDate: item.itemDeliveryDate ? Timestamp.fromDate(new Date(item.itemDeliveryDate)) : null,
          shippingDate: item.shippingDate ? Timestamp.fromDate(new Date(item.shippingDate)) : null,
        };
      });

      const orderRef = doc(db, "companies", "mecald", "orders", selectedOrder.id);
      await updateDoc(orderRef, { items: itemsForFirestore });

      toast({ title: "Progresso colado!", description: `Etapas aplicadas ao item "${targetItem.description}".` });
      
      const allOrders = await fetchOrders();
      const updatedOrder = allOrders.find(o => o.id === selectedOrder.id);
      if (updatedOrder) {
        setSelectedOrder(updatedOrder);
        formReset({
          ...updatedOrder,
          status: updatedOrder.status as any,
        });
      }

    } catch (error) {
      console.error("Error pasting progress:", error);
      toast({ variant: "destructive", title: "Erro ao colar", description: "Não foi possível colar o progresso." });
    }
  }, [progressClipboard, toast]);

  return {
    itemToTrack,
    isProgressModalOpen,
    editedPlan,
    isFetchingPlan,
    newStageNameForPlan,
    progressClipboard,
    setItemToTrack,
    setIsProgressModalOpen,
    setEditedPlan,
    setIsFetchingPlan,
    setNewStageNameForPlan,
    openProgressModal,
    saveProgress,
    handlePlanChange,
    addStageToPlan,
    removeStageFromPlan,
    copyProgress,
    cancelCopy,
    pasteProgress,
  };
};

const usePdfGenerator = () => {
  const { toast } = useToast();

  const generatePackingSlip = React.useCallback(async (selectedOrder: Order, selectedItems: Set<string>) => {
    if (!selectedOrder || selectedItems.size === 0) return;

    toast({ title: "Gerando Romaneio...", description: "Por favor, aguarde." });

    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
      
      const itemsToInclude = selectedOrder.items.filter(item => selectedItems.has(item.id!));
      const totalWeightOfSelection = calculateTotalWeight(itemsToInclude);
      
      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.width;
      const pageHeight = docPdf.internal.pageSize.height;
      let yPos = 15;

      if (companyData.logo?.preview) {
        try {
          docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
        } catch (e) {
          console.error("Error adding logo to PDF:", e);
        }
      }

      let textX = 65;
      let textY = yPos;
      docPdf.setFontSize(18).setFont(undefined, 'bold');
      docPdf.text(companyData.nomeFantasia || 'Sua Empresa', textX, textY, { align: 'left' });
      textY += 6;
      
      docPdf.setFontSize(9).setFont(undefined, 'normal');
      if (companyData.endereco) {
        const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - textX - 15);
        docPdf.text(addressLines, textX, textY);
        textY += (addressLines.length * 4);
      }
      if (companyData.cnpj) {
        docPdf.text(`CNPJ: ${companyData.cnpj}`, textX, textY);
      }
      
      yPos = 55;
      docPdf.setFontSize(14).setFont(undefined, 'bold');
      docPdf.text('ROMANEIO DE ENTREGA', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      docPdf.setFontSize(11).setFont(undefined, 'normal');
      docPdf.text(`Cliente: ${selectedOrder.customer.name}`, 15, yPos);
      docPdf.text(`Data de Emissão: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
      yPos += 7;
      
      docPdf.text(`Pedido Nº: ${selectedOrder.quotationNumber}`, 15, yPos);
      if (selectedOrder.deliveryDate) {
        docPdf.text(`Data de Entrega: ${format(selectedOrder.deliveryDate, "dd/MM/yyyy")}`, pageWidth - 15, yPos, { align: 'right' });
      }
      yPos += 7;

      docPdf.text(`OS Interna: ${selectedOrder.internalOS || 'N/A'}`, 15, yPos);
      yPos += 12;

      const tableBody = itemsToInclude.map(item => {
        const itemTotalWeight = (Number(item.quantity) || 0) * (Number(item.unitWeight) || 0);
        return [
          item.code || '-',
          item.description,
          item.quantity.toString(),
          (Number(item.unitWeight) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          itemTotalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        ];
      });
      
      autoTable(docPdf, {
        startY: yPos,
        head: [['Cód.', 'Descrição', 'Qtd.', 'Peso Unit. (kg)', 'Peso Total (kg)']],
        body: tableBody,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235], fontSize: 9, textColor: 255, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 30, halign: 'center' },
          4: { cellWidth: 30, halign: 'center' },
        }
      });

      let finalY = (docPdf as any).lastAutoTable.finalY;
      const footerStartY = pageHeight - 35;

      if (finalY + 20 > footerStartY) {
        docPdf.addPage();
        finalY = 15;
      }

      docPdf.setFontSize(12).setFont(undefined, 'bold');
      docPdf.text(
        `Peso Total dos Itens: ${totalWeightOfSelection.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`, 
        pageWidth - 15, finalY + 15, { align: 'right' }
      );

      docPdf.setFontSize(10).setFont(undefined, 'normal');
      docPdf.text('Recebido por:', 15, footerStartY);
      docPdf.line(40, footerStartY, 120, footerStartY);
      docPdf.text('Data:', 15, footerStartY + 10);
      docPdf.line(28, footerStartY + 10, 85, footerStartY + 10);

      docPdf.save(`Romaneio_${selectedOrder.quotationNumber}.pdf`);
      
    } catch (error) {
      console.error("Error generating packing slip:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar romaneio",
        description: "Não foi possível gerar o arquivo PDF.",
      });
    }
  }, [toast]);

  const exportSchedule = React.useCallback(async (selectedOrder: Order) => {
    if (!selectedOrder) return;

    toast({ title: "Gerando Cronograma...", description: "Por favor, aguarde." });

    try {
      const companyRef = doc(db, "companies", "mecald", "settings", "company");
      const docSnap = await getDoc(companyRef);
      const companyData: CompanyData = docSnap.exists() ? docSnap.data() as CompanyData : {};
      
      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.width;
      let yPos = 15;

      if (companyData.logo?.preview) {
        try {
          docPdf.addImage(companyData.logo.preview, 'PNG', 15, yPos, 40, 20, undefined, 'FAST');
        } catch (e) {
          console.error("Error adding logo to PDF:", e);
        }
      }

      let companyInfoX = 65;
      let companyInfoY = yPos + 5;
      docPdf.setFontSize(16).setFont(undefined, 'bold');
      docPdf.text(companyData.nomeFantasia || 'Sua Empresa', companyInfoX, companyInfoY);
      companyInfoY += 6;
      
      docPdf.setFontSize(8).setFont(undefined, 'normal');
      if (companyData.endereco) {
        const addressLines = docPdf.splitTextToSize(companyData.endereco, pageWidth - companyInfoX - 15);
        docPdf.text(addressLines, companyInfoX, companyInfoY);
        companyInfoY += (addressLines.length * 3);
      }
      if (companyData.cnpj) {
        docPdf.text(`CNPJ: ${companyData.cnpj}`, companyInfoX, companyInfoY);
        companyInfoY += 4;
      }
      if (companyData.email) {
        docPdf.text(`Email: ${companyData.email}`, companyInfoX, companyInfoY);
        companyInfoY += 4;
      }
      if (companyData.celular) {
        docPdf.text(`Telefone: ${companyData.celular}`, companyInfoX, companyInfoY);
      }

      yPos = 45;

      docPdf.setFontSize(16).setFont(undefined, 'bold');
      docPdf.text('CRONOGRAMA DE PRODUÇÃO', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      docPdf.setFontSize(10).setFont(undefined, 'normal');
      
      const leftColumnX = 15;
      let leftColumnY = yPos;
      docPdf.setFont(undefined, 'bold');
      docPdf.text('DADOS DO PEDIDO:', leftColumnX, leftColumnY);
      leftColumnY += 6;
      docPdf.setFont(undefined, 'normal');
      docPdf.text(`Pedido Nº: ${selectedOrder.quotationNumber}`, leftColumnX, leftColumnY);
      leftColumnY += 5;
      docPdf.text(`Cliente: ${selectedOrder.customer.name}`, leftColumnX, leftColumnY);
      leftColumnY += 5;
      if (selectedOrder.projectName) {
        docPdf.text(`Projeto: ${selectedOrder.projectName}`, leftColumnX, leftColumnY);
        leftColumnY += 5;
      }
      
      const rightColumnX = pageWidth / 2 + 10;
      let rightColumnY = yPos + 6;
      if (selectedOrder.internalOS) {
        docPdf.text(`OS Interna: ${selectedOrder.internalOS}`, rightColumnX, rightColumnY);
        rightColumnY += 5;
      }
      if (selectedOrder.deliveryDate) {
        docPdf.text(`Data de Entrega Final: ${format(selectedOrder.deliveryDate, "dd/MM/yyyy")}`, rightColumnX, rightColumnY);
      }
      yPos = Math.max(leftColumnY, rightColumnY) + 10;

      for (const item of selectedOrder.items) {
        if (item.productionPlan && item.productionPlan.length > 0) {
          docPdf.setFontSize(11).setFont(undefined, 'bold');
          docPdf.text(`Item: ${item.description} (Cód: ${item.code || '-'})`, 15, yPos);
          yPos += 8;

          const itemTableBody = item.productionPlan.map(stage => [
            stage.stageName,
            stage.status,
            stage.startDate ? format(new Date(stage.startDate), 'dd/MM/yyyy') : '-',
            stage.completedDate ? format(new Date(stage.completedDate), 'dd/MM/yyyy') : '-',
            stage.durationDays ? `${stage.durationDays}` : '-',
          ]);

          autoTable(docPdf, {
            startY: yPos,
            head: [['Etapa', 'Status', 'Início Previsto', 'Conclusão Prevista', 'Duração (dias úteis)']],
            body: itemTableBody,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [6, 78, 59], fontSize: 9, textColor: 255, halign: 'center' },
            columnStyles: {
              0: { cellWidth: 'auto' },
              1: { cellWidth: 25, halign: 'center' },
              2: { cellWidth: 30, halign: 'center' },
              3: { cellWidth: 30, halign: 'center' },
              4: { cellWidth: 35, halign: 'center' },
            },
            margin: { bottom: 10 }
          });
          yPos = (docPdf as any).lastAutoTable.finalY + 10;

          if (yPos > docPdf.internal.pageSize.height - 30) {
            docPdf.addPage();
            yPos = 15;
          }
        }
      }

      docPdf.save(`Cronograma_${selectedOrder.quotationNumber}.pdf`);

    } catch (error) {
      console.error("Error generating schedule:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar cronograma",
        description: "Não foi possível gerar o arquivo PDF do cronograma.",
      });
    }
  }, [toast]);

  return { generatePackingSlip, exportSchedule };
};

// MAIN COMPONENT
const OrdersPage = () => {
  const { user, authLoading } = useAuth();
  const { toast } = useToast();

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Estados para filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Custom Hooks
  const { orders, loadingOrders, fetchOrders, updateOrder, deleteOrder } = useOrders(user, authLoading);
  const { customers, loadingCustomers } = useCustomers(user, authLoading);
  const {
    itemToTrack,
    isProgressModalOpen,
    editedPlan,
    isFetchingPlan,
    newStageNameForPlan,
    progressClipboard,
    setItemToTrack,
    setIsProgressModalOpen,
    setEditedPlan,
    setNewStageNameForPlan,
    openProgressModal,
    saveProgress,
    handlePlanChange,
    addStageToPlan,
    removeStageFromPlan,
    copyProgress,
    cancelCopy,
    pasteProgress,
  } = useProductionProgress();
  const { generatePackingSlip, exportSchedule } = usePdfGenerator();

  const form = useForm<z.infer<typeof orderSchema>>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      id: "",
      customer: { id: "", name: "" },
      quotationNumber: "",
      internalOS: "",
      projectName: "",
      status: "Aguardando Produção",
      deliveryDate: undefined,
      items: [],
      driveLink: "",
      documents: { drawings: false, inspectionTestPlan: false, paintPlan: false },
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useEffect(() => {
    if (selectedOrder) {
      form.reset({
        ...selectedOrder,
        status: selectedOrder.status as any,
        documents: selectedOrder.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
        items: selectedOrder.items.map(item => ({
          ...item,
          itemDeliveryDate: item.itemDeliveryDate ? new Date(item.itemDeliveryDate) : undefined,
          shippingDate: item.shippingDate ? new Date(item.shippingDate) : undefined,
          productionPlan: (item.productionPlan || []).map(p => ({
            ...p,
            startDate: p.startDate ? new Date(p.startDate) : undefined,
            completedDate: p.completedDate ? new Date(p.completedDate) : undefined,
          }))
        })),
      });
    }
  }, [selectedOrder, form]);

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsEditing(false);
    setSelectedItems(new Set());
    setIsSheetOpen(true);
  };

  const onOrderSubmit = async (values: z.infer<typeof orderSchema>) => {
    if (!selectedOrder) return;
    const success = await updateOrder(selectedOrder.id, values);
    if (success) {
      const updatedOrderForState: Order = {
        ...selectedOrder,
        quotationNumber: values.quotationNumber!,
        deliveryDate: values.deliveryDate ? new Date(values.deliveryDate) : undefined,
        customer: values.customer,
        projectName: values.projectName,
        internalOS: values.internalOS,
        status: values.status,
        driveLink: values.driveLink,
        documents: values.documents || { drawings: false, inspectionTestPlan: false, paintPlan: false },
        items: values.items.map(item => ({
          ...item,
          itemDeliveryDate: item.itemDeliveryDate ? new Date(item.itemDeliveryDate) : undefined,
          shippingDate: item.shippingDate ? new Date(item.shippingDate) : undefined,
          productionPlan: (item.productionPlan || []).map(p => ({
            ...p,
            startDate: p.startDate ? new Date(p.startDate) : undefined,
            completedDate: p.completedDate ? new Date(p.completedDate) : undefined,
          })) as any
        })),
        totalWeight: calculateTotalWeight(values.items),
      };
      setSelectedOrder(updatedOrderForState);
      form.reset({
        ...updatedOrderForState,
        status: updatedOrderForState.status as any,
      });
      setIsEditing(false);
    }
  };

  const handleDeleteClick = (order: Order) => {
    setOrderToDelete(order);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    const success = await deleteOrder(orderToDelete.id);
    if (success) {
      setOrderToDelete(null);
      setIsDeleteDialogOpen(false);
      setIsSheetOpen(false);
    }
  };

  const handleSaveProgress = async () => {
    if (!selectedOrder || !itemToTrack) return;
    await saveProgress(selectedOrder, itemToTrack, editedPlan, fetchOrders, setSelectedOrder, form.reset);
  };

  const handlePasteProgress = async (targetItem: OrderItem) => {
    if (!selectedOrder) return;
    await pasteProgress(targetItem, selectedOrder, fetchOrders, setSelectedOrder, form.reset);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCustomerFilter("all");
    setDateFilter(undefined);
  };

  const handleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true && selectedOrder) {
      const allItemIds = new Set(selectedOrder.items.map(item => item.id!));
      setSelectedItems(allItemIds);
    } else {
      setSelectedItems(new Set());
    }
  };

  const filteredOrders = useMemo(() => {
    let currentOrders = orders;

    if (searchQuery) {
      currentOrders = currentOrders.filter(order =>
        order.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.internalOS?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.projectName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.items.some(item => item.description.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (statusFilter !== "all") {
      currentOrders = currentOrders.filter(order => order.status === statusFilter);
    }

    if (customerFilter !== "all") {
      currentOrders = currentOrders.filter(order => order.customer.id === customerFilter);
    }

    if (dateFilter) {
      currentOrders = currentOrders.filter(order =>
        order.deliveryDate && isSameDay(order.deliveryDate, dateFilter)
      );
    }

    return currentOrders;
  }, [orders, searchQuery, statusFilter, customerFilter, dateFilter]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Aguardando Produção": return <Hourglass className="h-4 w-4 text-gray-500" />;
      case "Em Produção": return <PlayCircle className="h-4 w-4 text-blue-500" />;
      case "Pronto para Entrega": return <Package className="h-4 w-4 text-green-500" />;
      case "Concluído": return <CheckCircle className="h-4 w-4 text-teal-500" />;
      case "Cancelado": return <XCircle className="h-4 w-4 text-red-500" />;
      case "Atrasado": return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default: return <Search className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Aguardando Produção": return "outline";
      case "Em Produção": return "default";
      case "Pronto para Entrega": return "secondary";
      case "Concluído": return "secondary";
      case "Cancelado": return "destructive";
      case "Atrasado": return "destructive";
      default: return "outline";
    }
  };

  const totalOrders = orders.length;
  const ordersInProgress = orders.filter(o => o.status === "Em Produção").length;
  const ordersCompleted = orders.filter(o => o.status === "Concluído").length;
  const totalWeightAllOrders = calculateTotalWeight(orders.flatMap(order => order.items));

  if (authLoading || loadingOrders || loadingCustomers) {
    return (
      <div className="flex flex-col space-y-3 p-8">
        <Skeleton className="h-[125px] w-full rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Pedidos</h2>
        <div className="flex items-center space-x-2">
        </div>
      </div>
      <Separator />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Pedidos"
          value={totalOrders.toString()}
          description="Pedidos registrados"
          icon={<ListChecks className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          title="Em Produção"
          value={ordersInProgress.toString()}
          description="Pedidos com status 'Em Produção'"
          icon={<GanttChart className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          title="Concluídos"
          value={ordersCompleted.toString()}
          description="Pedidos finalizados"
          icon={<ClipboardCheck className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          title="Peso Total Estimado"
          value={`${totalWeightAllOrders.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`}
          description="Soma do peso de todos os itens"
          icon={<Weight className="h-5 w-5 text-muted-foreground" />}
        />
      </div>
      <Separator />

      {/* Filter and Search Section */}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <Input
          placeholder="Pesquisar por Nº Pedido, Cliente, OS Interna ou Projeto..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            {Object.values(orderStatusEnum.enum).map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Clientes</SelectItem>
            {customers.map(customer => (
              <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-[280px] justify-start text-left font-normal",
                !dateFilter && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFilter ? format(dateFilter, "PPP") : <span>Filtrar por Data de Entrega</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={dateFilter}
              onSelect={setDateFilter}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {(searchQuery || statusFilter !== "all" || customerFilter !== "all" || dateFilter) && (
          <Button variant="ghost" onClick={clearFilters}>
            Limpar Filtros
          </Button>
        )}
      </div>
      <Separator />

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Pedidos</CardTitle>
          <CardDescription>Visualizar e gerenciar seus pedidos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-350px)] max-h-[700px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Nº Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>OS Interna</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Entrega</TableHead>
                  <TableHead>Peso Total</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.quotationNumber}</TableCell>
                      <TableCell>{order.customer.name}</TableCell>
                      <TableCell>{order.internalOS || 'N/A'}</TableCell>
                      <TableCell>{order.projectName || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(order.status)} className="flex items-center gap-1 w-fit">
                          {getStatusIcon(order.status)}
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.deliveryDate ? format(order.deliveryDate, 'dd/MM/yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>{order.totalWeight.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleViewOrder(order)}>
                          <Search className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum pedido encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Order Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl lg:max-w-4xl flex flex-col">
          <SheetHeader>
            <SheetTitle>{isEditing ? "Editar Pedido" : "Detalhes do Pedido"}</SheetTitle>
            <SheetDescription>
              {isEditing ? "Edite as informações do pedido." : "Visualize as informações detalhadas do pedido."}
            </SheetDescription>
          </SheetHeader>
          {selectedOrder && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onOrderSubmit)} className="space-y-6 flex-grow overflow-y-auto pr-4">
                <Card className="p-4 space-y-4">
                  <CardHeader>
                    <CardTitle>Informações Gerais</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="customer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              const selectedCustomer = customers.find(c => c.id === value);
                              field.onChange(selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name } : null);
                            }}
                            value={field.value?.id || ""}
                            disabled={!isEditing}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um cliente" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {customers.map((customer) => (
                                <SelectItem key={customer.id} value={customer.id}>
                                  {customer.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="quotationNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número da Cotação/Pedido</FormLabel>
                          <FormControl>
                            <Input placeholder="Número do Pedido" {...field} disabled={!isEditing} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="internalOS"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>OS Interna</FormLabel>
                          <FormControl>
                            <Input placeholder="OS Interna" {...field} disabled={!isEditing} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="projectName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do Projeto</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome do Projeto" {...field} disabled={!isEditing} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={!isEditing}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione o status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.values(orderStatusEnum.enum).map(status => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="deliveryDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Data de Entrega</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  disabled={!isEditing}
                                >
                                  {field.value ? (
                                    format(field.value, "dd/MM/yyyy")
                                  ) : (
                                    <span>Selecione uma data</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value || undefined}
                                onSelect={field.onChange}
                                disabled={!isEditing}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="driveLink"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Link do Drive (Documentos)</FormLabel>
                          <FormControl>
                            <Input placeholder="URL do Google Drive ou similar" {...field} disabled={!isEditing} />
                          </FormControl>
                          <FormDescription>
                            Link para a pasta de documentos do projeto (desenhos, ITPs, etc.).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Document Checkboxes */}
                <Card className="p-4">
                  <CardHeader>
                    <CardTitle>Documentos Requeridos</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="documents.drawings"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isEditing}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Desenhos</FormLabel>
                            <FormDescription>Desenhos técnicos aprovados.</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="documents.inspectionTestPlan"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isEditing}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Plano de Inspeção e Teste (PIT)</FormLabel>
                            <FormDescription>Documento de controle de qualidade.</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="documents.paintPlan"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!isEditing}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Plano de Pintura</FormLabel>
                            <FormDescription>Especificações de pintura.</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Order Items Section */}
                <Card className="p-4 space-y-4">
                  <CardHeader>
                    <CardTitle>Itens do Pedido</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {fields.map((item, index) => (
                      <Card key={item.id} className="p-4 bg-muted/50">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold">Item #{index + 1}</h4>
                          {isEditing && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => remove(index)}
                            >
                              Remover Item
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name={`items.${index}.code`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Código</FormLabel>
                                <FormControl>
                                  <Input placeholder="Código do produto" {...field} disabled={!isEditing} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.description`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Descrição</FormLabel>
                                <FormControl>
                                  <Input placeholder="Descrição do item" {...field} disabled={!isEditing} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Quantidade</FormLabel>
                                <FormControl>
                                  <Input type="number" placeholder="Quantidade" {...field} disabled={!isEditing} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.unitWeight`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Peso Unitário (kg)</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" placeholder="Peso por unidade" {...field} disabled={!isEditing} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.itemDeliveryDate`}
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>Data de Entrega do Item</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn(
                                          "w-full pl-3 text-left font-normal",
                                          !field.value && "text-muted-foreground"
                                        )}
                                        disabled={!isEditing}
                                      >
                                        {field.value ? (
                                          format(field.value, "dd/MM/yyyy")
                                        ) : (
                                          <span>Selecione uma data</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value || undefined}
                                      onSelect={field.onChange}
                                      disabled={!isEditing}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.shippingList`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Romaneio de Envio</FormLabel>
                                <FormControl>
                                  <Input placeholder="Romaneio de Envio" {...field} disabled={!isEditing} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.invoiceNumber`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Número da Nota Fiscal</FormLabel>
                                <FormControl>
                                  <Input placeholder="Número da NF" {...field} disabled={!isEditing} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${index}.shippingDate`}
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>Data de Envio</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn(
                                          "w-full pl-3 text-left font-normal",
                                          !field.value && "text-muted-foreground"
                                        )}
                                        disabled={!isEditing}
                                      >
                                        {field.value ? (
                                          format(field.value, "dd/MM/yyyy")
                                        ) : (
                                          <span>Selecione uma data</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value || undefined}
                                      onSelect={field.onChange}
                                      disabled={!isEditing}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        {!isEditing && (
                          <div className="flex gap-2 mt-4">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openProgressModal(selectedOrder.items[index])}
                            >
                              <CalendarClock className="mr-2 h-4 w-4" /> Acompanhar Progresso
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => copyProgress(selectedOrder.items[index])}
                            >
                              <Copy className="mr-2 h-4 w-4" /> Copiar Progresso
                            </Button>
                            {progressClipboard && progressClipboard.id !== selectedOrder.items[index].id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handlePasteProgress(selectedOrder.items[index])}
                              >
                                <ClipboardPaste className="mr-2 h-4 w-4" /> Colar Progresso
                              </Button>
                            )}
                            {progressClipboard && progressClipboard.id === selectedOrder.items[index].id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={cancelCopy}
                              >
                                <XCircleIcon className="mr-2 h-4 w-4" /> Cancelar Cópia
                              </Button>
                            )}
                          </div>
                        )}
                      </Card>
                    ))}
                    {isEditing && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => append({ id: `new-item-${Date.now()}`, description: "", quantity: 0, unitWeight: 0, productionPlan: [] })}
                        className="w-full"
                      >
                        <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Item
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <SheetFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                  {!isEditing ? (
                    <>
                      <Button variant="outline" onClick={() => setIsEditing(true)}>
                        <Edit className="mr-2 h-4 w-4" /> Editar
                      </Button>
                      <Button variant="destructive" onClick={() => handleDeleteClick(selectedOrder)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </Button>
                      <Button onClick={() => generatePackingSlip(selectedOrder, selectedItems)} disabled={selectedItems.size === 0}>
                        <Truck className="mr-2 h-4 w-4" /> Gerar Romaneio
                      </Button>
                      <Button onClick={() => exportSchedule(selectedOrder)}>
                        <CalendarCheck className="mr-2 h-4 w-4" /> Exportar Cronograma
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => { setIsEditing(false); form.reset(selectedOrder); }}>
                        Cancelar
                      </Button>
                      <Button type="submit">Salvar Alterações</Button>
                    </>
                  )}
                </SheetFooter>
              </form>
            </Form>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza que deseja excluir?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o pedido "{orderToDelete?.quotationNumber}"
              e removerá seus dados de nossos servidores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-500 hover:bg-red-600">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Production Progress Modal */}
      <Dialog open={isProgressModalOpen} onOpenChange={setIsProgressModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Acompanhamento de Progresso - {itemToTrack?.description}</DialogTitle>
            <DialogDescription>
              Monitore e atualize o status das etapas de produção para este item.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto pr-4">
            {isFetchingPlan ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : editedPlan.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma etapa de produção definida para este item. Adicione uma abaixo.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[150px]">Início Previsto</TableHead>
                    <TableHead className="w-[150px]">Conclusão Prevista</TableHead>
                    <TableHead className="w-[100px]">Duração (dias)</TableHead>
                    <TableHead className="w-[50px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedPlan.map((stage, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={stage.stageName}
                          onChange={(e) => {
                            const newPlan = [...editedPlan];
                            newPlan[index].stageName = e.target.value;
                            setEditedPlan(newPlan);
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={stage.status}
                          onValueChange={(value) => {
                            const newPlan = [...editedPlan];
                            newPlan[index].status = value;
                            if (value === 'Concluído' && !newPlan[index].completedDate) {
                               newPlan[index].completedDate = new Date();
                            } else if (value !== 'Concluído' && newPlan[index].completedDate) {
                               newPlan[index].completedDate = null;
                            }
                            if (value === 'Em Produção' && !newPlan[index].startDate) {
                               newPlan[index].startDate = new Date();
                            }
                            setEditedPlan(newPlan);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pendente">Pendente</SelectItem>
                            <SelectItem value="Em Produção">Em Produção</SelectItem>
                            <SelectItem value="Concluído">Concluído</SelectItem>
                            <SelectItem value="Atrasado">Atrasado</SelectItem>
                            <SelectItem value="Cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !stage.startDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {stage.startDate ? format(stage.startDate, "dd/MM/yyyy") : "Selecione"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={stage.startDate || undefined}
                              onSelect={(date) => handlePlanChange(index, 'startDate', date)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !stage.completedDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {stage.completedDate ? format(stage.completedDate, "dd/MM/yyyy") : "Selecione"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={stage.completedDate || undefined}
                              onSelect={(date) => handlePlanChange(index, 'completedDate', date)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={stage.durationDays ?? ''}
                          onChange={(e) => handlePlanChange(index, 'durationDays', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => removeStageFromPlan(index)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex items-center gap-2 mt-4">
              <Input
                placeholder="Nome da nova etapa"
                value={newStageNameForPlan}
                onChange={(e) => setNewStageNameForPlan(e.target.value)}
                className="flex-grow"
              />
              <Button onClick={addStageToPlan}>
                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Etapa
              </Button>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsProgressModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveProgress}>Salvar Progresso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
