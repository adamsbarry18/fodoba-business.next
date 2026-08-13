
"use client"

import { useState, useEffect, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { InventoryService } from "@/services/inventory.service"
import { ProductService } from "@/services/product.service"
import { StoreService } from "@/services/store.service"
import { Product, Store } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { toast } from "sonner"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import {
  ArrowLeft,
  Loader2,
  ArrowRightLeft,
  Package,
  Info,
  Store as StoreIcon,
  AlertTriangle,
  Save,
  History,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FieldWithAdd } from "@/components/forms/field-with-add"
import { applyReturnSelection } from "@/hooks/use-return-selection"
import { ENTITY_ROUTES } from "@/lib/navigation/return-to"
import { BarcodeScanField } from "@/components/barcode/barcode-scan-field"
import { StatusBadge } from "@/components/ui/status-badge"
import { useT } from "@/i18n/context"
import { filterActiveStores } from "@/lib/store-utils"
import { getProductUnitLabel } from "@/lib/product-utils"

type TransferFormValues = {
  productId: string
  destinationStoreId: string
  quantity: number
  reason?: string
}

export default function NewTransferPage() {
  const router = useRouter()
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const t = useT()
  const formatUnit = (unit?: string) => getProductUnitLabel(unit, t)

  const transferFormSchema = useMemo(
    () =>
      z.object({
        productId: z.string().min(1, t("stockTransfer.validation.productRequired")),
        destinationStoreId: z
          .string()
          .min(1, t("stockTransfer.validation.destinationRequired")),
        quantity: z.coerce.number().min(1, t("stockTransfer.validation.quantityMin")),
        reason: z.string().optional(),
      }),
    [t]
  )

  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [scanProcessing, setScanProcessing] = useState(false)
  const [sourceStock, setSourceStock] = useState(0)
  const [destStock, setDestStock] = useState<number | null>(null)
  const [loadingStock, setLoadingStock] = useState(false)

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      productId: "",
      destinationStoreId: "",
      quantity: 1,
      reason: "",
    },
  })

  const productId = useWatch({ control: form.control, name: "productId" })
  const destinationStoreId = useWatch({ control: form.control, name: "destinationStoreId" })
  const quantity = useWatch({ control: form.control, name: "quantity" })

  const destinationStores = useMemo(
    () => stores.filter((s) => s.id !== activeStore?.id),
    [stores, activeStore?.id]
  )

  const selectedProduct = products.find((p) => p.id === productId)
  const destinationStore = stores.find((s) => s.id === destinationStoreId)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const [prodResult, storeResult] = await Promise.all([
          ProductService.listProducts({ active: true }, 200),
          StoreService.listStores(100),
        ])
        if (cancelled) return
        setProducts(prodResult.products)
        setStores(filterActiveStores(storeResult.stores))

        await applyReturnSelection(
          ENTITY_ROUTES.product.param,
          (id) => form.setValue("productId", id),
          {
            successMessage: t(ENTITY_ROUTES.product.createdMessageKey),
            errorMessage: t("hooks.returnSelectionError"),
            reload: async () => {
              const result = await ProductService.listProducts({ active: true }, 200)
              setProducts(result.products)
            },
          }
        )
      } catch {
        if (!cancelled) toast.error(t("stockTransfer.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [form, t])

  useEffect(() => {
    const storeId = activeStore?.id
    if (!productId || !storeId) {
      setSourceStock(0)
      setDestStock(null)
      return
    }

    let cancelled = false

    const fetchStocks = async () => {
      setLoadingStock(true)
      try {
        const sourceQty = await ProductService.getStockLevel(productId, storeId)
        if (cancelled) return
        setSourceStock(sourceQty)

        if (destinationStoreId) {
          const destQty = await ProductService.getStockLevel(productId, destinationStoreId)
          if (!cancelled) setDestStock(destQty)
        } else {
          setDestStock(null)
        }
      } catch {
        if (!cancelled) toast.error(t("stockTransfer.stockError"))
      } finally {
        if (!cancelled) setLoadingStock(false)
      }
    }

    void fetchStocks()
    return () => {
      cancelled = true
    }
  }, [activeStore?.id, destinationStoreId, productId, t])

  const handleProductScan = async (code: string) => {
    setScanProcessing(true)
    try {
      const product = await ProductService.findProductByCode(code)
      if (!product) {
        toast.error(t("stockTransfer.productNotFound", { code }))
        return
      }
      form.setValue("productId", product.id)
      toast.success(t("stockTransfer.productSelected", { name: product.name }))
    } catch {
      toast.error(t("stockTransfer.scanError"))
    } finally {
      setScanProcessing(false)
    }
  }

  const onSubmit = async (values: TransferFormValues) => {
    if (!activeStore || !userProfile) return

    if (values.quantity > sourceStock) {
      form.setError("quantity", {
        message: t("stockTransfer.insufficientStock", { stock: sourceStock }),
      })
      return
    }

    try {
      await InventoryService.transferStock({
        productId: values.productId,
        fromStoreId: activeStore.id,
        toStoreId: values.destinationStoreId,
        quantity: values.quantity,
        user: userProfile,
        reason: values.reason,
      })
      toast.success(t("stockTransfer.transferSuccess"))
      router.push("/inventory/history")
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("stockTransfer.transferError")
      toast.error(message)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!activeStore) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <ArrowRightLeft className="h-10 w-10 opacity-30" />
        <p>{t("stockTransfer.selectStore")}</p>
      </div>
    )
  }

  const stockInsufficient = quantity > sourceStock

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-xl">
          <Link href="/inventory/history">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("stockTransfer.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t.rich("stockTransfer.subtitleFrom", {
                store: activeStore.name,
                strong: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
              })}
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Package className="h-4 w-4 text-primary" />
                    {t("stockTransfer.productCardTitle")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("stockTransfer.productCardDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <FormField
                    control={form.control}
                    name="productId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("stockTransfer.product")}</FormLabel>
                        <FieldWithAdd entity="product" returnTo="/inventory/transfers/new">
                          <FormControl>
                            <Combobox
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder={t("stockTransfer.selectProductPlaceholder")}
                              searchPlaceholder={t("inventory.searchPlaceholder")}
                              options={products.map((p) => ({
                                value: p.id,
                                label: `${p.name} (${p.sku})`,
                                keywords: [p.name, p.sku, p.barcode],
                              }))}
                            />
                          </FormControl>
                        </FieldWithAdd>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <BarcodeScanField
                    onScan={handleProductScan}
                    processing={scanProcessing}
                    placeholder={t("stockTransfer.scanPlaceholderSku")}
                    inputClassName="rounded-xl"
                  />
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <StoreIcon className="h-4 w-4 text-primary" />
                    {t("stockTransfer.destinationCardTitle")}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t("stockTransfer.destinationCardDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="destinationStoreId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>{t("stockTransfer.destinationStore")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-10 rounded-xl">
                                <SelectValue placeholder={t("stockTransfer.selectDestination")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-xl">
                              {destinationStores.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name} ({s.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>{t("stockTransfer.quantityToSend")}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={sourceStock || undefined}
                              className="h-10 rounded-xl font-headline font-bold"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          {selectedProduct && (
                            <FormDescription className="text-[11px]">
                              {t("stockTransfer.unitLabel", {
                                unit: formatUnit(selectedProduct.unit),
                              })}
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("stockTransfer.reasonOptional")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("stockTransfer.reasonPlaceholder")}
                            className="h-10 rounded-xl"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="sticky top-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
                <CardHeader className="border-b bg-muted/20 p-4">
                  <CardTitle className="text-sm font-bold">{t("stockTransfer.summary")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/20 p-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t("stockTransfer.source")}
                      </p>
                      <p className="truncate text-sm font-semibold">{activeStore.name}</p>
                      <p className="text-[10px] text-muted-foreground">{activeStore.code}</p>
                    </div>
                    <ArrowRightLeft className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t("stockTransfer.destination")}
                      </p>
                      <p className="truncate text-sm font-semibold">
                        {destinationStore?.name ?? "-"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {destinationStore?.code ?? ""}
                      </p>
                    </div>
                  </div>

                  {selectedProduct ? (
                    <div className="space-y-3 rounded-xl border p-3">
                      <p className="text-sm font-semibold">{selectedProduct.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {selectedProduct.sku}
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-rose-50 p-2 dark:bg-rose-950/30">
                          <p className="text-[10px] text-muted-foreground">
                            {t("stockTransfer.sourceStock")}
                          </p>
                          <p className="font-headline text-lg font-bold">
                            {loadingStock ? "…" : sourceStock}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatUnit(selectedProduct.unit)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/30">
                          <p className="text-[10px] text-muted-foreground">
                            {t("stockTransfer.destStock")}
                          </p>
                          <p className="font-headline text-lg font-bold">
                            {loadingStock || destStock === null
                              ? "…"
                              : destStock + (quantity > 0 ? quantity : 0)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {t("stockTransfer.afterTransfer")}
                          </p>
                        </div>
                      </div>

                      {quantity > 0 && (
                        <StatusBadge
                          tone={stockInsufficient ? "destructive" : "info"}
                          className="w-full justify-center text-[10px]"
                        >
                          {t("stockTransfer.transferDelta", {
                            quantity,
                            unit: formatUnit(selectedProduct.unit),
                          })}
                        </StatusBadge>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground py-4">
                      {t("stockTransfer.selectProductHint")}
                    </p>
                  )}

                  {stockInsufficient && (
                    <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {t("stockTransfer.insufficientStockWarning")}
                    </div>
                  )}

                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>{t("stockTransfer.irreversibleNote")}</p>
                  </div>

                  <Button
                    type="submit"
                    disabled={
                      form.formState.isSubmitting ||
                      !productId ||
                      !destinationStoreId ||
                      quantity <= 0 ||
                      stockInsufficient
                    }
                    className="w-full rounded-xl font-semibold"
                  >
                    {form.formState.isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t("stockTransfer.confirmTransfer")}
                  </Button>

                  <Button
                    variant="outline"
                    asChild
                    className="w-full rounded-xl font-semibold"
                  >
                    <Link href="/inventory/history">
                      <History className="mr-2 h-4 w-4" />
                      {t("stockTransfer.viewHistory")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}
