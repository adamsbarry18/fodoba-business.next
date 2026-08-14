
"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ReportService } from "@/services/report.service"
import { StoreService } from "@/services/store.service"
import { SaleService } from "@/services/sale.service"
import { Sale } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ArrowLeft,
  Download,
  Printer,
  Search,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Ban,
} from "lucide-react"
import Link from "next/link"
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
} from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/hooks/use-currency"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { TableListToolbar } from "@/components/ui/table-list-toolbar"
import { SALES_REPORT_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { SaleClientInfo } from "@/components/sales/sale-client-info"
import { PrintService } from "@/services/print.service"
import { getPrintLabels } from "@/lib/print-labels"
import { downloadSalesCsv } from "@/lib/sales-export-utils"
import {
  canCancelOrCorrectSale,
  canViewAllStoreSales,
  filterSalesForRole,
  computeSalesReportTotals,
} from "@/lib/sale-utils"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { RoleGuard } from "@/components/auth/role-guard"
import { PermissionGate } from "@/components/auth/permission-gate"
import { useSaleTicket } from "@/hooks/use-sale-ticket"
import { useReportStoreScope } from "@/hooks/use-report-store-scope"
import { REPORT_ALL_STORES } from "@/lib/report-utils"
import { useT } from "@/i18n/context"

const PAGE_SIZE = 50

type SalesPeriodPreset = "today" | "7d" | "30d" | "month"

function getSalesPeriodRange(preset: SalesPeriodPreset, now = new Date()) {
  switch (preset) {
    case "today":
      return {
        startDate: format(now, "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd"),
      }
    case "7d":
      return {
        startDate: format(subDays(now, 6), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd"),
      }
    case "month":
      return {
        startDate: format(startOfMonth(now), "yyyy-MM-dd"),
        endDate: format(endOfMonth(now), "yyyy-MM-dd"),
      }
    case "30d":
    default:
      return {
        startDate: format(subDays(now, 29), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd"),
      }
  }
}

const SALES_PERIOD_PRESETS: { id: SalesPeriodPreset; labelKey: string }[] = [
  { id: "today", labelKey: "reports.sales.period.today" },
  { id: "7d", labelKey: "reports.sales.period.7d" },
  { id: "30d", labelKey: "reports.sales.period.30d" },
  { id: "month", labelKey: "reports.sales.period.month" },
]

const SALES_REPORT_COLUMN_LABEL_KEYS: Record<string, string> = {
  date: "reports.sales.colDate",
  client: "reports.sales.colClient",
  store: "reports.sales.colStore",
  total: "reports.sales.colTotal",
  payment: "reports.sales.colPayment",
  status: "reports.sales.colStatus",
  actions: "reports.sales.colActions",
}

function SalesReportContent() {
  const t = useT()
  const router = useRouter()
  const { formatAmount } = useCurrency()
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const seeAllStoreSales = canViewAllStoreSales(userProfile?.role)
  const {
    storeId,
    setStoreId,
    stores,
    filter,
    showStoreFilter,
    showAllOption,
    canViewAllStores,
  } = useReportStoreScope()
  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState<Sale[]>([])
  const { printTicket, printingId } = useSaleTicket(stores)
  const [totals, setTotals] = useState({ revenue: 0, discount: 0, debt: 0, count: 0 })

  const defaultPreset: SalesPeriodPreset = seeAllStoreSales ? "30d" : "today"
  const defaultRange = getSalesPeriodRange(defaultPreset)
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [periodPreset, setPeriodPreset] = useState<SalesPeriodPreset | "custom">(defaultPreset)
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null)
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  const salesResetKey = `${startDate}|${endDate}|${storeId}|${sales.length}`
  const {
    paginatedItems: paginatedSales,
    page,
    setPage,
    totalPages,
    totalItems: salesTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(sales, { pageSize: PAGE_SIZE, resetKey: salesResetKey })

  const {
    isVisible,
    toggleColumn,
    resetColumns,
    columns: tableColumns,
    visibleColumnCount,
  } = useTranslatedTableColumns("sales-report", SALES_REPORT_TABLE_COLUMNS, SALES_REPORT_COLUMN_LABEL_KEYS)

  const allStoresLabel = t(
    canViewAllStores ? "reports.sales.storeAll" : "reports.sales.storeMine"
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (!filter) {
        const empty = ReportService.emptySalesReport()
        setSales(empty.sales)
        setTotals(empty.totals)
        return
      }
      const salesRes = await ReportService.getSalesReport({
        startDate: startOfDay(new Date(`${startDate}T00:00:00`)),
        endDate: endOfDay(new Date(`${endDate}T00:00:00`)),
        ...filter,
      })
      const visibleSales = filterSalesForRole(
        salesRes.sales,
        userProfile?.role,
        userProfile?.uid
      )
      setSales(visibleSales)
      setTotals(computeSalesReportTotals(visibleSales))
    } catch {
      toast.error(t("common.errorLoading"))
    } finally {
      setLoading(false)
    }
  }, [endDate, filter, startDate, t, userProfile?.role, userProfile?.uid])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const ensureActiveStoreForSale = (sale: Sale) => {
    if (!activeStore) {
      toast.error(t("reports.sales.needActiveStore"))
      return false
    }
    if (sale.storeId !== activeStore.id) {
      toast.error(t("reports.sales.wrongStore"))
      return false
    }
    return true
  }

  const handleCorrectSale = (sale: Sale) => {
    if (!ensureActiveStoreForSale(sale)) return
    router.push(`/pos?correctSaleId=${sale.id}`)
  }

  const handleConfirmCancel = async () => {
    if (!saleToCancel || !activeStore || !userProfile) return
    if (!ensureActiveStoreForSale(saleToCancel)) return

    setCancelling(true)
    try {
      const result = await SaleService.cancelSale({
        saleId: saleToCancel.id,
        store: activeStore,
        user: userProfile,
        reason: cancelReason.trim() || undefined,
      })
      if (result.debtNotReversed > 0) {
        toast.warning(
          t("reports.sales.cancelDebtPartial", {
            amount: formatAmount(result.debtNotReversed),
          })
        )
      } else {
        toast.success(t("reports.sales.cancelSuccess"))
      }
      setSaleToCancel(null)
      setCancelReason("")
      await loadData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("reports.sales.cancelError"))
    } finally {
      setCancelling(false)
    }
  }

  const handleExportCsv = () => {
    if (sales.length === 0) {
      toast.error(t("reports.sales.noSalesExport"))
      return
    }

    try {
      downloadSalesCsv(sales, stores, {
        walkIn: t("pos.walkInClient"),
        headers: {
          date: t("reports.sales.colDate"),
          ref: "Ref",
          client: t("reports.sales.colClient"),
          phone: t("common.phone"),
          clientType: t("clients.form.clientType"),
          seller: t("print.seller"),
          store: t("reports.sales.colStore"),
          total: t("reports.sales.colTotal"),
          status: t("reports.sales.colStatus"),
          payment: t("reports.sales.colPayment"),
        },
        paymentComplete: t("badges.salePayment.complete"),
        paymentPartial: t("badges.salePayment.partial"),
        clientTypeParticulier: t("badges.clientType.particulier"),
        clientTypeGrossiste: t("badges.clientType.grossiste"),
      })
      toast.success(t("reports.sales.exportCsvSuccess"))
    } catch {
      toast.error(t("reports.sales.exportError"))
    }
  }

  const handleExportPdf = async () => {
    if (sales.length === 0) {
      toast.error(t("reports.sales.noSalesExport"))
      return
    }

    setExporting("pdf")
    try {
      const reportStore =
        storeId === REPORT_ALL_STORES
          ? null
          : stores.find((store) => store.id === storeId) ??
            (await StoreService.getStore(storeId))

      await PrintService.generateSalesReport(
        sales,
        reportStore,
        {
          startDate: format(new Date(startDate), "dd/MM/yyyy"),
          endDate: format(new Date(endDate), "dd/MM/yyyy"),
          storeLabel:
            storeId === REPORT_ALL_STORES
              ? allStoresLabel
              : reportStore?.name || storeId,
        },
        getPrintLabels(t), formatAmount
      )
      toast.success(t("reports.sales.exportPdfSuccess"))
    } catch {
      toast.error(t("reports.sales.exportError"))
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/reports">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("reports.sales.title")}</h1>
            <p className="text-muted-foreground">
              {seeAllStoreSales
                ? t("reports.sales.subtitle")
                : t("reports.sales.mySalesOnly")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCsv} disabled={loading || exporting !== null}>
            <Download className="mr-2 h-4 w-4" /> {t("reports.sales.exportCsv")}
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={loading || exporting !== null}
          >
            {exporting === "pdf" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            {t("reports.sales.exportPdf")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {SALES_PERIOD_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant={periodPreset === preset.id ? "default" : "outline"}
                  className={cn(
                    "rounded-xl text-xs font-bold",
                    periodPreset === preset.id && "shadow-sm"
                  )}
                  onClick={() => {
                    const range = getSalesPeriodRange(preset.id)
                    setPeriodPreset(preset.id)
                    setStartDate(range.startDate)
                    setEndDate(range.endDate)
                  }}
                >
                  {t(preset.labelKey)}
                </Button>
              ))}
            </div>
            <div className={cn("grid gap-6", showStoreFilter ? "md:grid-cols-4" : "md:grid-cols-3")}>
              <div className="space-y-2">
                <Label>{t("reports.sales.startDate")}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setPeriodPreset("custom")
                    setStartDate(e.target.value)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("reports.sales.endDate")}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setPeriodPreset("custom")
                    setEndDate(e.target.value)
                  }}
                />
              </div>
              {showStoreFilter && (
                <div className="space-y-2">
                  <Label>{t("reports.sales.store")}</Label>
                  <Select value={storeId} onValueChange={setStoreId}>
                    <SelectTrigger>
                      <SelectValue placeholder={allStoresLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      {showAllOption && (
                        <SelectItem value={REPORT_ALL_STORES}>{allStoresLabel}</SelectItem>
                      )}
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-end">
                <Button className="w-full" onClick={loadData} disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  {t("reports.sales.filter")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-accent/20 bg-accent/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("reports.sales.statRevenue")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold font-headline text-accent">
              {formatAmount(totals.revenue)}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("reports.sales.statRevenueDesc", { count: totals.count })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("reports.sales.statDiscount")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold font-headline">{formatAmount(totals.discount)}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("reports.sales.statDiscountDesc")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("reports.sales.statCredit")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold font-headline text-destructive">
              {formatAmount(totals.debt)}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("reports.sales.statCreditDesc")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="animate-spin text-accent" />
            </div>
          ) : (
            <>
              <TableListToolbar
                summary={sales.length > 0 ? t("reports.sales.summary", { count: sales.length }) : undefined}
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
                  <TableRow>
                    <VisibleTableColumn id="date" isVisible={isVisible}>
                      <TableHead>{t("reports.sales.colDate")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="client" isVisible={isVisible}>
                      <TableHead>{t("reports.sales.colClient")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="store" isVisible={isVisible}>
                      <TableHead>{t("reports.sales.colStore")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="total" isVisible={isVisible}>
                      <TableHead className="text-right">{t("reports.sales.colTotal")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="payment" isVisible={isVisible}>
                      <TableHead className="text-center">{t("reports.sales.colPayment")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="status" isVisible={isVisible}>
                      <TableHead>{t("reports.sales.colStatus")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="actions" isVisible={isVisible}>
                      <TableHead className="text-right">{t("reports.sales.colActions")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={visibleColumnCount}
                        className="py-12 text-center text-muted-foreground"
                      >
                        {t("reports.sales.noSalesPeriod", {
                          start: format(new Date(`${startDate}T00:00:00`), "dd/MM/yyyy"),
                          end: format(new Date(`${endDate}T00:00:00`), "dd/MM/yyyy"),
                        })}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedSales.map((s) => (
                      <TableRow key={s.id}>
                        <VisibleTableColumn id="date" isVisible={isVisible}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold">
                                #{s.id.slice(-6).toUpperCase()}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {s.timestamp?.toDate
                                  ? format(s.timestamp.toDate(), "dd/MM/yy HH:mm")
                                  : "-"}
                              </span>
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="client" isVisible={isVisible}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <SaleClientInfo sale={s} showPhone={false} />
                              <span className="text-[9px] italic text-muted-foreground">
                                {t("reports.sales.bySeller", { name: s.sellerName })}
                              </span>
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="store" isVisible={isVisible}>
                          <TableCell className="text-xs">
                            {stores.find((st) => st.id === s.storeId)?.code || "N/A"}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="total" isVisible={isVisible}>
                          <TableCell className="text-right font-headline font-bold">
                            {formatAmount(s.total)}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="payment" isVisible={isVisible}>
                          <TableCell className="text-center">
                            {s.debtAmount > 0 ? (
                              <StatusBadge
                                preset="salePayment"
                                value="partial"
                                className="text-[9px] uppercase"
                              />
                            ) : (
                              <StatusBadge
                                preset="salePayment"
                                value="complete"
                                className="text-[9px] uppercase"
                              />
                            )}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="status" isVisible={isVisible}>
                          <TableCell>
                            <StatusBadge
                              preset="saleStatus"
                              value={s.status}
                              className="text-[9px] uppercase"
                            />
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="actions" isVisible={isVisible}>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  aria-label={t("reports.sales.actionsMenu")}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-xl">
                                <DropdownMenuItem
                                  className="gap-2"
                                  disabled={printingId === s.id}
                                  onClick={() => printTicket(s)}
                                >
                                  {printingId === s.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Printer className="h-3.5 w-3.5" />
                                  )}
                                  {t("pos.ticket.label")}
                                </DropdownMenuItem>
                                {canCancelOrCorrectSale(s) && (
                                  <>
                                    <RoleGuard permission="modify:sale">
                                      <DropdownMenuItem
                                        className="gap-2"
                                        onClick={() => handleCorrectSale(s)}
                                      >
                                        <PencilLine className="h-3.5 w-3.5" />
                                        {t("reports.sales.correct")}
                                      </DropdownMenuItem>
                                    </RoleGuard>
                                    <RoleGuard permission="cancel:sale">
                                      <DropdownMenuItem
                                        className="gap-2 text-destructive focus:text-destructive"
                                        onClick={() => {
                                          if (!ensureActiveStoreForSale(s)) return
                                          setSaleToCancel(s)
                                          setCancelReason("")
                                        }}
                                      >
                                        <Ban className="h-3.5 w-3.5" />
                                        {t("reports.sales.cancel")}
                                      </DropdownMenuItem>
                                    </RoleGuard>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </VisibleTableColumn>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={salesTotal}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!saleToCancel}
        onOpenChange={(open) => {
          if (!open && !cancelling) {
            setSaleToCancel(null)
            setCancelReason("")
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reports.sales.cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {saleToCancel
                ? t("reports.sales.cancelDesc", {
                    ref: saleToCancel.id.slice(-6).toUpperCase(),
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="cancel-reason" className="text-xs font-bold uppercase text-muted-foreground">
              {t("reports.sales.cancelReason")}
            </Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("reports.sales.cancelReasonPlaceholder")}
              className="rounded-xl"
              disabled={cancelling}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={cancelling}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmCancel()
              }}
            >
              {cancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("reports.sales.cancelConfirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function SalesReportPage() {
  return (
    <PermissionGate permission="view:reports:store">
      <SalesReportContent />
    </PermissionGate>
  )
}

