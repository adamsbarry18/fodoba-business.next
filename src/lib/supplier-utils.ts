import type { CurrencyCode, Supplier } from "@/lib/types"
import { CURRENCY_SELECT_OPTIONS } from "@/lib/constants/currencies"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export type SupplierTypeFilter = "all" | Supplier["type"]
export type SupplierDebtFilter = "all" | "with_debt" | "clear"
export type SupplierDeleteBlocker = "debt" | "purchases" | "payments"

export const SUPPLIER_CURRENCIES = CURRENCY_SELECT_OPTIONS

export const SUPPLIER_TYPES = [
  {
    value: "local" as const,
    label: "Local",
    description: "Fournisseur sous-régional ou national",
  },
  {
    value: "import" as const,
    label: "Import",
    description: "Partenaire international, devises étrangères",
  },
] as const

export function countSuppliersWithDebt(suppliers: Supplier[]): number {
  return suppliers.filter((s) => s.currentDebt > 0).length
}

export function countImportSuppliers(suppliers: Supplier[]): number {
  return suppliers.filter((s) => s.type === "import").length
}

export function sumSupplierDebt(suppliers: Supplier[]): number {
  return suppliers.reduce((acc, s) => acc + s.currentDebt, 0)
}

export function filterSuppliers(
  suppliers: Supplier[],
  opts: {
    search?: string
    type?: SupplierTypeFilter
    currency?: CurrencyCode | "all"
    debt?: SupplierDebtFilter
  }
): Supplier[] {
  const term = prepareSearchQuery(opts.search)
  return suppliers.filter((s) => {
    const matchesSearch =
      !term ||
      matchesAnySearchField(
        [s.name, s.country, s.city, s.paymentTerms],
        term
      )

    const matchesType =
      !opts.type || opts.type === "all" || s.type === opts.type
    const matchesCurrency =
      !opts.currency || opts.currency === "all" || s.defaultCurrency === opts.currency

    let matchesDebt = true
    if (opts.debt === "with_debt") matchesDebt = s.currentDebt > 0
    else if (opts.debt === "clear") matchesDebt = s.currentDebt <= 0

    return matchesSearch && matchesType && matchesCurrency && matchesDebt
  })
}

export function getSupplierDeleteBlockerMessageKey(blocker: SupplierDeleteBlocker): string {
  switch (blocker) {
    case "debt":
      return "suppliers.deleteBlocked.debt"
    case "purchases":
      return "suppliers.deleteBlocked.purchases"
    case "payments":
      return "suppliers.deleteBlocked.payments"
  }
}
