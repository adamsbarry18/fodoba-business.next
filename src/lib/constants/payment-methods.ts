import type { PaymentMethod } from "@/lib/types"
import frMessages from "@/i18n/messages/fr.json"
import { getNestedMessage, nestMessages } from "@/i18n/nest-messages"

const nestedFrMessages = nestMessages(frMessages)

export type PosPaymentMode = "comptant" | "partiel" | "credit" | "fractionne"

export type PaymentMethodOption = {
  id: PaymentMethod
  label: string
}

/** Trois moyens principaux affichés par défaut. */
export const PRIMARY_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "CASH", label: "payment.cash" },
  { id: "ORANGE_MONEY", label: "payment.orangeMoney" },
  { id: "CARD", label: "payment.card" },
]

/** Moyens additionnels (ajoutables dynamiquement). */
export const EXTRA_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: "MOBILE_MONEY", label: "payment.mobileMoney" },
  { id: "TRANSFER", label: "payment.transfer" },
  { id: "OTHER", label: "payment.other" },
]

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  ...PRIMARY_PAYMENT_METHODS,
  ...EXTRA_PAYMENT_METHODS,
]

/** Alias historique : moyens standards (principaux + extras, hors UI progressive). */
export const POS_PAYMENT_METHODS = PAYMENT_METHOD_OPTIONS.filter((m) => m.id !== "OTHER")

/** Modes du paiement fractionné (tous les moyens). */
export const POS_FRACTIONAL_METHODS = PAYMENT_METHOD_OPTIONS

export const PAYMENT_METHOD_IDS = PAYMENT_METHOD_OPTIONS.map((m) => m.id)

export const PRIMARY_PAYMENT_METHOD_IDS = PRIMARY_PAYMENT_METHODS.map((m) => m.id)
export const EXTRA_PAYMENT_METHOD_IDS = EXTRA_PAYMENT_METHODS.map((m) => m.id)

export function isPrimaryPaymentMethod(method: PaymentMethod): boolean {
  return PRIMARY_PAYMENT_METHOD_IDS.includes(method)
}

export function isExtraPaymentMethod(method: PaymentMethod): boolean {
  return EXTRA_PAYMENT_METHOD_IDS.includes(method)
}

/** Retourne la clé i18n du mode de paiement (à passer à `t()`). */
export function getPaymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_OPTIONS.find((m) => m.id === method)?.label ?? method
}

/** Libellé FR pour exports PDF (hors composants React). */
export function getPaymentMethodLabelFr(method: string): string {
  const key = getPaymentMethodLabel(method)
  return getNestedMessage(nestedFrMessages, key) ?? method
}

export const EMPTY_PAYMENT_AMOUNTS = (): Record<PaymentMethod, string> => ({
  CASH: "",
  ORANGE_MONEY: "",
  MOBILE_MONEY: "",
  CARD: "",
  TRANSFER: "",
  OTHER: "",
})

export function buildSalePayments(
  mode: PosPaymentMode,
  total: number,
  amounts: Record<PaymentMethod, string>,
  comptantMethod: PaymentMethod
): { payments: { method: PaymentMethod; amount: number }[]; debtAmount: number } {
  if (mode === "credit") {
    return { payments: [], debtAmount: total }
  }

  if (mode === "partiel") {
    const paid = Math.min(Math.max(0, Number(amounts[comptantMethod]) || 0), total)
    const payments =
      paid > 0 ? [{ method: comptantMethod, amount: paid }] : []
    return { payments, debtAmount: Math.max(0, total - paid) }
  }

  const methodList = mode === "fractionne" ? POS_FRACTIONAL_METHODS : PAYMENT_METHOD_OPTIONS

  const entries =
    mode === "comptant"
      ? [{ method: comptantMethod, amount: Number(amounts[comptantMethod]) || total }]
      : methodList
          .map(({ id }) => ({
            method: id,
            amount: Number(amounts[id]) || 0,
          }))
          .filter((e) => e.amount > 0)

  let remaining = total
  const payments: { method: PaymentMethod; amount: number }[] = []

  for (const entry of entries) {
    const applied = Math.min(entry.amount, remaining)
    if (applied > 0) {
      payments.push({ method: entry.method, amount: applied })
      remaining -= applied
    }
  }

  return { payments, debtAmount: Math.max(0, remaining) }
}
