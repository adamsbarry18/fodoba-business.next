
"use client"

import { useEffect, useState, useCallback } from "react"
import { ProductService } from "@/services/product.service"
import { InventoryService } from "@/services/inventory.service"
import { StoreService } from "@/services/store.service"
import { CategoryService } from "@/services/category.service"
import { PrintService } from "@/services/print.service"
import { getPrintLabels } from "@/lib/print-labels"
import { Product, Store } from "@/lib/types"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  ArrowLeft,
  Edit,
  Loader2,
  Package,
  Plus,
  Minus,
  Download,
  ImageIcon,
  Save,
} from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { useStore } from "@/lib/contexts/StoreContext"
import { useCurrency } from "@/hooks/use-currency"
import { usePermissions } from "@/hooks/use-permissions"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { useT } from "@/i18n/context"
import { useAuth } from "@/lib/contexts/AuthContext"
import {
  buildDecomposedStock,
  formatDecomposedStockLabel,
  type DecomposedStock,
} from "@/lib/stock-utils"
import { getProductUnitLabel, getRetailUnitsPerPack, normalizeProduct } from "@/lib/product-utils"
import { ProductExpirationDisplay } from "@/components/inventory/product-expiration-display"
import { AppNotificationHelper } from "@/lib/notifications/app-notification-helper"
import { cn } from "@/lib/utils"

export default function ProductDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { formatAmount } = useCurrency()
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const { can } = usePermissions()
  const t = useT()
  const [product, setProduct] = useState<Product | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [stockRecords, setStockRecords] = useState<Record<string, DecomposedStock>>({})
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [draftPackaging, setDraftPackaging] = useState(0)
  const [draftDetail, setDraftDetail] = useState(0)

  const canEdit = can("manage:catalog")
  const canAdjust = can("adjust:stock")

  const loadAll = useCallback(async () => {
    try {
      const [prod, allStores] = await Promise.all([
        ProductService.getProduct(params.id as string),
        StoreService.listStores(100),
      ])

      if (prod) {
        setProduct(prod)
        const levels: Record<string, DecomposedStock> = {}
        await Promise.all(
          allStores.stores.map(async (s) => {
            levels[s.id] = await ProductService.getStockRecord(
              prod.id,
              s.id,
              getRetailUnitsPerPack(normalizeProduct(prod))
            )
          })
        )
        setStockRecords(levels)
        setStores(allStores.stores)
      } else {
        toast.error(t("common.errorProductNotFound"))
        router.push("/inventory")
      }
    } catch {
      toast.error(t("common.errorLoading"))
    } finally {
      setLoading(false)
    }
  }, [params.id, router, t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!product) return
    void AppNotificationHelper.notifyProductExpiration({
      product,
      storeId: activeStore?.id,
    })
  }, [product, activeStore?.id])

  useEffect(() => {
    if (!activeStore?.id || !product) return
    const record = stockRecords[activeStore.id]
    const normalized = normalizeProduct(product)
    const hasPackaging =
      !!normalized.packagingUnit && normalized.unitsPerPack > 1

    if (!record) {
      setDraftPackaging(0)
      setDraftDetail(0)
      return
    }

    if (hasPackaging) {
      setDraftPackaging(record.packagingQty)
      setDraftDetail(record.detailQty)
    } else {
      setDraftPackaging(0)
      setDraftDetail(record.quantity)
    }
  }, [activeStore?.id, stockRecords, product])

  const parseQtyInput = (raw: string) => {
    if (raw.trim() === "") return 0
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return parsed
  }

  const handleApplyStockAdjustment = async () => {
    if (!activeStore || !product || !userProfile) return

    const normalized = normalizeProduct(product)
    const hasPackaging =
      !!normalized.packagingUnit && normalized.unitsPerPack > 1
    const packagingQty = hasPackaging ? Math.max(0, draftPackaging) : 0
    const detailQty = Math.max(0, draftDetail)
    const current = stockRecords[activeStore.id] ?? {
      packagingQty: 0,
      detailQty: 0,
      quantity: 0,
    }

    const unchanged = hasPackaging
      ? packagingQty === current.packagingQty && detailQty === current.detailQty
      : detailQty === current.quantity

    if (unchanged) {
      toast.message(t("inventory.detail.noStockChange"))
      return
    }

    setAdjusting(true)
    try {
      await InventoryService.setStockDecomposed({
        productId: product.id,
        storeId: activeStore.id,
        packagingQty,
        detailQty,
        user: userProfile,
        reason: t("inventory.form.stockCorrectionReason"),
      })
      toast.success(t("common.successStockUpdate"))
      await loadAll()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("common.errorAdjustment"))
    } finally {
      setAdjusting(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!product) return
    setGeneratingPdf(true)
    try {
      let categoryName: string | undefined
      try {
        const category = await CategoryService.getCategory(product.categoryId)
        categoryName = category?.name
      } catch {
        // optional for PDF
      }
      await PrintService.generateProductSheet(
        product,
        stores,
        stockRecords,
        getPrintLabels(t),
        activeStore,
        categoryName,
        formatAmount
      )
      toast.success(t("common.successExportPdf"))
    } catch {
      toast.error(t("common.errorExportPdf"))
    } finally {
      setGeneratingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )
  }
  if (!product) return null

  const normalized = normalizeProduct(product)
  const formatUnit = (unit?: string) => getProductUnitLabel(unit, t)
  const unitLabel = formatUnit(normalized.unit)
  const packLabel = formatUnit(normalized.packagingUnit)

  const cardClassName =
    "overflow-hidden rounded-[32px] border-none bg-white shadow-sm ring-1 ring-gray-100"

  const metaRowClassName =
    "flex items-center justify-between border-b border-gray-50 py-3 last:border-b-0"
  const metaLabelClassName =
    "text-[11px] font-bold uppercase tracking-wider text-gray-400"
  const metaValueClassName = "text-right font-bold text-gray-700"

  const hasPackagingInfo =
    (normalized.packagingUnit && normalized.unitsPerPack > 1) ||
    !!product.manufacturingDate ||
    !!product.expirationDate

  const hasFinancialInfo =
    product.sellingPriceFCFA > 0 ||
    (normalized.wholesalePriceFCFA ?? 0) > 0 ||
    product.purchasePriceRef > 0 ||
    !!product.prices?.GNF ||
    !!product.prices?.USD

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-xl" asChild>
            <Link href="/inventory">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {product.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-500"
              >
                {product.sku}
              </Badge>
              <span className="text-sm font-medium text-gray-400">•</span>
              <span className="text-sm font-medium text-gray-400">{unitLabel}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button
            variant="outline"
            className="flex-1 rounded-xl font-bold sm:flex-none"
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
          >
            {generatingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {t("inventory.detail.productSheet")}
          </Button>
          {canEdit && (
            <Button
              asChild
              className="flex-1 rounded-xl bg-primary font-bold hover:bg-primary/90 sm:flex-none"
            >
              <Link href={`/inventory/${product.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" /> {t("inventory.edit")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <Card className={`${cardClassName} lg:col-span-2`}>
          {product.imageUrl ? (
            <CardContent className="flex max-h-[160px] items-center justify-center overflow-hidden bg-muted/10 p-3 sm:max-h-[180px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl}
                alt={product.name}
                className="max-h-[136px] w-full max-w-full object-contain sm:max-h-[156px]"
              />
            </CardContent>
          ) : (
            <CardContent className="flex h-[160px] flex-col items-center justify-center gap-2 bg-muted/20 sm:h-[180px]">
              <div className="rounded-xl bg-muted/40 p-3">
                <ImageIcon className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-[10px] font-medium text-muted-foreground">
                {t("inventory.form.image")}
              </p>
            </CardContent>
          )}
        </Card>

        {(hasPackagingInfo || hasFinancialInfo) && (
          <Card className={`${cardClassName} lg:col-span-7`}>
            <CardContent
              className={`grid h-full gap-0 p-6 sm:gap-6 sm:p-8 ${
                hasPackagingInfo && hasFinancialInfo
                  ? "sm:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]"
                  : "sm:grid-cols-1"
              }`}
            >
              {hasPackagingInfo && (
                <div
                  className={`space-y-1 ${hasFinancialInfo ? "sm:border-r sm:border-gray-100 sm:pr-6" : ""}`}
                >
                  <p className="mb-3 text-sm font-bold text-gray-900">
                    {t("inventory.detail.packagingInfo")}
                  </p>
                  {normalized.packagingUnit && normalized.unitsPerPack > 1 && (
                    <div className={metaRowClassName}>
                      <span className={metaLabelClassName}>
                        {t("inventory.form.unitsPerPack")}
                      </span>
                      <span className={metaValueClassName}>
                        {t("inventory.detail.unitsPerPack", {
                          count: normalized.unitsPerPack,
                          unit: unitLabel,
                          packaging: packLabel,
                        })}
                      </span>
                    </div>
                  )}
                  {product.manufacturingDate && (
                    <div className={metaRowClassName}>
                      <span className={metaLabelClassName}>
                        {t("inventory.detail.manufacturingDate")}
                      </span>
                      <span className={metaValueClassName}>{product.manufacturingDate}</span>
                    </div>
                  )}
                  {product.expirationDate && (
                    <div className={metaRowClassName}>
                      <span className={metaLabelClassName}>
                        {t("inventory.detail.expirationDate")}
                      </span>
                      <ProductExpirationDisplay
                        expirationDate={product.expirationDate}
                        showDate
                        className="text-right"
                      />
                    </div>
                  )}
                </div>
              )}

              {hasFinancialInfo && (
                <div className="space-y-1 sm:pl-2">
                  <p className="mb-2 text-xs font-bold text-gray-900">
                    {t("inventory.detail.financialInfoTitle")}
                  </p>
                  <div className={metaRowClassName}>
                    <span className={metaLabelClassName}>{t("inventory.form.retailPrice")}</span>
                    <span className="font-headline text-base font-bold text-primary">
                      {formatAmount(product.sellingPriceFCFA)}
                    </span>
                  </div>
                  {(normalized.wholesalePriceFCFA ?? 0) > 0 && (
                    <div className={metaRowClassName}>
                      <span className={metaLabelClassName}>
                        {t("inventory.detail.wholesalePrice")}
                      </span>
                      <span className={metaValueClassName}>
                        {formatAmount(normalized.wholesalePriceFCFA!)}
                      </span>
                    </div>
                  )}
                  {product.purchasePriceRef > 0 && (
                    <div className={metaRowClassName}>
                      <span className={metaLabelClassName}>
                        {t("inventory.detail.purchasePrice")}
                      </span>
                      <span className={metaValueClassName}>
                        {formatAmount(product.purchasePriceRef)}
                      </span>
                    </div>
                  )}
                  {product.prices?.GNF ? (
                    <div className={metaRowClassName}>
                      <span className={metaLabelClassName}>{t("inventory.detail.priceGnf")}</span>
                      <span className={metaValueClassName}>
                        {product.prices.GNF.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                  {product.prices?.USD ? (
                    <div className={metaRowClassName}>
                      <span className={metaLabelClassName}>{t("inventory.detail.priceUsd")}</span>
                      <span className={metaValueClassName}>
                        ${product.prices.USD.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card
          className={`${cardClassName} ${hasPackagingInfo || hasFinancialInfo ? "lg:col-span-3" : "lg:col-span-10"}`}
        >
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-4 sm:p-5 lg:flex-col">
            <div className="shrink-0 rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
              <QRCodeSVG value={product.id} size={96} />
            </div>
            <div className="space-y-1.5 text-center lg:text-center">
              <p className="text-xs font-bold text-gray-900">
                {t("inventory.detail.digitalIdTitle")}
              </p>
              <Badge
                variant="secondary"
                className="rounded-lg border-none bg-gray-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-gray-500"
              >
                {product.barcode || t("inventory.detail.noBarcode")}
              </Badge>
              <p className="max-w-[200px] text-[10px] font-medium leading-relaxed text-gray-400">
                {t("inventory.detail.qrHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <Card className={cardClassName}>
          <CardHeader className="p-6 pb-2 sm:p-8 sm:pb-4">
            <CardTitle className="text-xl">{t("inventory.detail.stockByStoreTitle")}</CardTitle>
            <CardDescription>{t("inventory.detail.stockByStoreDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6 pt-2 sm:p-8 sm:pt-4">
            {stores.map((store) => {
              const stockRecord = stockRecords[store.id] ?? {
                packagingQty: 0,
                detailQty: 0,
                quantity: 0,
              }
              const qty = stockRecord.quantity
              const isCurrent = store.id === activeStore?.id
              const hasPackaging =
                !!normalized.packagingUnit && normalized.unitsPerPack > 1
              const decomposedLabel = formatDecomposedStockLabel(
                stockRecord,
                product,
                t("inventory.stockBreakdownSeparator"),
                formatUnit
              )
              return (
                <div
                  key={store.id}
                  className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${isCurrent ? "border-primary/20 bg-primary/5 ring-1 ring-primary/10" : "border-gray-100 bg-white"}`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${qty > product.lowStockThreshold ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.4)]"}`}
                    />
                    <div>
                      <div className="font-bold text-gray-900">
                        {store.name}
                        {isCurrent && (
                          <Badge
                            variant="secondary"
                            className="ml-3 border-none bg-primary/10 text-[9px] font-bold uppercase tracking-widest text-primary"
                          >
                            {t("inventory.detail.myStore")}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        {store.code}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {hasPackaging ? (
                      <>
                        <div className="font-headline text-lg font-bold leading-tight text-gray-900 sm:text-xl">
                          {decomposedLabel}
                        </div>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {t("inventory.stockTotalUnits", {
                            count: qty,
                            unit: unitLabel,
                          })}
                        </p>
                      </>
                    ) : (
                      <div className="font-headline text-2xl font-bold text-gray-900">
                        {qty}{" "}
                        <span className="ml-1 text-[10px] font-bold uppercase text-gray-400">
                          {unitLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {canAdjust && (
          <Card className={cardClassName}>
            <CardHeader className="p-6 pb-2 sm:p-8 sm:pb-4">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="rounded-xl bg-primary/10 p-2">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                {t("inventory.detail.manualAdjustTitle")}
              </CardTitle>
              <CardDescription>
                {t.rich("inventory.detail.manualAdjustDesc", {
                  store: activeStore?.name ?? "",
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-2 sm:p-8 sm:pt-4">
              {(() => {
                const record = stockRecords[activeStore?.id || ""] ?? {
                  packagingQty: 0,
                  detailQty: 0,
                  quantity: 0,
                }
                const hasPackaging =
                  !!normalized.packagingUnit && normalized.unitsPerPack > 1
                const packagingUnit =
                  packLabel || t("inventory.form.packagingFallback")
                const draft = buildDecomposedStock(
                  hasPackaging ? draftPackaging : 0,
                  hasPackaging ? draftDetail : draftDetail,
                  hasPackaging ? normalized.unitsPerPack : 1,
                  hasPackaging ? normalized.retailQtyFactor : 1
                )
                const hasChanges = hasPackaging
                  ? draftPackaging !== record.packagingQty ||
                    draftDetail !== record.detailQty
                  : draftDetail !== record.quantity

                const QtyStepper = ({
                  label,
                  unit,
                  value,
                  onChange,
                }: {
                  label: string
                  unit: string
                  value: number
                  onChange: (next: number) => void
                }) => (
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {label}
                      <span className="ml-1 font-semibold normal-case text-muted-foreground/80">
                        ({unit})
                      </span>
                    </Label>
                    <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/20 p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-lg bg-background"
                        onClick={() => onChange(Math.max(0, value - 1))}
                        disabled={adjusting || value <= 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => {
                          const parsed = parseQtyInput(e.target.value)
                          if (parsed === null) return
                          onChange(parsed)
                        }}
                        onFocus={(e) => e.target.select()}
                        disabled={adjusting}
                        className="h-10 flex-1 border-0 bg-transparent text-center font-headline text-lg font-bold shadow-none focus-visible:ring-0"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-lg bg-background"
                        onClick={() => onChange(value + 1)}
                        disabled={adjusting}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )

                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {t("inventory.detail.current")}
                        </p>
                        <p className="mt-0.5 font-headline text-base font-bold text-foreground">
                          {hasPackaging
                            ? formatDecomposedStockLabel(
                                record,
                                product,
                                t("inventory.stockBreakdownSeparator"),
                                formatUnit
                              )
                            : `${record.quantity} ${unitLabel}`}
                        </p>
                      </div>
                      {hasPackaging && (
                        <p className="text-xs text-muted-foreground">
                          {t("inventory.stockTotalUnits", {
                            count: record.quantity,
                            unit: unitLabel,
                          })}
                        </p>
                      )}
                    </div>

                    <div
                      className={cn(
                        "grid gap-4",
                        hasPackaging ? "sm:grid-cols-2" : "sm:grid-cols-1 sm:max-w-sm"
                      )}
                    >
                      {hasPackaging && (
                        <QtyStepper
                          label={t("inventory.form.packaging")}
                          unit={packagingUnit}
                          value={draftPackaging}
                          onChange={setDraftPackaging}
                        />
                      )}
                      <QtyStepper
                        label={
                          hasPackaging
                            ? t("inventory.form.detailStock")
                            : t("inventory.detail.stockQuantity")
                        }
                        unit={unitLabel}
                        value={draftDetail}
                        onChange={setDraftDetail}
                      />
                    </div>

                    {hasPackaging && (
                      <p className="text-[11px] text-muted-foreground">
                        {t("inventory.detail.draftTotal", {
                          stock: formatDecomposedStockLabel(
                            draft,
                            product,
                            t("inventory.stockBreakdownSeparator"),
                            formatUnit
                          ),
                          count: draft.quantity,
                          unit: unitLabel,
                        })}
                      </p>
                    )}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        disabled={adjusting || !hasChanges}
                        onClick={() => {
                          if (hasPackaging) {
                            setDraftPackaging(record.packagingQty)
                            setDraftDetail(record.detailQty)
                          } else {
                            setDraftPackaging(0)
                            setDraftDetail(record.quantity)
                          }
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        type="button"
                        className="rounded-xl font-semibold"
                        disabled={adjusting || !hasChanges}
                        onClick={handleApplyStockAdjustment}
                      >
                        {adjusting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        {t("inventory.detail.applyStockAdjustment")}
                      </Button>
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
