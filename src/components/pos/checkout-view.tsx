"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Plus,
  Printer,
  Receipt,
  ShoppingCart,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { Client, PaymentMethod, Sale, SaleItem } from "@/lib/types"
import { ClientService } from "@/services/client.service"
import { SaleService } from "@/services/sale.service"
import { CashService } from "@/services/cash.service"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { useCurrency } from "@/hooks/use-currency"
import { useT, useLocale } from "@/i18n/context"
import { usePosPaymentForm } from "@/hooks/use-pos-payment-form"
import { useSaleTicket } from "@/hooks/use-sale-ticket"
import { applyReturnSelection } from "@/hooks/use-return-selection"
import { ENTITY_ROUTES } from "@/lib/navigation/return-to"
import {
  applyCartDiscount,
  getCartItemCount,
  getCartSubtotal,
  getCashQuickAmounts,
  POS_PAYMENT_MODES,
} from "@/lib/pos-utils"
import { getProductUnitLabel } from "@/lib/product-utils"
import { formatQuantity } from "@/lib/quantity-utils"
import {
  clearPosCheckoutDraft,
  loadPosCheckoutDraft,
  savePosCheckoutDraft,
  type PosCheckoutDraft,
} from "@/lib/pos-checkout-draft"
import { PaymentMethodPicker } from "@/components/payments/payment-method-picker"
import { PosClientPicker } from "@/components/pos/pos-client-picker"
import {
  EMPTY_PAYMENT_AMOUNTS,
  normalizePaymentMethodInput,
  resolvePaymentMethodDisplay,
} from "@/lib/constants/payment-methods"
import { getSaleClientDisplayName } from "@/lib/sale-client-utils"

function StepHeader({
  step,
  title,
  hint,
}: {
  step: number
  title: string
  hint: string
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {step}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

function ClientCreditSummary({
  client,
  formatAmount,
}: {
  client: Client
  formatAmount: (amount: number) => string
}) {
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-xl bg-background p-3">
        <p className="text-muted-foreground">{t("pos.pay.currentDebt")}</p>
        <p className="mt-0.5 font-bold">{formatAmount(client.currentDebt)}</p>
      </div>
      <div className="rounded-xl bg-background p-3">
        <p className="text-muted-foreground">{t("pos.pay.creditCeiling")}</p>
        <p className="mt-0.5 font-bold">
          {client.creditCeiling > 0
            ? formatAmount(client.creditCeiling)
            : t("pos.pay.unlimited")}
        </p>
      </div>
    </div>
  )
}

function AlertBlock({ message, tone = "danger" }: { message: string; tone?: "danger" | "warning" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-2xl border p-3.5 text-xs",
        tone === "warning"
          ? "border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-200"
          : "border-destructive/20 bg-destructive/5 text-destructive"
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="leading-relaxed">{message}</span>
    </div>
  )
}

export function PosCheckoutView() {
  const t = useT()
  const { locale } = useLocale()
  const router = useRouter()
  const { formatAmount } = useCurrency()
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const { printTicket, printingId } = useSaleTicket(activeStore ? [activeStore] : undefined)

  const [draft, setDraft] = useState<PosCheckoutDraft | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)

  const persistDraft = useCallback((next: PosCheckoutDraft) => {
    setDraft(next)
    savePosCheckoutDraft(next)
  }, [])

  useEffect(() => {
    if (!activeStore?.id) return

    const stored = loadPosCheckoutDraft()
    if (!stored || stored.storeId !== activeStore.id || stored.cart.length === 0) {
      toast.message(t("pos.pay.emptyDraft"))
      router.replace("/pos")
      return
    }

    setDraft(stored)

    const init = async () => {
      try {
        const list = await ClientService.listClients()
        setClients(list)
        await applyReturnSelection(
          ENTITY_ROUTES.client.param,
          (id) => {
            const next = { ...stored, selectedClientId: id }
            persistDraft(next)
          },
          {
            successMessage: t(ENTITY_ROUTES.client.createdMessageKey),
            errorMessage: t("hooks.returnSelectionError"),
            reload: async () => {
              const fresh = await ClientService.listClients()
              setClients(fresh)
            },
          }
        )
      } catch {
        toast.error(t("pos.errorLoadingData"))
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [activeStore?.id, persistDraft, router, t])

  const cart = draft?.cart ?? []
  const discount = draft?.discount ?? 0
  const selectedClientId = draft?.selectedClientId ?? "none"
  const subtotal = getCartSubtotal(cart)
  const total = applyCartDiscount(subtotal, discount)
  const cartItemCount = getCartItemCount(cart)
  const selectedClient = clients.find((c) => c.id === selectedClientId)
  const selectedClientName =
    selectedClientId === "none"
      ? t("pos.walkInClient")
      : selectedClient?.name || t("pos.selectedClient")

  const payment = usePosPaymentForm({
    total,
    selectedClientId,
    selectedClient,
  })

  const quickAmounts = getCashQuickAmounts(total)

  const selectClient = (clientId: string) => {
    if (!draft) return
    persistDraft({ ...draft, selectedClientId: clientId })
  }

  const handleConfirm = async (
    payments: { method: PaymentMethod; amount: number }[],
    debtAmount: number
  ) => {
    if (!activeStore || !userProfile || !draft || cart.length === 0) return
    if (debtAmount > 0 && selectedClientId === "none") {
      toast.error(t("pos.selectClientForCredit"))
      return
    }

    const session = await CashService.getActiveSession(activeStore.id)
    if (!session) {
      toast.error(t("pos.openCashFirst"))
      return
    }

    setProcessing(true)
    try {
      let sale: Sale
      if (draft.correctingSaleId) {
        const result = await SaleService.correctSale({
          originalSaleId: draft.correctingSaleId,
          store: activeStore,
          user: userProfile,
          items: cart,
          clientId: selectedClientId !== "none" ? selectedClientId : undefined,
          payments,
          discount,
          subtotal,
          total,
          debtAmount,
        })
        sale = result.sale
        if (result.cancelled.debtNotReversed > 0) {
          toast.warning(
            t("pos.correctSaleDebtPartial", {
              amount: formatAmount(result.cancelled.debtNotReversed),
            })
          )
        }
      } else {
        sale = await SaleService.processSale({
          store: activeStore,
          user: userProfile,
          items: cart,
          clientId: selectedClientId !== "none" ? selectedClientId : undefined,
          payments,
          discount,
          subtotal,
          total,
          debtAmount,
        })
      }
      clearPosCheckoutDraft()
      setLastSale(sale)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("pos.transactionError"))
    } finally {
      setProcessing(false)
    }
  }

  if (loading || !draft) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (lastSale) {
    const printingTicket = printingId === lastSale.id
    return (
      <div className="mx-auto max-w-md space-y-6 py-6">
        <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold">{t("pos.saleRecorded")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("pos.saleRecordedDesc")}</p>
          <p className="mt-4 font-headline text-lg font-bold text-primary">
            #{lastSale.id.slice(-6).toUpperCase()} · {formatAmount(lastSale.total)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("pos.saleForClient", {
              name: getSaleClientDisplayName(lastSale, t("pos.walkInClient")),
            })}
          </p>
          <div className="mt-6 space-y-2">
            <Button
              className="h-11 w-full rounded-xl font-semibold"
              onClick={() => void printTicket(lastSale)}
              disabled={printingTicket}
            >
              {printingTicket ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              {t("pos.printTicket")}
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl font-semibold"
              onClick={() => router.push("/pos")}
            >
              {t("pos.newSale")}
            </Button>
            <Button variant="link" className="w-full text-xs text-muted-foreground" asChild>
              <Link href="/reports/sales">{t("pos.viewSaleHistory")}</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const formatUnit = (unit?: string) => getProductUnitLabel(unit, t)
  const receivedValue = payment.amounts[payment.comptantMethod] ?? ""

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("pos.pay.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("pos.pay.subtitle")}</p>
          </div>
        </div>
        <Button variant="outline" className="h-10 rounded-xl font-semibold" asChild>
          <Link href="/pos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("pos.pay.backToCart")}
          </Link>
        </Button>
      </div>

      <div className="rounded-3xl border border-primary/20 bg-primary/5 px-5 py-4 sm:px-7 sm:py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
          {t("pos.netAmount")}
        </p>
        <p className="mt-1 font-headline text-3xl font-black tracking-tight text-primary sm:text-4xl">
          {formatAmount(total)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("pos.itemCount", { count: cartItemCount })}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
            <StepHeader
              step={1}
              title={t("pos.pay.stepClient")}
              hint={t("pos.pay.stepClientHint")}
            />
            <PosClientPicker
              clients={clients}
              selectedClientId={selectedClientId}
              selectedClient={selectedClient}
              onSelect={selectClient}
              returnTo="/pos/checkout"
            />
          </section>

          <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
            <StepHeader
              step={2}
              title={t("pos.pay.stepStrategy")}
              hint={t("pos.pay.stepStrategyHint")}
            />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {POS_PAYMENT_MODES.map(({ id, labelKey, shortLabelKey, descriptionKey, tone }) => {
                const isDisabled = (id === "credit" || id === "partiel") && payment.creditDisabled
                const selected = payment.mode === id
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && payment.setMode(id)}
                    title={isDisabled ? t("pos.pay.selectIdentifiedClient") : t(descriptionKey)}
                    className={cn(
                      "flex min-h-[7.5rem] flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-background hover:bg-muted/40",
                      isDisabled && "cursor-not-allowed opacity-45"
                    )}
                  >
                    <StatusBadge tone={tone} className="text-[9px]">
                      {t(shortLabelKey)}
                    </StatusBadge>
                    <span className="text-[13px] font-bold leading-tight">{t(labelKey)}</span>
                    <span className="mt-auto text-[10px] leading-snug text-muted-foreground">
                      {t(descriptionKey)}
                    </span>
                  </button>
                )
              })}
            </div>
            {payment.creditDisabled && (
              <div className="mt-4">
                <AlertBlock tone="warning" message={t("pos.pay.creditNeedsClient")} />
              </div>
            )}
          </section>

          {payment.mode !== "credit" && (
            <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
              <StepHeader
                step={3}
                title={t("pos.pay.stepMethod")}
                hint={
                  payment.mode === "fractionne"
                    ? t("pos.pay.splitDesc")
                    : payment.mode === "partiel"
                      ? t("pos.pay.depositPlusCredit")
                      : t("pos.pay.paymentMode")
                }
              />

              {payment.mode === "comptant" && (
                <div className="space-y-4">
                  <PaymentMethodPicker
                    variant="cards"
                    value={payment.comptantMethod}
                    onValueChange={(method) => {
                      payment.setComptantMethod(method)
                      payment.setAmounts({
                        ...EMPTY_PAYMENT_AMOUNTS(),
                        [method]: String(total),
                      })
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="checkout-amount" required className="text-xs font-semibold">
                      {t("pos.pay.amountReceived")}
                    </Label>
                    <Input
                      id="checkout-amount"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      className="h-12 rounded-2xl font-headline text-lg font-bold"
                      value={receivedValue}
                      onChange={(e) => payment.setAmountFor(payment.comptantMethod, e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => payment.setAmountFor(payment.comptantMethod, String(total))}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors",
                          Number(receivedValue) === total
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {t("pos.pay.exactAmount")}
                      </button>
                      {quickAmounts.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => payment.setAmountFor(payment.comptantMethod, String(amount))}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors",
                            Number(receivedValue) === amount
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {formatAmount(amount)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {payment.totalPaid < total && payment.totalPaid > 0 && (
                    <p className="text-[11px] text-amber-600">{t("pos.pay.insufficientAmount")}</p>
                  )}
                </div>
              )}

              {payment.mode === "partiel" && (
                <div className="space-y-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <PaymentMethodPicker
                    variant="cards"
                    value={payment.comptantMethod}
                    onValueChange={(method) => {
                      payment.setComptantMethod(method)
                      payment.setAmounts((prev) => ({
                        ...prev,
                        [method]: prev[method] ?? "",
                      }))
                    }}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="partiel-amount" required className="text-xs font-semibold">
                      {t("pos.pay.amountNow")}
                    </Label>
                    <Input
                      id="partiel-amount"
                      type="number"
                      min={1}
                      max={total - 1}
                      inputMode="decimal"
                      className="h-12 rounded-2xl font-headline text-lg font-bold"
                      value={payment.amounts[payment.comptantMethod] ?? ""}
                      onChange={(e) =>
                        payment.setAmountFor(payment.comptantMethod, e.target.value)
                      }
                    />
                  </div>
                  <div className="flex justify-between rounded-xl bg-background px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{t("pos.pay.remainingCredit")}</span>
                    <span className="font-bold text-amber-600">{formatAmount(payment.debtAmount)}</span>
                  </div>
                  {selectedClient && (
                    <ClientCreditSummary client={selectedClient} formatAmount={formatAmount} />
                  )}
                </div>
              )}

              {payment.mode === "fractionne" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {payment.splitMethods.map(({ id, label, custom }) => (
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
                              onClick={() => payment.fillRemaining(id)}
                              className="text-[10px] font-semibold text-primary hover:underline"
                            >
                              {t("pos.pay.balance")}
                            </button>
                            {custom && (
                              <button
                                type="button"
                                onClick={() => payment.removeSplitExtra(id)}
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
                          className="h-11 rounded-xl font-bold"
                          value={payment.amounts[id] ?? ""}
                          onChange={(e) => payment.setAmountFor(id, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  {payment.isAddingSplit ? (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        value={payment.splitDraft}
                        maxLength={48}
                        placeholder={t("payment.customMethodPlaceholder")}
                        className="h-10 rounded-xl text-xs"
                        onChange={(e) => payment.setSplitDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            payment.confirmSplitCustom()
                          }
                          if (e.key === "Escape") {
                            e.preventDefault()
                            payment.setSplitDraft("")
                            payment.setIsAddingSplit(false)
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!normalizePaymentMethodInput(payment.splitDraft)}
                        className="h-10 shrink-0 rounded-xl text-xs font-semibold"
                        onClick={payment.confirmSplitCustom}
                      >
                        {t("payment.confirmCustomMethod")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-10 shrink-0 rounded-xl px-2"
                        onClick={() => {
                          payment.setSplitDraft("")
                          payment.setIsAddingSplit(false)
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
                      className="h-10 w-full rounded-xl border-dashed text-xs font-semibold"
                      onClick={() => payment.setIsAddingSplit(true)}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      {t("pos.pay.addAnotherMethod")}
                    </Button>
                  )}
                  {!payment.hasClient && payment.debtAmount > 0 && (
                    <AlertBlock
                      message={t("pos.pay.partialNeedsClient", {
                        amount: formatAmount(payment.debtAmount),
                      })}
                    />
                  )}
                </div>
              )}
            </section>
          )}

          {payment.mode === "credit" && (
            <section className="space-y-4 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 sm:p-6">
              <p className="text-sm font-semibold">{t("pos.pay.fullCredit")}</p>
              <p className="text-xs text-muted-foreground">
                {t("pos.pay.fullCreditDesc", { amount: formatAmount(total) })}
              </p>
              {!payment.hasClient && <AlertBlock message={t("pos.pay.selectClientFirst")} />}
              {selectedClient && (
                <ClientCreditSummary client={selectedClient} formatAmount={formatAmount} />
              )}
            </section>
          )}

          {payment.creditExceeded && <AlertBlock message={t("pos.pay.creditExceeded")} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:col-span-5">
          <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("pos.activeCart")}
                </h2>
              </div>
              <StatusBadge tone={payment.hasClient ? "info" : "slate"} className="max-w-[55%] truncate text-[10px]">
                {selectedClientName}
              </StatusBadge>
            </div>
            <ul className="divide-y divide-border">
              {cart.map((item: SaleItem, index) => (
                <li key={`${item.productId}-${item.priceTier}-${index}`} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatQuantity(item.quantity, locale)} {formatUnit(item.saleUnit)} · {formatAmount(item.unitPrice)}
                    </p>
                  </div>
                  <p className="shrink-0 font-headline text-sm font-bold">
                    {formatAmount(item.total)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              {t("pos.pay.summary")}
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("pos.subtotal")}</span>
                <span className="font-semibold">{formatAmount(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("pos.globalDiscount")}</span>
                  <span className="font-semibold">− {formatAmount(discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("pos.pay.cashCollected")}</span>
                <span className="font-bold text-emerald-600">{formatAmount(payment.totalPaid)}</span>
              </div>
              {payment.debtAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("pos.pay.onCredit")}</span>
                  <span className="font-bold text-amber-600">{formatAmount(payment.debtAmount)}</span>
                </div>
              )}
              {payment.change > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("pos.pay.changeDue")}</span>
                  <span className="font-bold text-primary">{formatAmount(payment.change)}</span>
                </div>
              )}
            </div>
            {payment.payments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {payment.payments.map((p) => (
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="h-12 flex-1 rounded-2xl font-semibold" asChild>
              <Link href="/pos">{t("common.cancel")}</Link>
            </Button>
            <Button
              className="h-12 flex-[1.4] rounded-2xl text-sm font-bold"
              disabled={!payment.canValidate || processing}
              onClick={() => void handleConfirm(payment.payments, payment.debtAmount)}
            >
              {processing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {t("pos.pay.validate")}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
