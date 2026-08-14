"use client"

import Link from "next/link"
import { ShieldOff } from "lucide-react"
import { ReactNode } from "react"
import { Permission } from "@/lib/auth/permissions"
import { usePermissions } from "@/hooks/use-permissions"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/context"

interface PermissionGateProps {
  children: ReactNode
  permission?: Permission
  permissions?: Permission[]
  requireAll?: boolean
  fallbackHref?: string
}

export function PermissionDenied({
  href = "/reports",
}: {
  href?: string
}) {
  const t = useT()

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center text-muted-foreground">
      <ShieldOff className="h-10 w-10 opacity-30" />
      <p className="max-w-md text-sm">{t("common.accessDenied")}</p>
      <Button asChild variant="outline" className="rounded-xl font-semibold">
        <Link href={href}>{t("common.back")}</Link>
      </Button>
    </div>
  )
}

/**
 * Protège une page entière : les enfants ne sont montés que si la permission est accordée.
 */
export function PermissionGate({
  children,
  permission,
  permissions,
  requireAll = false,
  fallbackHref = "/reports",
}: PermissionGateProps) {
  const { can, canAny } = usePermissions()

  const allowed = permission
    ? can(permission)
    : permissions
      ? requireAll
        ? permissions.every((item) => can(item))
        : canAny(permissions)
      : true

  if (!allowed) {
    return <PermissionDenied href={fallbackHref} />
  }

  return <>{children}</>
}
