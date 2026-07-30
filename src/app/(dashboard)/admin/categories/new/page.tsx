"use client"

import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CategorySchema, Category } from "@/lib/types"
import { CategoryService } from "@/services/category.service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { Switch } from "@/components/ui/switch"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  Loader2,
  Save,
  FolderTree,
  Tag,
  Layers,
  Info,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useCreateReturn } from "@/hooks/use-create-return"
import { ENTITY_ROUTES, readReturnContext } from "@/lib/navigation/return-to"
import { applyReturnSelection } from "@/hooks/use-return-selection"
import { getCategoryPath } from "@/lib/category-utils"
import { StatusBadge } from "@/components/ui/status-badge"
import { useT } from "@/i18n/context"

export default function NewCategoryPage() {
  const router = useRouter()
  const t = useT()
  const { redirectAfterCreate, cancelHref } = useCreateReturn(
    "/admin/categories",
    ENTITY_ROUTES.category.param
  )
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const form = useForm<Omit<Category, "id">>({
    resolver: zodResolver(CategorySchema.omit({ id: true })),
    defaultValues: {
      name: "",
      parentId: null,
      description: "",
      active: true,
    },
  })

  const parentId = useWatch({ control: form.control, name: "parentId" })
  const isActive = useWatch({ control: form.control, name: "active" })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await CategoryService.listCategories()
        if (cancelled) return
        setCategories(data)

        await applyReturnSelection(
          ENTITY_ROUTES.category.param,
          (id) => form.setValue("parentId", id),
          {
            successMessage: t(ENTITY_ROUTES.category.createdMessageKey),
            errorMessage: t("hooks.returnSelectionError"),
            reload: async () => {
              const cats = await CategoryService.listCategories()
              setCategories(cats)
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

  const parentPath = parentId ? getCategoryPath(categories, parentId) : []

  const onSubmit = async (values: Omit<Category, "id">) => {
    try {
      const category = await CategoryService.createCategory(values)
      if (!readReturnContext(ENTITY_ROUTES.category.param).returnTo) {
        toast.success(t("categories.form.created"))
      }
      redirectAfterCreate(category.id)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("common.errorCreation")
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-xl">
          <Link href={cancelHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <FolderTree className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("categories.form.newTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("categories.form.newSubtitle")}
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tag className="h-4 w-4 text-primary" />
                {t("categories.form.identification")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("categories.form.identificationDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("categories.form.name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("categories.form.namePlaceholder")}
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("categories.form.descriptionPlaceholder")}
                        className="min-h-[80px] rounded-xl resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      {t("categories.form.descriptionHint")}
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
                <Layers className="h-4 w-4 text-primary" />
                {t("categories.form.hierarchyTitle")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("categories.form.hierarchyDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("categories.form.parent")}</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value || "none"}
                        onValueChange={(value) =>
                          field.onChange(value === "none" ? null : value)
                        }
                        placeholder={t("categories.form.parentPlaceholder")}
                        searchPlaceholder={t("categories.searchPlaceholder")}
                        options={[
                          { value: "none", label: t("categories.form.parentNone") },
                          ...categories.map((cat) => ({
                            value: cat.id,
                            label: cat.name,
                            keywords: [cat.name, cat.description],
                          })),
                        ]}
                      />
                    </FormControl>
                    {parentPath.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {t("categories.form.pathLabel")}
                        </span>
                        {parentPath.map((segment, i) => (
                          <StatusBadge key={i} tone="slate" className="text-[10px]">
                            {segment}
                          </StatusBadge>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-xl border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {t("categories.form.active")}
                      </FormLabel>
                      <FormDescription className="text-[11px]">
                        {isActive
                          ? t("categories.form.activeDescOn")
                          : t("categories.form.activeDescOff")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>{t("categories.form.hierarchyHint")}</p>
              </div>
            </CardContent>
          </Card>

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
              className="min-w-[160px] rounded-xl font-semibold"
            >
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
