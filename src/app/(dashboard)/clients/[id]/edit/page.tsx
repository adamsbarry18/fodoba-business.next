"use client"

import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ClientSchema, Client } from "@/lib/types"
import { ClientService } from "@/services/client.service"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  Loader2,
  Save,
  Phone,
  MapPin,
  CreditCard,
  Info,
  User,
  Edit,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/client-utils"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"
import { useCurrency } from "@/hooks/use-currency"

export default function EditClientPage() {
  const router = useRouter()
  const params = useParams()
  const t = useT()
  const { formatAmount } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [currentDebt, setCurrentDebt] = useState(0)

  const form = useForm<Client>({
    resolver: zodResolver(ClientSchema),
  })

  useEffect(() => {
    const load = async () => {
      try {
        const data = await ClientService.getClient(params.id as string)
        if (data) {
          form.reset(data)
          setCurrentDebt(data.currentDebt)
        } else {
          toast.error(t("clients.detail.notFound"))
          router.push("/clients")
        }
      } catch {
        toast.error(t("common.errorLoading"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [params.id, router, form, t])

  const selectedType = useWatch({ control: form.control, name: "type" })
  const selectedStatus = useWatch({ control: form.control, name: "status" })

  const onSubmit = async (values: Client) => {
    try {
      await ClientService.updateClient(params.id as string, {
        name: values.name,
        phone: values.phone,
        address: values.address,
        type: values.type,
        status: values.status,
        creditCeiling: values.creditCeiling,
      })
      toast.success(t("clients.form.updated"))
      router.push(`/clients/${params.id}`)
    } catch {
      toast.error(t("common.errorUpdate"))
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-xl">
          <Link href={`/clients/${params.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Edit className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("clients.form.editTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("clients.form.editSubtitle")}</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" />
                {t("clients.form.identification")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("clients.form.identificationDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("clients.form.name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("clients.form.namePlaceholder")}
                        className="h-10 rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("clients.form.phone")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="+224 6XX XX XX XX"
                            className="h-10 rounded-xl pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("clients.form.address")}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder={t("clients.form.addressPlaceholder")}
                            className="h-10 rounded-xl pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4 text-primary" />
                {t("clients.form.classificationTitle")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("clients.form.classificationDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-4 sm:p-6">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("clients.form.clientType")}</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {CLIENT_TYPES.map((clientType) => (
                        <button
                          key={clientType.value}
                          type="button"
                          onClick={() => field.onChange(clientType.value)}
                          className={cn(
                            "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                            selectedType === clientType.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <StatusBadge
                            preset="clientType"
                            value={clientType.value}
                            className="text-[10px]"
                          />
                          <span className="text-sm font-semibold">
                            {t(clientType.labelKey)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {t(clientType.descriptionKey)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("clients.form.status")}</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {CLIENT_STATUSES.map((clientStatus) => (
                        <button
                          key={clientStatus.value}
                          type="button"
                          onClick={() => field.onChange(clientStatus.value)}
                          className={cn(
                            "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                            selectedStatus === clientStatus.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <StatusBadge
                            preset="clientStatus"
                            value={clientStatus.value}
                            className="text-[10px]"
                          />
                          <span className="text-sm font-semibold">
                            {t(clientStatus.labelKey)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {t(clientStatus.descriptionKey)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="creditCeiling"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("clients.form.creditCeiling")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        className="h-10 rounded-xl"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      {t("clients.form.creditCeilingHint")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {currentDebt > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p>
                    {t("clients.form.currentDebtHint", {
                      amount: formatAmount(currentDebt),
                    })}
                  </p>
                </div>
              )}
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
              className="min-w-[180px] rounded-xl font-semibold"
            >
              {form.formState.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("clients.form.saveChanges")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
