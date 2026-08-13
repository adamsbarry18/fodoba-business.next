import type { SaleItem } from "@/lib/types"

const STORAGE_KEY = "fodoba-pos-checkout-draft"

export type PosCheckoutDraft = {
  storeId: string
  cart: SaleItem[]
  discount: number
  selectedClientId: string
  correctingSaleId: string | null
  correctingSaleRef: string | null
}

export function loadPosCheckoutDraft(): PosCheckoutDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PosCheckoutDraft
    if (!parsed?.storeId || !Array.isArray(parsed.cart)) return null
    return parsed
  } catch {
    return null
  }
}

export function savePosCheckoutDraft(draft: PosCheckoutDraft): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // quota / private mode
  }
}

export function clearPosCheckoutDraft(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(STORAGE_KEY)
}
