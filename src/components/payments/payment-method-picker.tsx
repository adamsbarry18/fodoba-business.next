"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PaymentMethod } from "@/lib/types"
import {
  EXTRA_PAYMENT_METHODS,
  PRIMARY_PAYMENT_METHODS,
  getPaymentMethodLabel,
  isExtraPaymentMethod,
  type PaymentMethodOption,
} from "@/lib/constants/payment-methods"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/context"

export type PaymentMethodPickerProps = {
  value: PaymentMethod
  onValueChange: (method: PaymentMethod) => void
  disabled?: boolean
  className?: string
  /** Restrict selectable methods (defaults to all). */
  allowedMethods?: PaymentMethod[]
}

function optionAllowed(
  option: PaymentMethodOption,
  allowed?: PaymentMethod[]
): boolean {
  return !allowed || allowed.includes(option.id)
}

export function PaymentMethodPicker({
  value,
  onValueChange,
  disabled,
  className,
  allowedMethods,
}: PaymentMethodPickerProps) {
  const t = useT()
  const [addedExtras, setAddedExtras] = useState<PaymentMethod[]>(() =>
    isExtraPaymentMethod(value) ? [value] : []
  )

  useEffect(() => {
    if (!isExtraPaymentMethod(value)) return
    setAddedExtras((prev) => (prev.includes(value) ? prev : [...prev, value]))
  }, [value])

  const primaryOptions = useMemo(
    () => PRIMARY_PAYMENT_METHODS.filter((o) => optionAllowed(o, allowedMethods)),
    [allowedMethods]
  )

  const visibleExtras = useMemo(() => {
    const ids = new Set(addedExtras)
    if (isExtraPaymentMethod(value)) ids.add(value)
    return EXTRA_PAYMENT_METHODS.filter(
      (o) => ids.has(o.id) && optionAllowed(o, allowedMethods)
    )
  }, [addedExtras, allowedMethods, value])

  const availableExtras = useMemo(
    () =>
      EXTRA_PAYMENT_METHODS.filter(
        (o) =>
          optionAllowed(o, allowedMethods) &&
          !visibleExtras.some((v) => v.id === o.id)
      ),
    [allowedMethods, visibleExtras]
  )

  const addExtra = (method: PaymentMethod) => {
    setAddedExtras((prev) => (prev.includes(method) ? prev : [...prev, method]))
    onValueChange(method)
  }

  const removeExtra = (method: PaymentMethod) => {
    setAddedExtras((prev) => prev.filter((m) => m !== method))
    if (value === method) {
      onValueChange(primaryOptions[0]?.id ?? "CASH")
    }
  }

  const renderChip = (option: PaymentMethodOption, removable = false) => {
    const selected = value === option.id
    return (
      <div key={option.id} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onValueChange(option.id)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors",
            selected
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background hover:bg-muted",
            disabled && "cursor-not-allowed opacity-50",
            removable && "pr-8"
          )}
        >
          {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{t(option.label)}</span>
        </button>
        {removable && !disabled && (
          <button
            type="button"
            aria-label={t("payment.removeMethod")}
            onClick={(e) => {
              e.stopPropagation()
              removeExtra(option.id)
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {primaryOptions.map((option) => renderChip(option))}
        {visibleExtras.map((option) => renderChip(option, true))}
      </div>

      {availableExtras.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-9 w-full rounded-xl border-dashed text-xs font-semibold"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("payment.addMethod")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {availableExtras.map((option) => (
              <DropdownMenuItem
                key={option.id}
                onSelect={() => addExtra(option.id)}
                className="text-xs font-medium"
              >
                {t(getPaymentMethodLabel(option.id))}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
