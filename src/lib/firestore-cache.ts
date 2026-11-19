import { collection, getDocs, type QuerySnapshot, type DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Cache curto, em memória, para leituras de coleções inteiras do Firestore.
 *
 * Por quê: várias telas (Dashboard, Clientes, Materiais, Qualidade, Financeiro...)
 * leem a coleção inteira de pedidos toda vez que abrem. Cada documento retornado
 * conta como 1 leitura cobrada. Navegar entre telas em sequência fazia o sistema
 * baixar a mesma coleção várias vezes em poucos segundos.
 *
 * Como funciona:
 *  - Chamadas simultâneas para a mesma coleção compartilham UMA requisição.
 *  - O resultado fica guardado por `ttlMs` (padrão 60s) nesta aba do navegador.
 *  - Depois de gravar algo na coleção, chame `invalidateCollectionCache(...)`
 *    para que a próxima leitura busque dados novos.
 *
 * O cache vive só na memória da aba: recarregar a página (F5) sempre busca dados novos.
 */

const DEFAULT_TTL_MS = 60_000;
const COMPANY_PATH = ["companies", "mecald"] as const;

type Entry = { expiresAt: number; promise: Promise<QuerySnapshot<DocumentData>> };
const cache = new Map<string, Entry>();

export async function getCompanyCollectionCached(
  collectionName: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<QuerySnapshot<DocumentData>> {
  const key = collectionName;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.promise;

  const promise = getDocs(collection(db, ...COMPANY_PATH, collectionName));
  cache.set(key, { expiresAt: now + ttlMs, promise });
  // Em caso de erro, não guarda o resultado com falha.
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

/** Descarta o cache de uma coleção (chamar depois de gravar nela). */
export function invalidateCollectionCache(collectionName: string): void {
  cache.delete(collectionName);
}

/** Descarta todo o cache (ex.: ao fazer logout). */
export function clearFirestoreCache(): void {
  cache.clear();
}
