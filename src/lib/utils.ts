import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { CURRENCY_META, STORAGE_CURRENCY } from "@/lib/constants/currencies"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Helvetica (jsPDF) ne gère pas les espaces Unicode de `Intl` (U+202F, NBSP…).
 * Sans normalisation : montants « 3 5 / 0 0 0 » ou caractères `&` entre chaque glyphe.
 */
export function sanitizePdfText(text: string): string {
  const symbol = CURRENCY_META[STORAGE_CURRENCY].symbol
  return text
    .normalize("NFC")
    .replace(/[\u00A0\u202F\u2000-\u200B\u2060\uFEFF]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/F\s*CFA/gi, symbol)
    .replace(/ {2,}/g, " ")
}

/** Montants lisibles en PDF (espaces ASCII, pas d'espaces insécables Unicode). */
export function formatPdfNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
    .formatToParts(value)
    .map((part) => {
      if (part.type === "group") return " "
      if (part.type === "decimal") return ","
      return part.value
    })
    .join("")
}

/** Montant + devise sûr pour jsPDF. */
export function formatPdfMoney(
  amountFcfa: number,
  currencyLabel: string = CURRENCY_META[STORAGE_CURRENCY].symbol
): string {
  return sanitizePdfText(`${formatPdfNumber(amountFcfa)} ${currencyLabel}`)
}
