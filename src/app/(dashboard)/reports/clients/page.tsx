
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
  Users,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useCurrency } from "@/hooks/use-currency"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useT } from "@/i18n/context"
import { PermissionGate } from "@/components/auth/permission-gate"

const PAGE_SIZE = 50

function ClientDebtReportContent() {
  const t = useT()
  const { formatAmount } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    summary: { totalClientDebt: number }
    clients: Array<{
      id: string
      name: string
      type: string
      status: string
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

  const clients = data?.clients ?? []

  const {
    paginatedItems: paginatedClients,
    page,
    setPage,
    totalPages,
    totalItems: clientsTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(clients, { pageSize: PAGE_SIZE })

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )
  }
  if (!data) return null

  const totalDebtors = clients.length

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
            <h1 className="text-3xl font-bold tracking-tight">{t("reports.clients.title")}</h1>
            <p className="text-muted-foreground">{t("reports.clients.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl font-bold">
            <Download className="mr-2 h-4 w-4" /> Excel
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
              {t("reports.clients.statTotalDebt")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="text-3xl font-bold font-headline text-destructive">
              {formatAmount(data.summary.totalClientDebt)}
            </div>
            <p className="mt-1 text-[10px] font-medium italic text-gray-400">
              {t("reports.clients.statTotalDebtDesc")}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[24px] border-none bg-white shadow-sm ring-1 ring-gray-100">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {t("reports.clients.statDebtors")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="text-3xl font-bold font-headline text-gray-900">{totalDebtors}</div>
            <p className="mt-1 text-[10px] font-medium text-gray-400">
              {t("reports.clients.statDebtorsDesc")}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[24px] border-none bg-white shadow-sm ring-1 ring-gray-100">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {t("reports.clients.statAvgRisk")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="text-3xl font-bold font-headline text-gray-900">
              {totalDebtors > 0
                ? formatAmount(data.summary.totalClientDebt / totalDebtors)
                : formatAmount(0)}
            </div>
            <p className="mt-1 text-[10px] font-medium text-gray-400">
              {t("reports.clients.statAvgRiskDesc")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-[24px] border-none bg-white shadow-sm ring-1 ring-gray-100">
        <CardHeader className="p-8">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t("reports.clients.detailTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="py-4 pl-8">{t("reports.clients.colName")}</TableHead>
                <TableHead>{t("reports.clients.colType")}</TableHead>
                <TableHead>{t("reports.clients.colStatus")}</TableHead>
                <TableHead className="pr-8 text-right">{t("reports.clients.colDebt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-20 text-center italic text-gray-400">
                    {t("reports.clients.noDebts")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClients.map((c) => (
                  <TableRow key={c.id} className="transition-colors hover:bg-gray-50/50">
                    <TableCell className="py-4 pl-8 font-bold text-gray-900">{c.name}</TableCell>
                    <TableCell>
                      <StatusBadge preset="clientType" value={c.type} className="text-[10px]" />
                    </TableCell>
                    <TableCell>
                      <StatusBadge preset="clientStatus" value={c.status} className="text-[10px]" />
                    </TableCell>
                    <TableCell className="pr-8 text-right font-headline font-bold text-destructive">
                      {formatAmount(c.currentDebt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={clientsTotal}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <div className="flex max-w-4xl items-start gap-4 rounded-2xl border border-amber-100 bg-amber-50 p-6">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-amber-900">{t("reports.clients.complianceTitle")}</p>
          <p className="text-[13px] leading-relaxed text-amber-700">
            {t("reports.clients.complianceDesc")}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ClientDebtReportPage() {
  return (
    <PermissionGate permission="view:reports:clients">
      <ClientDebtReportContent />
    </PermissionGate>
  )
}

