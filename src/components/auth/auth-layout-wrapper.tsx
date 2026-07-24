"use client"

import { useAuth } from "@/lib/contexts/AuthContext"
import { useStore } from "@/lib/contexts/StoreContext"
import { LoadingScreen } from "@/components/ui/loading-screen"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import { useT } from "@/i18n/context"
import { resolveSafeNextPath } from "@/lib/auth/safe-next-path"

const PUBLIC_PATHS = ["/login", "/forgot-password"]

function AuthLayoutInner({ children }: { children: React.ReactNode }) {
  const { currentUser, loading: authLoading } = useAuth()
  const { loading: storeLoading } = useStore()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useT()

  const isPublicPath = PUBLIC_PATHS.includes(pathname)
  const isAuthenticated = Boolean(currentUser)
  const waitingForStore = isAuthenticated && !isPublicPath && storeLoading

  useEffect(() => {
    if (authLoading || waitingForStore) return

    if (!currentUser && !isPublicPath) {
      router.push("/login")
      return
    }

    if (currentUser && pathname === "/login") {
      router.push(resolveSafeNextPath(searchParams.get("next")))
    }
  }, [
    currentUser,
    authLoading,
    waitingForStore,
    pathname,
    router,
    isPublicPath,
    searchParams,
  ])

  if (authLoading || waitingForStore) {
    return (
      <LoadingScreen
        message={
          authLoading
            ? t("loading.sessionCheck")
            : t("loading.storeActivation")
        }
      />
    )
  }

  return <>{children}</>
}

export function AuthLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthLayoutInner>{children}</AuthLayoutInner>
    </Suspense>
  )
}
