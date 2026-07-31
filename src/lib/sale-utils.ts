import type { Sale } from "@/lib/types"

/** Ventes prises en compte dans CA / stats (hors annulations et remboursements). */
export function isSaleCountedInRevenue(sale: Sale): boolean {
  return sale.status === "COMPLETED"
}

export function canCancelOrCorrectSale(sale: Sale): boolean {
  return sale.status === "COMPLETED"
}
