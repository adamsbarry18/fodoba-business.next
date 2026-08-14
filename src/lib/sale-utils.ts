import type { Sale } from "@/lib/types"

export function toSaleDate(ts: Sale["timestamp"]): Date {
  return ts?.toDate ? ts.toDate() : new Date(ts)
}

export function isSaleInDateRange(sale: Sale, start: Date, end: Date): boolean {
  const ms = toSaleDate(sale.timestamp).getTime()
  return ms >= start.getTime() && ms <= end.getTime()
}

/** Ventes prises en compte dans CA / stats (hors annulations et remboursements). */
export function isSaleCountedInRevenue(sale: Sale): boolean {
  return sale.status === "COMPLETED"
}

export function canCancelOrCorrectSale(sale: Sale): boolean {
  return sale.status === "COMPLETED"
}

/** Reste dû sur une facture active (crédit non soldé). */
export function getSaleOpenDebt(sale: Sale): number {
  if (!isSaleCountedInRevenue(sale)) return 0
  return Math.max(0, Number(sale.debtAmount) || 0)
}

/** Encours créance = somme des restes dus des factures terminées. */
export function sumOpenSaleDebt(sales: Sale[]): number {
  return sales.reduce((acc, sale) => acc + getSaleOpenDebt(sale), 0)
}
