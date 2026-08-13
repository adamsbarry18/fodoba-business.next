import type { LucideIcon } from "lucide-react"
import {
  UserPlus,
  UserPen,
  UserCheck,
  UserX,
  Coins,
  ShieldAlert,
  Store,
} from "lucide-react"
import type { AuditAction, AuditCategory } from "@/lib/types"
import type { BadgeTone } from "@/lib/badge-tones"

export type AuditActionConfig = {
  labelKey: string
  tone: BadgeTone
  category: AuditCategory
  icon: LucideIcon
}

export const AUDIT_ACTION_CONFIG: Record<string, AuditActionConfig> = {
  CREATE_USER: {
    labelKey: "badges.auditAction.CREATE_USER",
    tone: "success",
    category: "user",
    icon: UserPlus,
  },
  UPDATE_USER: {
    labelKey: "badges.auditAction.UPDATE_USER",
    tone: "info",
    category: "user",
    icon: UserPen,
  },
  ACTIVATE_USER: {
    labelKey: "badges.auditAction.ACTIVATE_USER",
    tone: "success",
    category: "user",
    icon: UserCheck,
  },
  SUSPEND_USER: {
    labelKey: "badges.auditAction.SUSPEND_USER",
    tone: "destructive",
    category: "user",
    icon: UserX,
  },
  UPDATE_EXCHANGE_RATE: {
    labelKey: "badges.auditAction.UPDATE_EXCHANGE_RATE",
    tone: "warning",
    category: "currency",
    icon: Coins,
  },
  CREATE_STORE: {
    labelKey: "badges.auditAction.CREATE_STORE",
    tone: "success",
    category: "system",
    icon: Store,
  },
  UPDATE_STORE: {
    labelKey: "badges.auditAction.UPDATE_STORE",
    tone: "info",
    category: "system",
    icon: Store,
  },
  ACTIVATE_STORE: {
    labelKey: "badges.auditAction.ACTIVATE_STORE",
    tone: "success",
    category: "system",
    icon: Store,
  },
  SUSPEND_STORE: {
    labelKey: "badges.auditAction.SUSPEND_STORE",
    tone: "destructive",
    category: "system",
    icon: Store,
  },
}

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  user: "audit.category.user",
  currency: "audit.category.currency",
  system: "audit.category.system",
}

export function getAuditActionConfig(action: AuditAction): AuditActionConfig {
  return (
    AUDIT_ACTION_CONFIG[action] ?? {
      labelKey: action.replace(/_/g, " ").toLowerCase(),
      tone: "slate",
      category: "system",
      icon: ShieldAlert,
    }
  )
}

export function formatAuditPerformer(log: {
  performedBy: string
  performedByName?: string
}): string {
  if (log.performedByName) return log.performedByName
  if (log.performedBy === "system") return "Système"
  return log.performedBy
}
