
"use client"

import { useState, useEffect, useCallback } from "react"
import { ReportService } from "@/services/report.service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  ArrowLeft,
  Download,
  Printer,
  Loader2,
  Truck,
  Globe,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useCurrency } from "@/hooks/use-currency"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useT } from "@/i18n/context"
import { PermissionGate } from "@/components/auth/permission-gate"

const PAGE_SIZE = 50

function SupplierDebtReportContent() {
  const t = useT()
  const { formatAmount } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    summary: { totalSupplierDebt: number }
    suppliers: Array<{
      id: string
      name: string
      type: string
      country: string
      currentDebt: number
    }>
  } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ReportService.getFinanceConsolidation()
      setData(res)
    } catch {
      toast.error(t("common.errorLoading"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const suppliers = data?.suppliers ?? []

  const {
    paginatedItems: paginatedSuppliers,
    page,
    setPage,
    totalPages,
    totalItems: suppliersTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(suppliers, { pageSize: PAGE_SIZE })

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-xl">
            <Link href="/reports">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("reports.suppliers.title")}</h1>
            <p className="text-muted-foreground">{t("reports.suppliers.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl font-bold">
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button className="rounded-xl bg-primary font-bold shadow-lg shadow-primary/20 hover:bg-primary/90">
            <Printer className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="overflow-hidden rounded-[24px] border-none bg-white shadow-sm ring-1 ring-gray-100">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {t("reports.suppliers.statTotalDebt")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="text-3xl font-bold font-headline text-orange-600">
              {formatAmount(data.summary.totalSupplierDebt)}
            </div>
            <p className="mt-1 text-[10px] font-medium text-gray-400">
              {t("reports.suppliers.statTotalDebtDesc")}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[24px] border-none bg-white shadow-sm ring-1 ring-gray-100">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {t("reports.suppliers.statImportLocal")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="text-3xl font-bold font-headline text-gray-900">
              {suppliers.filter((s) => s.type === "import").length} /{" "}
              {suppliers.filter((s) => s.type === "local").length}
            </div>
            <p className="mt-1 text-[10px] font-medium text-gray-400">
              {t("reports.suppliers.statImportLocalDesc")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[24px] border-none bg-white shadow-sm ring-1 ring-gray-100">
        <CardHeader className="p-8">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5 text-orange-500" />
            {t("reports.suppliers.detailTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="py-4 pl-8">{t("reports.suppliers.colName")}</TableHead>
                <TableHead>{t("reports.suppliers.colType")}</TableHead>
                <TableHead>{t("reports.suppliers.colCountry")}</TableHead>
                <TableHead className="pr-8 text-right">{t("reports.suppliers.colBalance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-20 text-center italic text-gray-400">
                    {t("reports.suppliers.noDebts")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSuppliers.map((s) => (
                  <TableRow key={s.id} className="transition-colors hover:bg-gray-50/50">
                    <TableCell className="py-4 pl-8 font-bold text-gray-900">{s.name}</TableCell>
                    <TableCell>
                      <StatusBadge
                        preset="supplierType"
                        value={s.type}
                        icon={s.type === "import" ? <Globe className="h-3 w-3" /> : undefined}
                        className="text-[10px]"
                      />
                    </TableCell>
                    <TableCell className="text-[13px] text-gray-500">{s.country}</TableCell>
                    <TableCell className="pr-8 text-right font-headline font-bold text-gray-900">
                      {formatAmount(s.currentDebt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={suppliersTotal}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default function SupplierDebtReportPage() {
  return (
    <PermissionGate permission="view:reports:suppliers">
      <SupplierDebtReportContent />
    </PermissionGate>
  )
}

