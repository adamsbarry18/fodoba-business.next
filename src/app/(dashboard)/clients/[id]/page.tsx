
"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { ClientService } from "@/services/client.service"
import { Client, ClientPayment, Sale } from "@/lib/types"
import { isSaleCountedInRevenue } from "@/lib/sale-utils"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowLeft,
  Edit,
  Loader2,
  Phone,
  MapPin,
  History,
  PlusCircle,
  AlertTriangle,
  Receipt,
  Download,
  Wallet,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/contexts/AuthContext"
import { useCurrency } from "@/hooks/use-currency"
import { useStore } from "@/lib/contexts/StoreContext"
import { SaleTicketButton } from "@/components/sales/sale-ticket-button"
import { StatusBadge } from "@/components/ui/status-badge"
import { PaymentMethodPicker } from "@/components/payments/payment-method-picker"
import { useT, useLocale } from "@/i18n/context"
import { getDateLocale } from "@/i18n/get-date-locale"
import { ClientDeleteDialog } from "@/components/clients/client-delete-dialog"

export default function ClientDetailsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = useMemo(() => getDateLocale(locale), [locale])
  const { userProfile } = useAuth()
  const { formatAmount } = useCurrency()
  const { availableStores, activeStore, loading: storeLoading } = useStore()
  const [client, setClient] = useState<Client | null>(null)
  const [payments, setPayments] = useState<ClientPayment[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentTargetSale, setPaymentTargetSale] = useState<Sale | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("history")

  const authorizedStoreIds = useMemo(
    () => availableStores.map((store) => store.id),
    [availableStores]
  )
  const authorizedStoreIdsKey = authorizedStoreIds.join(",")

  const [amount, setAmount] = useState<string>("")
  const [method, setMethod] = useState<ClientPayment["method"]>("CASH")
  const [notes, setNotes] = useState("")

  const openGlobalPayment = () => {
    setPaymentTargetSale(null)
    setAmount(client?.currentDebt ? String(client.currentDebt) : "")
    setNotes("")
    setMethod("CASH")
    setPaymentDialogOpen(true)
  }

  const openInvoicePayment = (sale: Sale) => {
    if (!activeStore) {
      toast.error(t("clients.detail.needActiveStore"))
      return
    }
    if (sale.storeId !== activeStore.id) {
      toast.error(t("clients.detail.wrongStoreForInvoice"))
      return
    }
    setPaymentTargetSale(sale)
    setAmount(String(sale.debtAmount))
    setNotes("")
    setMethod("CASH")
    setPaymentDialogOpen(true)
  }

  const closePaymentDialog = (open: boolean) => {
    setPaymentDialogOpen(open)
    if (!open) {
      setPaymentTargetSale(null)
      setAmount("")
      setNotes("")
      setMethod("CASH")
    }
  }

  const loadData = useCallback(async () => {
    const clientId = params.id as string
    const storeIds = authorizedStoreIdsKey ? authorizedStoreIdsKey.split(",") : []
    setLoading(true)

    try {
      const clientData = await ClientService.getClient(clientId)

      if (!clientData) {
        toast.error(t("clients.detail.notFound"))
        router.push("/clients")
        return
      }

      setClient(clientData)

      if (storeIds.length === 0) {
        setPayments([])
        setSales([])
        return
      }

      const [paymentsData, salesData] = await Promise.all([
        ClientService.getClientPayments(clientId, storeIds),
        ClientService.getClientSales(clientId, storeIds),
      ])

      setPayments(paymentsData)
      setSales(salesData)
    } catch (error) {
      console.error("Erreur chargement client:", error)
      toast.error(t("clients.detail.loadError"))
    } finally {
      setLoading(false)
    }
  }, [authorizedStoreIdsKey, params.id, router, t])

  useEffect(() => {
    if (storeLoading) return
    void loadData()
  }, [storeLoading, loadData])

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab === "payments" || tab === "statement" || tab === "history") {
      setActiveTab(tab)
    }
  }, [searchParams])

  useEffect(() => {
    if (searchParams.get("action") === "payment" && client && client.currentDebt > 0) {
      setPaymentTargetSale(null)
      setAmount(String(client.currentDebt))
      setPaymentDialogOpen(true)
    }
  }, [searchParams, client])

  const handlePayment = async () => {
    const parsed = Number(amount)
    if (!parsed || parsed <= 0) return toast.error(t("clients.detail.invalidAmount"))
    if (!activeStore || !userProfile || !client) return

    const maxAmount = paymentTargetSale
      ? Math.min(paymentTargetSale.debtAmount, client.currentDebt)
      : client.currentDebt

    if (parsed > maxAmount) {
      toast.error(
        t("clients.detail.amountExceedsDebt", { amount: formatAmount(maxAmount) })
      )
      return
    }

    if (paymentTargetSale && paymentTargetSale.storeId !== activeStore.id) {
      toast.error(t("clients.detail.wrongStoreForInvoice"))
      return
    }

    setPaymentLoading(true)
    try {
      await ClientService.recordPayment({
        clientId: client.id,
        amount: parsed,
        method,
        storeId: activeStore.id,
        user: userProfile,
        notes,
        saleId: paymentTargetSale?.id,
      })
      toast.success(
        paymentTargetSale
          ? t("clients.detail.invoicePaymentSuccess", {
              ref: paymentTargetSale.id.slice(-6).toUpperCase(),
            })
          : t("clients.detail.paymentSuccess")
      )
      closePaymentDialog(false)
      loadData()
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t("clients.detail.paymentError")
      )
    } finally {
      setPaymentLoading(false)
    }
  }

  if (storeLoading || loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin" />
      </div>
    )
  }
  if (!client) return null

  const isOverLimit = client.currentDebt > client.creditCeiling && client.creditCeiling > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/clients">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center">
                <Phone className="w-3 h-3 mr-1" /> {client.phone}
              </span>
              <span className="flex items-center">
                <MapPin className="w-3 h-3 mr-1" /> {client.address}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/clients/${client.id}/edit`}>
              <Edit className="w-4 h-4 mr-2" /> {t("clients.detail.edit")}
            </Link>
          </Button>
          <Button onClick={openGlobalPayment} disabled={client.currentDebt <= 0}>
            <PlusCircle className="w-4 h-4 mr-2" /> {t("clients.detail.payment")}
          </Button>
          <Dialog open={paymentDialogOpen} onOpenChange={closePaymentDialog}>
            <DialogContent className="rounded-2xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {paymentTargetSale
                    ? t("clients.detail.invoicePaymentTitle", {
                        ref: paymentTargetSale.id.slice(-6).toUpperCase(),
                      })
                    : t("clients.detail.paymentTitle")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      {paymentTargetSale
                        ? t("clients.detail.invoiceDebt")
                        : t("clients.detail.totalDebt")}
                    </p>
                    <p className="font-headline text-2xl font-bold text-destructive">
                      {formatAmount(
                        paymentTargetSale
                          ? paymentTargetSale.debtAmount
                          : client.currentDebt
                      )}
                    </p>
                    {paymentTargetSale && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {t("clients.detail.clientDebtHint", {
                          amount: formatAmount(client.currentDebt),
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label required>{t("clients.detail.amountPaid")}</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label required>{t("clients.detail.paymentMethod")}</Label>
                  <PaymentMethodPicker value={method} onValueChange={setMethod} />
                </div>
                <div className="space-y-2">
                  <Label>{t("clients.detail.notes")}</Label>
                  <Input
                    placeholder={t("clients.detail.notesPlaceholder")}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handlePayment} disabled={paymentLoading}>
                  {paymentLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="mr-2 h-4 w-4" />
                  )}
                  {t("clients.detail.validatePayment")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("common.delete")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="min-w-0 bg-muted/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("clients.detail.profileType")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
            <StatusBadge preset="clientType" value={client.type} className="text-sm font-bold" />
            <StatusBadge preset="clientStatus" value={client.status} className="text-[10px]" />
          </CardContent>
        </Card>

        <Card className={`min-w-0 ${isOverLimit ? "border-destructive bg-destructive/5" : "bg-muted/5"}`}>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("clients.detail.outstanding")}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 p-4 pt-0">
            <div
              className={`truncate text-xl font-headline font-bold ${client.currentDebt > 0 ? "text-destructive" : ""}`}
            >
              {formatAmount(client.currentDebt)}
            </div>
            {isOverLimit && (
              <div className="flex items-center text-[10px] text-destructive mt-1 font-bold">
                <AlertTriangle className="w-3 h-3 mr-1 shrink-0" /> {t("clients.detail.overLimit")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-muted/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("clients.detail.creditCeiling")}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 p-4 pt-0">
            <div className="truncate text-xl font-headline font-bold">
              {formatAmount(client.creditCeiling)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {t("clients.detail.overdraftAuth")}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-muted/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("clients.detail.lastActivity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 p-4 pt-0">
            <div className="truncate text-sm font-medium">
              {payments.length > 0
                ? format(payments[0].timestamp.toDate(), "dd MMM yyyy", { locale: dateLocale })
                : t("clients.detail.none")}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {t("clients.detail.lastPayment")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" /> {t("clients.detail.tabHistory")}
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <Wallet className="w-4 h-4" /> {t("clients.detail.tabPayments")}
          </TabsTrigger>
          <TabsTrigger value="statement" className="flex items-center gap-2">
            <Receipt className="w-4 h-4" /> {t("clients.detail.tabStatement")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("clients.detail.recentSales")}</CardTitle>
              <CardDescription>{t("clients.detail.recentSalesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {t("clients.detail.noSales")}
                </div>
              ) : (
                <div className="space-y-4">
                  {sales.map((sale) => {
                    const canRepayInvoice =
                      sale.status === "COMPLETED" &&
                      sale.debtAmount > 0 &&
                      client.currentDebt > 0

                    return (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="font-bold">
                          {t("clients.detail.invoice", {
                            ref: sale.id.slice(-6).toUpperCase(),
                          })}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(sale.timestamp.toDate(), "dd/MM/yyyy HH:mm", {
                            locale: dateLocale,
                          })}
                        </span>
                        {canRepayInvoice && (
                          <span className="mt-0.5 text-[10px] font-medium text-destructive">
                            {t("clients.detail.invoiceRemaining", {
                              amount: formatAmount(sale.debtAmount),
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <div className="font-headline font-bold">
                            {formatAmount(sale.total)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                            {sale.status === "COMPLETED" && sale.debtAmount > 0 && (
                              <StatusBadge
                                preset="paymentMethod"
                                value="CREDIT"
                                className="text-[10px]"
                              >
                                {t("clients.detail.credit")}
                              </StatusBadge>
                            )}
                            {(sale.amountPaid > 0 ||
                              (sale.status === "COMPLETED" && sale.debtAmount <= 0)) && (
                              <StatusBadge
                                preset="paymentMethod"
                                value="CASH"
                                className="text-[10px]"
                              >
                                {t("clients.detail.paid")}
                              </StatusBadge>
                            )}
                            {sale.status !== "COMPLETED" && (
                              <StatusBadge
                                preset="saleStatus"
                                value={sale.status}
                                className="text-[10px]"
                              />
                            )}
                          </div>
                        </div>
                        {canRepayInvoice && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-xs font-semibold"
                            onClick={() => openInvoicePayment(sale)}
                            title={t("clients.detail.repayInvoice")}
                          >
                            <Wallet className="mr-1.5 h-3.5 w-3.5" />
                            {t("clients.detail.repayInvoice")}
                          </Button>
                        )}
                        <SaleTicketButton sale={sale} stores={availableStores} />
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("clients.detail.paymentJournal")}</CardTitle>
              <CardDescription>{t("clients.detail.paymentJournalDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {t("clients.detail.noPayments")}
                </div>
              ) : (
                <div className="space-y-4">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 border-b last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-full">
                          <Wallet className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-bold text-emerald-600">
                            +{formatAmount(p.amount)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(p.timestamp.toDate(), "dd MMM yyyy à HH:mm", {
                              locale: dateLocale,
                            })}
                          </p>
                          {p.saleId && (
                            <p className="text-[10px] font-medium text-muted-foreground">
                              {t("clients.detail.paymentForInvoice", {
                                ref: p.saleId.slice(-6).toUpperCase(),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <StatusBadge preset="paymentMethod" value={p.method} className="text-[10px]" />
                        <p className="text-[10px] text-muted-foreground mt-1 italic">{p.notes}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statement" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("clients.detail.balanceAnalysis")}</CardTitle>
                <CardDescription>{t("clients.detail.balanceAnalysisDesc")}</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" /> {t("clients.detail.exportPdf")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase text-muted-foreground mb-1">
                    {t("clients.detail.totalCreditGranted")}
                  </span>
                  <span className="text-3xl font-headline font-bold text-destructive">
                    {formatAmount(
                      sales
                        .filter(isSaleCountedInRevenue)
                        .reduce((acc, s) => acc + (s.debtAmount || 0), 0)
                    )}
                  </span>
                </div>
                <div className="p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase text-muted-foreground mb-1">
                    {t("clients.detail.totalRepaid")}
                  </span>
                  <span className="text-3xl font-headline font-bold text-emerald-600">
                    {formatAmount(payments.reduce((acc, p) => acc + p.amount, 0))}
                  </span>
                </div>
              </div>

              <div className="bg-muted/20 p-6 rounded-xl border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{t("clients.detail.remainingBalance")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("clients.detail.statementAsOf", {
                      date: format(new Date(), "dd MMMM yyyy", { locale: dateLocale }),
                    })}
                  </p>
                </div>
                <div className="text-4xl font-headline font-bold text-destructive">
                  {formatAmount(client.currentDebt)}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ClientDeleteDialog
        client={client}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={() => router.push("/clients")}
      />
    </div>
  )
}
