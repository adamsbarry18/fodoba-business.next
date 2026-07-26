import type { LucideIcon } from "lucide-react"
import { Clock, Truck, CheckCircle2, BadgeAlert } from "lucide-react"
import type { Purchase, PurchaseItem, PurchaseExpense } from "@/lib/types"
import { CURRENCY_CODES } from "@/lib/constants/currencies"

export type PurchaseStatus = Purchase["status"]

export const PURCHASE_CURRENCIES = CURRENCY_CODES

export const PURCHASE_STATUS_ORDER: PurchaseStatus[] = [
  "DRAFT",
  "ORDERED",
  "RECEIVED",
  "CANCELLED",
]

export const PURCHASE_STATUS_ICONS: Record<PurchaseStatus, LucideIcon> = {
  DRAFT: Clock,
  ORDERED: Truck,
  RECEIVED: CheckCircle2,
  CANCELLED: BadgeAlert,
}

export function formatPurchaseRef(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`
}

export function getPurchaseLineTotal(item: PurchaseItem): number {
  return item.quantity * item.unitCost * item.exchangeRate
}

export function getPurchaseSubtotal(items: PurchaseItem[]): number {
  return items.reduce((acc, item) => acc + getPurchaseLineTotal(item), 0)
}

export function getExpensesTotal(expenses: PurchaseExpense[]): number {
  return expenses.reduce((acc, exp) => acc + exp.amount * exp.exchangeRate, 0)
}

export function getLandedCostUnit(
  item: PurchaseItem,
  purchase: Pick<Purchase, "subtotalFCFA" | "expensesTotalFCFA">
): number {
  if (item.quantity <= 0) return 0
  const itemTotalFCFA = getPurchaseLineTotal(item)
  const expenseShare =
    purchase.subtotalFCFA > 0
      ? purchase.expensesTotalFCFA * (itemTotalFCFA / purchase.subtotalFCFA)
      : 0
  return (itemTotalFCFA + expenseShare) / item.quantity
}

export function toPurchaseDate(ts: Purchase["timestamp"]): Date | null {
  if (!ts) return null
  return ts.toDate ? ts.toDate() : new Date(ts)
}

export function canEditPurchase(status: PurchaseStatus): boolean {
  return status === "DRAFT" || status === "ORDERED"
}
