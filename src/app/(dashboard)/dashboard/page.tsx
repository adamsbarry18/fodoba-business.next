
"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useAuth } from "@/lib/contexts/AuthContext"
import { useStore } from "@/lib/contexts/StoreContext"
import { useCurrency } from "@/hooks/use-currency"
import { usePermissions } from "@/hooks/use-permissions"
import { fetchWithCache } from "@/lib/cache/client-cache"
import { SaleService } from "@/services/sale.service"
import { ClientService } from "@/services/client.service"
import { SupplierService } from "@/services/supplier.service"
import { ProductService } from "@/services/product.service"
import { CashService } from "@/services/cash.service"
import { Sale, Client, Supplier, CashSession, Product } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  ShoppingCart,
  Truck,
  CreditCard,
  Loader2,
  Calendar,
  AlertTriangle,
  ChevronRight,
  LayoutDashboard,
  RefreshCw,
  Wallet,
  Package,
  BarChart3,
  ArrowRightLeft,
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import Link from "next/link"
import { format } from "date-fns"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import { SaleClientInfo } from "@/components/sales/sale-client-info"
import { toast } from "sonner"
import {
  DASHBOARD_TIME_RANGES,
  getDashboardStats,
  type DashboardTimeRange,
} from "@/lib/dashboard-utils"
import { getProductUnitLabel, getStockStatus } from "@/lib/product-utils"
import { cn } from "@/lib/utils"
import { useT, useLocale } from "@/i18n/context"
import { getDateLocale } from "@/i18n/get-date-locale"
import { FirstStoreOnboarding } from "@/components/auth/first-store-onboarding"

interface LowStockItem extends Product {
  currentStock: number
}

export default function DashboardPage() {
  const { userProfile, isAdmin } = useAuth()
  const { can } = usePermissions()
  const { activeStore, availableStores } = useStore()
  const { formatAmount } = useCurrency()
  const canViewSupplierDebts = can("view:reports:suppliers")
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("7d")
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = useMemo(() => getDateLocale(locale), [locale])

  const [sales, setSales] = useState<Sale[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([])
  const [cashSession, setCashSession] = useState<CashSession | null>(null)

  const chartConfig = useMemo(() => ({
    sales: {
      label: t("dashboard.chartLabel"),
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig), [t])

  const loadDashboardData = useCallback(async () => {
    const uid = userProfile?.uid
    const storeId = activeStore?.id
    if (!uid || !storeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [clientsRes, suppliersRes, salesRes, sessionRes, productsRes] = await Promise.all([
        fetchWithCache("clients:list", () => ClientService.listClients(), 120_000),
        canViewSupplierDebts
          ? fetchWithCache("suppliers:list", () => SupplierService.listSuppliers(), 120_000)
          : Promise.resolve([] as Supplier[]),
        SaleService.listRecentSales(storeId, 200),
        CashService.getActiveSession(storeId),
        fetchWithCache(`products:active:${storeId}`, () => ProductService.listProducts({ active: true }, 100), 60_000),
      ])

      setClients(clientsRes)
      setSuppliers(suppliersRes)
      setSales(salesRes.sales)
      setCashSession(sessionRes)

      const productIds = productsRes.products.map((p) => p.id)
      const stocks = await ProductService.getStockLevelsForProducts(
        productIds,
        storeId
      )

      const alerts = productsRes.products
        .map((p) => ({ ...p, currentStock: stocks[p.id] || 0 }))
        .filter((p) => {
          const status = getStockStatus(p.currentStock, p.lowStockThreshold)
          return status === "low" || status === "out"
        })
        .sort((a, b) => a.currentStock - b.currentStock)

      setLowStockItems(alerts)
    } catch {
      toast.error(t("dashboard.loadError"))
    } finally {
      setLoading(false)
    }
  }, [userProfile?.uid, activeStore?.id, canViewSupplierDebts, t])

  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  const stats = useMemo(
    () => getDashboardStats(sales, clients, suppliers, timeRange, cashSession, dateLocale),
    [sales, clients, suppliers, timeRange, cashSession, dateLocale]
  )

  if (!activeStore) {
    if (isAdmin && availableStores.length === 0) {
      return <FirstStoreOnboarding userName={userProfile?.firstName} />
    }
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <LayoutDashboard className="h-10 w-10 opacity-30" />
        <p>{t("dashboard.selectStore")}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("dashboard.loadingDashboard")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <LayoutDashboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary/70">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: dateLocale })}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("dashboard.greetingPrefix")}{" "}
              <span className="text-primary">{userProfile?.firstName || ""}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {t("dashboard.overview")} -{" "}
                <strong className="text-foreground">{activeStore.name}</strong>
              </span>
              <StatusBadge
                preset="cashSessionStatus"
                value={stats.isCashOpen ? "OPEN" : "CLOSED"}
                className="text-[9px] uppercase"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={loadDashboardData}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
          <Select
            value={timeRange}
            onValueChange={(v) => setTimeRange(v as DashboardTimeRange)}
          >
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-[200px]">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <SelectValue placeholder={t("common.period")} />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {DASHBOARD_TIME_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {t(r.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild className="rounded-xl font-semibold">
            <Link href="/pos">
              <ShoppingCart className="mr-2 h-4 w-4" />
              {t("common.sale")}
            </Link>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          canViewSupplierDebts ? "xl:grid-cols-4" : "xl:grid-cols-3"
        )}
      >
        <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("dashboard.storeRevenue")}
              </p>
              <p className="truncate text-sm font-bold">{formatAmount(stats.periodRevenue)}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {t("dashboard.salesCount", { count: stats.salesCount })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <CreditCard className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("dashboard.clientDebts")}
              </p>
              <p className="truncate text-sm font-bold text-destructive">
                {formatAmount(stats.totalClientDebt)}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{t("common.globalNetwork")}</p>
            </div>
          </CardContent>
        </Card>

        {canViewSupplierDebts && (
          <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
            <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
                <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("dashboard.supplierDebts")}
                </p>
                <p className="truncate text-sm font-bold">{formatAmount(stats.totalSupplierDebt)}</p>
                <p className="truncate text-[10px] text-muted-foreground">{t("common.globalFodoba")}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("dashboard.cashRegister")}
              </p>
              <p className="truncate text-sm font-bold">{formatAmount(stats.cashCash)}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {t("dashboard.totalCash", { amount: formatAmount(stats.cashTotal) })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild className="rounded-xl">
          <Link href="/inventory">
            <Package className="mr-1.5 h-3.5 w-3.5" />
            {t("dashboard.catalog")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="rounded-xl">
          <Link href="/reconciliation">
            <Wallet className="mr-1.5 h-3.5 w-3.5" />
            {t("dashboard.treasury")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="rounded-xl">
          <Link href="/reports">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            {t("dashboard.reports")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="rounded-xl">
          <Link href="/inventory/transfers/new">
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
            {t("dashboard.stockTransfer")}
          </Link>
        </Button>
      </div>

      {lowStockItems.length > 0 && (
        <Card className="overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-amber-500/10 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-500/10 p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-base">{t("dashboard.stockAlerts")}</CardTitle>
                <CardDescription className="text-xs">
                  {t("dashboard.productsAtStore", { count: lowStockItems.length, code: activeStore.code })}
                </CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" asChild className="rounded-xl text-xs font-semibold">
              <Link href="/inventory">
                {t("common.viewAll")} <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 p-4 sm:grid-cols-2 sm:p-6">
            {lowStockItems.slice(0, 4).map((item) => {
              const status = getStockStatus(item.currentStock, item.lowStockThreshold)
              return (
                <Link key={item.id} href={`/inventory/${item.id}`}>
                  <div className="flex items-center justify-between rounded-xl border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-muted/30">
                    <span className="truncate text-sm font-semibold">{item.name}</span>
                    <StatusBadge
                      tone={status === "out" ? "destructive" : "warning"}
                      className="shrink-0 font-mono text-[10px]"
                    >
                      {item.currentStock} {getProductUnitLabel(item.unit, t)}
                    </StatusBadge>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:col-span-4">
          <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
            <CardTitle className="text-base">{t("dashboard.performance", { code: activeStore.code })}</CardTitle>
            <CardDescription className="text-xs">
              {t("dashboard.revenueEvolution")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
              <LineChart data={stats.chartData} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="name"
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v / 1000}k`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--color-sales)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-sales)" }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm lg:col-span-3">
          <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
            <CardTitle className="text-base">{t("dashboard.recentSales")}</CardTitle>
            <CardDescription className="text-xs">{t("dashboard.recentTransactions")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-4 sm:p-6">
            {sales.slice(0, 6).map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between rounded-xl p-3"
              >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-mono text-xs font-bold">#{sale.id.slice(-6)}</p>
                      <SaleClientInfo
                        sale={sale}
                        showType={false}
                        showPhone={false}
                        nameClassName="text-[11px] text-muted-foreground font-normal"
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatAmount(sale.total)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {sale.timestamp?.toDate
                        ? format(sale.timestamp.toDate(), "HH:mm")
                        : "-"}
                    </p>
                  </div>
                </div>
            ))}
            {sales.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {t("dashboard.noRecentSales", { name: activeStore.name })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
