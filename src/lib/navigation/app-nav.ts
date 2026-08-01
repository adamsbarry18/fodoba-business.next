import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Wallet,
  Store as StoreIcon,
  Users,
  FolderTree,
  History,
  ArrowRightLeft,
  UsersRound,
  Truck,
  Coins,
  BarChart3,
  ShieldCheck,
  Receipt,
  Building2,
  Calculator,
} from "lucide-react"
import type { Permission } from "@/lib/auth/permissions"

export interface NavItem {
  title: string
  icon: LucideIcon
  url: string
  permission?: Permission
  description?: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const APP_NAVIGATION: NavGroup[] = [
  {
    title: "nav.general",
    items: [
      {
        title: "nav.home",
        icon: LayoutDashboard,
        url: "/dashboard",
        permission: "view:reports:store",
        description: "nav.homeDesc",
      },
    ],
  },
  {
    title: "nav.commercial",
    items: [
      {
        title: "nav.pos",
        icon: ShoppingCart,
        url: "/pos",
        permission: "create:sale",
        description: "nav.posDesc",
      },
      {
        title: "nav.purchases",
        icon: Truck,
        url: "/purchases",
        permission: "manage:purchases",
        description: "nav.purchasesDesc",
      },
      {
        title: "nav.inventory",
        icon: Package,
        url: "/inventory",
        permission: "view:stock",
        description: "nav.inventoryDesc",
      },
      {
        title: "nav.clients",
        icon: UsersRound,
        url: "/clients",
        permission: "view:clients",
        description: "nav.clientsDesc",
      },
    ],
  },
  {
    title: "nav.stockFlow",
    items: [
      {
        title: "nav.stockHistory",
        icon: History,
        url: "/inventory/history",
        permission: "view:stock",
        description: "nav.stockHistoryDesc",
      },
      {
        title: "nav.stockTransfer",
        icon: ArrowRightLeft,
        url: "/inventory/transfers/new",
        permission: "manage:transfers",
        description: "nav.stockTransferDesc",
      },
      {
        title: "nav.categories",
        icon: FolderTree,
        url: "/admin/categories",
        permission: "manage:catalog",
        description: "nav.categoriesDesc",
      },
    ],
  },
  {
    title: "nav.financeAnalysis",
    items: [
      {
        title: "nav.reports",
        icon: BarChart3,
        url: "/reports",
        permission: "view:reports:store",
        description: "nav.reportsDesc",
      },
      {
        title: "nav.cashTreasury",
        icon: Wallet,
        url: "/reconciliation",
        permission: "reconcile:cash",
        description: "nav.cashTreasuryDesc",
      },
      {
        title: "nav.expenses",
        icon: Receipt,
        url: "/expenses",
        permission: "manage:expenses",
        description: "nav.expensesDesc",
      },
      {
        title: "nav.suppliers",
        icon: Building2,
        url: "/suppliers",
        permission: "view:suppliers",
        description: "nav.suppliersDesc",
      },
      {
        title: "nav.landedCost",
        icon: Calculator,
        url: "/landed-cost",
        permission: "manage:purchases",
        description: "nav.landedCostDesc",
      },
    ],
  },
]

export const APP_ADMIN_NAV: NavItem[] = [
  {
    title: "nav.stores",
    icon: StoreIcon,
    url: "/admin/stores",
    permission: "manage:stores",
    description: "nav.storesDesc",
  },
  {
    title: "nav.users",
    icon: Users,
    url: "/admin/users",
    permission: "manage:users",
    description: "nav.usersDesc",
  },
  {
    title: "nav.currencies",
    icon: Coins,
    url: "/admin/currencies",
    permission: "manage:currencies",
    description: "nav.currenciesDesc",
  },
  {
    title: "nav.auditLogs",
    icon: ShieldCheck,
    url: "/admin/audit",
    permission: "manage:stores",
    description: "nav.auditLogsDesc",
  },
]

export function isNavItemActive(pathname: string, url: string): boolean {
  if (url === "/dashboard") return pathname === "/dashboard"
  return pathname === url || pathname.startsWith(`${url}/`)
}

export function findActiveNavItem(pathname: string, items: NavItem[]): NavItem | undefined {
  const matches = items.filter((item) => isNavItemActive(pathname, item.url))
  return matches.sort((a, b) => b.url.length - a.url.length)[0]
}

export function getAllNavItems(): NavItem[] {
  return [...APP_NAVIGATION.flatMap((group) => group.items), ...APP_ADMIN_NAV]
}
