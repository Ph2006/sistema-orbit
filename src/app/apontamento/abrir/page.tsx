"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, query, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
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
type ActiveAppointment = { id: string; orderId: string; orderInternalOS: string; itemId: string; itemDescription: string; stageName: string; hourlyRate: number; status: 'Aberto' | 'Pausado'; operatorName: string; startedAt: any; lastResumedAt?: any; accumulatedSeconds: number };

const asArray = (value: any): any[] => Array.isArray(value)
  ? value
  : value && typeof value === "object"
    ? Object.keys(value).sort((a, b) => Number(a) - Number(b)).map(key => value[key]).filter(Boolean)
    : [];

const normalizeStatus = (value: any) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizeStage = (value: any) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase('pt-BR');
const toMillis = (value: any) => value?.toDate ? value.toDate().getTime() : value ? new Date(value).getTime() : 0;
const currentSeconds = (appointment: ActiveAppointment) => appointment.status === 'Aberto'
  ? Math.max(0, Math.floor((Date.now() - toMillis(appointment.lastResumedAt || appointment.startedAt)) / 1000))
  : 0;
const formatDuration = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function AbrirApontamentoPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [availableStages, setAvailableStages] = useState<StageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [mode, setMode] = useState<'start' | 'manage'>('start');
  const [activeAppointments, setActiveAppointments] = useState<ActiveAppointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [savingAppointmentId, setSavingAppointmentId] = useState('');
  const [, setClockTick] = useState(0);

  useEffect(() => { const timer = window.setInterval(() => setClockTick(value => value + 1), 1000); return () => window.clearInterval(timer); }, []);

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
  const filteredOrders = useMemo(() => {
    const search = orderSearch.trim().toLocaleLowerCase("pt-BR");
    if (!search) return orders;
    return orders.filter(order =>
      order.internalOS.toLocaleLowerCase("pt-BR").includes(search) ||
      order.customerName.toLocaleLowerCase("pt-BR").includes(search)
    );
  }, [orders, orderSearch]);

  const fetchActiveAppointments = async (orderId: string) => {
    if (!orderId) return setActiveAppointments([]);
    setLoadingAppointments(true);
    try {
      const snapshot = await getDocs(query(collection(db, "companies", "mecald", "productionAppointments"), where("orderId", "==", orderId)));
      setActiveAppointments(snapshot.docs.map(appointmentDoc => ({ id: appointmentDoc.id, ...appointmentDoc.data() } as ActiveAppointment)).filter(appointment => ['Aberto', 'Pausado'].includes(appointment.status)));
    } catch (error) {
      console.error('Erro ao buscar apontamentos ativos:', error);
      toast({ variant: 'destructive', title: 'Erro ao buscar apontamentos da OS' });
    } finally { setLoadingAppointments(false); }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId); setSelectedItemId(""); setSelectedStage(""); setAvailableStages([]);
    if (mode === 'manage') fetchActiveAppointments(orderId);
  };

  const changeMode = (nextMode: 'start' | 'manage') => {
    setMode(nextMode); setSelectedOrderId(''); setSelectedItemId(''); setSelectedStage(''); setActiveAppointments([]);
  };

  const handleSelectItem = async (itemId: string) => {
    setSelectedItemId(itemId); setSelectedStage("");
    const item = selectedOrder?.items.find(candidate => candidate.id === itemId);
    if (!item) return setAvailableStages([]);

    let template: any[] = [];
    const costCenterRates = new Map<string, number>();
    try {
      const costCentersSnapshot = await getDocs(collection(db, "companies", "mecald", "productionCostCenters"));
      costCentersSnapshot.docs.forEach(costDoc => {
        const data = costDoc.data();
        costCenterRates.set(normalizeStage(data.sectorName), Number(data.hourlyRate) || 0);
      });
    } catch (error) {
      console.warn("Não foi possível carregar os centros de custo:", error);
    }
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
      const centerRate = costCenterRates.get(normalizeStage(stageName));
      return { stageName, hourlyRate: Number(centerRate ?? templateStage?.hourlyRate ?? stage?.hourlyRate) || 0 };
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
        toast({ variant: "destructive", title: "Já existe apontamento para esta etapa", description: "Use a opção Pausar ou encerrar nesta mesma tela." }); return;
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

  const pauseAppointment = async (appointment: ActiveAppointment) => {
    setSavingAppointmentId(appointment.id);
    try {
      const seconds = (Number(appointment.accumulatedSeconds) || 0) + currentSeconds(appointment);
      await updateDoc(doc(db, "companies", "mecald", "productionAppointments", appointment.id), { status: 'Pausado', pausedAt: Timestamp.now(), accumulatedSeconds: seconds });
      toast({ title: 'Apontamento pausado', description: `Tempo acumulado: ${formatDuration(seconds)}` });
      await fetchActiveAppointments(appointment.orderId);
    } catch (error) { console.error(error); toast({ variant: 'destructive', title: 'Erro ao pausar apontamento' }); }
    finally { setSavingAppointmentId(''); }
  };

  const resumeAppointment = async (appointment: ActiveAppointment) => {
    setSavingAppointmentId(appointment.id);
    try {
      await updateDoc(doc(db, "companies", "mecald", "productionAppointments", appointment.id), { status: 'Aberto', lastResumedAt: Timestamp.now(), pausedAt: null });
      toast({ title: 'Apontamento retomado' }); await fetchActiveAppointments(appointment.orderId);
    } catch (error) { console.error(error); toast({ variant: 'destructive', title: 'Erro ao retomar apontamento' }); }
    finally { setSavingAppointmentId(''); }
  };

  const closeAppointment = async (appointment: ActiveAppointment) => {
    setSavingAppointmentId(appointment.id);
    try {
      const seconds = (Number(appointment.accumulatedSeconds) || 0) + currentSeconds(appointment);
      const hours = seconds / 3600;
      const totalCost = Math.round(hours * (Number(appointment.hourlyRate) || 0) * 100) / 100;
      const costEntry = {
        id: `apontamento-${appointment.id}`,
        description: `Mão de obra - ${appointment.stageName} (${appointment.itemDescription})`,
        quantity: Number(hours.toFixed(4)), unitCost: Number(appointment.hourlyRate) || 0, totalCost,
        entryDate: Timestamp.now(), enteredBy: `Apontamento (${appointment.operatorName})`, isFromAppointment: true, appointmentId: appointment.id,
      };
      const batch = writeBatch(db);
      batch.update(doc(db, "companies", "mecald", "productionAppointments", appointment.id), { status: 'Concluído', closedAt: Timestamp.now(), accumulatedSeconds: seconds, totalHours: hours, totalCost });
      batch.update(doc(db, "companies", "mecald", "orders", appointment.orderId), { costEntries: arrayUnion(costEntry) });
      await batch.commit();
      toast({ title: 'Apontamento encerrado', description: `${hours.toFixed(2)}h — ${totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` });
      await fetchActiveAppointments(appointment.orderId);
    } catch (error) { console.error(error); toast({ variant: 'destructive', title: 'Erro ao encerrar apontamento' }); }
    finally { setSavingAppointmentId(''); }
  };

  return <main className="mx-auto max-w-2xl p-4 md:p-6">
    <Card><CardHeader><CardTitle>Apontamento de Produção</CardTitle><CardDescription>Inicie um processo ou gerencie um apontamento já aberto usando o mesmo QR Code.</CardDescription></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button variant={mode === 'start' ? 'default' : 'ghost'} onClick={() => changeMode('start')}>Iniciar novo</Button>
          <Button variant={mode === 'manage' ? 'default' : 'ghost'} onClick={() => changeMode('manage')}>Pausar ou encerrar</Button>
        </div>

        {mode === 'start' && <div className="space-y-2"><Label>Operador</Label><Input placeholder="Digite seu nome" value={operatorName} onChange={event => setOperatorName(event.target.value)} /></div>}
        <div className="space-y-2"><Label>Buscar OS</Label><Input placeholder="Digite o número da OS ou o cliente" value={orderSearch} onChange={event => setOrderSearch(event.target.value)} /></div>
        <Select value={selectedOrderId} onValueChange={handleSelectOrder} disabled={loadingOrders}><SelectTrigger><SelectValue placeholder={loadingOrders ? "Carregando OS..." : "Selecione a OS"} /></SelectTrigger><SelectContent>{filteredOrders.map(order => <SelectItem key={order.id} value={order.id}>OS {order.internalOS} — {order.customerName}</SelectItem>)}</SelectContent></Select>
        {!loadingOrders && orderSearch && filteredOrders.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma OS encontrada para “{orderSearch}”.</p>}

        {mode === 'start' && <>
          {selectedOrder && <Select value={selectedItemId} onValueChange={handleSelectItem}><SelectTrigger><SelectValue placeholder="Selecione o item" /></SelectTrigger><SelectContent>{selectedOrder.items.map(item => <SelectItem key={item.id} value={item.id}>{item.description}</SelectItem>)}</SelectContent></Select>}
          {selectedItemId && <Select value={selectedStage} onValueChange={setSelectedStage}><SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger><SelectContent>{availableStages.map(stage => <SelectItem key={stage.stageName} value={stage.stageName}>{stage.stageName}</SelectItem>)}</SelectContent></Select>}
          <Button className="w-full" size="lg" onClick={handleOpen} disabled={loading}>{loading ? "Iniciando..." : "Iniciar apontamento"}</Button>
        </>}

        {mode === 'manage' && selectedOrderId && <div className="space-y-3 border-t pt-4">
          <div><h2 className="font-semibold">Apontamentos ativos da OS {selectedOrder?.internalOS}</h2><p className="text-sm text-muted-foreground">Escolha exatamente qual etapa deseja pausar, retomar ou encerrar.</p></div>
          {loadingAppointments ? <p className="py-5 text-center text-muted-foreground">Buscando apontamentos...</p> : activeAppointments.length === 0 ? <p className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">Nenhum apontamento aberto ou pausado nesta OS.</p> : activeAppointments.map(appointment => {
            const seconds = (Number(appointment.accumulatedSeconds) || 0) + currentSeconds(appointment);
            return <div key={appointment.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{appointment.stageName}</p><p className="text-sm text-muted-foreground">{appointment.itemDescription}</p><p className="mt-1 text-xs text-muted-foreground">Operador: {appointment.operatorName}</p></div><span className={appointment.status === 'Aberto' ? 'rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700' : 'rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700'}>{appointment.status}</span></div>
              <div className="rounded-md bg-muted p-3 text-center"><p className="text-xs text-muted-foreground">Tempo acumulado</p><p className="font-mono text-2xl font-bold">{formatDuration(seconds)}</p></div>
              <div className="grid grid-cols-2 gap-2">{appointment.status === 'Aberto' ? <Button variant="outline" disabled={savingAppointmentId === appointment.id} onClick={() => pauseAppointment(appointment)}>Pausar</Button> : <Button variant="outline" disabled={savingAppointmentId === appointment.id} onClick={() => resumeAppointment(appointment)}>Retomar</Button>}<Button variant="destructive" disabled={savingAppointmentId === appointment.id} onClick={() => closeAppointment(appointment)}>Encerrar</Button></div>
            </div>;
          })}
        </div>}
      </CardContent></Card>
  </main>;
}
