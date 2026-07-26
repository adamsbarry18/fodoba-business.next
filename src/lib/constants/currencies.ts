import type { LucideIcon } from "lucide-react"
import { CircleDollarSign, Coins, DollarSign, Euro } from "lucide-react"
import type { BadgeTone } from "@/lib/badge-tones"

/** Codes devises supportés (source de vérité). */
export const CURRENCY_CODES = ["FCFA", "GNF", "USD", "EUR"] as const

export type CurrencyCode = (typeof CURRENCY_CODES)[number]

/** Devise de stockage / comptable (montants Firestore). */
export const STORAGE_CURRENCY: CurrencyCode = "FCFA"

/** Code ISO 4217 pour `Intl.NumberFormat` (FCFA → XOF). */
export const ISO_CURRENCY_BY_CODE: Record<CurrencyCode, string> = {
  FCFA: "XOF",
  GNF: "GNF",
  USD: "USD",
  EUR: "EUR",
}

/** Taux par défaut : 1 unité = X FCFA. */
export const DEFAULT_RATES: Record<CurrencyCode, number> = {
  FCFA: 1,
  GNF: 0.065,
  USD: 600,
  EUR: 655.957,
}

/** Ordre d’affichage UI / listes. */
export const CURRENCY_ORDER: CurrencyCode[] = [...CURRENCY_CODES]

export type CurrencyMeta = {
  code: CurrencyCode
  label: string
  symbol: string
  tone: BadgeTone
  icon: LucideIcon
  /** Décimales pour l’édition des taux de change. */
  rateDecimals: number
  /** Décimales pour l’affichage des montants. */
  amountFractionDigits: number
  /** @deprecated Alias de `rateDecimals` (écrans existants). */
  decimals: number
}

function meta(
  partial: Omit<CurrencyMeta, "decimals">
): CurrencyMeta {
  return { ...partial, decimals: partial.rateDecimals }
}

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  FCFA: meta({
    code: "FCFA",
    label: "Franc CFA",
    symbol: "FCFA",
    tone: "primary-soft",
    icon: CircleDollarSign,
    rateDecimals: 0,
    amountFractionDigits: 0,
  }),
  GNF: meta({
    code: "GNF",
    label: "Franc guinéen",
    symbol: "GNF",
    tone: "warning",
    icon: Coins,
    rateDecimals: 4,
    amountFractionDigits: 0,
  }),
  USD: meta({
    code: "USD",
    label: "Dollar US",
    symbol: "$",
    tone: "success",
    icon: DollarSign,
    rateDecimals: 2,
    amountFractionDigits: 2,
  }),
  EUR: meta({
    code: "EUR",
    label: "Euro",
    symbol: "€",
    tone: "info",
    icon: Euro,
    rateDecimals: 3,
    amountFractionDigits: 2,
  }),
}

/** Options de select (fournisseurs, achats, etc.). */
export const CURRENCY_SELECT_OPTIONS: {
  value: CurrencyCode
  label: string
}[] = CURRENCY_ORDER.map((code) => {
  const item = CURRENCY_META[code]
  if (code === STORAGE_CURRENCY) {
    return { value: code, label: `${code} (Référence)` }
  }
  if (item.symbol === code) {
    return { value: code, label: code }
  }
  return { value: code, label: `${code} (${item.symbol})` }
})

export function isValidCurrencyCode(code: string): code is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(code)
}

export function getIsoCurrencyCode(code: CurrencyCode): string {
  return ISO_CURRENCY_BY_CODE[code]
}

export function getAmountFractionDigits(code: CurrencyCode): number {
  return CURRENCY_META[code].amountFractionDigits
}

export function getRateDecimals(code: CurrencyCode): number {
  return CURRENCY_META[code].rateDecimals
}
