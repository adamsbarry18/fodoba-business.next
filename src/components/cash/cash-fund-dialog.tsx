"use client"

import { useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { toast } from "sonner"
import { Loader2, Save, ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react"
import { PaymentMethodPicker } from "@/components/payments/payment-method-picker"
import { type FundOperationType } from "@/lib/cash-session-utils"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { PaymentMethodSchema, type PaymentMethod } from "@/lib/types"
import { useT } from "@/i18n/context"

type CashFundFormValues = {
  type: FundOperationType
  method: PaymentMethod
  amount: number
  reason: string
}

type CashFundDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CashFundFormValues) => Promise<void>
}

const FUND_TYPE_KEYS: Record<FundOperationType, { label: string; description: string; hint: string }> = {
  IN: {
    label: "cashFund.typeIn.label",
    description: "cashFund.typeIn.description",
    hint: "cashFund.typeIn.hint",
  },
  OUT: {
    label: "cashFund.typeOut.label",
    description: "cashFund.typeOut.description",
    hint: "cashFund.typeOut.hint",
  },
}

export function CashFundDialog({ open, onOpenChange, onSubmit }: CashFundDialogProps) {
  const t = useT()

  const schema = useMemo(
    () =>
      z.object({
        type: z.enum(["IN", "OUT"]),
        method: PaymentMethodSchema,
        amount: z.coerce.number().min(1, t("cashFund.validation.amountMin")),
        reason: z.string().min(3, t("cashFund.validation.reasonMin")),
      }),
    [t]
  )

  const form = useForm<CashFundFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "IN",
      method: "CASH",
      amount: 0,
      reason: "",
    },
  })

  const selectedType = useWatch({ control: form.control, name: "type" })

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset()
    onOpenChange(next)
  }

  const handleSubmit = async (values: CashFundFormValues) => {
    try {
      await onSubmit(values)
      form.reset()
      onOpenChange(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("cashFund.error")
      toast.error(message)
    }
  }

  const reasonPlaceholder =
    selectedType === "IN"
      ? t(FUND_TYPE_KEYS.IN.hint)
      : selectedType === "OUT"
        ? t(FUND_TYPE_KEYS.OUT.hint)
        : t("cashFund.reasonPlaceholder")

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden rounded-2xl border p-0 shadow-lg">
        <DialogHeader className="border-b bg-muted/20 p-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            {t("cashFund.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">{t("cashFund.desc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t("cashFund.sessionWarning")}</p>
              </div>

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("cashFund.operationType")}</FormLabel>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["IN", "OUT"] as const).map((opValue) => {
                        const keys = FUND_TYPE_KEYS[opValue]
                        return (
                          <button
                            key={opValue}
                            type="button"
                            onClick={() => field.onChange(opValue)}
                            className={cn(
                              "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                              selectedType === opValue
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "hover:bg-muted/50"
                            )}
                          >
                            <StatusBadge
                              tone={opValue === "IN" ? "success" : "destructive"}
                              className="text-[10px]"
                            >
                              {opValue === "IN" ? (
                                <ArrowDownToLine className="mr-1 h-3 w-3" />
                              ) : (
                                <ArrowUpFromLine className="mr-1 h-3 w-3" />
                              )}
                              {t(keys.label)}
                            </StatusBadge>
                            <span className="text-sm font-semibold">{t(keys.label)}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {t(keys.description)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("cashFund.cashLine")}</FormLabel>
                    <FormControl>
                      <PaymentMethodPicker
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("cashFund.amount")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        inputMode="decimal"
                        placeholder="0"
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
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("cashFund.reason")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={reasonPlaceholder}
                        className="h-10 rounded-xl"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      {t("cashFund.reasonHint")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="flex flex-row justify-end gap-3 border-t bg-muted/20 p-6">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl font-semibold"
                onClick={() => handleOpenChange(false)}
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
                {t("cashFund.validate")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export type { CashFundFormValues, FundOperationType }
