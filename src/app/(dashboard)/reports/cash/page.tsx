
"use client"

import { useState, useEffect, useMemo } from "react"
import { CashService } from "@/services/cash.service"
import { PrintService } from "@/services/print.service"
import { getPrintLabels } from "@/lib/print-labels"
import { CashSession } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  ArrowLeft,
  Download,
  Loader2,
  History,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Wallet,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { format } from "date-fns"
import { useStore } from "@/lib/contexts/StoreContext"
import { getCashAuditSummary, getSessionTotals, toCashSessionDate, isCashSessionOpen } from "@/lib/cash-session-utils"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useT, useLocale } from "@/i18n/context"
import { useCurrency } from "@/hooks/use-currency"
import { getDateLocale } from "@/i18n/get-date-locale"
import { PermissionGate } from "@/components/auth/permission-gate"

const PAGE_SIZE = 25

function CashReportContent() {
  const t = useT()
  const { formatAmount } = useCurrency()
  const { locale } = useLocale()
  const dateLocale = useMemo(() => getDateLocale(locale), [locale])
  const { activeStore } = useStore()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [sessions, setSessions] = useState<CashSession[]>([])

  useEffect(() => {
    const load = async () => {
      const storeId = activeStore?.id
      if (!storeId) {
        setSessions([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await CashService.listSessions(storeId, 50)
        setSessions(res)
      } catch {
        toast.error(t("common.errorLoading"))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [activeStore?.id, t])

  const summary = useMemo(() => getCashAuditSummary(sessions), [sessions])

  const {
    paginatedItems: paginatedSessions,
    page,
    setPage,
    totalPages,
    totalItems: sessionsTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(sessions, { pageSize: PAGE_SIZE })

  const handleExportPdf = async () => {
    if (!activeStore) return
    if (sessions.length === 0) {
      toast.error(t("common.noSessionToExport"))
      return
    }
    setExporting(true)
    try {
      await PrintService.generateCashAuditReport(
        sessions,
        activeStore,
        {
          totalVariance: summary.totalVariance,
          reliabilityPercent: summary.reliabilityPercent,
        },
        getPrintLabels(t),
        formatAmount
      )
      toast.success(t("common.successExportPdfConsolidated"))
    } catch {
      toast.error(t("common.errorExportPdf"))
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!activeStore) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground">
        <Wallet className="h-10 w-10 opacity-30" />
        <p>{t("reports.cash.selectStore")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-xl">
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("reports.cash.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("reports.cash.subtitle", { store: activeStore.name })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="rounded-xl font-semibold"
          onClick={handleExportPdf}
          disabled={exporting || sessions.length === 0}
        >
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {t("reconciliation.exportPdf")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("reports.cash.statGlobalVariance", { count: summary.sessionCount })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold font-headline ${
                summary.totalVariance === 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {formatAmount(summary.totalVariance)}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("reports.cash.statGlobalVarianceDesc")}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("reports.cash.statReliability")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">
              {summary.reliabilityPercent}%
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("reports.cash.statReliabilityDetail", {
                conform: summary.conformCount,
                total: summary.closedCount || summary.sessionCount,
              })}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("reports.cash.statSessions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-headline text-foreground">
              {summary.sessionCount}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("reports.cash.statSessionsDetail", {
                closed: summary.closedCount,
                open: summary.sessionCount - summary.closedCount,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" />
            {t("reports.cash.journalTitle")}
          </CardTitle>
          <CardDescription>{t("reports.cash.journalDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="py-4 pl-6">{t("reports.cash.colDateOpen")}</TableHead>
                <TableHead>{t("reports.cash.colCashier")}</TableHead>
                <TableHead className="text-right">{t("reports.cash.colExpectedTotal")}</TableHead>
                <TableHead className="text-right">{t("reports.cash.colActualTotal")}</TableHead>
                <TableHead className="pr-6 text-center">{t("reports.cash.colStatusVariance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center italic text-muted-foreground">
                    {t("reports.cash.noSessions")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSessions.map((s) => {
                  const { totalExpected, totalActual, totalVar } = getSessionTotals(s)
                  const openedAt = toCashSessionDate(s.openedAt)

                  return (
                    <TableRow key={s.id} className="hover:bg-muted/20">
                      <TableCell className="py-4 pl-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">
                            {openedAt
                              ? format(openedAt, "dd MMM yyyy", { locale: dateLocale })
                              : "-"}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="h-2.5 w-2.5" />
                            {t("reports.cash.atTime", {
                              time: openedAt ? format(openedAt, "HH:mm") : "-",
                            })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.openedByName}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatAmount(totalExpected)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatAmount(totalActual)}
                      </TableCell>
                      <TableCell className="pr-6 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge
                            preset="cashVariance"
                            value={totalVar === 0 ? "conforme" : "variance"}
                            className="h-5 rounded-md text-[10px] uppercase"
                            icon={
                              totalVar === 0 ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <AlertCircle className="h-3 w-3" />
                              )
                            }
                          >
                            {totalVar === 0
                              ? undefined
                              : `${totalVar > 0 ? "+" : ""}${formatAmount(Math.abs(totalVar))}`}
                          </StatusBadge>
                          {isCashSessionOpen(s) && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-primary">
                              <ShieldCheck className="h-3 w-3" />
                              {t("reports.cash.sessionInProgress")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            totalPages={totalPages}
            totalItems={sessionsTotal}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default function CashReportPage() {
  return (
    <PermissionGate permission="view:reports:cash">
      <CashReportContent />
    </PermissionGate>
  )
}

