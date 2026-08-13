
"use client"

import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ProductCreateFormSchema, ProductCreateFormValues, ProductFormValues, Category } from "@/lib/types"
import { ProductService } from "@/services/product.service"
import { CategoryService } from "@/services/category.service"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save, Package } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useCreateReturn } from "@/hooks/use-create-return"
import { ENTITY_ROUTES, readReturnContext } from "@/lib/navigation/return-to"
import { applyReturnSelection } from "@/hooks/use-return-selection"
import { generateProductSku, DEFAULT_RETAIL_UNIT } from "@/lib/product-utils"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { ProductFormFields } from "@/components/inventory/product-form-fields"
import { useT } from "@/i18n/context"
import { usePermissions } from "@/hooks/use-permissions"

export default function NewProductPage() {
  const router = useRouter()
  const { activeStore } = useStore()
  const { userProfile, loading: authLoading } = useAuth()
  const { can } = usePermissions()
  const canManageCatalog = can("manage:catalog")
  const { redirectAfterCreate, cancelHref } = useCreateReturn(
    "/inventory",
    ENTITY_ROUTES.product.param
  )
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const t = useT()

  const form = useForm<ProductCreateFormValues>({
    resolver: zodResolver(ProductCreateFormSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      categoryId: "",
      imageUrl: undefined,
      packagingUnit: "",
      unit: DEFAULT_RETAIL_UNIT,
      unitsPerPack: 1,
      retailQtyFactor: 1,
      initialStockPackaging: 0,
      detailStock: undefined,
      manufacturingDate: "",
      expirationDate: "",
      purchasePriceRef: 0,
      wholesalePriceFCFA: 0,
      sellingPriceFCFA: 0,
      lowStockThreshold: 10,
      active: true,
      prices: { GNF: 0, USD: 0, EUR: 0 },
    },
  })

  useEffect(() => {
    // Profil null pendant logout ≠ refus de droit
    if (authLoading || !userProfile) return
    if (!canManageCatalog) {
      toast.error(t("common.accessDenied"))
      router.replace("/inventory")
    }
  }, [authLoading, userProfile, canManageCatalog, router, t])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await CategoryService.listCategories()
        if (cancelled) return
        setCategories(data.filter((c) => c.active))

        await applyReturnSelection(
          ENTITY_ROUTES.category.param,
          (id) => form.setValue("categoryId", id),
          {
            successMessage: t(ENTITY_ROUTES.category.createdMessageKey),
            errorMessage: t("hooks.returnSelectionError"),
            reload: async () => {
              const cats = await CategoryService.listCategories()
              setCategories(cats.filter((c) => c.active))
            },
          }
        )
      } catch {
        if (!cancelled) toast.error(t("common.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [form, t])

  const onSubmit = async (values: ProductCreateFormValues) => {
    if (!canManageCatalog) {
      toast.error(t("common.accessDenied"))
      return
    }
    if (!activeStore) {
      toast.error(t("inventory.selectStoreForStock"))
      return
    }

    try {
      const {
        initialStockPackaging,
        detailStock,
        barcode,
        packagingUnit,
        manufacturingDate,
        expirationDate,
        imageUrl: _imageUrl,
        sku: _sku,
        ...productFields
      } = values

      const payload = {
        ...productFields,
        sku: generateProductSku(values.name),
        barcode: barcode?.trim() || undefined,
        packagingUnit: packagingUnit?.trim() || undefined,
        manufacturingDate: manufacturingDate || undefined,
        expirationDate: expirationDate || undefined,
        imageUrl: undefined as string | undefined,
      }

      const product = await ProductService.createProductWithInitialStock(payload, {
        storeId: activeStore.id,
        initialStockPackaging,
        detailStock,
      })

      if (imageFile) {
        try {
          const imageUrl = await ProductService.uploadProductImage(product.id, imageFile)
          await ProductService.updateProduct(product.id, { imageUrl })
        } catch {
          toast.error(t("inventory.imageUploadError"))
        }
      }

      const { returnTo } = readReturnContext(ENTITY_ROUTES.product.param)
      if (returnTo) {
        redirectAfterCreate(product.id)
        return
      }

      toast.success(t("common.successProductAdded"))
      router.push(`/inventory/${product.id}`)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("common.errorCreation")
      toast.error(message)
    }
  }

  if (!canManageCatalog) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-xl">
          <Link href={cancelHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("inventory.newTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("inventory.newSubtitle")}</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <ProductFormFields
            form={form as UseFormReturn<ProductFormValues>}
            categories={categories}
            mode="create"
            categoryReturnPath="/inventory/new"
            imageFile={imageFile}
            onImageFileChange={setImageFile}
            showReferences={false}
          />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              type="button"
              className="rounded-xl font-semibold"
              onClick={() => router.back()}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="min-w-[180px] rounded-xl font-semibold"
            >
              {form.formState.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("inventory.saveProduct")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
