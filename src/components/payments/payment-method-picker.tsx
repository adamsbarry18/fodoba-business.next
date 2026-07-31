"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PaymentMethod } from "@/lib/types"
import {
  PRIMARY_PAYMENT_METHODS,
  isExtraOrCustomPaymentMethod,
  isPrimaryPaymentMethod,
  normalizePaymentMethodInput,
  resolvePaymentMethodDisplay,
  type PaymentMethodOption,
} from "@/lib/constants/payment-methods"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/context"

export type PaymentMethodPickerProps = {
  value: PaymentMethod
  onValueChange: (method: PaymentMethod) => void
  disabled?: boolean
  className?: string
  /** Restrict selectable primary methods (defaults to all primary). */
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [customMethods, setCustomMethods] = useState<string[]>(() =>
    isExtraOrCustomPaymentMethod(value) ? [value] : []
  )
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState("")

  useEffect(() => {
    if (!isExtraOrCustomPaymentMethod(value)) return
    setCustomMethods((prev) => (prev.includes(value) ? prev : [...prev, value]))
  }, [value])

  useEffect(() => {
    if (!isAdding) return
    inputRef.current?.focus()
  }, [isAdding])

  const primaryOptions = useMemo(
    () => PRIMARY_PAYMENT_METHODS.filter((o) => optionAllowed(o, allowedMethods)),
    [allowedMethods]
  )

  const visibleCustoms = useMemo(() => {
    const ids = new Set(customMethods)
    if (isExtraOrCustomPaymentMethod(value)) ids.add(value)
    return [...ids]
  }, [customMethods, value])

  const labelFor = (method: string) =>
    resolvePaymentMethodDisplay(method, (key) => t(key))

  const confirmCustom = () => {
    const normalized = normalizePaymentMethodInput(draft)
    if (!normalized) return

    if (isPrimaryPaymentMethod(normalized)) {
      onValueChange(normalized)
      setDraft("")
      setIsAdding(false)
      return
    }

    setCustomMethods((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized]
    )
    onValueChange(normalized)
    setDraft("")
    setIsAdding(false)
  }

  const cancelAdding = () => {
    setDraft("")
    setIsAdding(false)
  }

  const removeCustom = (method: string) => {
    setCustomMethods((prev) => prev.filter((m) => m !== method))
    if (value === method) {
      onValueChange(primaryOptions[0]?.id ?? "CASH")
    }
  }

  const renderChip = (method: string, label: string, removable = false) => {
    const selected = value === method
    return (
      <div key={method} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onValueChange(method)}
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
          <span className="truncate">{label}</span>
        </button>
        {removable && !disabled && (
          <button
            type="button"
            aria-label={t("payment.removeMethod")}
            onClick={(e) => {
              e.stopPropagation()
              removeCustom(method)
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
        {primaryOptions.map((option) =>
          renderChip(option.id, t(option.label))
        )}
        {visibleCustoms.map((method) =>
          renderChip(method, labelFor(method), true)
        )}
      </div>

      {isAdding ? (
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={draft}
            disabled={disabled}
            maxLength={48}
            placeholder={t("payment.customMethodPlaceholder")}
            className="h-9 rounded-xl text-xs"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                confirmCustom()
              }
              if (e.key === "Escape") {
                e.preventDefault()
                cancelAdding()
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled || !normalizePaymentMethodInput(draft)}
            className="h-9 shrink-0 rounded-xl text-xs font-semibold"
            onClick={confirmCustom}
          >
            {t("payment.confirmCustomMethod")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="h-9 shrink-0 rounded-xl px-2"
            onClick={cancelAdding}
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-9 w-full rounded-xl border-dashed text-xs font-semibold"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("payment.addMethod")}
        </Button>
      )}
    </div>
  )
}

