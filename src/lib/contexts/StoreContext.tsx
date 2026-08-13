"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { Store, UserProfile } from "@/lib/types"
import { useAuth } from "./AuthContext"
import { StoreService } from "@/services/store.service"
import { toast } from "sonner"
import { useT } from "@/i18n/context"
import {
  clearLegacyActiveStoreKey,
  filterActiveStores,
  readSavedActiveStoreId,
  resolveActiveStore,
  writeSavedActiveStoreId,
} from "@/lib/store-utils"

interface StoreContextType {
  activeStore: Store | null
  availableStores: Store[]
  setActiveStoreById: (id: string) => void
  loading: boolean
  refreshStores: () => Promise<void>
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

async function fetchStoresForProfile(
  profile: UserProfile,
  isAdmin: boolean
): Promise<Store[]> {
  if (isAdmin) {
    const result = await StoreService.listStores(100)
    return result.stores
  }
  if (profile.storeIds?.length > 0) {
    return StoreService.getStoresByIds(profile.storeIds)
  }
  return []
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { userProfile, isAdmin } = useAuth()
  const t = useT()
  const [activeStore, setActiveStore] = useState<Store | null>(null)
  const [availableStores, setAvailableStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const loadGenerationRef = useRef(0)

  const applyStoreSelection = useCallback((profile: UserProfile, stores: Store[]) => {
    const preferredDefaultId =
      profile.storeIds?.find((id) => stores.some((store) => store.id === id)) ?? null
    const { store } = resolveActiveStore(
      stores,
      readSavedActiveStoreId(profile.uid),
      preferredDefaultId
    )

    setActiveStore((prev) => {
      if (prev?.id && store?.id === prev.id) {
        const fresh = stores.find((s) => s.id === prev.id)
        return fresh ?? store
      }
      return store
    })

    if (store) {
      writeSavedActiveStoreId(profile.uid, store.id)
    }
  }, [])

  const loadStoresForUser = useCallback(
    async (profile: UserProfile | null, admin: boolean) => {
      const generation = ++loadGenerationRef.current

      if (!profile) {
        setAvailableStores([])
        setActiveStore(null)
        setLoading(false)
        clearLegacyActiveStoreKey()
        return
      }

      setLoading(true)

      try {
        const stores = await fetchStoresForProfile(profile, admin)

        if (loadGenerationRef.current !== generation) return

        const selectableStores = filterActiveStores(stores)
        setAvailableStores(selectableStores)
        applyStoreSelection(profile, selectableStores)
      } catch (error) {
        if (loadGenerationRef.current !== generation) return
        console.error("Erreur lors du chargement des boutiques:", error)
        setAvailableStores([])
        setActiveStore(null)
      } finally {
        if (loadGenerationRef.current === generation) {
          setLoading(false)
        }
      }
    },
    [applyStoreSelection]
  )

  const storeIdsKey = userProfile?.storeIds?.join(",") ?? ""
  const profileUid = userProfile?.uid

  useEffect(() => {
    // Recharge seulement si uid / storeIds / rôle changent (pas à chaque nouvelle ref profil)
    void loadStoresForUser(userProfile, isAdmin)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identité userProfile volontairement ignorée
  }, [profileUid, isAdmin, storeIdsKey, loadStoresForUser])

  const setActiveStoreById = (id: string) => {
    const store = availableStores.find((s) => s.id === id)
    if (!store || !userProfile) return
    if (activeStore?.id === id) return

    setActiveStore(store)
    writeSavedActiveStoreId(userProfile.uid, id)
    toast.success(t("stores.switched", { name: store.name }), {
      id: "active-store",
    })
  }

  const refreshStores = useCallback(() => {
    return loadStoresForUser(userProfile, isAdmin)
  }, [loadStoresForUser, userProfile, isAdmin])

  return (
    <StoreContext.Provider
      value={{
        activeStore,
        availableStores,
        setActiveStoreById,
        loading,
        refreshStores,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export const useStore = () => {
  const context = useContext(StoreContext)
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider")
  }
  return context
}
