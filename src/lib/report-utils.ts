import type { LucideIcon } from "lucide-react"
import {
  ShoppingCart,
  Package,
  History,
  Users,
  Truck,
  Scale,
} from "lucide-react"
import type { Permission } from "@/lib/auth/permissions"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export type ReportCategory = "finance" | "logistics" | "clients"

export type ReportCard = {
  title: string
  description: string
  icon: LucideIcon
  href: string
  color: string
  bg: string
  permission: Permission
  category: ReportCategory
}

export const REPORT_CATEGORIES: { id: "all" | ReportCategory; labelKey: string }[] = [
  { id: "all", labelKey: "reports.categoryAll" },
  { id: "finance", labelKey: "reports.categoryFinance" },
  { id: "logistics", labelKey: "reports.categoryLogistics" },
  { id: "clients", labelKey: "reports.categoryClients" },
]

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  finance: "reports.categoryFinanceBadge",
  logistics: "reports.categoryLogisticsBadge",
  clients: "reports.categoryClientsBadge",
}

export const REPORT_CARDS: ReportCard[] = [
  {
    title: "reports.card.sales.title",
    description: "reports.card.sales.desc",
    icon: ShoppingCart,
    href: "/reports/sales",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    permission: "view:reports:store",
    category: "finance",
  },
  {
    title: "reports.card.inventory.title",
    description: "reports.card.inventory.desc",
    icon: Package,
    href: "/reports/inventory",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    permission: "view:stock",
    category: "logistics",
  },
  {
    title: "reports.card.cash.title",
    description: "reports.card.cash.desc",
    icon: History,
    href: "/reports/cash",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    permission: "view:reports:cash",
    category: "finance",
  },
  {
    title: "reports.card.clients.title",
    description: "reports.card.clients.desc",
    icon: Users,
    href: "/reports/clients",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    permission: "view:reports:clients",
    category: "clients",
  },
  {
    title: "reports.card.suppliers.title",
    description: "reports.card.suppliers.desc",
    icon: Truck,
    href: "/reports/suppliers",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    permission: "view:reports:suppliers",
    category: "logistics",
  },
  {
    title: "reports.card.finance.title",
    description: "reports.card.finance.desc",
    icon: Scale,
    href: "/reports/finance",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    permission: "view:reports:global",
    category: "finance",
  },
]

/** Valeur du filtre « toutes les boutiques » (admin) ou « toutes mes boutiques ». */
export const REPORT_ALL_STORES = "all"

/** Limite Firestore pour `where("storeId", "in", …)`. */
export const FIRESTORE_IN_QUERY_LIMIT = 30

export type ReportStoreQuery =
  | { kind: "empty" }
  | { kind: "unconstrained" }
  | { kind: "single"; storeId: string }
  | { kind: "in"; storeIds: string[] }

export type ReportStoreFilter = {
  storeId?: string
  storeIds?: string[]
}

/**
 * Périmètre Firestore d'un rapport :
 * - admin + « toutes » → aucune contrainte storeId (règles `isAdmin`)
 * - une boutique → `==`
 * - plusieurs boutiques assignées → `in` (max 30)
 * - vendeur/gérant sans boutique → pas de requête
 */
export function resolveReportStoreQuery(params: {
  selectedStoreId: string
  authorizedStoreIds: string[]
  canViewAllStores: boolean
}): ReportStoreQuery {
  const authorized = [...new Set(params.authorizedStoreIds.filter(Boolean))]
  const selected = params.selectedStoreId

  if (selected && selected !== REPORT_ALL_STORES) {
    if (!params.canViewAllStores && !authorized.includes(selected)) {
      return { kind: "empty" }
    }
    return { kind: "single", storeId: selected }
  }

  if (params.canViewAllStores) {
    return { kind: "unconstrained" }
  }

  if (authorized.length === 0) return { kind: "empty" }
  if (authorized.length === 1) return { kind: "single", storeId: authorized[0] }
  return { kind: "in", storeIds: authorized.slice(0, FIRESTORE_IN_QUERY_LIMIT) }
}

export function reportStoreQueryToFilter(
  query: ReportStoreQuery
): ReportStoreFilter | null {
  switch (query.kind) {
    case "empty":
      return null
    case "unconstrained":
      return {}
    case "single":
      return { storeId: query.storeId }
    case "in":
      return { storeIds: query.storeIds }
  }
}

export function filterReports(
  cards: ReportCard[],
  opts: {
    search?: string
    category?: "all" | ReportCategory
    can: (permission: Permission) => boolean
  }
): ReportCard[] {
  const term = prepareSearchQuery(opts.search)
  return cards.filter((report) => {
    if (!opts.can(report.permission)) return false
    const matchesCategory =
      !opts.category || opts.category === "all" || report.category === opts.category
    const matchesSearch =
      !term || matchesAnySearchField([report.title, report.description], term)
    return matchesCategory && matchesSearch
  })
}

export function countReportsByCategory(
  cards: ReportCard[],
  can: (permission: Permission) => boolean
) {
  const allowed = cards.filter((r) => can(r.permission))
  return {
    total: allowed.length,
    finance: allowed.filter((r) => r.category === "finance").length,
    logistics: allowed.filter((r) => r.category === "logistics").length,
    clients: allowed.filter((r) => r.category === "clients").length,
  }
}
