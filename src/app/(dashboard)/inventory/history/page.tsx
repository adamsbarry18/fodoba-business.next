
"use client"

import { useState, useEffect, useMemo } from "react"
import { DocumentSnapshot } from "firebase/firestore"
import { InventoryService } from "@/services/inventory.service"
import { PrintService } from "@/services/print.service"
import { getPrintLabels } from "@/lib/print-labels"
import { StockMovement } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  History,
  Loader2,
  ArrowDownToLine,
  RefreshCw,
  PackageSearch,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Plus,
  Search,
} from "lucide-react"
import { useStore } from "@/lib/contexts/StoreContext"
import { format } from "date-fns"
import { toast } from "sonner"
import Link from "next/link"
import {
  filterMovements,
  getMovementStats,
  MOVEMENT_META,
  MOVEMENT_TYPE_ORDER,
  toMovementDate,
  type MovementTypeFilter,
} from "@/lib/stock-movement-utils"
import { cn } from "@/lib/utils"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { TableListToolbar } from "@/components/ui/table-list-toolbar"
import { STOCK_HISTORY_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { useT, useLocale } from "@/i18n/context"
import { getDateLocale } from "@/i18n/get-date-locale"

const PAGE_SIZE = 50

const STOCK_HISTORY_COLUMN_LABEL_KEYS: Record<string, string> = {
  date: "stockHistory.colDateTime",
  product: "stockHistory.colProduct",
  type: "stockHistory.colType",
  variation: "stockHistory.colVariation",
  finalStock: "stockHistory.colFinalStock",
  author: "stockHistory.colAuthor",
}

export default function StockHistoryPage() {
  const { activeStore } = useStore()
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = useMemo(() => getDateLocale(locale), [locale])

  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<MovementTypeFilter>("all")

  const { isVisible, toggleColumn, resetColumns, columns: tableColumns } =
    useTranslatedTableColumns(
      "stock-history",
      STOCK_HISTORY_TABLE_COLUMNS,
      STOCK_HISTORY_COLUMN_LABEL_KEYS
    )

  const loadMovements = async (options?: { loadMore?: boolean; reset?: boolean }) => {
    if (!activeStore) return
    const loadMore = options?.loadMore ?? false
    if (loadMore) setLoadingMore(true)
    else setLoading(true)

    try {
      const result = await InventoryService.listMovements(
        { storeId: activeStore.id },
        PAGE_SIZE,
        loadMore && !options?.reset ? lastDoc : undefined
      )

      if (loadMore) {
        setMovements((prev) => [...prev, ...result.movements])
      } else {
        setMovements(result.movements)
      }

      setLastDoc(result.lastVisible)
      setHasMore(result.movements.length === PAGE_SIZE)
    } catch {
      toast.error(t("stockHistory.errorLoading"))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const storeId = activeStore?.id
    if (!storeId) {
      setMovements([])
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchInitial = async () => {
      setLoading(true)
      try {
        const result = await InventoryService.listMovements(
          { storeId },
          PAGE_SIZE
        )
        if (cancelled) return
        setMovements(result.movements)
        setLastDoc(result.lastVisible)
        setHasMore(result.movements.length === PAGE_SIZE)
      } catch {
        if (!cancelled) toast.error(t("stockHistory.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchInitial()
    return () => {
      cancelled = true
    }
  }, [activeStore?.id, t])

  const filteredMovements = useMemo(
    () => filterMovements(movements, { search: searchTerm, type: typeFilter }),
    [movements, searchTerm, typeFilter]
  )

  const stats = useMemo(() => getMovementStats(movements), [movements])

  const handleExportPdf = async () => {
    if (!activeStore) return
    setExporting(true)
    try {
      const result = await InventoryService.listMovements(
        { storeId: activeStore.id },
        500
      )
      if (result.movements.length === 0) {
        toast.error(t("stockHistory.noMovementsToExport"))
        return
      }
      await PrintService.generateStockHistoryReport(
        result.movements,
        activeStore,
        getPrintLabels(t)
      )
      toast.success(t("stockHistory.exportSuccess"))
    } catch {
      toast.error(t("stockHistory.exportError"))
    } finally {
      setExporting(false)
    }
  }

  if (!activeStore) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <History className="h-10 w-10 opacity-30" />
        <p>{t("stockHistory.selectStore")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <History className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("stockHistory.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t.rich("stockHistory.subtitle", {
                store: activeStore.name,
                strong: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={() => loadMovements({ reset: true })}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("stockHistory.refresh")}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={handleExportPdf}
            disabled={exporting || loading}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownToLine className="mr-2 h-4 w-4" />
            )}
            {t("stockHistory.exportPdf")}
          </Button>
          <Button asChild className="rounded-xl font-semibold">
            <Link href="/inventory/transfers/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("stockHistory.newTransfer")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <History className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("stockHistory.statTotal")}
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">
                {stats.monthCount} {t("stockHistory.statMonth")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <ArrowDownLeft className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("stockHistory.statEntries")}
              </p>
              <p className="text-2xl font-bold">{stats.entries}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <ArrowUpRight className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("stockHistory.statExits")}
              </p>
              <p className="text-2xl font-bold">{stats.exits}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 rounded-2xl border bg-card shadow-sm lg:col-span-1">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-950/40">
              <TrendingUp className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("stockHistory.statNetDelta")}
              </p>
              <p
                className={cn(
                  "text-sm font-bold",
                  stats.netDelta >= 0 ? "text-emerald-600" : "text-destructive"
                )}
              >
                {stats.netDelta >= 0 ? "+" : ""}
                {stats.netDelta}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {t("stockHistory.statTransfers", { count: stats.transfers })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("stockHistory.searchPlaceholderExtended")}
              className="h-10 rounded-xl pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as MovementTypeFilter)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder={t("stockHistory.filterTypePlaceholder")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("stockHistory.filterTypeAll")}</SelectItem>
              {MOVEMENT_TYPE_ORDER.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`badges.stockMovement.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
              <PackageSearch className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-semibold">{t("stockHistory.noMovementsFound")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {movements.length === 0
                    ? t("stockHistory.noMovementsEmptyDesc")
                    : t("stockHistory.noMovementsFilterDescShort")}
                </p>
              </div>
              {movements.length === 0 && (
                <Button asChild className="rounded-xl font-semibold">
                  <Link href="/inventory/transfers/new">
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    {t("stockHistory.newTransfer")}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <TableListToolbar
                summary={
                  !loading && filteredMovements.length > 0
                    ? t("stockHistory.movementSummary", { count: filteredMovements.length })
                    : undefined
                }
                actions={
                  <TableColumnToggle
                    columns={tableColumns}
                    isVisible={isVisible}
                    onToggle={toggleColumn}
                    onReset={resetColumns}
                  />
                }
              />
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <VisibleTableColumn id="date" isVisible={isVisible}>
                      <TableHead>{t("stockHistory.colDateTime")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="product" isVisible={isVisible}>
                      <TableHead>{t("stockHistory.colProduct")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="type" isVisible={isVisible}>
                      <TableHead>{t("stockHistory.colType")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="variation" isVisible={isVisible}>
                      <TableHead className="text-center">{t("stockHistory.colVariation")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="finalStock" isVisible={isVisible}>
                      <TableHead className="text-center">{t("stockHistory.colFinalStock")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="author" isVisible={isVisible}>
                      <TableHead>{t("stockHistory.colAuthor")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map((move) => {
                    const date = toMovementDate(move.timestamp)
                    const meta = MOVEMENT_META[move.type]
                    const Icon = meta.Icon
                    return (
                      <TableRow key={move.id} className="group">
                        <VisibleTableColumn id="date" isVisible={isVisible}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {date
                              ? format(date, "dd/MM/yyyy HH:mm", { locale: dateLocale })
                              : "-"}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="product" isVisible={isVisible}>
                          <TableCell>
                            <div className="font-semibold">{move.productName}</div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="type" isVisible={isVisible}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <StatusBadge
                                preset="stockMovement"
                                value={move.type}
                                className="text-[10px]"
                              />
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="variation" isVisible={isVisible}>
                          <TableCell className="text-center">
                            <StatusBadge
                              preset="stockDelta"
                              value={move.delta > 0 ? "positive" : "negative"}
                              className="text-[10px] font-bold"
                            >
                              {move.delta > 0 ? `+${move.delta}` : move.delta}
                            </StatusBadge>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="finalStock" isVisible={isVisible}>
                          <TableCell className="text-center font-headline font-bold">
                            {move.newStock}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="author" isVisible={isVisible}>
                          <TableCell>
                            <div className="text-xs font-medium">{move.performedByName}</div>
                            {move.reason && (
                              <div className="mt-0.5 max-w-[200px] truncate text-[10px] text-muted-foreground">
                                {move.reason}
                              </div>
                            )}
                          </TableCell>
                        </VisibleTableColumn>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {hasMore && typeFilter === "all" && !searchTerm && (
                <div className="flex justify-center border-t p-4">
                  <Button
                    variant="outline"
                    className="rounded-xl font-semibold"
                    onClick={() => loadMovements({ loadMore: true })}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t("stockHistory.loadMoreShort")}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
