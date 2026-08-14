
"use client"

import { useState, useEffect, useCallback } from "react"
import { ReportService } from "@/services/report.service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft,
  Printer,
  Loader2,
  CircleDollarSign,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useCurrency } from "@/hooks/use-currency"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useT, useLocale } from "@/i18n/context"
import { getProductUnitLabel } from "@/lib/product-utils"
import { formatQuantity } from "@/lib/quantity-utils"
import { PermissionGate } from "@/components/auth/permission-gate"
import { useReportStoreScope } from "@/hooks/use-report-store-scope"
import { REPORT_ALL_STORES } from "@/lib/report-utils"

const PAGE_SIZE = 50

function InventoryReportContent() {
  const t = useT()
  const { locale } = useLocale()
  const { formatAmount } = useCurrency()
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
  const [items, setItems] = useState<
    Array<{
      id: string
      name: string
      sku: string
      stock: number
      unit: string
      unitCost: number
      valuation: number
    }>
  >([])
  const [totalValuation, setTotalValuation] = useState(0)

  const itemsResetKey = `${storeId}|${items.length}`
  const {
    paginatedItems,
    page,
    setPage,
    totalPages,
    totalItems: itemsTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(items, { pageSize: PAGE_SIZE, resetKey: itemsResetKey })

  const allStoresLabel = t(
    canViewAllStores ? "reports.inventory.storeAll" : "reports.inventory.storeMine"
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (!filter) {
        setItems([])
        setTotalValuation(0)
        return
      }
      const reportRes = await ReportService.getInventoryReport(filter)
      setItems(reportRes.items)
      setTotalValuation(reportRes.totalValuation)
    } catch {
      toast.error(t("common.errorGeneration"))
    } finally {
      setLoading(false)
    }
  }, [filter, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

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
            <h1 className="text-3xl font-bold tracking-tight">{t("reports.inventory.title")}</h1>
            <p className="text-muted-foreground">{t("reports.inventory.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> {t("reports.inventory.print")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {showStoreFilter && (
          <Card className="md:col-span-1">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground">
                {t("reports.inventory.storeFilter")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue />
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
            </CardContent>
          </Card>
        )}

        <Card className={`border-emerald-200 bg-emerald-50 ${showStoreFilter ? "md:col-span-3" : "md:col-span-4"}`}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center text-xs font-bold uppercase text-emerald-700">
              <CircleDollarSign className="mr-1 h-3 w-3" /> {t("reports.inventory.statTotalValue")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-headline font-bold text-emerald-800">
              {formatAmount(totalValuation)}
            </div>
            <p className="text-[10px] text-emerald-600">{t("reports.inventory.statTotalValueDesc")}</p>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("reports.inventory.colName")}</TableHead>
                    <TableHead>{t("reports.inventory.colSku")}</TableHead>
                    <TableHead className="text-center">{t("reports.inventory.colQuantity")}</TableHead>
                    <TableHead className="text-right">{t("reports.inventory.colUnitCost")}</TableHead>
                    <TableHead className="text-right">{t("reports.inventory.colStockValue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                        {t("reports.inventory.noProducts")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {item.sku}
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {formatQuantity(item.stock, locale)}{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {getProductUnitLabel(item.unit, t)}
                          </span>
                          {item.stock <= 0 && (
                            <span title={t("reports.inventory.outOfStock")}>
                              <AlertTriangle className="ml-1 inline h-3 w-3 text-destructive" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatAmount(item.unitCost)}
                        </TableCell>
                        <TableCell className="text-right font-headline font-bold text-accent">
                          {formatAmount(item.valuation)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={itemsTotal}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function InventoryReportPage() {
  return (
    <PermissionGate permission="view:stock">
      <InventoryReportContent />
    </PermissionGate>
  )
}
