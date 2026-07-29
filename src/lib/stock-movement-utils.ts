import type { LucideIcon } from "lucide-react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  RefreshCw,
  ClipboardCheck,
} from "lucide-react"
import type { StockMovement } from "@/lib/types"
import { startOfMonth, endOfMonth, isWithinInterval } from "date-fns"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export type MovementType = StockMovement["type"]
export type MovementTypeFilter = "all" | MovementType

export const MOVEMENT_TYPE_ORDER: MovementType[] = [
  "PURCHASE",
  "SALE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RETURN",
  "CORRECTION",
]

export const MOVEMENT_META: Record<
  MovementType,
  { label: string; Icon: LucideIcon }
> = {
  PURCHASE: { label: "Achat / Entrée", Icon: ArrowDownLeft },
  SALE: { label: "Vente", Icon: ArrowUpRight },
  TRANSFER_IN: { label: "Transfert (Entrée)", Icon: ArrowRightLeft },
  TRANSFER_OUT: { label: "Transfert (Sortie)", Icon: ArrowRightLeft },
  RETURN: { label: "Retour client", Icon: RefreshCw },
  CORRECTION: { label: "Correction inventaire", Icon: ClipboardCheck },
}

export function toMovementDate(ts: StockMovement["timestamp"]): Date | null {
  if (!ts) return null
  return ts.toDate ? ts.toDate() : new Date(ts)
}

export function filterMovements(
  movements: StockMovement[],
  opts: { search?: string; type?: MovementTypeFilter }
): StockMovement[] {
  const term = prepareSearchQuery(opts.search)
  return movements.filter((m) => {
    const matchesSearch =
      !term ||
      matchesAnySearchField(
        [m.productName, m.reason, m.performedByName],
        term
      )

    const matchesType =
      !opts.type || opts.type === "all" || m.type === opts.type

    return matchesSearch && matchesType
  })
}

export function countEntries(movements: StockMovement[]): number {
  return movements.filter((m) => m.delta > 0).length
}

export function countExits(movements: StockMovement[]): number {
  return movements.filter((m) => m.delta < 0).length
}

export function countTransfers(movements: StockMovement[]): number {
  return movements.filter(
    (m) => m.type === "TRANSFER_IN" || m.type === "TRANSFER_OUT"
  ).length
}

export function sumNetDelta(movements: StockMovement[]): number {
  return movements.reduce((acc, m) => acc + m.delta, 0)
}

export function getMovementsThisMonth(movements: StockMovement[]): StockMovement[] {
  const now = new Date()
  const start = startOfMonth(now)
  const end = endOfMonth(now)
  return movements.filter((m) => {
    const date = toMovementDate(m.timestamp)
    return date ? isWithinInterval(date, { start, end }) : false
  })
}

export function getMovementStats(movements: StockMovement[]) {
  const thisMonth = getMovementsThisMonth(movements)
  return {
    total: movements.length,
    monthCount: thisMonth.length,
    entries: countEntries(movements),
    exits: countExits(movements),
    transfers: countTransfers(movements),
    netDelta: sumNetDelta(movements),
  }
}
