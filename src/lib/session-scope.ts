import { browserSessionPersistence, setPersistence, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Separação entre o Sistema e a tela de Apontamento.
 *
 * - O login vale só para a aba/janela em que foi feito e termina quando ela é
 *   fechada (persistência de sessão). Abrir o sistema de novo sempre pede login.
 * - Cada login registra por qual porta entrou: "sistema" (tela de login) ou
 *   "apontamento". Um login feito no Apontamento NÃO dá acesso ao sistema, e
 *   vice-versa: ao tentar trocar, a sessão é encerrada e o login é pedido de novo.
 */

export type SessionScope = "sistema" | "apontamento";
const KEY = "orbit-session-scope";

export async function prepareLogin(scope: SessionScope): Promise<void> {
  await setPersistence(auth, browserSessionPersistence);
  try { sessionStorage.setItem(KEY, scope); } catch { /* navegador sem sessionStorage */ }
}

export function getSessionScope(): SessionScope | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value === "sistema" || value === "apontamento" ? value : null;
  } catch {
    return null;
  }
}

export function clearSessionScope(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Encerra a sessão atual (usado quando o login não foi feito pela porta certa). */
export async function endSession(): Promise<void> {
  clearSessionScope();
  await signOut(auth);
}
