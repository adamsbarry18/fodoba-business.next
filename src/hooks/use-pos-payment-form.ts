"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Client, PaymentMethod } from "@/lib/types"
import {
  PRIMARY_PAYMENT_METHODS,
  EMPTY_PAYMENT_AMOUNTS,
  buildSalePayments,
  isPrimaryPaymentMethod,
  normalizePaymentMethodInput,
  type PosPaymentMode,
} from "@/lib/constants/payment-methods"

export function usePosPaymentForm({
  total,
  selectedClientId,
  selectedClient,
}: {
  total: number
  selectedClientId: string
  selectedClient?: Client
}) {
  const [mode, setMode] = useState<PosPaymentMode>("comptant")
  const [comptantMethod, setComptantMethod] = useState<PaymentMethod>("CASH")
  const [amounts, setAmounts] = useState(EMPTY_PAYMENT_AMOUNTS())
  const [splitExtras, setSplitExtras] = useState<string[]>([])
  const [isAddingSplit, setIsAddingSplit] = useState(false)
  const [splitDraft, setSplitDraft] = useState("")
  const initializedTotal = useRef<number | null>(null)

  useEffect(() => {
    if (initializedTotal.current === total) return
    initializedTotal.current = total
    setMode("comptant")
    setComptantMethod("CASH")
    setAmounts({ ...EMPTY_PAYMENT_AMOUNTS(), CASH: String(total) })
    setSplitExtras([])
    setIsAddingSplit(false)
    setSplitDraft("")
  }, [total])

  useEffect(() => {
    if (mode === "credit" || mode === "partiel") {
      setAmounts(EMPTY_PAYMENT_AMOUNTS())
      return
    }
    if (mode === "comptant") {
      setAmounts({ ...EMPTY_PAYMENT_AMOUNTS(), [comptantMethod]: String(total) })
    }
    if (mode === "fractionne") {
      setSplitExtras([])
      setIsAddingSplit(false)
      setSplitDraft("")
    }
  }, [mode, comptantMethod, total])

  const { payments, debtAmount } = useMemo(
    () => buildSalePayments(mode, total, amounts, comptantMethod),
    [mode, total, amounts, comptantMethod]
  )

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0)
  const cashTendered = Number(amounts.CASH) || 0
  const cashApplied = payments.find((p) => p.method === "CASH")?.amount ?? 0
  const change =
    mode === "comptant" && comptantMethod === "CASH" && cashTendered > cashApplied
      ? cashTendered - cashApplied
      : mode === "fractionne" && cashTendered > cashApplied
        ? cashTendered - cashApplied
        : 0

  const needsClient = debtAmount > 0
  const hasClient = selectedClientId !== "none"
  const creditDisabled = !hasClient
  const creditExceeded =
    !!selectedClient &&
    selectedClient.creditCeiling > 0 &&
    debtAmount > 0 &&
    selectedClient.currentDebt + debtAmount > selectedClient.creditCeiling

  const canValidate = (() => {
    if (creditExceeded) return false
    switch (mode) {
      case "comptant":
        return debtAmount === 0 && totalPaid >= total
      case "partiel":
        return hasClient && totalPaid > 0 && debtAmount > 0
      case "credit":
        return hasClient && debtAmount === total
      case "fractionne":
        return needsClient ? hasClient : totalPaid >= total
      default:
        return false
    }
  })()

  useEffect(() => {
    if ((mode === "credit" || mode === "partiel") && creditDisabled) {
      setMode("comptant")
    }
  }, [mode, creditDisabled])

  const fillRemaining = (method: PaymentMethod) => {
    const remaining = Math.max(
      0,
      total -
        Object.entries(amounts).reduce((acc, [key, val]) => {
          if (key === method) return acc
          return acc + (Number(val) || 0)
        }, 0)
    )
    setAmounts((prev) => ({ ...prev, [method]: String(remaining) }))
  }

  const splitMethods = useMemo(
    () => [
      ...PRIMARY_PAYMENT_METHODS.map((m) => ({
        id: m.id,
        label: m.label,
        custom: false as const,
      })),
      ...splitExtras.map((id) => ({ id, label: id, custom: true as const })),
    ],
    [splitExtras]
  )

  const addSplitExtra = (method: string) => {
    if (isPrimaryPaymentMethod(method)) return
    setSplitExtras((prev) => (prev.includes(method) ? prev : [...prev, method]))
    setAmounts((prev) => ({ ...prev, [method]: prev[method] ?? "" }))
  }

  const confirmSplitCustom = () => {
    const normalized = normalizePaymentMethodInput(splitDraft)
    if (!normalized) return
    if (isPrimaryPaymentMethod(normalized)) {
      setSplitDraft("")
      setIsAddingSplit(false)
      return
    }
    addSplitExtra(normalized)
    setSplitDraft("")
    setIsAddingSplit(false)
  }

  const removeSplitExtra = (method: string) => {
    setSplitExtras((prev) => prev.filter((m) => m !== method))
    setAmounts((prev) => {
      const next = { ...prev }
      delete next[method]
      return next
    })
  }

  const setAmountFor = (method: PaymentMethod, value: string) => {
    setAmounts((prev) => ({ ...prev, [method]: value }))
  }

  return {
    mode,
    setMode,
    comptantMethod,
    setComptantMethod,
    amounts,
    setAmounts,
    setAmountFor,
    splitExtras,
    splitMethods,
    isAddingSplit,
    setIsAddingSplit,
    splitDraft,
    setSplitDraft,
    payments,
    debtAmount,
    totalPaid,
    change,
    needsClient,
    hasClient,
    creditDisabled,
    creditExceeded,
    canValidate,
    fillRemaining,
    confirmSplitCustom,
    removeSplitExtra,
  }
}
