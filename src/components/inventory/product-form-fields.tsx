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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldWithAdd } from "@/components/forms/field-with-add"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { computeInitialStockTotal } from "@/lib/product-utils"
import { Coins, ImageIcon, Scale, Tags, X, Info } from "lucide-react"
import { useT } from "@/i18n/context"

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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue placeholder={t("inventory.form.chooseCategory")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            <CardDescription className="text-xs">
              {t("inventory.form.logisticsUnitsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <FormField
              control={form.control}
              name="packagingUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.form.packagingUnit")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("inventory.form.packagingUnitPlaceholder")}
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
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("inventory.form.retailUnit")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("inventory.form.retailUnitPlaceholder")}
                      className="h-10 rounded-xl"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
            <FormDescription className="text-[11px]">
              {t("inventory.form.unitsPerPackHint")}
            </FormDescription>

            {showStockFields && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="initialStockPackaging"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.form.initialStock")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          className="h-10 rounded-xl"
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="detailStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("inventory.form.detailStock")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
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
              </div>
            )}

            {showStockFields && (
              <FormDescription className="text-[11px]">
                {mode === "edit" && activeStoreName
                  ? t("inventory.form.editStockStoreHint", { store: activeStoreName })
                  : null}
                {mode === "edit" && activeStoreName ? " · " : null}
                {t("inventory.form.initialStockPackagingHint", {
                  unit: packagingUnit || t("inventory.form.packagingFallback"),
                })}
                {" · "}
                {t("inventory.form.detailStockHint")}
              </FormDescription>
            )}

            {showStockFields && computedStock !== null && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                <p className="font-semibold text-primary">
                  {t("inventory.form.computedStockTitle")}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {t("inventory.form.computedStockValue", {
                    total: computedStock,
                    unit: retailUnit || t("inventory.form.unitFallback"),
                  })}
                </p>
              </div>
            )}

            {mode === "edit" && !activeStoreName && (
              <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>{t("inventory.form.selectStoreForStock")}</p>
                </div>
              </div>
            )}

            {mode === "edit" && activeStoreName && !canAdjustStock && (
              <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-2">
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
          <CardDescription className="text-xs">{t("inventory.form.pricingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="purchasePriceRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.form.purchasePrice")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      className="h-10 rounded-xl"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription className="text-[10px]">
                    {t("inventory.form.unitCostHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="wholesalePriceFCFA"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("inventory.form.wholesalePrice")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
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
                <FormItem>
                  <FormLabel required>{t("inventory.form.retailPrice")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      className="h-10 rounded-xl font-headline font-bold"
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
