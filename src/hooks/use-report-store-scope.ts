"use client"

import { useEffect, useMemo, useState } from "react"
import { useStore } from "@/lib/contexts/StoreContext"
import { usePermissions } from "@/hooks/use-permissions"
import {
  REPORT_ALL_STORES,
  resolveReportStoreQuery,
  reportStoreQueryToFilter,
} from "@/lib/report-utils"

/**
 * Filtre boutique des rapports, aligné sur le CDC :
 * admin = réseau entier ; gérant/vendeur = boutiques assignées uniquement.
 */
export function useReportStoreScope() {
  const { activeStore, availableStores } = useStore()
  const { can } = usePermissions()
  const canViewAllStores = can("view:reports:global")

  const authorizedStoreIds = useMemo(
    () => availableStores.map((store) => store.id),
    [availableStores]
  )

  const defaultStoreId = canViewAllStores
    ? REPORT_ALL_STORES
    : (activeStore?.id ?? authorizedStoreIds[0] ?? REPORT_ALL_STORES)

  const [storeId, setStoreId] = useState(defaultStoreId)

  useEffect(() => {
    setStoreId((prev) => {
      if (prev === REPORT_ALL_STORES) {
        if (canViewAllStores || authorizedStoreIds.length > 1) return prev
        return authorizedStoreIds[0] ?? prev
      }
      if (canViewAllStores || authorizedStoreIds.includes(prev)) return prev
      return defaultStoreId
    })
  }, [authorizedStoreIds, canViewAllStores, defaultStoreId])

  const query = useMemo(
    () =>
      resolveReportStoreQuery({
        selectedStoreId: storeId,
        authorizedStoreIds,
        canViewAllStores,
      }),
    [authorizedStoreIds, canViewAllStores, storeId]
  )

  const filter = useMemo(() => reportStoreQueryToFilter(query), [query])

  const showStoreFilter = canViewAllStores || availableStores.length > 1
  const showAllOption = canViewAllStores || availableStores.length > 1

  return {
    storeId,
    setStoreId,
    stores: availableStores,
    query,
    filter,
    showStoreFilter,
    showAllOption,
    canViewAllStores,
  }
}
