import type { LucideIcon } from "lucide-react"
import { Package, ShoppingCart, Truck, Info, CalendarClock } from "lucide-react"
import type { AppNotification, AppNotificationType } from "@/lib/types"
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns"
import type { Locale as DateFnsLocale } from "date-fns"

export type NotificationTab = "all" | "unread"

/** Types affichés / créés : alertes critiques uniquement */
export const IMPORTANT_NOTIFICATION_TYPES: readonly AppNotificationType[] = [
  "STOCK_ALERT",
  "EXPIRATION_ALERT",
] as const

export function isImportantNotification(notification: AppNotification): boolean {
  return IMPORTANT_NOTIFICATION_TYPES.includes(notification.type)
}

export const NOTIFICATION_TYPE_META: Record<
  AppNotificationType,
  { labelKey: string; Icon: LucideIcon }
> = {
  STOCK_ALERT: { labelKey: "badges.notificationType.STOCK_ALERT", Icon: Package },
  SALE: { labelKey: "badges.notificationType.SALE", Icon: ShoppingCart },
  PURCHASE: { labelKey: "badges.notificationType.PURCHASE", Icon: Truck },
  INFO: { labelKey: "badges.notificationType.INFO", Icon: Info },
  EXPIRATION_ALERT: { labelKey: "badges.notificationType.EXPIRATION_ALERT", Icon: CalendarClock },
}

export function toNotificationDate(ts: AppNotification["timestamp"]): Date | null {
  if (!ts) return null
  if (typeof ts === "object" && ts !== null && "toDate" in ts && typeof ts.toDate === "function") {
    return ts.toDate()
  }
  return new Date(ts as Date | string)
}

export function formatNotificationTime(
  ts: AppNotification["timestamp"],
  options: {
    locale: DateFnsLocale
    t: (key: string, values?: Record<string, string>) => string
  }
): string {
  const date = toNotificationDate(ts)
  if (!date) return ""

  const { locale, t } = options
  const time = format(date, "HH:mm")
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) return t("notifications.time.justNow")

  if (isToday(date)) {
    return formatDistanceToNow(date, { addSuffix: true, locale })
  }

  if (isYesterday(date)) {
    return t("notifications.time.yesterdayAt", { time })
  }

  if (diffMs < 7 * 24 * 60 * 60 * 1000) {
    return t("notifications.time.weekdayAt", {
      weekday: format(date, "EEEE", { locale }),
      time,
    })
  }

  return t("notifications.time.dateAt", {
    date: format(date, "d MMM yyyy", { locale }),
    time,
  })
}

export function filterNotifications(
  notifications: AppNotification[],
  tab: NotificationTab
): AppNotification[] {
  const important = notifications.filter(isImportantNotification)
  if (tab === "unread") return important.filter((n) => !n.read)
  return important
}

export function countUnread(notifications: AppNotification[]): number {
  return notifications.filter((n) => isImportantNotification(n) && !n.read).length
}
