import type { LucideIcon } from "lucide-react"
import { Shield, Store, UserRound } from "lucide-react"
import type { Role } from "@/lib/types"
import type { BadgeTone } from "@/lib/badge-tones"

export type RoleMeta = {
  value: Role
  labelKey: string
  shortLabelKey: string
  descriptionKey: string
  tone: BadgeTone
  icon: LucideIcon
}

export const ROLE_ORDER: Role[] = ["admin", "manager", "seller"]

export const ROLE_META: Record<Role, RoleMeta> = {
  admin: {
    value: "admin",
    labelKey: "users.roles.admin.label",
    shortLabelKey: "users.roles.admin.short",
    descriptionKey: "users.roles.admin.description",
    tone: "violet",
    icon: Shield,
  },
  manager: {
    value: "manager",
    labelKey: "users.roles.manager.label",
    shortLabelKey: "users.roles.manager.short",
    descriptionKey: "users.roles.manager.description",
    tone: "info",
    icon: Store,
  },
  seller: {
    value: "seller",
    labelKey: "users.roles.seller.label",
    shortLabelKey: "users.roles.seller.short",
    descriptionKey: "users.roles.seller.description",
    tone: "success",
    icon: UserRound,
  },
}

export function getRoleMeta(role: Role): RoleMeta {
  return ROLE_META[role]
}

export function getUserDisplayName(user: {
  firstName: string
  lastName: string
}): string {
  return `${user.firstName} ${user.lastName}`.trim()
}

/**
 * Déduit un prénom à partir de l'email Auth (ex. mamadou@gmail.com → Mamadou).
 */
export function extractFirstNameFromEmail(email: string): string {
  const localPart = email.split("@")[0]?.trim() ?? ""
  const token = localPart.split(/[._+\-]/).find((part) => part.length > 0) ?? localPart
  if (!token) return "Admin"
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

export function getUserInitials(user: {
  firstName: string
  lastName: string
}): string {
  const firstInitial = user.firstName?.charAt(0) ?? ""
  const lastInitial = user.lastName?.charAt(0) ?? ""
  return `${firstInitial}${lastInitial}`.toUpperCase() || "?"
}

export function getUserAvatarSeed(user: {
  uid?: string
  email?: string
  firstName?: string
  lastName?: string
}): string {
  return user.uid || user.email || `${user.firstName ?? ""}${user.lastName ?? ""}` || "user"
}

/** Couleur d'avatar stable et distincte par utilisateur (dérivée du seed). */
export function getUserAvatarStyle(seed: string): {
  backgroundColor: string
  color: string
} {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }

  const hue = Math.abs(hash) % 360
  const saturation = 58 + (Math.abs(hash >> 8) % 18)
  const lightness = 40 + (Math.abs(hash >> 16) % 14)

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    color: "#ffffff",
  }
}
