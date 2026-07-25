"use client"

import { useAuth } from "@/lib/contexts/AuthContext"
import { useStore } from "@/lib/contexts/StoreContext"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"
import { useT } from "@/i18n/context"

const PUBLIC_PATHS = ["/login", "/forgot-password"]

export function AuthLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { currentUser, loading: authLoading } = useAuth()
  const { loading: storeLoading } = useStore()
  const router = useRouter()
  const pathname = usePathname()
  const t = useT()

  const isPublicPath = PUBLIC_PATHS.includes(pathname)
  const isAuthenticated = Boolean(currentUser)
  // Une seule phase de boot : auth puis boutiques (même écran, même message)
  const bootstrapping =
    authLoading || (isAuthenticated && !isPublicPath && storeLoading)

  useEffect(() => {
    if (authLoading) return

    if (!currentUser && !isPublicPath) {
      router.replace("/login")
    }
    // Pas de redirect /login → app ici : la page login gère la navigation
    // (évite double window.location après submit + course cookie Safari).
  }, [currentUser, authLoading, router, isPublicPath])

  if (bootstrapping) {
    return <LoadingScreen message={t("loading.preparingWorkspace")} />
  }

  return <>{children}</>
}
