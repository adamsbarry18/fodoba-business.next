
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { CashService } from "@/services/cash.service"
import { PrintService } from "@/services/print.service"
import { getPrintLabels } from "@/lib/print-labels"
import { CashSession, CashMovement } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Wallet,
  CheckCircle2,
  History,
  ArrowDownToLine,
  Loader2,
  Lock,
  Unlock,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  FileText,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { format } from "date-fns"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { runTransaction } from "firebase/firestore"
import { db } from "@/lib/firebase/client"
import { PAYMENT_METHOD_IDS } from "@/lib/constants/payment-methods"
import { usePaymentMethodLabel } from "@/hooks/use-payment-method-label"
import {
  getSessionTotals,
  getMovementStats,
  getCashAuditSummary,
} from "@/lib/cash-session-utils"
import {
  CashFundDialog,
  type CashFundFormValues,
} from "@/components/cash/cash-fund-dialog"
import { useCurrency } from "@/hooks/use-currency"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useT, useLocale } from "@/i18n/context"
import { getDateLocale } from "@/i18n/get-date-locale"

const MOVEMENTS_PAGE_SIZE = 25
const HISTORY_PAGE_SIZE = 25

const MOVEMENT_SOURCE_KEYS = [
  "SALE",
  "EXPENSE",
  "PURCHASE_PAYMENT",
  "CLIENT_PAYMENT",
  "ADJUSTMENT",
  "FUND_ENTRY",
  "FUND_WITHDRAWAL",
] as const

export default function ReconciliationPage() {
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = useMemo(() => getDateLocale(locale), [locale])
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const { formatAmount } = useCurrency()
  const paymentMethodLabel = usePaymentMethodLabel()

  const [activeSession, setActiveSession] = useState<CashSession | null>(null)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [history, setHistory] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  const [actualBalances, setActualBalances] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")

  const [isFundDialogOpen, setIsFundDialogOpen] = useState(false)

  const movementSourceLabel = useCallback(
    (source: CashMovement["source"]) => {
      const key = `reconciliation.movementSource.${source}` as const
      if (MOVEMENT_SOURCE_KEYS.includes(source as (typeof MOVEMENT_SOURCE_KEYS)[number])) {
        return t(key)
      }
      return source
    },
    [t]
  )

  const formatTimestamp = useCallback(
    (ts: { toDate?: () => Date } | undefined) => {
      if (!ts?.toDate) return "-"
      return format(ts.toDate(), "dd MMM yyyy HH:mm", { locale: dateLocale })
    },
    [dateLocale]
  )

  const loadData = useCallback(async () => {
    const storeId = activeStore?.id
    if (!storeId) {
      setActiveSession(null)
      setMovements([])
      setHistory([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [session, pastSessions] = await Promise.all([
        CashService.getActiveSession(storeId),
        CashService.listSessions(storeId, 10),
      ])
      setActiveSession(session)
      setHistory(pastSessions)

      if (session) {
        const moves = await CashService.getMovements(session.id, storeId)
        setMovements(moves)
        const initialActual: Record<string, string> = {}
        PAYMENT_METHOD_IDS.forEach((m) => {
          initialActual[m] = ""
        })
        setActualBalances(initialActual)
      } else {
        setMovements([])
      }
    } catch (error: unknown) {
      console.error("Reconciliation load error:", error)
      const message = error instanceof Error ? error.message : t("common.errorLoading")
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [activeStore?.id, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const movementStats = useMemo(() => getMovementStats(movements), [movements])

  const {
    paginatedItems: paginatedMovements,
    page: movementsPage,
    setPage: setMovementsPage,
    totalPages: movementsTotalPages,
    totalItems: movementsTotal,
    rangeStart: movementsRangeStart,
    rangeEnd: movementsRangeEnd,
  } = useClientPagination(movements, {
    pageSize: MOVEMENTS_PAGE_SIZE,
    resetKey: movements.length,
  })

  const {
    paginatedItems: paginatedHistory,
    page: historyPage,
    setPage: setHistoryPage,
    totalPages: historyTotalPages,
    totalItems: historyTotal,
    rangeStart: historyRangeStart,
    rangeEnd: historyRangeEnd,
  } = useClientPagination(history, {
    pageSize: HISTORY_PAGE_SIZE,
    resetKey: history.length,
  })

  const sessionTotalExpected = useMemo(() => {
    if (!activeSession) return 0
    return Object.values(activeSession.expectedBalances).reduce((a, b) => a + b, 0)
  }, [activeSession])

  const closureVariance = useMemo(() => {
    if (!activeSession) return 0
    return PAYMENT_METHOD_IDS.reduce((sum, method) => {
      const expected = activeSession.expectedBalances[method] || 0
      const actual = Number(actualBalances[method]) || 0
      if (actualBalances[method] === "") return sum
      return sum + (actual - expected)
    }, 0)
  }, [activeSession, actualBalances])

  const allBalancesFilled = useMemo(
    () => PAYMENT_METHOD_IDS.every((m) => actualBalances[m] !== ""),
    [actualBalances]
  )

  const handleOpenCash = async () => {
    if (!activeStore || !userProfile) return
    const initialBalances: Record<string, number> = {}
    PAYMENT_METHOD_IDS.forEach((m) => {
      initialBalances[m] = 0
    })

    setProcessing(true)
    try {
      await CashService.openSession(activeStore.id, userProfile, initialBalances)
      toast.success(t("reconciliation.openSuccess"))
      setNotes("")
      await loadData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("reconciliation.openError"))
    } finally {
      setProcessing(false)
    }
  }

  const handleCloseCash = async () => {
    if (!activeSession || !userProfile) return
    if (!allBalancesFilled) {
      toast.error(t("reconciliation.fillAllBeforeClose"))
      return
    }

    const formattedActual: Record<string, number> = {}
    PAYMENT_METHOD_IDS.forEach((m) => {
      formattedActual[m] = Number(actualBalances[m]) || 0
    })

    setProcessing(true)
    try {
      await CashService.closeSession(activeSession.id, userProfile, formattedActual, notes)
      toast.success(t("reconciliation.closeSuccess"))
      setNotes("")
      await loadData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("reconciliation.closeError"))
    } finally {
      setProcessing(false)
    }
  }

  const handleFundMovement = async (values: CashFundFormValues) => {
    if (!activeStore || !userProfile || !activeSession) return

    setProcessing(true)
    try {
      await runTransaction(db, async (transaction) => {
        await CashService.recordMovement(transaction, {
          sessionId: activeSession.id,
          storeId: activeStore.id,
          type: values.type,
          source: values.type === "IN" ? "FUND_ENTRY" : "FUND_WITHDRAWAL",
          amount: values.amount,
          method: values.method,
          user: userProfile,
          description: values.reason,
        })
      })
      toast.success(t("reconciliation.fundSuccess"))
      await loadData()
    } finally {
      setProcessing(false)
    }
  }

  const fillWithExpected = () => {
    if (!activeSession) return
    const next: Record<string, string> = {}
    PAYMENT_METHOD_IDS.forEach((m) => {
      next[m] = String(activeSession.expectedBalances[m] ?? 0)
    })
    setActualBalances(next)
    toast.info(t("reconciliation.expectedApplied"))
  }

  const handleExportPdf = async () => {
    if (!activeStore) return
    setExportingPdf(true)
    try {
      const sessions = await CashService.listSessions(activeStore.id, 50)
      if (sessions.length === 0) {
        toast.error(t("reconciliation.noSessionsToExport"))
        return
      }
      const summary = getCashAuditSummary(sessions)
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
      toast.success(t("reconciliation.exportSuccess"))
    } catch {
      toast.error(t("reconciliation.exportError"))
    } finally {
      setExportingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("reconciliation.syncing")}</p>
      </div>
    )
  }

  if (!activeStore) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <Wallet className="h-10 w-10 opacity-30" />
        <p>{t("reconciliation.selectStore")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{t("reconciliation.title")}</h1>
              <StatusBadge
                preset="cashSessionStatus"
                value={activeSession ? "OPEN" : "CLOSED"}
                className="text-[10px] font-bold uppercase"
              >
                {activeSession ? t("reconciliation.sessionOpen") : t("reconciliation.sessionClosed")}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("reconciliation.subtitle", { store: activeStore.name })}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("reconciliation.refresh")}
          </Button>
          <Button variant="outline" className="rounded-xl font-semibold" asChild>
            <Link href="/reports/cash">
              <FileText className="mr-2 h-4 w-4" />
              {t("reconciliation.auditReport")}
            </Link>
          </Button>

          {activeSession ? (
            <>
              <Button
                variant="outline"
                className="rounded-xl font-semibold"
                onClick={() => setIsFundDialogOpen(true)}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                {t("reconciliation.fundMovement")}
              </Button>
              <CashFundDialog
                open={isFundDialogOpen}
                onOpenChange={setIsFundDialogOpen}
                onSubmit={handleFundMovement}
              />
            </>
          ) : (
            <Button
              onClick={handleOpenCash}
              disabled={processing}
              className="rounded-xl font-semibold"
            >
              {processing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 h-4 w-4" />
              )}
              {t("reconciliation.openCash")}
            </Button>
          )}
        </div>
      </div>

      {!activeSession ? (
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-2xl border bg-muted/30 p-5">
              <Lock className="h-12 w-12 text-muted-foreground/40" />
            </div>
            <h3 className="text-xl font-bold">{t("reconciliation.cashClosed")}</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {t("reconciliation.cashClosedDesc")}
            </p>
            <Button
              onClick={handleOpenCash}
              disabled={processing}
              className="mt-6 rounded-xl font-semibold"
            >
              <Unlock className="mr-2 h-4 w-4" />
              {t("reconciliation.openCash")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl border border-primary/20 bg-primary/5 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  {t("reconciliation.currentSession")}
                </p>
                <p className="text-sm text-foreground">
                  {t("reconciliation.openedBy", {
                    name: activeSession.openedByName,
                    date: formatTimestamp(activeSession.openedAt),
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("reconciliation.totalExpected")}
                </p>
                <p className="text-2xl font-bold font-headline text-foreground">
                  {formatAmount(sessionTotalExpected)}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("reconciliation.statEntries")}
                  </p>
                  <p className="text-sm font-bold text-emerald-600">
                    +{formatAmount(movementStats.totalIn)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
                  <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("reconciliation.statExits")}
                  </p>
                  <p className="text-sm font-bold text-destructive">
                    −{formatAmount(movementStats.totalOut)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
                  <History className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("reconciliation.statMovements")}
                  </p>
                  <p className="text-2xl font-bold">{movementStats.count}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2 rounded-2xl border bg-card shadow-sm lg:col-span-1">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("reconciliation.statActiveLines")}
                  </p>
                  <p className="text-2xl font-bold">{PAYMENT_METHOD_IDS.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("reconciliation.expectedBalances")}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PAYMENT_METHOD_IDS.map((method) => (
                <Card key={method} className="rounded-2xl border bg-card shadow-sm">
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {paymentMethodLabel(method)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-lg font-bold font-headline sm:text-xl">
                      {formatAmount(activeSession.expectedBalances[method] || 0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("reconciliation.expectedShort")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-12 xl:items-stretch">
            <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm xl:col-span-8">
              <CardHeader className="shrink-0 border-b bg-muted/20 p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-5 w-5 text-primary" />
                  {t("reconciliation.movementsTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("reconciliation.movementsDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pl-4 text-xs uppercase sm:pl-6">
                            {t("reconciliation.colTime")}
                          </TableHead>
                          <TableHead className="text-xs uppercase">
                            {t("reconciliation.colSource")}
                          </TableHead>
                          <TableHead className="hidden text-xs uppercase sm:table-cell">
                            {t("reconciliation.colMethod")}
                          </TableHead>
                          <TableHead className="pr-4 text-right text-xs uppercase sm:pr-6">
                            {t("common.amount")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="py-16 text-center text-muted-foreground"
                            >
                              {t("reconciliation.noMovements")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedMovements.map((m) => (
                            <TableRow key={m.id} className="group">
                              <TableCell className="pl-4 font-mono text-xs text-muted-foreground sm:pl-6">
                                {m.timestamp?.toDate
                                  ? format(m.timestamp.toDate(), "HH:mm:ss")
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                <div className="min-w-[120px]">
                                  <p className="text-xs font-semibold">
                                    {movementSourceLabel(m.source)}
                                  </p>
                                  {m.description && (
                                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                                      {m.description}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-muted-foreground sm:hidden">
                                    {paymentMethodLabel(m.method)}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <StatusBadge
                                  preset="paymentMethod"
                                  value={m.method}
                                  className="text-[9px]"
                                />
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "pr-4 text-right font-bold sm:pr-6",
                                  m.type === "IN" ? "text-emerald-600" : "text-destructive"
                                )}
                              >
                                {m.type === "IN" ? "+" : "−"}
                                {formatAmount(m.amount)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                </div>
                <div className="mt-auto shrink-0 border-t">
                  <TablePagination
                    page={movementsPage}
                    totalPages={movementsTotalPages}
                    totalItems={movementsTotal}
                    rangeStart={movementsRangeStart}
                    rangeEnd={movementsRangeEnd}
                    onPageChange={setMovementsPage}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="flex h-full min-h-0 flex-col rounded-2xl border border-primary/20 bg-primary/5 shadow-sm xl:col-span-4 xl:sticky xl:top-6">
              <CardHeader className="shrink-0 p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-5 w-5 text-primary" />
                  {t("reconciliation.sessionClosure")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("reconciliation.closeCashDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col space-y-4 p-4 pt-0 sm:p-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl text-xs font-semibold"
                  onClick={fillWithExpected}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("reconciliation.fillExpected")}
                </Button>

                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("reconciliation.actualBalances")}
                </p>

                {PAYMENT_METHOD_IDS.map((method) => {
                  const expected = activeSession.expectedBalances[method] || 0
                  const actual = Number(actualBalances[method]) || 0
                  const variance =
                    actualBalances[method] === "" ? null : actual - expected

                  return (
                    <div
                      key={method}
                      className="space-y-1.5 rounded-xl border bg-background p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label
                          required
                          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                        >
                          {paymentMethodLabel(method)}
                        </Label>
                        <span className="shrink-0 text-[9px] font-semibold text-primary/80">
                          {t("reconciliation.expectedAbbrev")}{" "}
                          {formatAmount(expected)}
                        </span>
                      </div>
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          placeholder={t("reconciliation.countPlaceholder")}
                          className="h-10 rounded-xl pr-16 font-bold"
                          value={actualBalances[method]}
                          onChange={(e) =>
                            setActualBalances((prev) => ({
                              ...prev,
                              [method]: e.target.value,
                            }))
                          }
                        />
                        {variance !== null && (
                          <div
                            className={cn(
                              "absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[9px] font-bold",
                              variance === 0
                                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                                : "border border-destructive/20 bg-destructive/10 text-destructive"
                            )}
                          >
                            {variance === 0
                              ? t("reconciliation.varianceOk")
                              : `${variance > 0 ? "+" : ""}${formatAmount(Math.abs(variance))}`}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("reconciliation.closureNotes")}
                  </Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("reconciliation.notesPlaceholder")}
                    className="h-10 rounded-xl"
                  />
                </div>

                {allBalancesFilled && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-xl border p-3 text-xs",
                      closureVariance === 0
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700"
                        : "border-amber-500/20 bg-amber-500/5 text-amber-800"
                    )}
                  >
                    {closureVariance === 0 ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {t("reconciliation.totalVarianceLabel")}{" "}
                      <strong>
                        {closureVariance > 0 ? "+" : ""}
                        {formatAmount(Math.abs(closureVariance))}
                        {closureVariance < 0
                          ? t("reconciliation.varianceShortage")
                          : closureVariance > 0
                            ? t("reconciliation.varianceExcess")
                            : ""}
                      </strong>
                    </span>
                  </div>
                )}

                <Button
                  className="mt-auto h-11 w-full shrink-0 rounded-xl font-bold"
                  onClick={handleCloseCash}
                  disabled={processing || !allBalancesFilled}
                >
                  {processing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  {t("reconciliation.closeDay")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <CardTitle className="text-base">{t("reconciliation.historyTitle")}</CardTitle>
            <CardDescription className="text-xs">
              {t("reconciliation.historyDesc")}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl font-semibold"
            onClick={handleExportPdf}
            disabled={exportingPdf || history.length === 0}
          >
            {exportingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownToLine className="mr-2 h-4 w-4" />
            )}
            {t("reconciliation.exportPdf")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-xs uppercase sm:pl-6">
                  {t("reconciliation.colPeriod")}
                </TableHead>
                <TableHead className="text-xs uppercase">
                  {t("reconciliation.colCashier")}
                </TableHead>
                <TableHead className="text-right text-xs uppercase">
                  {t("reconciliation.expectedBalances")}
                </TableHead>
                <TableHead className="hidden text-right text-xs uppercase md:table-cell">
                  {t("reconciliation.actualBalances")}
                </TableHead>
                <TableHead className="text-center text-xs uppercase">
                  {t("reconciliation.variance")}
                </TableHead>
                <TableHead className="pr-4 text-xs uppercase sm:pr-6">
                  {t("common.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {t("reconciliation.noHistory")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedHistory.map((session) => {
                  const { totalExpected, totalActual, totalVar } = getSessionTotals(session)
                  const openedAt = session.openedAt?.toDate?.() ?? new Date()

                  return (
                    <TableRow key={session.id} className="group">
                      <TableCell className="pl-4 sm:pl-6">
                        <div>
                          <p className="text-xs font-semibold">
                            {format(openedAt, "dd MMM yyyy", { locale: dateLocale })}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(openedAt, "HH:mm")}
                            {session.closedAt
                              ? ` → ${format(session.closedAt.toDate(), "HH:mm")}`
                              : ` → ${t("reconciliation.sessionOngoing")}`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {session.openedByName}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatAmount(totalExpected)}
                      </TableCell>
                      <TableCell className="hidden text-right font-bold md:table-cell">
                        {formatAmount(totalActual)}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge
                          preset="cashVariance"
                          value={totalVar === 0 ? "conforme" : "variance"}
                          className="text-[9px] uppercase"
                        >
                          {totalVar === 0
                            ? undefined
                            : `${totalVar > 0 ? "+" : ""}${formatAmount(Math.abs(totalVar))}`}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="pr-4 sm:pr-6">
                        <StatusBadge
                          preset="cashSessionStatus"
                          value={session.status}
                          className="text-[9px] uppercase"
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <TablePagination
            page={historyPage}
            totalPages={historyTotalPages}
            totalItems={historyTotal}
            rangeStart={historyRangeStart}
            rangeEnd={historyRangeEnd}
            onPageChange={setHistoryPage}
          />
        </CardContent>
      </Card>
    </div>
  )
}
