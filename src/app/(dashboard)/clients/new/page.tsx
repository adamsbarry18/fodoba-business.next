
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
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  Loader2,
  Save,
  UserPlus,
  Phone,
  MapPin,
  CreditCard,
  Info,
  User,
} from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { useStore } from "@/lib/contexts/StoreContext"
import { useCreateReturn } from "@/hooks/use-create-return"
import { ENTITY_ROUTES, readReturnContext } from "@/lib/navigation/return-to"
import { CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/client-utils"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"

export default function NewClientPage() {
  const router = useRouter()
  const t = useT()
  const { activeStore } = useStore()
  const { redirectAfterCreate, cancelHref } = useCreateReturn(
    "/clients",
    ENTITY_ROUTES.client.param
  )

  const form = useForm<Omit<Client, "id" | "createdAt" | "currentDebt">>({
    resolver: zodResolver(
      ClientSchema.omit({ id: true, createdAt: true, currentDebt: true })
    ),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      type: "particulier",
      status: "actif",
      creditCeiling: 0,
      storeOfOriginId: activeStore?.id || "",
    },
  })

  useEffect(() => {
    if (activeStore?.id) {
      form.setValue("storeOfOriginId", activeStore.id)
    }
  }, [activeStore?.id, form])

  const selectedType = useWatch({ control: form.control, name: "type" })
  const selectedStatus = useWatch({ control: form.control, name: "status" })

  const onSubmit = async (values: Omit<Client, "id" | "createdAt" | "currentDebt">) => {
    try {
      const client = await ClientService.createClient({
        ...values,
        storeOfOriginId: activeStore?.id || values.storeOfOriginId || "unknown",
      })
      if (!readReturnContext(ENTITY_ROUTES.client.param).returnTo) {
        toast.success(t("clients.form.created"))
      }
      redirectAfterCreate(client.id)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : t("common.errorCreation")
      toast.error(message)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-xl">
          <Link href={cancelHref}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("clients.form.newTitle")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("clients.form.newSubtitle")}
            </p>
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

              {activeStore && (
                <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p>
                    {t("clients.form.originStore", { name: activeStore.name })}
                  </p>
                </div>
              )}
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
                    <FormLabel required>{t("clients.form.initialStatus")}</FormLabel>
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
              {t("clients.form.saveClient")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
