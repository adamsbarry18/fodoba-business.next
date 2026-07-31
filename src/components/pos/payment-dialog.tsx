"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Receipt,
  Banknote,
  Plus,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Client, CurrencyCode, PaymentMethod } from "@/lib/types"
import {
  PRIMARY_PAYMENT_METHODS,
  EMPTY_PAYMENT_AMOUNTS,
  buildSalePayments,
  isPrimaryPaymentMethod,
  normalizePaymentMethodInput,
  resolvePaymentMethodDisplay,
  type PosPaymentMode,
} from "@/lib/constants/payment-methods"
import { POS_PAYMENT_MODES } from "@/lib/pos-utils"
import { StatusBadge } from "@/components/ui/status-badge"
import { PaymentMethodPicker } from "@/components/payments/payment-method-picker"
import { useCurrency } from "@/hooks/use-currency"
import { useT } from "@/i18n/context"

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  total: number
  selectedClientId: string
  selectedClientName: string
  selectedClient?: Client
  processing: boolean
  onConfirm: (payments: { method: PaymentMethod; amount: number }[], debtAmount: number) => void
}

export function PaymentDialog({
  open,
  onOpenChange,
  total,
  selectedClientId,
  selectedClientName,
  selectedClient,
  processing,
  onConfirm,
}: PaymentDialogProps) {
  const { formatAmount } = useCurrency()
  const t = useT()
  const [mode, setMode] = useState<PosPaymentMode>("comptant")
  const [comptantMethod, setComptantMethod] = useState<PaymentMethod>("CASH")
  const [amounts, setAmounts] = useState(EMPTY_PAYMENT_AMOUNTS())
  const [splitExtras, setSplitExtras] = useState<string[]>([])
  const [isAddingSplit, setIsAddingSplit] = useState(false)
  const [splitDraft, setSplitDraft] = useState("")
  const splitInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setMode("comptant")
    setComptantMethod("CASH")
    setAmounts({ ...EMPTY_PAYMENT_AMOUNTS(), CASH: String(total) })
    setSplitExtras([])
    setIsAddingSplit(false)
    setSplitDraft("")
  }, [open, total])

  useEffect(() => {
    if (!open) return
    if (mode === "credit" || mode === "partiel") {
      setAmounts(EMPTY_PAYMENT_AMOUNTS())
      return
    }
    if (mode === "comptant") {
      setAmounts({ ...EMPTY_PAYMENT_AMOUNTS(), [comptantMethod]: String(total) })
    }
    if (mode === "fractionne") {
      setSplitExtras([])
      setIsAddingSplit(false)
      setSplitDraft("")
    }
  }, [mode, comptantMethod, open, total])

  useEffect(() => {
    if (!isAddingSplit) return
    splitInputRef.current?.focus()
  }, [isAddingSplit])

  const { payments, debtAmount } = useMemo(
    () => buildSalePayments(mode, total, amounts, comptantMethod),
    [mode, total, amounts, comptantMethod]
  )

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0)
  const cashTendered = Number(amounts.CASH) || 0
  const cashApplied = payments.find((p) => p.method === "CASH")?.amount ?? 0
  const change =
    mode === "comptant" && comptantMethod === "CASH" && cashTendered > cashApplied
      ? cashTendered - cashApplied
      : mode === "fractionne" && cashTendered > cashApplied
        ? cashTendered - cashApplied
        : 0

  const needsClient = debtAmount > 0
  const hasClient = selectedClientId !== "none"
  const creditDisabled = !hasClient
  const creditExceeded =
    !!selectedClient &&
    selectedClient.creditCeiling > 0 &&
    debtAmount > 0 &&
    selectedClient.currentDebt + debtAmount > selectedClient.creditCeiling

  const canValidate = (() => {
    if (processing || creditExceeded) return false
    switch (mode) {
      case "comptant":
        return debtAmount === 0 && totalPaid >= total
      case "partiel":
        return hasClient && totalPaid > 0 && debtAmount > 0
      case "credit":
        return hasClient && debtAmount === total
      case "fractionne":
        return needsClient ? hasClient : totalPaid >= total
      default:
        return false
    }
  })()

  useEffect(() => {
    if (!open) return
    if ((mode === "credit" || mode === "partiel") && creditDisabled) {
      setMode("comptant")
    }
  }, [open, mode, creditDisabled])

  const fillRemaining = (method: PaymentMethod) => {
    const remaining = Math.max(
      0,
      total -
        Object.entries(amounts).reduce((acc, [key, val]) => {
          if (key === method) return acc
          return acc + (Number(val) || 0)
        }, 0)
    )
    setAmounts((prev) => ({ ...prev, [method]: String(remaining) }))
  }

  const splitMethods = useMemo(
    () => [
      ...PRIMARY_PAYMENT_METHODS.map((m) => ({ id: m.id, label: m.label, custom: false as const })),
      ...splitExtras.map((id) => ({ id, label: id, custom: true as const })),
    ],
    [splitExtras]
  )

  const addSplitExtra = (method: string) => {
    if (isPrimaryPaymentMethod(method)) return
    setSplitExtras((prev) => (prev.includes(method) ? prev : [...prev, method]))
    setAmounts((prev) => ({ ...prev, [method]: prev[method] ?? "" }))
  }

  const confirmSplitCustom = () => {
    const normalized = normalizePaymentMethodInput(splitDraft)
    if (!normalized) return
    if (isPrimaryPaymentMethod(normalized)) {
      setSplitDraft("")
      setIsAddingSplit(false)
      return
    }
    addSplitExtra(normalized)
    setSplitDraft("")
    setIsAddingSplit(false)
  }

  const removeSplitExtra = (method: string) => {
    setSplitExtras((prev) => prev.filter((m) => m !== method))
    setAmounts((prev) => {
      const next = { ...prev }
      delete next[method]
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,720px)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border p-0 shadow-lg">
        <DialogHeader className="shrink-0 border-b bg-muted/20 p-4 sm:p-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Receipt className="h-5 w-5 text-primary" />
            {t("pos.pay.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("pos.pay.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {t("pos.netAmount")}
              </span>
              <span className="font-headline text-2xl font-bold text-primary">
                {formatAmount(total)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border bg-background p-3 text-xs">
            <span className="text-muted-foreground">{t("pos.pay.billingClient")}</span>
            <StatusBadge
              tone={hasClient ? "info" : "slate"}
              className="max-w-[60%] truncate text-[10px]"
            >
              {selectedClientName}
            </StatusBadge>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POS_PAYMENT_MODES.map(({ id, labelKey, shortLabelKey, descriptionKey, icon: Icon, tone }) => {
              const isDisabled = (id === "credit" || id === "partiel") && creditDisabled
              return (
                <button
                  key={id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && setMode(id)}
                  title={isDisabled ? t("pos.pay.selectIdentifiedClient") : t(descriptionKey)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors",
                    mode === id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-muted/50",
                    isDisabled && "cursor-not-allowed opacity-45"
                  )}
                >
                  <StatusBadge tone={tone} className="text-[9px]">
                    <Icon className="mr-1 h-3 w-3" />
                    {t(shortLabelKey)}
                  </StatusBadge>
                  <span className="text-[11px] font-bold leading-tight">{t(labelKey)}</span>
                </button>
              )
            })}
          </div>

          {creditDisabled && (
            <div className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                {t("pos.pay.creditNeedsClient")}
              </span>
            </div>
          )}

          {mode === "comptant" && (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <Label required className="text-xs font-semibold">
                {t("pos.pay.paymentMode")}
              </Label>
              <PaymentMethodPicker
                value={comptantMethod}
                onValueChange={(method) => {
                  setComptantMethod(method)
                  setAmounts((prev) => ({
                    ...EMPTY_PAYMENT_AMOUNTS(),
                    ...prev,
                    [method]: prev[method] ?? String(total),
                  }))
                }}
              />
              <div className="space-y-1.5">
                <Label htmlFor="comptant-amount" required className="text-xs font-semibold">
                  {t("pos.pay.amountReceived")}
                </Label>
                <Input
                  id="comptant-amount"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  className="h-11 rounded-xl font-headline font-bold"
                  value={amounts[comptantMethod] ?? ""}
                  onChange={(e) =>
                    setAmounts((prev) => ({ ...prev, [comptantMethod]: e.target.value }))
                  }
                />
              </div>
              {totalPaid < total && totalPaid > 0 && (
                <p className="text-[11px] text-amber-600">
                  {t("pos.pay.insufficientAmount")}
                </p>
              )}
            </div>
          )}

          {mode === "partiel" && (
            <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold">{t("pos.pay.depositPlusCredit")}</p>
              <Label required className="text-xs font-semibold">
                {t("pos.pay.depositMode")}
              </Label>
              <PaymentMethodPicker
                value={comptantMethod}
                onValueChange={(method) => {
                  setComptantMethod(method)
                  setAmounts((prev) => ({
                    ...prev,
                    [method]: prev[method] ?? "",
                  }))
                }}
              />
              <div className="space-y-1.5">
                <Label htmlFor="partiel-amount" required className="text-xs font-semibold">
                  {t("pos.pay.amountNow")}
                </Label>
                <Input
                  id="partiel-amount"
                  type="number"
                  min={1}
                  max={total - 1}
                  inputMode="decimal"
                  className="h-11 rounded-xl font-bold"
                  value={amounts[comptantMethod] ?? ""}
                  onChange={(e) =>
                    setAmounts((prev) => ({ ...prev, [comptantMethod]: e.target.value }))
                  }
                />
              </div>
              <div className="flex justify-between rounded-lg bg-background p-3 text-xs">
                <span className="text-muted-foreground">{t("pos.pay.remainingCredit")}</span>
                <span className="font-bold text-amber-600">{formatAmount(debtAmount)}</span>
              </div>
              {selectedClient && (
                <ClientCreditSummary client={selectedClient} formatAmount={formatAmount} />
              )}
            </div>
          )}

          {mode === "credit" && (
            <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold">{t("pos.pay.fullCredit")}</p>
              <p className="text-xs text-muted-foreground">
                {t("pos.pay.fullCreditDesc", { amount: formatAmount(total) })}
              </p>
              {!hasClient && (
                <AlertBlock message={t("pos.pay.selectClientFirst")} />
              )}
              {selectedClient && (
                <ClientCreditSummary client={selectedClient} formatAmount={formatAmount} />
              )}
            </div>
          )}

          {mode === "fractionne" && (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {t("pos.pay.splitDesc")}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {splitMethods.map(({ id, label, custom }) => {
                  return (
                    <div key={id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {custom
                            ? resolvePaymentMethodDisplay(id, (key) => t(key))
                            : t(label)}
                        </Label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fillRemaining(id)}
                            className="text-[10px] font-semibold text-primary hover:underline"
                          >
                            {t("pos.pay.balance")}
                          </button>
                          {custom && (
                            <button
                              type="button"
                              onClick={() => removeSplitExtra(id)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={t("payment.removeSplitMethod")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-10 rounded-xl font-bold"
                        value={amounts[id] ?? ""}
                        onChange={(e) =>
                          setAmounts((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                      />
                    </div>
                  )
                })}
              </div>
              {isAddingSplit ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={splitInputRef}
                    value={splitDraft}
                    maxLength={48}
                    placeholder={t("payment.customMethodPlaceholder")}
                    className="h-9 rounded-xl text-xs"
                    onChange={(e) => setSplitDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        confirmSplitCustom()
                      }
                      if (e.key === "Escape") {
                        e.preventDefault()
                        setSplitDraft("")
                        setIsAddingSplit(false)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!normalizePaymentMethodInput(splitDraft)}
                    className="h-9 shrink-0 rounded-xl text-xs font-semibold"
                    onClick={confirmSplitCustom}
                  >
                    {t("payment.confirmCustomMethod")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 shrink-0 rounded-xl px-2"
                    onClick={() => {
                      setSplitDraft("")
                      setIsAddingSplit(false)
                    }}
                    aria-label={t("common.cancel")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full rounded-xl border-dashed text-xs font-semibold"
                  onClick={() => setIsAddingSplit(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {t("payment.addSplitMethod")}
                </Button>
              )}
              {!hasClient && debtAmount > 0 && (
                <AlertBlock
                  message={t("pos.pay.partialNeedsClient", { amount: formatAmount(debtAmount) })}
                />
              )}
            </div>
          )}

          <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Banknote className="h-3.5 w-3.5" />
              {t("pos.pay.summary")}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("pos.pay.cashCollected")}</span>
              <span className="font-bold text-emerald-600">{formatAmount(totalPaid)}</span>
            </div>
            {debtAmount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("pos.pay.onCredit")}</span>
                <span className="font-bold text-amber-600">{formatAmount(debtAmount)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("pos.pay.changeDue")}</span>
                <span className="font-bold text-primary">{formatAmount(change)}</span>
              </div>
            )}
            {payments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {payments.map((p) => (
                  <StatusBadge
                    key={p.method}
                    preset="paymentMethod"
                    value={p.method}
                    className="text-[10px]"
                  >
                    {formatAmount(p.amount)}
                  </StatusBadge>
                ))}
              </div>
            )}
          </div>

          {creditExceeded && (
            <AlertBlock message={t("pos.pay.creditExceeded")} />
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row gap-2 border-t bg-muted/20 p-4 sm:p-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-11 flex-1 rounded-xl font-semibold"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="h-11 flex-1 rounded-xl font-semibold"
            disabled={!canValidate}
            onClick={() => onConfirm(payments, debtAmount)}
          >
            {processing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {t("pos.pay.validate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ClientCreditSummary({
  client,
  formatAmount,
}: {
  client: Client
  formatAmount: (amount: number, code?: CurrencyCode) => string
}) {
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-lg bg-background p-2.5">
        <p className="text-muted-foreground">{t("pos.pay.currentDebt")}</p>
        <p className="font-bold">{formatAmount(client.currentDebt)}</p>
      </div>
      <div className="rounded-lg bg-background p-2.5">
        <p className="text-muted-foreground">{t("pos.pay.creditCeiling")}</p>
        <p className="font-bold">
          {client.creditCeiling > 0
            ? formatAmount(client.creditCeiling)
            : t("pos.pay.unlimited")}
        </p>
      </div>
    </div>
  )
}

function AlertBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
