import { z } from "zod"
import type { CurrencyCode } from "@/lib/types"
import { CURRENCY_META, isValidCurrencyCode } from "@/lib/constants/currencies"
import type { LandedCostOutput } from "@/lib/calculations"

/** Devises d'origine usuelles pour un import / achat. */
export const PURCHASE_CURRENCIES = (
  ["USD", "EUR", "GNF", "FCFA"] as const satisfies readonly CurrencyCode[]
).map((code) => ({
  value: code,
  label:
    code === "FCFA"
      ? "FCFA (référence)"
      : CURRENCY_META[code].symbol === code
        ? code
        : `${code} (${CURRENCY_META[code].symbol})`,
}))

export const TARGET_CURRENCIES = (
  ["FCFA", "GNF"] as const satisfies readonly CurrencyCode[]
).map((code) => ({
  value: code,
  label: code === "FCFA" ? "FCFA (référence)" : code,
}))

export const LandedCostFormSchema = z.object({
  purchasePrice: z.coerce.number().min(0.01, "Prix unitaire requis"),
  purchaseCurrency: z.string().min(1),
  transportFees: z.coerce.number().min(0),
  customsDutyPercentage: z.coerce.number().min(0).max(100),
  otherFees: z.coerce.number().min(0),
  targetCurrency: z.string().min(1),
  exchangeRateToTargetCurrency: z.coerce.number().min(0.0001, "Taux invalide"),
})

export type LandedCostFormValues = z.infer<typeof LandedCostFormSchema>

/**
 * Suggère un taux : 1 devise d'origine = X devise cible,
 * à partir des taux FODOBA (1 devise = X FCFA).
 */
export function suggestExchangeRate(
  purchaseCurrency: string,
  targetCurrency: string,
  rates: Record<CurrencyCode, number>
): number | null {
  if (!isValidCurrencyCode(purchaseCurrency) || !isValidCurrencyCode(targetCurrency)) {
    return null
  }

  if (purchaseCurrency === targetCurrency) return 1

  const fromFcfa = rates[purchaseCurrency]
  const toFcfa = rates[targetCurrency]
  if (!fromFcfa || !toFcfa) return null

  // 1 origin = fromFcfa FCFA ; 1 target = toFcfa FCFA
  // => 1 origin = fromFcfa / toFcfa target
  return fromFcfa / toFcfa
}

export function getCostBreakdownRows(result: LandedCostOutput) {
  return [
    { value: result.costBreakdown.purchasePrice, additive: false },
    { value: result.costBreakdown.transportFees, additive: true },
    { value: result.costBreakdown.customsDuty, additive: true },
    { value: result.costBreakdown.otherFees, additive: true },
  ]
}

export const LANDED_COST_DEFAULTS: LandedCostFormValues = {
  purchasePrice: 10,
  purchaseCurrency: "USD",
  transportFees: 2,
  customsDutyPercentage: 5,
  otherFees: 0.5,
  targetCurrency: "FCFA",
  exchangeRateToTargetCurrency: 600,
}
