import type { Sale, Role } from "@/lib/types"

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

export function canViewAllStoreSales(role: Role | null | undefined): boolean {
  return role === "admin" || role === "manager"
}

export function filterSalesForRole(
  sales: Sale[],
  role: Role | null | undefined,
  uid: string | undefined
): Sale[] {
  if (canViewAllStoreSales(role)) return sales
  if (!uid) return []
  return sales.filter((sale) => sale.sellerId === uid)
}

export function computeSalesReportTotals(sales: Sale[]) {
  const counted = sales.filter(isSaleCountedInRevenue)
  return counted.reduce(
    (acc, sale) => ({
      revenue: acc.revenue + sale.total,
      discount: acc.discount + (sale.discount || 0),
      debt: acc.debt + (sale.debtAmount || 0),
      count: acc.count + 1,
    }),
    { revenue: 0, discount: 0, debt: 0, count: 0 }
  )
}
