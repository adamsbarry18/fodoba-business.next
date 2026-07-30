"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CategorySchema, Category } from "@/lib/types"
import { CategoryService } from "@/services/category.service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { Switch } from "@/components/ui/switch"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useT } from "@/i18n/context"

export default function EditCategoryPage() {
  const router = useRouter()
  const params = useParams()
  const t = useT()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const form = useForm<Category>({
    resolver: zodResolver(CategorySchema),
  })

  useEffect(() => {
    const init = async () => {
      try {
        const [catData, allCats] = await Promise.all([
          CategoryService.getCategory(params.id as string),
          CategoryService.listCategories(),
        ])

        if (catData) {
          form.reset(catData)
        } else {
          toast.error(t("categories.form.notFound"))
          router.push("/admin/categories")
        }
        setCategories(allCats.filter((c) => c.id !== params.id))
      } catch {
        toast.error(t("common.errorLoading"))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [params.id, form, router, t])

  const onSubmit = async (values: Category) => {
    try {
      await CategoryService.updateCategory(params.id as string, values)
      toast.success(t("categories.form.updated"))
      router.push("/admin/categories")
    } catch {
      toast.error(t("categories.form.updateError"))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/categories">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{t("categories.form.editTitle")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{form.getValues("name")}</CardTitle>
          <CardDescription>{t("categories.form.editDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("categories.form.name")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">{t("categories.form.active")}</FormLabel>
                      <FormDescription>
                        {t("categories.form.activeDescEdit")}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4">
                <Button variant="outline" type="button" onClick={() => router.back()}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {t("categories.form.saveChanges")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
