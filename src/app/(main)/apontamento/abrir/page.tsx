"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type StageOption = { stageName: string; hourlyRate: number };
type ItemOption = { id: string; code: string; description: string; productionPlan: any[] };
type OrderOption = { id: string; internalOS: string; customerName: string; items: ItemOption[] };

const asArray = (value: any): any[] => Array.isArray(value)
  ? value
  : value && typeof value === "object"
    ? Object.keys(value).sort((a, b) => Number(a) - Number(b)).map(key => value[key]).filter(Boolean)
    : [];

const normalizeStatus = (value: any) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function AbrirApontamentoPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [availableStages, setAvailableStages] = useState<StageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, "companies", "mecald", "orders"));
        const closed = new Set(["concluido", "completed", "finished", "cancelado", "cancelled", "canceled"]);
        const list = snapshot.docs.map(orderDoc => {
          const data = orderDoc.data();
          const customerName = typeof data.customer === "string" ? data.customer : data.customer?.name || data.customerName || "";
          return {
            id: orderDoc.id,
            internalOS: String(data.internalOS || data.quotationNumber || orderDoc.id),
            customerName,
            items: asArray(data.items).map((item, index) => ({
              id: String(item?.id || `${orderDoc.id}-item-${index}`),
              code: String(item?.code || item?.product_code || item?.productCode || ""),
              description: String(item?.description || `Item ${index + 1}`),
              productionPlan: asArray(item?.productionPlan),
            })),
            status: normalizeStatus(data.status),
          };
        }).filter(order => !closed.has(order.status) && order.internalOS);
        setOrders(list.sort((a, b) => a.internalOS.localeCompare(b.internalOS, "pt-BR", { numeric: true })));
      } catch (error) {
        console.error("Erro ao buscar OS para apontamento:", error);
        toast({ variant: "destructive", title: "Erro ao buscar Ordens de Serviço" });
      } finally {
        setLoadingOrders(false);
      }
    })();
  }, [toast]);

  const selectedOrder = useMemo(() => orders.find(order => order.id === selectedOrderId), [orders, selectedOrderId]);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId); setSelectedItemId(""); setSelectedStage(""); setAvailableStages([]);
  };

  const handleSelectItem = async (itemId: string) => {
    setSelectedItemId(itemId); setSelectedStage("");
    const item = selectedOrder?.items.find(candidate => candidate.id === itemId);
    if (!item) return setAvailableStages([]);

    let template: any[] = [];
    if (item.code) {
      try {
        const productSnapshot = await getDoc(doc(db, "companies", "mecald", "products", item.code));
        if (productSnapshot.exists()) template = asArray(productSnapshot.data().productionPlanTemplate);
      } catch (error) {
        console.warn("Não foi possível carregar o produto da etapa:", error);
      }
    }
    const source = item.productionPlan.length ? item.productionPlan : template;
    const stages = source.map(stage => {
      const stageName = typeof stage === "string" ? stage : String(stage?.stageName || stage?.name || "");
      const templateStage = template.find(candidate => String(candidate?.stageName || candidate?.name || "") === stageName);
      return { stageName, hourlyRate: Number(templateStage?.hourlyRate ?? stage?.hourlyRate) || 0 };
    }).filter(stage => stage.stageName);
    setAvailableStages([...new Map(stages.map(stage => [stage.stageName, stage])).values()]);
  };

  const handleOpen = async () => {
    if (!operatorName.trim() || !selectedOrderId || !selectedItemId || !selectedStage) {
      toast({ variant: "destructive", title: "Preencha todos os campos" }); return;
    }
    setLoading(true);
    try {
      // Consulta por um único campo para não exigir índice composto; etapa e status são validados no cliente.
      const existing = await getDocs(query(
        collection(db, "companies", "mecald", "productionAppointments"),
        where("itemId", "==", selectedItemId)
      ));
      const hasActiveAppointment = existing.docs.some(appointmentDoc => {
        const data = appointmentDoc.data();
        return data.stageName === selectedStage && ["Aberto", "Pausado"].includes(data.status);
      });
      if (hasActiveAppointment) {
        toast({ variant: "destructive", title: "Já existe apontamento para esta etapa", description: "Use o QR Code de fechamento para pausar, retomar ou encerrar." }); return;
      }
      const order = selectedOrder!;
      const item = order.items.find(candidate => candidate.id === selectedItemId)!;
      const stage = availableStages.find(candidate => candidate.stageName === selectedStage)!;
      await addDoc(collection(db, "companies", "mecald", "productionAppointments"), {
        orderId: order.id, orderInternalOS: order.internalOS, itemId: item.id, itemDescription: item.description,
        stageName: stage.stageName, hourlyRate: stage.hourlyRate, status: "Aberto", operatorName: operatorName.trim(),
        startedAt: Timestamp.now(), lastResumedAt: Timestamp.now(), pausedAt: null, accumulatedSeconds: 0,
      });
      toast({ title: "Apontamento iniciado", description: `${stage.stageName} — OS ${order.internalOS}` });
      setSelectedOrderId(""); setSelectedItemId(""); setSelectedStage(""); setOperatorName(""); setAvailableStages([]);
    } catch (error) {
      console.error("Erro ao abrir apontamento:", error);
      toast({ variant: "destructive", title: "Erro ao abrir apontamento" });
    } finally { setLoading(false); }
  };

  return <main className="mx-auto max-w-md p-4 md:p-6">
    <Card><CardHeader><CardTitle>Iniciar Apontamento</CardTitle><CardDescription>Selecione a OS, o item e a etapa de produção.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label>Operador</Label><Input placeholder="Seu nome" value={operatorName} onChange={event => setOperatorName(event.target.value)} /></div>
        <Select value={selectedOrderId} onValueChange={handleSelectOrder} disabled={loadingOrders}><SelectTrigger><SelectValue placeholder={loadingOrders ? "Carregando OS..." : "Selecione a OS"} /></SelectTrigger><SelectContent>{orders.map(order => <SelectItem key={order.id} value={order.id}>OS {order.internalOS} — {order.customerName}</SelectItem>)}</SelectContent></Select>
        {selectedOrder && <Select value={selectedItemId} onValueChange={handleSelectItem}><SelectTrigger><SelectValue placeholder="Selecione o item" /></SelectTrigger><SelectContent>{selectedOrder.items.map(item => <SelectItem key={item.id} value={item.id}>{item.description}</SelectItem>)}</SelectContent></Select>}
        {selectedItemId && <Select value={selectedStage} onValueChange={setSelectedStage}><SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger><SelectContent>{availableStages.map(stage => <SelectItem key={stage.stageName} value={stage.stageName}>{stage.stageName}</SelectItem>)}</SelectContent></Select>}
        <Button className="w-full" size="lg" onClick={handleOpen} disabled={loading}>{loading ? "Iniciando..." : "Iniciar Apontamento"}</Button>
      </CardContent></Card>
  </main>;
}
