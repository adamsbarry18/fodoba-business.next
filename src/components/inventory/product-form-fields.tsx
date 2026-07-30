"use client"

import { useMemo, useRef, useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import type { Category, ProductFormValues } from "@/lib/types"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldWithAdd } from "@/components/forms/field-with-add"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { computeInitialStockTotal, getRetailUnitsPerPack, PACKAGING_UNITS, RETAIL_UNITS } from "@/lib/product-utils"
import { Coins, ImageIcon, Scale, Tags, X, Info, Package, ShoppingBag } from "lucide-react"
import { useT } from "@/i18n/context"
import { cn } from "@/lib/utils"

type ProductFormFieldsProps = {
  form: UseFormReturn<ProductFormValues>
  categories: Category[]
  mode: "create" | "edit"
  categoryReturnPath: string
  imageFile?: File | null
  onImageFileChange?: (file: File | null) => void
  showReferences?: boolean
  productId?: string
  /** Boutique active — permet l'édition du stock en mode modification */
  activeStoreName?: string
  canAdjustStock?: boolean
}

export function ProductFormFields({
  form,
  categories,
  mode,
  categoryReturnPath,
  imageFile,
  onImageFileChange,
  showReferences = mode === "edit",
  productId,
  activeStoreName,
  canAdjustStock = true,
}: ProductFormFieldsProps) {
  const t = useT()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const showStockFields =
    mode === "create" || (mode === "edit" && !!activeStoreName && canAdjustStock)
  const initialPackaging = showStockFields ? form.watch("initialStockPackaging") : undefined
  const detailStock = showStockFields ? form.watch("detailStock") : undefined
  const unitsPerPack = form.watch("unitsPerPack")
  const retailQtyFactor = form.watch("retailQtyFactor")
  const imageUrl = form.watch("imageUrl")
  const packagingUnit = form.watch("packagingUnit")
  const retailUnit = form.watch("unit")

  const hasPackaging =
    !!packagingUnit?.trim() && (unitsPerPack ?? 1) > 1

  const retailUnitsPerPack = useMemo(
    () =>
      getRetailUnitsPerPack({
        unitsPerPack: unitsPerPack ?? 1,
        retailQtyFactor: retailQtyFactor ?? 1,
      }),
    [unitsPerPack, retailQtyFactor]
  )

  const packLabel = packagingUnit?.trim() || t("inventory.form.packagingFallback")
  const unitLabel = retailUnit?.trim() || t("inventory.form.unitFallback")

  const computedStock = useMemo(() => {
    if (!showStockFields) return null
    return computeInitialStockTotal(
      Number(initialPackaging) || 0,
      unitsPerPack ?? 1,
      detailStock ?? 0,
      retailQtyFactor ?? 1
    )
  }, [showStockFields, initialPackaging, detailStock, unitsPerPack, retailQtyFactor])

  const previewSrc = imagePreview || imageUrl || null

  const handleImageChange = (file: File | null) => {
    onImageFileChange?.(file)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    if (file) {
      setImagePreview(URL.createObjectURL(file))
    } else {
      setImagePreview(null)
      form.setValue("imageUrl", undefined)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4 text-primary" />
              {t("inventory.form.identification")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("inventory.form.identificationDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <FormField
              control={form.control}
              name="imageUrl"
              render={() => (
                <FormItem>
                  <FormLabel>{t("inventory.form.image")}</FormLabel>
                  <FormControl>
                    <div className="space-y-3">
                      {previewSrc ? (
                        <div className="relative overflow-hidden rounded-xl border bg-muted/20">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewSrc}
                            alt={t("inventory.form.imagePreviewAlt")}
                            className="h-32 w-full object-cover"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="absolute right-2 top-2 h-8 w-8 rounded-lg"
                            onClick={() => {
                              handleImageChange(null)
                              if (fileInputRef.current) fileInputRef.current.value = ""
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex h-20 items-center justify-center rounded-xl border border-dashed bg-muted/10">
                          <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
                        </div>
                      )}
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="h-10 cursor-pointer rounded-xl file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          handleImageChange(file)
                        }}
                      />
                      {imageFile && (
                        <p className="text-[11px] text-muted-foreground">{imageFile.name}</p>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription className="text-[11px]">
                    {t("inventory.form.imageOptionalHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("inventory.form.productName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("inventory.form.productNamePlaceholder")}
                      className="h-10 rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("inventory.form.category")}</FormLabel>
                  <FieldWithAdd entity="category" returnTo={categoryReturnPath}>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t("inventory.form.chooseCategory")}
                        searchPlaceholder={t("categories.searchPlaceholder")}
                        options={categories.map((cat) => ({
                          value: cat.id,
                          label: cat.name,
                          keywords: [cat.name, cat.description],
                        }))}
                      />
                    </FormControl>
                  </FieldWithAdd>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="manufacturingDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.form.manufacturingDate")}</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="h-10 rounded-xl"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expirationDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.form.expirationDate")}</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="h-10 rounded-xl"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="lowStockThreshold"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>{t("inventory.form.lowStockThreshold")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      className="h-10 rounded-xl"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription className="text-[11px]">
                    {t("inventory.form.lowStockThresholdHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-primary" />
              {t("inventory.form.logisticsUnits")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {/* —— Détail —— */}
            <div className="space-y-3 rounded-xl border bg-muted/10 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                  {t("inventory.form.retailSectionTitle")}
                </p>
              </div>
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("inventory.form.retailUnit")}</FormLabel>
                    <FormControl>
                      <Combobox
                        creatable
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                        placeholder={t("inventory.form.retailUnitPlaceholder")}
                        searchPlaceholder={t("inventory.form.retailUnitSearch")}
                        options={RETAIL_UNITS.map((unit) => ({
                          value: unit,
                          label: unit,
                        }))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* —— Engros / conditionnement —— */}
            <div className="space-y-3 rounded-xl border bg-amber-500/5 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                  {t("inventory.form.wholesaleSectionTitle")}
                </p>
              </div>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="packagingUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.form.packagingUnit")}</FormLabel>
                      <FormControl>
                        <Combobox
                          creatable
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          placeholder={t("inventory.form.packagingUnitPlaceholder")}
                          searchPlaceholder={t("inventory.form.packagingUnitSearch")}
                          options={PACKAGING_UNITS.map((unit) => ({
                            value: unit,
                            label: unit,
                          }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="unitsPerPack"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t("inventory.form.unitsPerPack")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            className="h-10 rounded-xl"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Math.max(1, Number(e.target.value) || 1))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="retailQtyFactor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("inventory.form.retailQtyFactor")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            className="h-10 rounded-xl"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Math.max(1, Number(e.target.value) || 1))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {!!packagingUnit?.trim() && (
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {t("inventory.form.packFormula", {
                    packaging: packLabel,
                    count: retailUnitsPerPack,
                    unit: unitLabel,
                  })}
                </p>
              )}
            </div>

            {/* —— Stock —— */}
            {showStockFields && (
              <div className="space-y-3 rounded-xl border p-3 sm:p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-foreground">
                    {t("inventory.form.stockSectionTitle")}
                  </p>
                  {mode === "edit" && activeStoreName && (
                    <p className="text-[11px] text-muted-foreground">{activeStoreName}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="initialStockPackaging"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {hasPackaging
                            ? t("inventory.form.initialStockWholesale", { unit: packLabel })
                            : t("inventory.form.initialStock")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            className="h-10 rounded-xl"
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {hasPackaging && (
                    <FormField
                      control={form.control}
                      name="detailStock"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("inventory.form.detailStockLabeled", { unit: unitLabel })}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              placeholder="0"
                              className="h-10 rounded-xl"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value)
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {computedStock !== null && (
                  <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
                    {t("inventory.form.computedStockTitle")}:{" "}
                    {t("inventory.form.computedStockValue", {
                      total: computedStock,
                      unit: unitLabel,
                    })}
                  </p>
                )}
              </div>
            )}

            {mode === "edit" && !activeStoreName && (
              <div className="rounded-xl border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>{t("inventory.form.selectStoreForStock")}</p>
                </div>
              </div>
            )}

            {mode === "edit" && activeStoreName && !canAdjustStock && (
              <div className="rounded-xl border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-1">
                    <p>{t("inventory.form.stockManagedOnDetail")}</p>
                    {productId && (
                      <Button variant="link" asChild className="h-auto p-0 text-xs font-semibold">
                        <Link href={`/inventory/${productId}`}>
                          {t("inventory.form.viewProductDetail")}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {mode === "edit" && (
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>{t("inventory.form.activeProduct")}</FormLabel>
                      <FormDescription>{t("inventory.form.hideFromPos")}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" />
            {t("inventory.form.pricing")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="purchasePriceRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("inventory.form.purchasePricePerUnit", { unit: unitLabel })}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      className="h-10 rounded-xl"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sellingPriceFCFA"
              render={({ field }) => (
                <FormItem className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <FormLabel required className="flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                    {t("inventory.form.retailPricePerUnit", { unit: unitLabel })}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      className="h-10 rounded-xl font-headline font-bold"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="wholesalePriceFCFA"
              render={({ field }) => (
                <FormItem
                  className={cn(
                    "rounded-xl border p-3",
                    hasPackaging
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-dashed bg-muted/10 opacity-80"
                  )}
                >
                  <FormLabel className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                    {hasPackaging
                      ? t("inventory.form.wholesalePricePerUnit", { unit: packLabel })
                      : t("inventory.form.wholesalePrice")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      className="h-10 rounded-xl"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {showReferences && (
        <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
            <CardTitle className="text-base">{t("inventory.form.referencesSection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("inventory.form.sku")}</FormLabel>
                    <FormControl>
                      <Input
                        className="h-10 rounded-xl font-mono uppercase"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inventory.form.barcode")}</FormLabel>
                    <FormControl>
                      <Input
                        className="h-10 rounded-xl font-mono"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
