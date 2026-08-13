"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useCurrency } from "@/hooks/use-currency"
import { CurrencyService } from "@/services/currency.service"
import { useAuth } from "@/lib/contexts/AuthContext"
import { usePermissions } from "@/hooks/use-permissions"
import { CurrencyCode, ExchangeRate } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Coins,
  Loader2,
  Info,
  TrendingUp,
  ArrowRightLeft,
  RefreshCw,
  Pencil,
  ShieldCheck,
  Clock,
  User,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  CURRENCY_META,
  CURRENCY_ORDER,
  editableCurrencies,
  formatRate,
  isReferenceCurrency,
  rateBetween,
  validateRate,
} from "@/lib/currency-utils"
import { cn } from "@/lib/utils"
import { useT, useLocale } from "@/i18n/context"
import { getDateLocale } from "@/i18n/get-date-locale"

function toDate(ts: ExchangeRate["lastUpdated"]): Date | null {
  if (!ts) return null
  if (typeof ts === "object" && ts !== null && "toDate" in ts && typeof ts.toDate === "function") {
    return ts.toDate()
  }
  return new Date(ts as Date | string)
}

export default function CurrenciesAdminPage() {
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = getDateLocale(locale)

  const {
    rates,
    referenceCurrency,
    refreshRates,
    setReferenceCurrency,
    formatAmount,
    toStorage,
    fromStorage,
  } = useCurrency()
  const { userProfile } = useAuth()
  const { can } = usePermissions()
  const canManage = can("manage:currencies")

  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [editCode, setEditCode] = useState<CurrencyCode | null>(null)
  const [newRate, setNewRate] = useState("")
  const [simAmount, setSimAmount] = useState("100")
  const [simCurrency, setSimCurrency] = useState<CurrencyCode>("USD")
  const [pendingRef, setPendingRef] = useState<CurrencyCode | null>(null)
  const [savingRef, setSavingRef] = useState(false)

  const editable = useMemo(
    () => editableCurrencies(referenceCurrency),
    [referenceCurrency]
  )

  const translateValidationError = useCallback(
    (error: string) => (error.startsWith("currencies.") ? t(error) : error),
    [t]
  )

  const loadExchangeRates = useCallback(async () => {
    setLoading(true)
    try {
      const data = await CurrencyService.getExchangeRates()
      setExchangeRates(data)
      await refreshRates()
    } catch {
      toast.error(t("currencies.errorLoading"))
    } finally {
      setLoading(false)
    }
  }, [refreshRates, t])

  useEffect(() => {
    void loadExchangeRates()
  }, [loadExchangeRates])

  const lastUpdate = useMemo(() => {
    const dates = exchangeRates
      .map((r) => toDate(r.lastUpdated))
      .filter((d): d is Date => d !== null)
    if (dates.length === 0) return null
    return dates.sort((a, b) => b.getTime() - a.getTime())[0]!
  }, [exchangeRates])

  const openEdit = (code: CurrencyCode) => {
    const displayed = rateBetween(code, referenceCurrency, rates)
    setEditCode(code)
    setNewRate(String(displayed))
  }

  const closeEdit = () => {
    setEditCode(null)
    setNewRate("")
  }

  const handleUpdate = async () => {
    if (!userProfile || !editCode) return

    const parsed = Number(newRate)
    const validationError = validateRate(parsed)
    if (validationError) {
      toast.error(translateValidationError(validationError))
      return
    }

    setUpdating(true)
    try {
      await CurrencyService.updateDisplayedRate(
        editCode,
        parsed,
        referenceCurrency,
        rates,
        userProfile
      )
      toast.success(t("currencies.rateUpdatedSuccess", { code: editCode }))
      closeEdit()
      await loadExchangeRates()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("currencies.updateError")
      toast.error(translateValidationError(message))
    } finally {
      setUpdating(false)
    }
  }

  const handleConfirmReference = async () => {
    if (!pendingRef || !userProfile) return
    setSavingRef(true)
    try {
      await setReferenceCurrency(pendingRef)
      toast.success(t("currencies.referenceUpdated", { code: pendingRef }))
      setPendingRef(null)
      await loadExchangeRates()
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("currencies.referenceUpdateError")
      toast.error(message)
    } finally {
      setSavingRef(false)
    }
  }

  const simValue = Number(simAmount) || 0
  const simInStorage = toStorage(simValue, simCurrency)
  const simInReference = fromStorage(simInStorage, referenceCurrency)
  const simReverse = fromStorage(10_000, simCurrency)

  const currentEditRate = editCode
    ? rateBetween(editCode, referenceCurrency, rates)
    : 0

  const isListLoading = loading

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Coins className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("currencies.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("currencies.subtitle", { currency: referenceCurrency })}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="rounded-xl font-semibold"
          onClick={loadExchangeRates}
          disabled={isListLoading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", isListLoading && "animate-spin")} />
          {t("currencies.refresh")}
        </Button>
      </div>

      {canManage && (
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold">{t("currencies.referenceSettingTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("currencies.referenceSettingDesc")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={referenceCurrency}
                onValueChange={(v) => {
                  const code = v as CurrencyCode
                  if (code !== referenceCurrency) setPendingRef(code)
                }}
              >
                <SelectTrigger className="h-10 w-[200px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {CURRENCY_ORDER.map((code) => (
                    <SelectItem key={code} value={code}>
                      {t(CURRENCY_META[code].labelKey)} ({code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("currencies.statPivot")}
              </p>
              <p className="text-lg font-bold">{referenceCurrency}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
              <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("currencies.statActive")}
              </p>
              <p className="text-2xl font-bold">{CURRENCY_ORDER.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <Pencil className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("currencies.statEditable")}
              </p>
              <p className="text-2xl font-bold">{editable.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <Clock className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("currencies.statLastUpdate")}
              </p>
              <p className="text-sm font-bold">
                {lastUpdate
                  ? format(lastUpdate, "dd MMM yyyy HH:mm", { locale: dateLocale })
                  : "-"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                {t("currencies.currentRates")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("currencies.currentRatesDesc", { currency: referenceCurrency })}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isListLoading ? (
                <div className="flex justify-center p-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4 sm:pl-6">{t("currencies.colCurrency")}</TableHead>
                        <TableHead className="text-right">
                          {t("currencies.colRate", { currency: referenceCurrency })}
                        </TableHead>
                        <TableHead className="hidden md:table-cell">{t("currencies.colLastUpdate")}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t("currencies.colUpdatedBy")}</TableHead>
                        <TableHead className="pr-4 text-right sm:pr-6">{t("currencies.colAction")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeRates.map((rate) => {
                        const meta = CURRENCY_META[rate.code]
                        const Icon = meta.icon
                        const updatedAt = toDate(rate.lastUpdated)
                        const isRef = isReferenceCurrency(rate.code, referenceCurrency)
                        const displayed = rateBetween(rate.code, referenceCurrency, rates)

                        return (
                          <TableRow
                            key={rate.code}
                            className={cn(
                              "transition-colors hover:bg-muted/20",
                              isRef && "bg-primary/5"
                            )}
                          >
                            <TableCell className="pl-4 sm:pl-6">
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                    isRef
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold">{t(meta.labelKey)}</p>
                                  <StatusBadge tone={meta.tone} className="mt-1 text-[10px]">
                                    {rate.code}
                                  </StatusBadge>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <p className="font-mono text-sm font-bold">
                                {isRef
                                  ? t("currencies.rateReference")
                                  : formatRate(displayed, rate.code)}
                              </p>
                              {!isRef && displayed > 0 && (
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {t("currencies.reverseRate", {
                                    rate: formatRate(1 / displayed, rate.code),
                                    code: rate.code,
                                    currency: referenceCurrency,
                                  })}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                              {updatedAt
                                ? format(updatedAt, "dd MMM yyyy HH:mm", { locale: dateLocale })
                                : "-"}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {rate.updatedBy && rate.updatedBy !== "-" ? (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  {rate.updatedBy}
                                </div>
                              ) : (
                                <span className="text-xs italic text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="pr-4 text-right sm:pr-6">
                              {!isRef && canManage ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg text-xs font-semibold"
                                  onClick={() => openEdit(rate.code)}
                                >
                                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                  {t("currencies.edit")}
                                </Button>
                              ) : isRef ? (
                                <StatusBadge tone="slate" className="text-[10px]">
                                  {t("currencies.reference")}
                                </StatusBadge>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-dashed bg-muted/20 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 text-primary" />
                {t("currencies.infoTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0 text-xs leading-relaxed text-muted-foreground">
              <p>{t("currencies.infoPivot", { currency: referenceCurrency })}</p>
              <p>{t("currencies.infoImpact")}</p>
              <p>{t("currencies.infoAudit")}</p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card className="sticky top-4 rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                {t("currencies.simulatorTitle")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("currencies.simulatorDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("currencies.amount")}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  className="h-10 rounded-xl font-bold"
                  placeholder="100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("currencies.sourceCurrency")}
                </Label>
                <Select
                  value={simCurrency}
                  onValueChange={(v) => setSimCurrency(v as CurrencyCode)}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {CURRENCY_ORDER.map((code) => (
                      <SelectItem key={code} value={code}>
                        {t(CURRENCY_META[code].labelKey)} ({code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-xl border bg-primary/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("currencies.equivalentRef", { currency: referenceCurrency })}
                </p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {formatAmount(simInStorage)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("currencies.simFormula", {
                    amount: simValue.toLocaleString(locale),
                    code: simCurrency,
                    rate: formatRate(
                      rateBetween(simCurrency, referenceCurrency, rates),
                      simCurrency
                    ),
                    result: simInReference.toLocaleString(locale),
                    currency: referenceCurrency,
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t("currencies.quickRefTitle")}
                </p>
                {editable.map((code) => (
                  <div
                    key={code}
                    className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">100 {code}</span>
                    <span className="font-bold text-foreground">
                      {formatAmount(toStorage(100, code))}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {formatAmount(10_000)} ≈{" "}
                {simReverse.toLocaleString(locale, {
                  maximumFractionDigits: CURRENCY_META[simCurrency].decimals,
                })}{" "}
                {simCurrency}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editCode !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b bg-muted/30 p-6">
            <DialogTitle className="text-xl font-bold">
              {t("currencies.editDialogTitle", { code: editCode ?? "" })}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("currencies.editDialogDesc", {
                code: editCode ?? "",
                currency: referenceCurrency,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-6">
            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <p className="text-xs text-muted-foreground">{t("currencies.currentRate")}</p>
              <p className="font-mono font-bold">
                {formatRate(currentEditRate, editCode ?? referenceCurrency)}{" "}
                {referenceCurrency}
              </p>
            </div>

            <div className="space-y-2">
              <Label required className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("currencies.newRate")}
              </Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="h-10 rounded-xl font-mono font-bold"
                placeholder={t("currencies.newRatePlaceholder")}
                autoFocus
              />
              {newRate &&
                !validateRate(Number(newRate)) &&
                Number(newRate) !== currentEditRate && (
                  <p className="text-xs text-muted-foreground">
                    {t("currencies.variation")}{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        Number(newRate) > currentEditRate
                          ? "text-emerald-600"
                          : "text-destructive"
                      )}
                    >
                      {currentEditRate > 0
                        ? `${(((Number(newRate) - currentEditRate) / currentEditRate) * 100).toFixed(1)} %`
                        : "-"}
                    </span>
                  </p>
                )}
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 p-4 sm:p-6">
            <Button variant="outline" className="rounded-xl" onClick={closeEdit} disabled={updating}>
              {t("currencies.cancel")}
            </Button>
            <Button
              className="rounded-xl font-semibold"
              onClick={handleUpdate}
              disabled={
                updating ||
                !newRate ||
                validateRate(Number(newRate)) !== null ||
                Number(newRate) === currentEditRate
              }
            >
              {updating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {t("currencies.confirmUpdate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingRef !== null} onOpenChange={(open) => !open && setPendingRef(null)}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b bg-muted/30 p-6">
            <DialogTitle className="text-xl font-bold">
              {t("currencies.referenceConfirmTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("currencies.referenceConfirmDesc", {
                from: referenceCurrency,
                to: pendingRef ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 p-6 text-sm text-muted-foreground">
            <p>{t("currencies.referenceConfirmHint")}</p>
            {pendingRef && (
              <p className="font-semibold text-foreground">
                {t(CURRENCY_META[pendingRef].labelKey)} ({pendingRef})
              </p>
            )}
          </div>
          <DialogFooter className="border-t bg-muted/20 p-4 sm:p-6">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setPendingRef(null)}
              disabled={savingRef}
            >
              {t("currencies.cancel")}
            </Button>
            <Button
              className="rounded-xl font-semibold"
              onClick={handleConfirmReference}
              disabled={savingRef}
            >
              {savingRef ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {t("currencies.referenceConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
