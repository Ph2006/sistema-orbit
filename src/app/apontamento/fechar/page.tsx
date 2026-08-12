"use client";

import { useEffect, useMemo, useState } from "react";
import { arrayUnion, collection, doc, getDocs, query, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Appointment = { id: string; orderId: string; orderInternalOS: string; itemId: string; itemDescription: string; stageName: string; hourlyRate: number; status: "Aberto" | "Pausado"; operatorName: string; startedAt: any; lastResumedAt?: any; accumulatedSeconds: number };
const toMillis = (value: any) => value?.toDate ? value.toDate().getTime() : value ? new Date(value).getTime() : 0;
const activeSeconds = (appointment: Appointment, now = Date.now()) => appointment.status === "Aberto" ? Math.max(0, Math.floor((now - toMillis(appointment.lastResumedAt || appointment.startedAt)) / 1000)) : 0;
const duration = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export default function FecharApontamentoPage() {
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());

  const fetchOpen = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, "companies", "mecald", "productionAppointments"), where("status", "in", ["Aberto", "Pausado"])));
      setAppointments(snapshot.docs.map(appointmentDoc => ({ id: appointmentDoc.id, ...appointmentDoc.data() } as Appointment)));
    } catch (error) {
      console.error("Erro ao buscar apontamentos abertos:", error);
      toast({ variant: "destructive", title: "Erro ao buscar apontamentos" });
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchOpen(); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const selected = useMemo(() => appointments.find(appointment => appointment.id === selectedId), [appointments, selectedId]);
  const filteredAppointments = useMemo(() => {
    const search = orderSearch.trim().toLocaleLowerCase("pt-BR");
    if (!search) return appointments;
    return appointments.filter(appointment => appointment.orderInternalOS.toLocaleLowerCase("pt-BR").includes(search));
  }, [appointments, orderSearch]);
  const totalSeconds = selected ? (Number(selected.accumulatedSeconds) || 0) + activeSeconds(selected, now) : 0;

  const handlePause = async () => {
    if (!selected || selected.status !== "Aberto") return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "companies", "mecald", "productionAppointments", selected.id), { status: "Pausado", pausedAt: Timestamp.now(), accumulatedSeconds: totalSeconds });
      toast({ title: "Apontamento pausado", description: `Tempo acumulado: ${duration(totalSeconds)}` }); await fetchOpen();
    } finally { setSaving(false); }
  };
  const handleResume = async () => {
    if (!selected || selected.status !== "Pausado") return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "companies", "mecald", "productionAppointments", selected.id), { status: "Aberto", lastResumedAt: Timestamp.now(), pausedAt: null });
      toast({ title: "Apontamento retomado" }); await fetchOpen();
    } finally { setSaving(false); }
  };
  const handleClose = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const seconds = (Number(selected.accumulatedSeconds) || 0) + activeSeconds(selected);
      const hours = seconds / 3600;
      const cost = Math.round(hours * (Number(selected.hourlyRate) || 0) * 100) / 100;
      const costEntry = { id: `apontamento-${selected.id}`, description: `Mão de obra - ${selected.stageName} (${selected.itemDescription})`, quantity: Number(hours.toFixed(4)), unitCost: Number(selected.hourlyRate) || 0, totalCost: cost, entryDate: Timestamp.now(), enteredBy: `Apontamento (${selected.operatorName})`, isFromAppointment: true, appointmentId: selected.id };
      // O fechamento e o lançamento do custo são atômicos: ou ambos gravam, ou nenhum grava.
      const batch = writeBatch(db);
      batch.update(doc(db, "companies", "mecald", "productionAppointments", selected.id), { status: "Concluído", closedAt: Timestamp.now(), accumulatedSeconds: seconds, totalHours: hours, totalCost: cost });
      batch.update(doc(db, "companies", "mecald", "orders", selected.orderId), { costEntries: arrayUnion(costEntry) });
      await batch.commit();
      toast({ title: "Apontamento encerrado", description: `${hours.toFixed(2)}h — ${cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` });
      setSelectedId(""); await fetchOpen();
    } catch (error) {
      console.error("Erro ao encerrar apontamento:", error); toast({ variant: "destructive", title: "Erro ao encerrar apontamento" });
    } finally { setSaving(false); }
  };

  return <main className="mx-auto max-w-md p-4 md:p-6"><Card><CardHeader><CardTitle>Pausar ou Encerrar</CardTitle><CardDescription>Escolha um apontamento ativo.</CardDescription></CardHeader><CardContent className="space-y-4">
    <div className="space-y-2"><Label>Buscar OS</Label><Input placeholder="Digite o número da OS" value={orderSearch} onChange={event => setOrderSearch(event.target.value)} /></div>
    <Select value={selectedId} onValueChange={setSelectedId} disabled={loading}><SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione OS, item e etapa"} /></SelectTrigger><SelectContent>{filteredAppointments.map(appointment => <SelectItem key={appointment.id} value={appointment.id}>OS {appointment.orderInternalOS} — {appointment.itemDescription} — {appointment.stageName}</SelectItem>)}</SelectContent></Select>
    {!loading && orderSearch && filteredAppointments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum apontamento ativo encontrado para a OS “{orderSearch}”.</p>}
    {selected && <div className="space-y-3 rounded-lg border p-4"><p className="font-medium">OS {selected.orderInternalOS} — {selected.stageName}</p><p className="text-sm text-muted-foreground">Operador: {selected.operatorName} · Status: {selected.status}</p><p className="text-center font-mono text-3xl font-bold">{duration(totalSeconds)}</p><div className="grid grid-cols-2 gap-2">{selected.status === "Aberto" ? <Button variant="outline" onClick={handlePause} disabled={saving}>Pausar</Button> : <Button variant="outline" onClick={handleResume} disabled={saving}>Retomar</Button>}<Button variant="destructive" onClick={handleClose} disabled={saving}>Encerrar</Button></div></div>}
    {!loading && !appointments.length && <p className="py-6 text-center text-muted-foreground">Nenhuma etapa em aberto.</p>}
  </CardContent></Card></main>;
}
