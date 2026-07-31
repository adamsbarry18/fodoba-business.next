"use client"

import { useCallback } from "react"
import { useT } from "@/i18n/context"
import { resolvePaymentMethodDisplay } from "@/lib/constants/payment-methods"

export function usePaymentMethodLabel() {
  const t = useT()

  return useCallback(
    (method: string) => resolvePaymentMethodDisplay(method, (key) => t(key)),
    [t]
  )
}
