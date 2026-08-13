import type { Store } from "@/lib/types"
import type { BadgeTone } from "@/lib/badge-tones"

export const STORE_CODE_HINT = "FI-B1"
export const STORE_CODE_EXAMPLE = "FI-B2"

/** Format attendu : préfixe + tiret + identifiant (ex. FI-B1). */
export const STORE_CODE_REGEX = /^[A-Z]{2}-[A-Z0-9]{1,6}$/i

export function normalizeStoreCode(code: string): string {
  return code.trim().toUpperCase()
}

export function getStoreInitials(store: Pick<Store, "name" | "code">): string {
  const fromCode = store.code.replace(/[^A-Z0-9]/gi, "").slice(0, 2)
  if (fromCode.length >= 2) return fromCode.toUpperCase()
  return store.name.slice(0, 2).toUpperCase() || "?"
}

export function validateStoreCodeFormat(code: string): string | null {
  const normalized = normalizeStoreCode(code)
  if (normalized.length < 2) return "Le code est requis."
  if (!STORE_CODE_REGEX.test(normalized)) {
    return `Format attendu : ${STORE_CODE_HINT} (lettres, chiffres, tiret).`
  }
  return null
}

export function getStoreStatusTone(active: boolean): BadgeTone {
  return active ? "success" : "destructive"
}

/** Boutique opérationnelle (non suspendue). `active` absent = actif (docs legacy). */
export function isStoreActive(store: Pick<Store, "active">): boolean {
  return store.active !== false
}

/** Boutiques affichables dans le sélecteur et utilisables au quotidien. */
export function filterActiveStores<T extends Pick<Store, "active">>(stores: T[]): T[] {
  return stores.filter(isStoreActive)
}

export function formatStoreCreatedAt(createdAt: Store["createdAt"]): Date | null {
  if (!createdAt) return null
  return createdAt.toDate ? createdAt.toDate() : new Date(createdAt)
}

const LEGACY_ACTIVE_STORE_KEY = "activeStoreId"
const ACTIVE_STORE_KEY_PREFIX = "activeStoreId:"

export function getActiveStoreStorageKey(uid: string): string {
  return `${ACTIVE_STORE_KEY_PREFIX}${uid}`
}

export function readSavedActiveStoreId(uid: string): string | null {
  return localStorage.getItem(getActiveStoreStorageKey(uid))
}

export function writeSavedActiveStoreId(uid: string, storeId: string): void {
  localStorage.setItem(getActiveStoreStorageKey(uid), storeId)
  localStorage.removeItem(LEGACY_ACTIVE_STORE_KEY)
}

/** Supprime uniquement l'ancienne clé globale (migration). */
export function clearLegacyActiveStoreKey(): void {
  localStorage.removeItem(LEGACY_ACTIVE_STORE_KEY)
}

export type StoreSelectionSource = "single" | "saved" | "default"

export interface ResolvedStoreSelection {
  store: Store | null
  source: StoreSelectionSource | null
}

function sortStoresByName(stores: Store[]): Store[] {
  return [...stores].sort((a, b) => a.name.localeCompare(b.name, "fr"))
}

/**
 * Choisit la boutique active parmi celles autorisées :
 * 1. dernière boutique utilisée (localStorage par uid)
 * 2. première boutique assignée au profil (ordre storeIds)
 * 3. première boutique par nom (fallback admin/manager)
 */
export function resolveActiveStore(
  stores: Store[],
  savedId: string | null,
  preferredDefaultId?: string | null
): ResolvedStoreSelection {
  if (stores.length === 0) {
    return { store: null, source: null }
  }

  if (savedId) {
    const savedMatch = stores.find((store) => store.id === savedId)
    if (savedMatch) {
      return {
        store: savedMatch,
        source: stores.length === 1 ? "single" : "saved",
      }
    }
  }

  if (preferredDefaultId) {
    const preferredMatch = stores.find((store) => store.id === preferredDefaultId)
    if (preferredMatch) {
      return {
        store: preferredMatch,
        source: stores.length === 1 ? "single" : "default",
      }
    }
  }

  const [store] = sortStoresByName(stores)
  return {
    store: store ?? null,
    source: stores.length === 1 ? "single" : "default",
  }
}
