"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { CurrencyCode, UserProfile } from "@/lib/types"
import { CurrencyService } from "@/services/currency.service"
import { useAuth } from "./AuthContext"
import {
  DEFAULT_RATES,
  STORAGE_CURRENCY,
  formatCurrencyValue,
  fromStorage,
  storageToReference,
  referenceToStorage,
  toStorage,
} from "@/lib/currency-utils"

interface CurrencyContextType {
  rates: Record<CurrencyCode, number>
  referenceCurrency: CurrencyCode
  loading: boolean
  refreshRates: () => Promise<void>
  refreshSettings: () => Promise<void>
  setReferenceCurrency: (code: CurrencyCode) => Promise<void>
  /** Formate un montant stocké en FCFA. Sans `code`, utilise la devise de référence. */
  formatAmount: (amountFcfa: number, code?: CurrencyCode) => string
  /** @deprecated Alias de toStorage — convertit vers FCFA */
  convertToRef: (amount: number, from: CurrencyCode) => number
  /** @deprecated Alias de fromStorage — convertit depuis FCFA */
  convertFromRef: (amount: number, to: CurrencyCode) => number
  toStorage: (amount: number, from: CurrencyCode) => number
  fromStorage: (amountFcfa: number, to: CurrencyCode) => number
  toReference: (amountFcfa: number) => number
  fromReference: (amountRef: number) => number
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [rates, setRates] = useState<Record<CurrencyCode, number>>({ ...DEFAULT_RATES })
  const [referenceCurrency, setReferenceCurrencyState] =
    useState<CurrencyCode>(STORAGE_CURRENCY)
  const [loading, setLoading] = useState(true)
  const { userProfile } = useAuth()

  const refreshRates = useCallback(async () => {
    try {
      const latestRates = await CurrencyService.getRates()
      setRates(latestRates)
    } catch (error) {
      console.error("Error loading exchange rates:", error)
    }
  }, [])

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await CurrencyService.getAppSettings()
      setReferenceCurrencyState(settings.referenceCurrency)
    } catch (error) {
      console.error("Error loading currency settings:", error)
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([refreshRates(), refreshSettings()])
    } finally {
      setLoading(false)
    }
  }, [refreshRates, refreshSettings])

  useEffect(() => {
    if (!userProfile?.uid) {
      setLoading(false)
      return
    }
    void loadAll()
  }, [userProfile?.uid, loadAll])

  const setReferenceCurrency = useCallback(
    async (code: CurrencyCode) => {
      if (!userProfile) {
        throw new Error("Utilisateur non connecté.")
      }
      await CurrencyService.setReferenceCurrency(code, userProfile as UserProfile)
      setReferenceCurrencyState(code)
    },
    [userProfile]
  )

  const toStorageFn = useCallback(
    (amount: number, from: CurrencyCode) => toStorage(amount, from, rates),
    [rates]
  )

  const fromStorageFn = useCallback(
    (amountFcfa: number, to: CurrencyCode) => fromStorage(amountFcfa, to, rates),
    [rates]
  )

  const toReferenceFn = useCallback(
    (amountFcfa: number) => storageToReference(amountFcfa, referenceCurrency, rates),
    [referenceCurrency, rates]
  )

  const fromReferenceFn = useCallback(
    (amountRef: number) => referenceToStorage(amountRef, referenceCurrency, rates),
    [referenceCurrency, rates]
  )

  const formatAmount = useCallback(
    (amountFcfa: number, code?: CurrencyCode) => {
      const target = code ?? referenceCurrency
      const value =
        target === STORAGE_CURRENCY
          ? amountFcfa
          : fromStorage(amountFcfa, target, rates)
      return formatCurrencyValue(value, target)
    },
    [referenceCurrency, rates]
  )

  const value = useMemo(
    () => ({
      rates,
      referenceCurrency,
      loading,
      refreshRates: loadAll,
      refreshSettings,
      setReferenceCurrency,
      formatAmount,
      convertToRef: toStorageFn,
      convertFromRef: fromStorageFn,
      toStorage: toStorageFn,
      fromStorage: fromStorageFn,
      toReference: toReferenceFn,
      fromReference: fromReferenceFn,
    }),
    [
      rates,
      referenceCurrency,
      loading,
      loadAll,
      refreshSettings,
      setReferenceCurrency,
      formatAmount,
      toStorageFn,
      fromStorageFn,
      toReferenceFn,
      fromReferenceFn,
    ]
  )

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  )
}

export const useCurrency = () => {
  const context = useContext(CurrencyContext)
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider")
  }
  return context
}
