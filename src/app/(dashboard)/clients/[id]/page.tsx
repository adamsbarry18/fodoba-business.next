
"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { ClientService } from "@/services/client.service"
import { Client, ClientPayment, Sale } from "@/lib/types"
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
      setPaymentDialogOpen(true)
    }
  }, [searchParams, client])

  const handlePayment = async () => {
    if (!amount || Number(amount) <= 0) return toast.error(t("clients.detail.invalidAmount"))
    if (!activeStore || !userProfile) return
    setPaymentLoading(true)
    try {
      await ClientService.recordPayment({
        clientId: client!.id,
        amount: Number(amount),
        method,
        storeId: activeStore.id,
        user: userProfile,
        notes,
      })
      toast.success(t("clients.detail.paymentSuccess"))
      setAmount("")
      setNotes("")
      setPaymentDialogOpen(false)
      loadData()
    } catch {
      toast.error(t("clients.detail.paymentError"))
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
          <Button onClick={() => setPaymentDialogOpen(true)}>
            <PlusCircle className="w-4 h-4 mr-2" /> {t("clients.detail.payment")}
          </Button>
          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("clients.detail.paymentTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="bg-muted/30 p-4 rounded-lg flex items-center justify-between border">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold">
                      {t("clients.detail.totalDebt")}
                    </p>
                    <p className="text-2xl font-headline font-bold text-destructive">
                      {formatAmount(client.currentDebt)}
                    </p>
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
                    <Loader2 className="animate-spin mr-2" />
                  ) : (
                    <Wallet className="mr-2" />
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
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between rounded-xl border p-3"
                    >
                      <div className="flex flex-col">
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
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-headline font-bold">
                            {formatAmount(sale.total)}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                            {sale.debtAmount > 0 && (
                              <StatusBadge
                                preset="paymentMethod"
                                value="CREDIT"
                                className="text-[10px]"
                              >
                                {t("clients.detail.credit")}
                              </StatusBadge>
                            )}
                            {(sale.amountPaid > 0 || sale.debtAmount <= 0) && (
                              <StatusBadge
                                preset="paymentMethod"
                                value="CASH"
                                className="text-[10px]"
                              >
                                {t("clients.detail.paid")}
                              </StatusBadge>
                            )}
                          </div>
                        </div>
                        <SaleTicketButton sale={sale} stores={availableStores} />
                      </div>
                    </div>
                  ))}
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
                    {formatAmount(sales.reduce((acc, s) => acc + (s.debtAmount || 0), 0))}
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
