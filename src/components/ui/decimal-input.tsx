"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  formatQuantity,
  isQuantityDraft,
  parseQuantityInput,
} from "@/lib/quantity-utils"
import { useLocale } from "@/i18n/context"

type InputProps = React.ComponentProps<typeof Input>

interface DecimalInputProps extends Omit<InputProps, "type" | "value" | "onChange"> {
  value: number
  onValueChange: (value: number) => void
  min?: number
  /** Si true, 0 s'affiche vide (saisie POS). */
  allowEmpty?: boolean
  onEmpty?: () => void
}

/**
 * Champ quantité décimale (0,5 / 10,5) : virgule ou point, brouillon pendant la saisie.
 */
export const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  function DecimalInput(
    {
      value,
      onValueChange,
      min = 0,
      allowEmpty = false,
      onEmpty,
      onBlur,
      onFocus,
      className,
      ...props
    },
    ref
  ) {
    const { locale } = useLocale()
    const [draft, setDraft] = React.useState<string | null>(null)
    const [focused, setFocused] = React.useState(false)

    const display =
      focused && draft !== null
        ? draft
        : allowEmpty && value === 0
          ? ""
          : formatQuantity(value, locale)

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        className={cn(className)}
        onFocus={(e) => {
          setFocused(true)
          e.target.select()
          onFocus?.(e)
        }}
        onChange={(e) => {
          const raw = e.target.value
          if (!isQuantityDraft(raw)) return
          setDraft(raw)
          if (raw.trim() === "") {
            onEmpty?.()
            if (!allowEmpty) onValueChange(0)
            return
          }
          const parsed = parseQuantityInput(raw)
          if (parsed === null) return
          if (parsed < min) return
          onValueChange(parsed)
        }}
        onBlur={(e) => {
          setFocused(false)
          setDraft(null)
          onBlur?.(e)
        }}
      />
    )
  }
)
