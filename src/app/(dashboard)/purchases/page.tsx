
"use client"

import { useState, useEffect, useMemo } from "react"
import { DocumentSnapshot } from "firebase/firestore"
import { PurchaseService } from "@/services/purchase.service"
import { Purchase } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Loader2,
  Truck,
  Eye,
  Edit,
  Calendar,
  User,
  Search,
  RefreshCw,
  Package,
  ClipboardList,
  CheckCircle2,
  Clock,
  MoreVertical,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { StatusBadge } from "@/components/ui/status-badge"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { useStore } from "@/lib/contexts/StoreContext"
import {
  formatPurchaseRef,
  PURCHASE_STATUS_ICONS,
  toPurchaseDate,
  canEditPurchase,
} from "@/lib/purchase-utils"
import { usePermissions } from "@/hooks/use-permissions"
import { cn } from "@/lib/utils"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { PURCHASE_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { useT } from "@/i18n/context"
import { useCurrency } from "@/hooks/use-currency"
import { matchesAnySearchField } from "@/lib/search-utils"

const PURCHASE_COLUMN_LABEL_KEYS: Record<string, string> = {
  ref: "purchases.colRefDate",
  supplier: "purchases.colSupplier",
  items: "purchases.colItems",
  total: "purchases.colTotalFcfa",
  status: "purchases.colStatus",
  actions: "purchases.colActions",
}

const PAGE_SIZE = 50

export default function PurchasesPage() {
  const { activeStore } = useStore()
  const { can } = usePermissions()
  const t = useT()
  const { formatAmount } = useCurrency()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<Purchase["status"] | "all">("all")

  const loadPurchases = async (options?: { loadMore?: boolean; reset?: boolean }) => {
    if (!activeStore) return
    const loadMore = options?.loadMore ?? false
    if (loadMore) setLoadingMore(true)
    else setLoading(true)

    try {
      const result = await PurchaseService.listPurchases(
        { storeId: activeStore.id },
        PAGE_SIZE,
        loadMore && !options?.reset ? lastDoc : undefined
      )

      if (loadMore) {
        setPurchases((prev) => [...prev, ...result.purchases])
      } else {
        setPurchases(result.purchases)
      }

      setLastDoc(result.lastVisible)
      setHasMore(result.purchases.length === PAGE_SIZE)
    } catch {
      toast.error(t("purchases.errorLoading"))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const storeId = activeStore?.id
    if (!storeId) {
      setPurchases([])
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchInitial = async () => {
      setLoading(true)
      try {
        const result = await PurchaseService.listPurchases(
          { storeId },
          PAGE_SIZE
        )
        if (cancelled) return
        setPurchases(result.purchases)
        setLastDoc(result.lastVisible)
        setHasMore(result.purchases.length === PAGE_SIZE)
      } catch {
        if (!cancelled) toast.error(t("purchases.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchInitial()
    return () => {
      cancelled = true
    }
  }, [activeStore?.id, t])

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const matchesSearch = matchesAnySearchField(
        [
          p.supplierName,
          p.performedByName,
          formatPurchaseRef(p.id),
          p.id,
        ],
        searchTerm
      )
      const matchesStatus = statusFilter === "all" || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [purchases, searchTerm, statusFilter])

  const { isVisible, toggleColumn, resetColumns, columns: tableColumns } =
    useTranslatedTableColumns("purchases", PURCHASE_TABLE_COLUMNS, PURCHASE_COLUMN_LABEL_KEYS)

  const stats = useMemo(
    () => ({
      total: purchases.length,
      draft: purchases.filter((p) => p.status === "DRAFT").length,
      ordered: purchases.filter((p) => p.status === "ORDERED").length,
      received: purchases.filter((p) => p.status === "RECEIVED").length,
      totalAmount: purchases.reduce((acc, p) => acc + p.totalFCFA, 0),
    }),
    [purchases]
  )

  const handleRefresh = async () => {
    setLastDoc(undefined)
    setHasMore(true)
    await loadPurchases({ reset: true })
  }

  if (!activeStore) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <Truck className="h-10 w-10 opacity-30" />
        <p>{t("purchases.selectStore")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-headline">
              {t("purchases.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("purchases.subtitle", { store: activeStore.name })}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
          <Button asChild className="rounded-xl font-semibold">
            <Link href="/purchases/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("purchases.newPurchase")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <ClipboardList className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("purchases.statTotal")}
              </p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-slate-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("purchases.statDraft")}
              </p>
              <p className="text-xl font-bold">{stats.draft}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <Truck className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("purchases.statOrdered")}
              </p>
              <p className="text-xl font-bold">{stats.ordered}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("purchases.statReceived")}
              </p>
              <p className="text-xl font-bold">{stats.received}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 rounded-2xl border bg-card shadow-sm lg:col-span-1">
          <CardContent className="flex items-center gap-3 p-4">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("purchases.statVolumeFcfa")}
              </p>
              <p className="text-sm font-bold">{formatAmount(stats.totalAmount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("purchases.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as Purchase["status"] | "all")}
          >
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-[200px]">
              <SelectValue placeholder={t("purchases.filterStatus")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("purchases.filterStatusAll")}</SelectItem>
              <SelectItem value="DRAFT">{t("badges.purchaseStatus.DRAFT")}</SelectItem>
              <SelectItem value="ORDERED">{t("badges.purchaseStatus.ORDERED")}</SelectItem>
              <SelectItem value="RECEIVED">{t("badges.purchaseStatus.RECEIVED")}</SelectItem>
              <SelectItem value="CANCELLED">{t("badges.purchaseStatus.CANCELLED")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 p-4 sm:p-6">
          <div>
            <CardTitle className="text-base">{t("purchases.historyTitle")}</CardTitle>
            <CardDescription className="text-xs">
              {searchTerm || statusFilter !== "all"
                ? t("purchases.listDescription", {
                    filtered: filteredPurchases.length,
                    total: purchases.length,
                  })
                : t("purchases.listDescriptionNoFilter", {
                    filtered: filteredPurchases.length,
                    total: purchases.length,
                  })}
            </CardDescription>
          </div>
          <TableColumnToggle
            columns={tableColumns}
            isVisible={isVisible}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-muted-foreground">
              <Truck className="h-10 w-10 opacity-30" />
              <p className="font-medium">{t("purchases.noPurchasesFound")}</p>
              <p className="text-xs">
                {purchases.length === 0
                  ? t("purchases.noPurchasesDesc")
                  : t("purchases.noPurchasesFilterDesc")}
              </p>
              {purchases.length === 0 && (
                <Button asChild className="mt-2 rounded-xl">
                  <Link href="/purchases/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("purchases.newPurchase")}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <VisibleTableColumn id="ref" isVisible={isVisible}>
                      <TableHead className="pl-4 sm:pl-6">{t("purchases.colRefDate")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="supplier" isVisible={isVisible}>
                      <TableHead>{t("purchases.colSupplier")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="items" isVisible={isVisible}>
                      <TableHead>{t("purchases.colItems")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="total" isVisible={isVisible}>
                      <TableHead className="text-right">{t("purchases.colTotalFcfa")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="status" isVisible={isVisible}>
                      <TableHead>{t("purchases.colStatus")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="actions" isVisible={isVisible}>
                      <TableHead className="pr-4 text-right sm:pr-6">{t("purchases.colActions")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map((p) => {
                    const date = toPurchaseDate(p.timestamp)
                    const StatusIcon = PURCHASE_STATUS_ICONS[p.status]

                    return (
                      <TableRow key={p.id} className="group transition-colors hover:bg-muted/20">
                        <VisibleTableColumn id="ref" isVisible={isVisible}>
                          <TableCell className="pl-4 sm:pl-6">
                            <Link
                              href={`/purchases/${p.id}`}
                              className="inline-block rounded-lg transition-colors hover:text-primary"
                            >
                              <p className="font-mono text-sm font-bold group-hover:text-primary">
                                {formatPurchaseRef(p.id)}
                              </p>
                              {date && (
                                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {format(date, "dd MMM yyyy", { locale: fr })}
                                </p>
                              )}
                            </Link>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="supplier" isVisible={isVisible}>
                          <TableCell>
                            <Link
                              href={`/purchases/${p.id}`}
                              className="block rounded-lg transition-colors hover:text-primary"
                            >
                              <p className="text-sm font-semibold group-hover:text-primary">
                                {p.supplierName}
                              </p>
                              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <User className="h-3 w-3" />
                                {p.performedByName}
                              </p>
                            </Link>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="items" isVisible={isVisible}>
                          <TableCell>
                            <StatusBadge tone="slate" className="text-[10px]">
                              {t("purchases.productCount", { count: p.items.length })}
                            </StatusBadge>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="total" isVisible={isVisible}>
                          <TableCell className="text-right font-headline font-bold">
                            {formatAmount(p.totalFCFA)}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="status" isVisible={isVisible}>
                          <TableCell>
                            <StatusBadge
                              preset="purchaseStatus"
                              value={p.status}
                              icon={<StatusIcon className="h-3 w-3" />}
                              className="text-[10px]"
                            />
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="actions" isVisible={isVisible}>
                          <TableCell className="pr-4 text-right sm:pr-6">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-44 rounded-xl p-2"
                              >
                                <DropdownMenuItem asChild className="rounded-lg">
                                  <Link
                                    href={`/purchases/${p.id}`}
                                    className="flex items-center gap-2"
                                  >
                                    <Eye className="h-4 w-4" />
                                    {t("purchases.viewDetail")}
                                  </Link>
                                </DropdownMenuItem>
                                {can("manage:purchases") && canEditPurchase(p.status) && (
                                  <DropdownMenuItem asChild className="rounded-lg">
                                    <Link
                                      href={`/purchases/${p.id}/edit`}
                                      className="flex items-center gap-2 text-primary"
                                    >
                                      <Edit className="h-4 w-4" />
                                      {t("common.edit")}
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </VisibleTableColumn>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {hasMore && !loading && filteredPurchases.length > 0 && (
            <div className="flex justify-center border-t p-4">
              <Button
                variant="ghost"
                onClick={() => loadPurchases({ loadMore: true })}
                disabled={loadingMore}
                className="rounded-xl font-semibold"
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("purchases.loadMore")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
