import { collection, doc, getDoc, getDocs, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Níveis de acesso do Sistema OrbIT.
 *
 * Cada usuário tem um perfil com a lista de telas (módulos) que pode abrir.
 * Os perfis ficam em Firestore: companies/mecald/userProfiles/{email}.
 * Enquanto um perfil ainda não foi salvo no banco, vale o padrão definido em
 * DEFAULT_PROFILES abaixo. Usuários "master" veem todas as telas e podem
 * editar os perfis na tela Usuários.
 */

export const MODULES = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard" },
  { id: "customers", href: "/customers", label: "Clientes" },
  { id: "company", href: "/company", label: "Empresa" },
  { id: "products", href: "/products", label: "Produtos" },
  { id: "quotations", href: "/quotations", label: "Orçamentos" },
  { id: "orders", href: "/orders", label: "Pedidos" },
  { id: "task", href: "/task", label: "Tarefas" },
  { id: "materials", href: "/materials", label: "Materiais" },
  { id: "costs", href: "/costs", label: "Custos" },
  { id: "quality", href: "/quality", label: "Qualidade" },
  { id: "finance", href: "/finance", label: "Financeiro" },
  { id: "apontamento", href: "/apontamento/abrir", label: "Apontamento (chão de fábrica)" },
  { id: "users", href: "/usuarios", label: "Usuários" },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];
export const ALL_MODULE_IDS: ModuleId[] = MODULES.map(m => m.id);

export type UserProfile = {
  email: string;
  name: string;
  master: boolean;
  active: boolean;
  modules: ModuleId[];
};

/**
 * Contas master fixas. Sempre têm acesso total, mesmo sem perfil no banco,
 * para que nunca fique ninguém sem conseguir administrar os acessos.
 * (A mesma lista está em firestore.rules.)
 */
export const BOOTSTRAP_MASTER_EMAILS = [
  "paulohenrique@mecald.com.br",
  "samuel.felipe@mecald.com.br",
];

const p = (email: string, name: string, modules: ModuleId[], master = false): UserProfile =>
  ({ email, name, modules, master, active: true });

/** Perfis padrão (lista enviada pela empresa em 19/11/2026). */
export const DEFAULT_PROFILES: UserProfile[] = [
  p("paulohenrique@mecald.com.br", "Paulo Henrique", ALL_MODULE_IDS, true),
  p("samuel.felipe@mecald.com.br", "Samuel Felipe", ALL_MODULE_IDS, true),
  p("gabriel.braga@mecald.com.br", "Gabriel Braga", ["orders", "quality"]),
  p("matheus.nogueira@mecald.com.br", "Matheus Nogueira", ["orders", "quality", "products"]),
  p("reginaldo.araujo@mecald.com.br", "Reginaldo Araújo", ["materials", "orders", "costs"]),
  p("roberto.araujo@mecald.com.br", "Roberto Araújo", ["orders", "quality"]),
  p("pedro.wilson@mecald.com.br", "Pedro Wilson", ["orders", "quality"]),
  p("rafael.menezes@mecald.com.br", "Rafael Menezes", ["orders", "quality"]),
  p("edvaldo.aguiar@mecald.com.br", "Edvaldo Aguiar", ["orders", "quality"]),
  p("producao@sistemaorbit.com.br", "Produção (chão de fábrica)", ["apontamento"]),
];

export const normalizeEmail = (email: string | null | undefined) => String(email || "").trim().toLowerCase();

const profilesCollection = () => collection(db, "companies", "mecald", "userProfiles");

function sanitize(raw: any, email: string): UserProfile {
  const master = !!raw?.master || BOOTSTRAP_MASTER_EMAILS.includes(email);
  const modules = Array.isArray(raw?.modules)
    ? raw.modules.filter((m: any): m is ModuleId => ALL_MODULE_IDS.includes(m))
    : [];
  return {
    email,
    name: String(raw?.name || email),
    master,
    active: master ? true : raw?.active !== false,
    modules: master ? ALL_MODULE_IDS : modules,
  };
}

/** Perfil do usuário logado: banco > padrão do código > sem acesso. */
export async function loadUserProfile(rawEmail: string | null | undefined): Promise<UserProfile | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  try {
    const snap = await getDoc(doc(profilesCollection(), email));
    if (snap.exists()) return sanitize(snap.data(), email);
  } catch (error) {
    console.error("Erro ao carregar perfil de acesso:", error);
  }
  const fallback = DEFAULT_PROFILES.find(d => d.email === email);
  if (fallback) return sanitize(fallback, email);
  if (BOOTSTRAP_MASTER_EMAILS.includes(email)) return sanitize({ master: true }, email);
  return null;
}

/** Todos os perfis (padrões + salvos no banco), para a tela Usuários. */
export async function listProfiles(): Promise<(UserProfile & { saved: boolean })[]> {
  const snap = await getDocs(profilesCollection());
  const map = new Map<string, UserProfile & { saved: boolean }>();
  DEFAULT_PROFILES.forEach(d => map.set(d.email, { ...sanitize(d, d.email), saved: false }));
  snap.docs.forEach(d => map.set(d.id, { ...sanitize(d.data(), d.id), saved: true }));
  return [...map.values()].sort((a, b) => Number(b.master) - Number(a.master) || a.name.localeCompare(b.name, "pt-BR"));
}

export async function saveProfile(profile: UserProfile, updatedBy: string): Promise<void> {
  const email = normalizeEmail(profile.email);
  await setDoc(doc(profilesCollection(), email), {
    email,
    name: profile.name.trim() || email,
    master: profile.master,
    active: profile.active,
    modules: profile.master ? ALL_MODULE_IDS : profile.modules,
    updatedBy: normalizeEmail(updatedBy),
    updatedAt: Timestamp.now(),
  });
}

export const canAccess = (profile: UserProfile | null, moduleId: ModuleId) =>
  !!profile && profile.active && (profile.master || profile.modules.includes(moduleId));

/** Módulo correspondente a um caminho (ex.: "/orders/" -> "orders"). */
export function moduleForPath(pathname: string): ModuleId | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const match = MODULES.find(m => clean === m.href || clean.startsWith(m.href + "/"));
  return match ? match.id : null;
}

/** Primeira tela que o usuário pode abrir (para redirecionar após o login). */
export function firstAllowedHref(profile: UserProfile | null): string | null {
  const first = MODULES.find(m => m.id !== "users" && canAccess(profile, m.id));
  return first ? first.href : null;
}
