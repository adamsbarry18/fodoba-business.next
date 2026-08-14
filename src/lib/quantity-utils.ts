/**
 * Quantités métier (stock, ventes, transferts) : nombres réels, pas seulement des entiers.
 * Ex. 0,5 pain, 0,5 kg ou 10,5 kg de riz.
 */
export const QUANTITY_MAX_DECIMALS = 3
export const QUANTITY_MIN = 0.001

const FACTOR = 10 ** QUANTITY_MAX_DECIMALS

export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * FACTOR) / FACTOR
}

export function parseQuantityInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (normalized === "" || normalized === "." || normalized === "-") return null
  if (!/^-?\d*\.?\d+$/.test(normalized) && !/^-?\d+\.$/.test(normalized)) {
    return null
  }
  if (normalized.endsWith(".")) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return roundQuantity(parsed)
}

/** Saisie en cours (autorise « 0, » / « 10. ») */
export function isQuantityDraft(raw: string): boolean {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".")
  return normalized === "" || /^\d*[.,]?\d*$/.test(normalized)
}

export function formatQuantity(value: number, locale?: string): string {
  const rounded = roundQuantity(value)
  if (locale) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: QUANTITY_MAX_DECIMALS,
      minimumFractionDigits: 0,
      useGrouping: false,
    }).format(rounded)
  }
  return String(rounded)
}

export function isQuantityAtLeast(available: number, needed: number): boolean {
  return roundQuantity(available) + 1 / (FACTOR * 2) >= roundQuantity(needed)
}
