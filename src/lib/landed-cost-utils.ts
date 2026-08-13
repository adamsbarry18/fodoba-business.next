import { z } from "zod"
import type { CurrencyCode } from "@/lib/types"
import { isValidCurrencyCode } from "@/lib/constants/currencies"
import type { LandedCostOutput } from "@/lib/calculations"

/** Devises d'origine usuelles pour un import / achat. */
export const PURCHASE_CURRENCY_CODES = [
  "USD",
  "EUR",
  "GNF",
  "FCFA",
] as const satisfies readonly CurrencyCode[]

export const TARGET_CURRENCY_CODES = [
  "FCFA",
  "GNF",
] as const satisfies readonly CurrencyCode[]

/** @deprecated Utiliser PURCHASE_CURRENCY_CODES + getCurrencySelectLabel */
export const PURCHASE_CURRENCIES = PURCHASE_CURRENCY_CODES.map((code) => ({ value: code }))

/** @deprecated Utiliser TARGET_CURRENCY_CODES + getCurrencySelectLabel */
export const TARGET_CURRENCIES = TARGET_CURRENCY_CODES.map((code) => ({ value: code }))

export function createLandedCostFormSchema(t: (key: string) => string) {
  return z.object({
    purchasePrice: z.coerce.number().min(0.01, t("landedCost.validation.unitPriceRequired")),
    purchaseCurrency: z.string().min(1),
    transportFees: z.coerce.number().min(0),
    customsDutyPercentage: z.coerce.number().min(0).max(100),
    otherFees: z.coerce.number().min(0),
    targetCurrency: z.string().min(1),
    exchangeRateToTargetCurrency: z.coerce.number().min(0.0001, t("landedCost.validation.invalidRate")),
  })
}

export const LandedCostFormSchema = createLandedCostFormSchema((key) => key)

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
