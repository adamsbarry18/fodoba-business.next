import type { CurrencyCode } from "@/lib/constants/currencies"
import {
  CURRENCY_META,
  CURRENCY_ORDER,
  CURRENCY_SELECT_OPTIONS,
  DEFAULT_RATES,
  STORAGE_CURRENCY,
  getAmountFractionDigits,
  getIsoCurrencyCode,
  getRateDecimals,
} from "@/lib/constants/currencies"

export type { CurrencyCode, CurrencyMeta } from "@/lib/constants/currencies"
export {
  CURRENCY_CODES,
  CURRENCY_META,
  CURRENCY_ORDER,
  CURRENCY_SELECT_OPTIONS,
  DEFAULT_RATES,
  STORAGE_CURRENCY,
  getAmountFractionDigits,
  getIsoCurrencyCode,
  getRateDecimals,
  isValidCurrencyCode,
} from "@/lib/constants/currencies"

/** @deprecated Préférer editableCurrencies(referenceCurrency) */
export const EDITABLE_CURRENCIES: CurrencyCode[] = CURRENCY_ORDER.filter(
  (code) => code !== STORAGE_CURRENCY
)

export function isReferenceCurrency(
  code: CurrencyCode,
  reference: CurrencyCode
): boolean {
  return code === reference
}

/**
 * Taux « 1 unité de `from` = X unités de `to` », via les taux stockés vers FCFA.
 */
export function rateBetween(
  from: CurrencyCode,
  to: CurrencyCode,
  rates: Record<CurrencyCode, number>
): number {
  if (from === to) return 1
  const fromToFcfa = rates[from] ?? DEFAULT_RATES[from] ?? 1
  const toToFcfa = rates[to] ?? DEFAULT_RATES[to] ?? 1
  if (toToFcfa === 0) return 0
  return fromToFcfa / toToFcfa
}

/** Convertit un montant FCFA (stockage) vers la devise de référence d’affichage. */
export function storageToReference(
  amountFcfa: number,
  reference: CurrencyCode,
  rates: Record<CurrencyCode, number>
): number {
  if (reference === STORAGE_CURRENCY) return amountFcfa
  const rate = rates[reference] ?? DEFAULT_RATES[reference] ?? 1
  if (rate === 0) return 0
  return amountFcfa / rate
}

/** Convertit un montant en devise de référence vers FCFA (stockage). */
export function referenceToStorage(
  amountRef: number,
  reference: CurrencyCode,
  rates: Record<CurrencyCode, number>
): number {
  if (reference === STORAGE_CURRENCY) return amountRef
  const rate = rates[reference] ?? DEFAULT_RATES[reference] ?? 1
  return amountRef * rate
}

/**
 * Convertit un montant d’une devise vers FCFA (stockage).
 * `rates[code]` = valeur de 1 unité en FCFA.
 */
export function toStorage(
  amount: number,
  from: CurrencyCode,
  rates: Record<CurrencyCode, number>
): number {
  if (from === STORAGE_CURRENCY) return amount
  return amount * (rates[from] ?? DEFAULT_RATES[from] ?? 1)
}

/**
 * Convertit un montant FCFA vers une autre devise.
 */
export function fromStorage(
  amountFcfa: number,
  to: CurrencyCode,
  rates: Record<CurrencyCode, number>
): number {
  if (to === STORAGE_CURRENCY) return amountFcfa
  const rate = rates[to] ?? DEFAULT_RATES[to] ?? 1
  if (rate === 0) return 0
  return amountFcfa / rate
}

/**
 * À partir d’un taux affiché « 1 code = x reference », calcule le rateToRef (vers FCFA).
 */
export function displayedRateToStorageRate(
  code: CurrencyCode,
  displayedRateVsRef: number,
  reference: CurrencyCode,
  rates: Record<CurrencyCode, number>
): number {
  if (code === STORAGE_CURRENCY) {
    if (displayedRateVsRef <= 0) return rates[reference] ?? DEFAULT_RATES[reference]
    return 1 / displayedRateVsRef
  }
  if (reference === STORAGE_CURRENCY) {
    return displayedRateVsRef
  }
  const refToFcfa = rates[reference] ?? DEFAULT_RATES[reference] ?? 1
  return displayedRateVsRef * refToFcfa
}

export function editableCurrencies(reference: CurrencyCode): CurrencyCode[] {
  return CURRENCY_ORDER.filter((code) => code !== reference)
}

/** Formatage montant pour l’UI (Intl + libellé FCFA). */
export function formatCurrencyValue(amount: number, code: CurrencyCode): string {
  const digits = getAmountFractionDigits(code)
  const formatter = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: getIsoCurrencyCode(code),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

  let result = formatter.format(amount)

  if (code === STORAGE_CURRENCY) {
    result = result
      .replace(/F[\u00A0\u202F\s]*CFA/g, CURRENCY_META.FCFA.symbol)
      .replace(/XOF/g, CURRENCY_META.FCFA.symbol)
  }

  return result
}

export function formatRate(value: number, code: CurrencyCode): string {
  const decimals = getRateDecimals(code)
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function validateRate(value: number): string | null {
  if (!Number.isFinite(value)) return "Saisissez un nombre valide."
  if (value <= 0) return "Le taux doit être strictement positif."
  if (value > 1_000_000) return "Le taux semble trop élevé. Vérifiez la valeur."
  return null
}

export type AppCurrencySettings = {
  referenceCurrency: CurrencyCode
  updatedAt?: unknown
  updatedBy?: string
}

export const DEFAULT_APP_SETTINGS: AppCurrencySettings = {
  referenceCurrency: STORAGE_CURRENCY,
}

/** @deprecated Utiliser CURRENCY_SELECT_OPTIONS */
export const SUPPLIER_CURRENCY_OPTIONS = CURRENCY_SELECT_OPTIONS
