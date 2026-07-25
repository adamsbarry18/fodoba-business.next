
"use client"

import { useForm, type Resolver, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ProductEditFormSchema, ProductEditFormValues, Category, ProductFormValues } from "@/lib/types"
import { ProductService } from "@/services/product.service"
import { InventoryService } from "@/services/inventory.service"
import { CategoryService } from "@/services/category.service"
import { Button } from "@/components/ui/button"
import { Form } from "@/components/ui/form"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save, Package } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { applyReturnSelection } from "@/hooks/use-return-selection"
import { ENTITY_ROUTES } from "@/lib/navigation/return-to"
import { getRetailUnitsPerPack, normalizeProduct } from "@/lib/product-utils"
import type { DecomposedStock } from "@/lib/stock-utils"
import { ProductFormFields } from "@/components/inventory/product-form-fields"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { usePermissions } from "@/hooks/use-permissions"
import { useT } from "@/i18n/context"

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [originalStock, setOriginalStock] = useState<DecomposedStock>({
    packagingQty: 0,
    detailQty: 0,
    quantity: 0,
  })
  const t = useT()
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const { can } = usePermissions()
  const canAdjustStock = can("adjust:stock")

  const form = useForm<ProductEditFormValues>({
    resolver: zodResolver(ProductEditFormSchema) as unknown as Resolver<ProductEditFormValues>,
    defaultValues: {
      initialStockPackaging: 0,
      detailStock: 0,
    },
  })

  const editReturnPath = `/inventory/${params.id}/edit`

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const productId = params.id as string
        const [prod, cats] = await Promise.all([
          ProductService.getProduct(productId),
          CategoryService.listCategories(),
        ])
        if (cancelled) return

        if (prod) {
          const normalized = normalizeProduct(prod)
          let initialStockPackaging = 0
          let detailStock = 0

          if (activeStore) {
            const stockRecord = await ProductService.getStockRecord(
              productId,
              activeStore.id,
              getRetailUnitsPerPack(normalized)
            )
            if (cancelled) return
            initialStockPackaging = stockRecord.packagingQty
            detailStock = stockRecord.detailQty
            setOriginalStock(stockRecord)
          }
          form.reset({
            ...normalized,
            initialStockPackaging,
            detailStock,
          })
        } else {
          toast.error(t("common.errorProductNotFound"))
          router.push("/inventory")
        }
        setCategories(cats.filter((c) => c.active))

        await applyReturnSelection(
          ENTITY_ROUTES.category.param,
          (id) => form.setValue("categoryId", id),
          {
            successMessage: t(ENTITY_ROUTES.category.createdMessageKey),
            errorMessage: t("hooks.returnSelectionError"),
            reload: async () => {
              const fresh = await CategoryService.listCategories()
              setCategories(fresh.filter((c) => c.active))
            },
          }
        )
      } catch {
        if (!cancelled) toast.error(t("common.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeStore?.id suffit (évite rechargements)
  }, [params.id, form, router, t, activeStore?.id])

  const onSubmit = async (values: ProductEditFormValues) => {
    try {
      const productId = params.id as string
      const {
        initialStockPackaging,
        detailStock,
        id: _id,
        createdAt: _createdAt,
        ...productFields
      } = values
      let imageUrl = productFields.imageUrl

      if (imageFile) {
        imageUrl = await ProductService.uploadProductImage(productId, imageFile)
      }

      await ProductService.updateProduct(
        productId,
        {
          ...productFields,
          imageUrl,
          manufacturingDate: productFields.manufacturingDate || undefined,
          expirationDate: productFields.expirationDate || undefined,
          packagingUnit: productFields.packagingUnit || undefined,
        },
        { storeId: activeStore?.id }
      )

      if (activeStore && userProfile && canAdjustStock) {
        const packagingQty = initialStockPackaging ?? 0
        const detailQty = detailStock ?? 0
        const original = originalStock

        if (packagingQty !== original.packagingQty || detailQty !== original.detailQty) {
          await InventoryService.setStockDecomposed({
            productId,
            storeId: activeStore.id,
            packagingQty,
            detailQty,
            user: userProfile,
            reason: t("inventory.form.stockCorrectionReason"),
          })
        }
      }

      toast.success(t("inventory.updatedSuccess"))
      router.push("/inventory")
    } catch (error: unknown) {
      if (error instanceof Error && imageFile) {
        toast.error(t("inventory.imageUploadError"))
        return
      }
      toast.error(error instanceof Error ? error.message : t("common.errorUpdate"))
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-xl">
          <Link href="/inventory">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t("inventory.editTitle")}</h1>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <ProductFormFields
            form={form as unknown as UseFormReturn<ProductFormValues>}
            categories={categories}
            mode="edit"
            categoryReturnPath={editReturnPath}
            imageFile={imageFile}
            onImageFileChange={setImageFile}
            productId={params.id as string}
            activeStoreName={activeStore?.name}
            canAdjustStock={canAdjustStock}
          />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" type="button" className="rounded-xl" onClick={() => router.back()}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting} className="rounded-xl font-semibold">
              {form.formState.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
