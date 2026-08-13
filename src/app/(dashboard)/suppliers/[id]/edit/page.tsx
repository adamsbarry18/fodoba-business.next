
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SupplierSchema, Supplier } from "@/lib/types"
import { SupplierService } from "@/services/supplier.service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useT } from "@/i18n/context"
import { SUPPLIER_CURRENCIES } from "@/lib/supplier-utils"
import { getCurrencySelectLabel } from "@/lib/constants/currencies"

export default function EditSupplierPage() {
  const router = useRouter()
  const params = useParams()
  const t = useT()
  const [loading, setLoading] = useState(true)
  
  const form = useForm<Supplier>({
    resolver: zodResolver(SupplierSchema),
  })

  useEffect(() => {
    const load = async () => {
      try {
        const data = await SupplierService.getSupplier(params.id as string)
        if (data) {
          form.reset(data)
        } else {
          toast.error(t("suppliers.notFound"))
          router.push("/suppliers")
        }
      } catch {
        toast.error(t("common.errorLoading"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [form, params.id, router, t])

  const onSubmit = async (values: Supplier) => {
    try {
      await SupplierService.updateSupplier(params.id as string, {
        name: values.name,
        country: values.country,
        city: values.city,
        type: values.type,
        defaultCurrency: values.defaultCurrency,
        paymentTerms: values.paymentTerms,
      })
      toast.success(t("suppliers.updateSuccess"))
      router.push(`/suppliers/${params.id}`)
    } catch {
      toast.error(t("common.errorUpdate"))
    }
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-accent" /></div>

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/suppliers/${params.id}`}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("suppliers.editTitle")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{form.getValues("name")}</CardTitle>
          <CardDescription>{t("suppliers.editDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("suppliers.nameLabel")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("suppliers.countryLabel")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("suppliers.cityLabel")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("suppliers.typeLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="local">{t("suppliers.typeLocalExtended")}</SelectItem>
                          <SelectItem value="import">{t("suppliers.typeImportExtended")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("suppliers.defaultCurrencyLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SUPPLIER_CURRENCIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {getCurrencySelectLabel(c.value, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="paymentTerms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("suppliers.paymentTermsLabel")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
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
                  {t("suppliers.saveChanges")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
