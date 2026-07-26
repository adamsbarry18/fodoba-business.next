"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { ProductService } from "@/services/product.service"
import { SupplierService } from "@/services/supplier.service"
import { PurchaseService } from "@/services/purchase.service"
import { Supplier, PurchaseItem, PurchaseExpense, CurrencyCode, Product } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Truck,
  Package,
  AlertTriangle,
  Save,
  Receipt,
  Info,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { useCurrency } from "@/hooks/use-currency"
import { BarcodeScanField } from "@/components/barcode/barcode-scan-field"
import { FieldWithAdd } from "@/components/forms/field-with-add"
import { applyReturnSelection } from "@/hooks/use-return-selection"
import { ENTITY_ROUTES } from "@/lib/navigation/return-to"
import {
  PURCHASE_CURRENCIES,
  getPurchaseLineTotal,
  getPurchaseSubtotal,
  getExpensesTotal,
} from "@/lib/purchase-utils"
import { STORAGE_CURRENCY } from "@/lib/constants/currencies"
import { useT } from "@/i18n/context"

const EMPTY_ITEM = (): PurchaseItem => ({
  productId: "",
  name: "",
  quantity: 1,
  unitCost: 0,
  currency: STORAGE_CURRENCY,
  exchangeRate: 1,
})

const EMPTY_EXPENSE = (): PurchaseExpense => ({
  label: "",
  amount: 0,
  currency: STORAGE_CURRENCY,
  exchangeRate: 1,
})

type PurchaseOrderFormProps = {
  mode: "create" | "edit"
  purchaseId?: string
  initialSupplierId?: string
  initialItems?: PurchaseItem[]
  initialExpenses?: PurchaseExpense[]
  initialNotes?: string
  initialStatus?: "DRAFT" | "ORDERED"
  title: string
  subtitle: string
  backHref: string
  returnPath: string
}

export function PurchaseOrderForm({
  mode,
  purchaseId,
  initialSupplierId = "",
  initialItems = [],
  initialExpenses = [],
  initialNotes = "",
  initialStatus = "DRAFT",
  title,
  subtitle,
  backHref,
  returnPath,
}: PurchaseOrderFormProps) {
  const router = useRouter()
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const { rates, formatAmount } = useCurrency()
  const t = useT()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [scanProcessing, setScanProcessing] = useState(false)

  const [supplierId, setSupplierId] = useState(initialSupplierId)
  const [items, setItems] = useState<PurchaseItem[]>(initialItems)
  const [expenses, setExpenses] = useState<PurchaseExpense[]>(initialExpenses)
  const [notes, setNotes] = useState(initialNotes)
  const [currentStatus, setCurrentStatus] = useState<"DRAFT" | "ORDERED">(initialStatus)

  const getRateForCurrency = useCallback(
    (currency: CurrencyCode) =>
      currency === STORAGE_CURRENCY ? 1 : rates[currency] ?? 1,
    [rates]
  )

  useEffect(() => {
    const init = async () => {
      try {
        const [suppResult, prodResult] = await Promise.all([
          SupplierService.listSuppliers(),
          ProductService.listProducts({ active: true }, 200),
        ])
        setSuppliers(suppResult)
        setProducts(prodResult.products)

        await applyReturnSelection(ENTITY_ROUTES.supplier.param, setSupplierId, {
          successMessage: t(ENTITY_ROUTES.supplier.createdMessageKey),
          errorMessage: t("hooks.returnSelectionError"),
          reload: async () => {
            const data = await SupplierService.listSuppliers()
            setSuppliers(data)
          },
        })

        if (mode === "create") {
          await applyReturnSelection(
            ENTITY_ROUTES.product.param,
            async (id) => {
              const product = await ProductService.getProduct(id)
              if (!product) return
              setItems((prev) => {
                const existingIndex = prev.findIndex((i) => i.productId === product.id)
                if (existingIndex >= 0) {
                  const next = [...prev]
                  next[existingIndex] = {
                    ...next[existingIndex],
                    quantity: next[existingIndex]!.quantity + 1,
                  }
                  return next
                }
                return [
                  ...prev,
                  {
                    productId: product.id,
                    name: product.name,
                    quantity: 1,
                    unitCost: product.purchasePriceRef,
                    currency: STORAGE_CURRENCY,
                    exchangeRate: 1,
                  },
                ]
              })
            },
            {
              successMessage: t(ENTITY_ROUTES.product.createdMessageKey),
              errorMessage: t("hooks.returnSelectionError"),
              reload: async () => {
                const result = await ProductService.listProducts({ active: true }, 200)
                setProducts(result.products)
              },
            }
          )
        }
      } catch {
        toast.error(t("purchases.form.errorLoading"))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [mode, t])

  useEffect(() => {
    if (mode !== "edit") return
    setSupplierId(initialSupplierId)
    setItems(initialItems)
    setExpenses(initialExpenses)
    setNotes(initialNotes)
    setCurrentStatus(initialStatus)
  }, [
    mode,
    initialSupplierId,
    initialItems,
    initialExpenses,
    initialNotes,
    initialStatus,
  ])

  const updateItem = (index: number, field: keyof PurchaseItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[index]! }

      if (field === "productId" && typeof value === "string") {
        const prod = products.find((p) => p.id === value)
        item.productId = value
        item.name = prod?.name || ""
        if (prod && item.unitCost === 0) item.unitCost = prod.purchasePriceRef
      } else if (field === "currency" && typeof value === "string") {
        const currency = value as CurrencyCode
        item.currency = currency
        item.exchangeRate = getRateForCurrency(currency)
      } else {
        ;(item as Record<string, unknown>)[field] = value
      }

      next[index] = item
      return next
    })
  }

  const updateExpense = (
    index: number,
    field: keyof PurchaseExpense,
    value: string | number
  ) => {
    setExpenses((prev) => {
      const next = [...prev]
      const exp = { ...next[index]! }

      if (field === "currency" && typeof value === "string") {
        const currency = value as CurrencyCode
        exp.currency = currency
        exp.exchangeRate = getRateForCurrency(currency)
      } else {
        ;(exp as Record<string, unknown>)[field] = value
      }

      next[index] = exp
      return next
    })
  }

  const handleProductScan = useCallback(
    async (code: string) => {
      setScanProcessing(true)
      try {
        const product = await ProductService.findProductByCode(code)
        if (!product) {
          toast.error(t("purchases.form.toast.productNotFound", { code }))
          return
        }

        setItems((prev) => {
          const existingIndex = prev.findIndex((i) => i.productId === product.id)
          if (existingIndex >= 0) {
            const next = [...prev]
            next[existingIndex] = {
              ...next[existingIndex]!,
              quantity: next[existingIndex]!.quantity + 1,
            }
            toast.success(
              t("purchases.form.toast.productQty", {
                name: product.name,
                quantity: next[existingIndex]!.quantity,
              })
            )
            return next
          }
          toast.success(t("purchases.form.toast.productAdded", { name: product.name }))
          return [
            ...prev,
            {
              productId: product.id,
              name: product.name,
              quantity: 1,
              unitCost: product.purchasePriceRef,
              currency: STORAGE_CURRENCY,
              exchangeRate: 1,
            },
          ]
        })
      } catch {
        toast.error(t("purchases.form.toast.scanError"))
      } finally {
        setScanProcessing(false)
      }
    },
    [t]
  )

  const subtotalFCFA = useMemo(() => getPurchaseSubtotal(items), [items])
  const expensesTotalFCFA = useMemo(() => getExpensesTotal(expenses), [expenses])
  const totalFCFA = subtotalFCFA + expensesTotalFCFA

  const selectedSupplier = suppliers.find((s) => s.id === supplierId)

  const summaryDescription = useMemo(() => {
    const itemsPart = t("purchases.form.summaryItems", { count: items.length })
    if (expenses.length === 0) return itemsPart
    return `${itemsPart}${t("purchases.form.summaryFees", { count: expenses.length })}`
  }, [t, items.length, expenses.length])

  const handleSubmit = async (status: "DRAFT" | "ORDERED") => {
    if (!activeStore || !userProfile) return
    if (!supplierId) return toast.error(t("purchases.form.toast.supplierRequired"))
    if (items.length === 0) return toast.error(t("purchases.form.toast.itemsRequired"))
    if (items.some((i) => !i.productId || i.quantity <= 0))
      return toast.error(t("purchases.form.toast.invalidItems"))

    setSubmitting(true)
    try {
      const payload = {
        supplierId,
        supplierName: selectedSupplier?.name || t("purchases.form.unknownSupplier"),
        items,
        expenses,
        subtotalFCFA,
        expensesTotalFCFA,
        totalFCFA,
        status,
        notes,
      }

      if (mode === "edit" && purchaseId) {
        await PurchaseService.updatePurchase(purchaseId, payload)
        toast.success(
          status === "DRAFT"
            ? t("purchases.form.toast.draftUpdated")
            : t("purchases.form.toast.orderUpdated")
        )
        router.push(`/purchases/${purchaseId}`)
      } else {
        await PurchaseService.createPurchase({
          ...payload,
          storeId: activeStore.id,
          storeName: activeStore.name,
          performedBy: userProfile.uid,
          performedByName: `${userProfile.firstName} ${userProfile.lastName}`,
        })
        toast.success(
          status === "DRAFT"
            ? t("purchases.form.toast.draftSaved")
            : t("purchases.form.toast.orderValidated")
        )
        router.push("/purchases")
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : t("purchases.form.toast.saveError")
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!activeStore) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <Truck className="h-10 w-10 opacity-30" />
        <p>{t("purchases.form.selectStore")}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-xl">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-headline">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="flex flex-col gap-4 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-primary" />
                  {t("purchases.form.articlesTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("purchases.form.articlesDesc")}
                </CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[280px]">
                <BarcodeScanField
                  placeholder={t("purchases.form.scanPlaceholder")}
                  onScan={handleProductScan}
                  processing={scanProcessing}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setItems((prev) => [...prev, EMPTY_ITEM()])}
                  className="w-full rounded-xl"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("purchases.form.addManually")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
                  {t("purchases.form.emptyItems")}
                </div>
              ) : (
                items.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-xl border bg-muted/10 p-4 space-y-3"
                  >
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-12 sm:col-span-5 space-y-1.5">
                        <Label required className="text-xs">
                          {t("purchases.form.product")}
                        </Label>
                        <FieldWithAdd entity="product" returnTo={returnPath}>
                          <Select
                            value={item.productId}
                            onValueChange={(v) => updateItem(index, "productId", v)}
                          >
                            <SelectTrigger className="h-10 rounded-xl">
                              <SelectValue placeholder={t("purchases.form.selectProduct")} />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldWithAdd>
                      </div>
                      <div className="col-span-4 sm:col-span-2 space-y-1.5">
                        <Label required className="text-xs">
                          {t("purchases.form.quantity")}
                        </Label>
                        <Input
                          type="number"
                          min="0.01"
                          step="any"
                          className="h-10 rounded-xl"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(index, "quantity", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2 space-y-1.5">
                        <Label required className="text-xs">
                          {t("purchases.form.unitPrice")}
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="h-10 rounded-xl"
                          value={item.unitCost}
                          onChange={(e) =>
                            updateItem(index, "unitCost", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="col-span-11 sm:col-span-2 space-y-1.5">
                        <Label required className="text-xs">
                          {t("purchases.form.currencyRate")}
                        </Label>
                        <div className="flex gap-1">
                          <Select
                            value={item.currency}
                            onValueChange={(v) => updateItem(index, "currency", v)}
                          >
                            <SelectTrigger className="h-10 w-20 rounded-xl px-2 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {PURCHASE_CURRENCIES.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="h-10 rounded-xl px-2 text-xs"
                            type="number"
                            step="0.001"
                            value={item.exchangeRate}
                            onChange={(e) =>
                              updateItem(index, "exchangeRate", Number(e.target.value))
                            }
                            disabled={item.currency === STORAGE_CURRENCY}
                          />
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-destructive"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {t("purchases.form.lineTotal", {
                        amount: formatAmount(getPurchaseLineTotal(item)),
                      })}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 p-4 sm:p-6">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-primary" />
                  {t("purchases.form.expensesTitle")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("purchases.form.expensesDesc")}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExpenses((prev) => [...prev, EMPTY_EXPENSE()])}
                className="rounded-xl"
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("purchases.form.add")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-6">
              {expenses.length === 0 ? (
                <p className="text-center text-sm italic text-muted-foreground py-4">
                  {t("purchases.form.noExpenses")}
                </p>
              ) : (
                expenses.map((exp, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-3 rounded-xl border p-3">
                    <div className="min-w-[140px] flex-1">
                      <Label className="text-xs">{t("purchases.form.label")}</Label>
                      <Input
                        placeholder={t("purchases.form.labelPlaceholder")}
                        className="mt-1 h-10 rounded-xl"
                        value={exp.label}
                        onChange={(e) => updateExpense(index, "label", e.target.value)}
                      />
                    </div>
                    <div className="w-28">
                      <Label className="text-xs">{t("purchases.form.amount")}</Label>
                      <Input
                        type="number"
                        min="0"
                        className="mt-1 h-10 rounded-xl"
                        value={exp.amount}
                        onChange={(e) =>
                          updateExpense(index, "amount", Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">{t("purchases.form.currency")}</Label>
                      <Select
                        value={exp.currency}
                        onValueChange={(v) => updateExpense(index, "currency", v)}
                      >
                        <SelectTrigger className="mt-1 h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {PURCHASE_CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive"
                      onClick={() =>
                        setExpenses((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
              <CardTitle className="text-base">{t("purchases.form.summary")}</CardTitle>
              <CardDescription className="text-xs">{summaryDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="space-y-1.5">
                <Label required>{t("purchases.form.supplier")}</Label>
                <FieldWithAdd entity="supplier" returnTo={returnPath}>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="h-10 rounded-xl">
                      <SelectValue placeholder={t("purchases.form.selectSupplier")} />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} - {s.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWithAdd>
                {selectedSupplier && (
                  <StatusBadge
                    preset="supplierType"
                    value={selectedSupplier.type}
                    className="mt-2 text-[10px]"
                  />
                )}
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("purchases.form.subtotal")}</span>
                  <span className="font-medium">
                    {formatAmount(subtotalFCFA)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("purchases.extraFees")}</span>
                  <span className="font-medium text-destructive">
                    +{formatAmount(expensesTotalFCFA)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 text-lg font-bold font-headline text-primary">
                  <span>{t("purchases.form.estimatedTotal")}</span>
                  <span>{formatAmount(totalFCFA)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("purchases.form.internalNotes")}</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("purchases.form.notesPlaceholder")}
                  className="h-10 rounded-xl"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 border-t bg-muted/10 p-4 sm:p-6">
              {mode === "edit" && currentStatus === "ORDERED" ? (
                <Button
                  className="h-11 w-full rounded-xl font-semibold"
                  onClick={() => handleSubmit("ORDERED")}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t("purchases.form.updateOrder")}
                </Button>
              ) : (
                <>
                  <Button
                    className="h-11 w-full rounded-xl font-semibold"
                    onClick={() => handleSubmit("ORDERED")}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Truck className="mr-2 h-4 w-4" />
                    )}
                    {mode === "edit"
                      ? t("purchases.form.validateOrderEdit")
                      : t("purchases.form.validateOrder")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl"
                    onClick={() => handleSubmit("DRAFT")}
                    disabled={submitting}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {mode === "edit"
                      ? t("purchases.form.saveDraftEdit")
                      : t("purchases.form.saveDraft")}
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>

          <Card className="rounded-2xl border border-dashed border-amber-200/60 bg-amber-50/50 shadow-sm dark:bg-amber-950/20">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                {t("purchases.form.knowTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0 text-xs leading-relaxed text-muted-foreground">
              <p>{t("purchases.form.knowNoStock")}</p>
              <p>{t("purchases.form.knowReception")}</p>
              <p className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                {t("purchases.form.knowRates")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
