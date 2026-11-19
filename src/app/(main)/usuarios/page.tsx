"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ALL_MODULE_IDS,
  BOOTSTRAP_MASTER_EMAILS,
  MODULES,
  listProfiles,
  normalizeEmail,
  saveProfile,
  type ModuleId,
  type UserProfile,
} from "@/lib/access-control";

type Row = UserProfile & { saved: boolean; dirty?: boolean };

const EDITABLE_MODULES = MODULES.filter(m => m.id !== "users");

export default function UsuariosPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listProfiles());
    } catch (error) {
      console.error("Erro ao carregar perfis:", error);
      toast({ variant: "destructive", title: "Erro ao carregar os perfis de acesso" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile?.master) load(); }, [profile?.master]);

  if (!profile?.master) {
    return <div className="p-6 text-muted-foreground">Somente administradores (master) acessam esta tela.</div>;
  }

  const update = (email: string, change: Partial<UserProfile>) =>
    setRows(current => current.map(r => r.email === email ? { ...r, ...change, dirty: true } : r));

  const toggleModule = (row: Row, moduleId: ModuleId, checked: boolean) =>
    update(row.email, { modules: checked ? [...row.modules, moduleId] : row.modules.filter(m => m !== moduleId) });

  const save = async (row: Row) => {
    setSavingEmail(row.email);
    try {
      await saveProfile(row, user?.email || "");
      setRows(current => current.map(r => r.email === row.email ? { ...r, saved: true, dirty: false } : r));
      toast({ title: `Acesso de ${row.name} salvo` });
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      toast({ variant: "destructive", title: "Erro ao salvar o acesso" });
    } finally {
      setSavingEmail("");
    }
  };

  const saveAllPending = async () => {
    for (const row of rows.filter(r => !r.saved || r.dirty)) {
      await save(row);
    }
  };

  const addRow = () => {
    const email = normalizeEmail(newEmail);
    if (!email.includes("@")) return toast({ variant: "destructive", title: "Informe um e-mail válido" });
    if (rows.some(r => r.email === email)) return toast({ variant: "destructive", title: "Esse e-mail já está na lista" });
    setRows(current => [...current, { email, name: newName.trim() || email, master: false, active: true, modules: [], saved: false, dirty: true }]);
    setNewEmail("");
    setNewName("");
  };

  const pendingCount = rows.filter(r => !r.saved || r.dirty).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Usuários e níveis de acesso</CardTitle>
          <CardDescription>
            Marque as telas que cada pessoa pode abrir. As contas de login (e-mail e senha) são criadas no
            Console do Firebase → Authentication. Para remover o acesso de alguém, desmarque "Ativo".
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nome</label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome da pessoa" className="w-56" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">E-mail de login</label>
            <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="nome.sobrenome@mecald.com.br" className="w-72" />
          </div>
          <Button variant="outline" onClick={addRow}>Adicionar pessoa</Button>
          <div className="flex-1" />
          <Button onClick={saveAllPending} disabled={!pendingCount || !!savingEmail}>
            Salvar todas as alterações{pendingCount ? ` (${pendingCount})` : ""}
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">Pessoa</th>
                <th className="p-2">Ativo</th>
                <th className="p-2">Master</th>
                {EDITABLE_MODULES.map(m => <th key={m.id} className="p-2 whitespace-nowrap">{m.label}</th>)}
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const fixedMaster = BOOTSTRAP_MASTER_EMAILS.includes(row.email);
                return (
                  <tr key={row.email} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                      {!row.saved && <Badge variant="outline" className="mt-1">padrão — ainda não salvo</Badge>}
                    </td>
                    <td className="p-2 text-center">
                      <Checkbox checked={row.active} disabled={row.master} onCheckedChange={v => update(row.email, { active: !!v })} />
                    </td>
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={row.master}
                        disabled={fixedMaster}
                        onCheckedChange={v => update(row.email, { master: !!v, modules: v ? ALL_MODULE_IDS : [] })}
                      />
                    </td>
                    {EDITABLE_MODULES.map(m => (
                      <td key={m.id} className="p-2 text-center">
                        <Checkbox
                          checked={row.master || row.modules.includes(m.id)}
                          disabled={row.master}
                          onCheckedChange={v => toggleModule(row, m.id, !!v)}
                        />
                      </td>
                    ))}
                    <td className="p-2">
                      <Button size="sm" variant={row.dirty || !row.saved ? "default" : "ghost"} disabled={savingEmail === row.email} onClick={() => save(row)}>
                        {savingEmail === row.email ? "Salvando..." : "Salvar"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
