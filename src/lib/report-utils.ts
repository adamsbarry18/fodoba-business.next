import type { LucideIcon } from "lucide-react"
import {
  ShoppingCart,
  Package,
  History,
  Users,
  Truck,
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
]

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
