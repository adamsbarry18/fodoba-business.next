
"use client"

import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { SupplierSchema, Supplier } from "@/lib/types"
import { SupplierService } from "@/services/supplier.service"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { useCurrency } from "@/hooks/use-currency"
import { toast } from "sonner"
import {
  ArrowLeft,
  Loader2,
  Save,
  Truck,
  Globe,
  MapPin,
  Coins,
  Info,
  Building2,
} from "lucide-react"
import Link from "next/link"
import { useCreateReturn } from "@/hooks/use-create-return"
import { ENTITY_ROUTES, readReturnContext } from "@/lib/navigation/return-to"
import { SUPPLIER_CURRENCIES, SUPPLIER_TYPES } from "@/lib/supplier-utils"
import { STORAGE_CURRENCY, getCurrencySelectLabel } from "@/lib/constants/currencies"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"

export default function NewSupplierPage() {
  const { formatAmount } = useCurrency()
  const router = useRouter()
  const t = useT()
  const { redirectAfterCreate, cancelHref } = useCreateReturn(
    "/suppliers",
    ENTITY_ROUTES.supplier.param
  )

  const form = useForm<Omit<Supplier, "id" | "createdAt" | "currentDebt">>({
    resolver: zodResolver(
      SupplierSchema.omit({ id: true, createdAt: true, currentDebt: true })
    ),
    defaultValues: {
      name: "",
      country: "",
      city: "",
      type: "local",
      defaultCurrency: STORAGE_CURRENCY,
      paymentTerms: "Comptant",
    },
  })

  const selectedType = useWatch({ control: form.control, name: "type" })

  const onSubmit = async (values: Omit<Supplier, "id" | "createdAt" | "currentDebt">) => {
    try {
      const supplier = await SupplierService.createSupplier(values)
      if (!readReturnContext(ENTITY_ROUTES.supplier.param).returnTo) {
        toast.success(t("suppliers.addSuccess"))
      }
      redirectAfterCreate(supplier.id)
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
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("entity.supplier.new")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("suppliers.newSubtitle")}
            </p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                {t("suppliers.sectionIdentification")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("suppliers.sectionIdentificationDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("suppliers.nameLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("suppliers.namePlaceholder")}
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
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("suppliers.typeLabel")}</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {SUPPLIER_TYPES.map((typeOption) => (
                        <button
                          key={typeOption.value}
                          type="button"
                          onClick={() => field.onChange(typeOption.value)}
                          className={cn(
                            "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                            selectedType === typeOption.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <StatusBadge
                            preset="supplierType"
                            value={typeOption.value}
                            icon={
                              typeOption.value === "import" ? (
                                <Globe className="h-3 w-3" />
                              ) : (
                                <Truck className="h-3 w-3" />
                              )
                            }
                            className="text-[10px]"
                          />
                          <span className="text-sm font-semibold">{t(typeOption.labelKey)}</span>
                          <span className="text-[11px] text-muted-foreground">{t(typeOption.descriptionKey)}</span>
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <CardHeader className="border-b bg-muted/20 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-primary" />
                {t("suppliers.sectionLocation")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("suppliers.sectionLocationDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("suppliers.countryLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("suppliers.countryPlaceholder")}
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
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("suppliers.cityLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("suppliers.cityPlaceholder")}
                          className="h-10 rounded-xl"
                          {...field}
                        />
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
                <Coins className="h-4 w-4 text-primary" />
                {t("suppliers.sectionCommercial")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("suppliers.sectionCommercialDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="defaultCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("suppliers.defaultCurrencyLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 rounded-xl">
                            <SelectValue placeholder={t("suppliers.filterCurrency")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {SUPPLIER_CURRENCIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {getCurrencySelectLabel(c.value, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-[11px]">
                        {t("suppliers.currencyHint")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("suppliers.paymentTermsLabel")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("suppliers.paymentTermsPlaceholder")}
                          className="h-10 rounded-xl"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  {t("suppliers.initialDebtHintPrefix")}{" "}
                  <strong className="text-foreground">{formatAmount(0)}</strong>.{" "}
                  {t("suppliers.initialDebtHintSuffix")}
                </p>
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
              className="min-w-[200px] rounded-xl font-semibold"
            >
              {form.formState.isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("suppliers.saveSupplier")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
