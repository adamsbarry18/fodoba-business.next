"use client"

import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { NavItem } from "@/lib/navigation/app-nav"
import { useT } from "@/i18n/context"

export const appDropdownContentClass =
  "z-[200] w-56 min-w-[14rem] rounded-xl border bg-popover py-1 text-popover-foreground shadow-lg"

export const appDropdownItemClass = cn(
  "cursor-pointer gap-2.5 rounded-lg px-3 py-2.5 text-sm",
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground",
  "data-[highlighted]:bg-sidebar-accent data-[highlighted]:text-sidebar-accent-foreground"
)

export const appDropdownItemDestructiveClass = cn(
  appDropdownItemClass,
  "text-destructive focus:text-destructive data-[highlighted]:text-destructive"
)

interface NavIconBoxProps {
  icon: LucideIcon
  active?: boolean
  size?: "sm" | "md"
}

export function NavIconBox({ icon: Icon, active, size = "md" }: NavIconBoxProps) {
  const dim = size === "sm" ? "h-6 w-6" : "h-7 w-7"
  const iconDim = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md transition-colors",
        dim,
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground group-hover/menu-item:text-sidebar-accent-foreground"
      )}
    >
      <Icon className={iconDim} aria-hidden />
    </span>
  )
}

interface SidebarNavMenuItemProps {
  item: NavItem
  isActive: boolean
  onNavigate?: () => void
}

export function SidebarNavMenuItem({ item, isActive, onNavigate }: SidebarNavMenuItemProps) {
  const Icon = item.icon
  const t = useT()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={t(item.title)}
        className="h-9 gap-2.5 rounded-lg px-2.5"
      >
        <Link
          href={item.url}
          prefetch={false}
          onClick={onNavigate}
          aria-current={isActive ? "page" : undefined}
        >
          {isActive ? (
            <span
              className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
              aria-hidden
            />
          ) : null}
          <NavIconBox icon={Icon} active={isActive} />
          <span className="truncate font-medium">{t(item.title)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

interface AppDropdownNavItemProps {
  item: NavItem
  isActive?: boolean
  onNavigate?: () => void
}

export function AppDropdownNavItem({ item, isActive, onNavigate }: AppDropdownNavItemProps) {
  const Icon = item.icon
  const t = useT()

  return (
    <DropdownMenuItem asChild className={cn(appDropdownItemClass, isActive && "bg-accent/60 font-medium")}>
      <Link
        href={item.url}
        prefetch={false}
        className="flex cursor-pointer items-center gap-2.5"
        onClick={onNavigate}
      >
        <NavIconBox icon={Icon} active={isActive} size="sm" />
        <span className="min-w-0 flex-1 truncate">{t(item.title)}</span>
      </Link>
    </DropdownMenuItem>
  )
}

interface AppMobileNavLinkProps {
  item: NavItem
  isActive?: boolean
  onNavigate?: () => void
}

export function AppMobileNavLink({ item, isActive, onNavigate }: AppMobileNavLinkProps) {
  const Icon = item.icon
  const t = useT()

  return (
    <Link
      href={item.url}
      prefetch={false}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-popover-foreground outline-none transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "active:bg-sidebar-accent active:text-sidebar-accent-foreground",
        "focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground",
        isActive && "bg-accent/60 font-medium"
      )}
      onClick={onNavigate}
    >
      <NavIconBox icon={Icon} active={isActive} size="sm" />
      <span className="truncate">{t(item.title)}</span>
    </Link>
  )
}

interface AppHeaderIconButtonProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  badge?: number | string
}

export function AppHeaderIconButton({
  icon: Icon,
  label,
  onClick,
  badge,
}: AppHeaderIconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground transition-colors",
        "hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
      )}
      onClick={onClick}
      aria-label={label}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {badge != null && Number(badge) > 0 ? (
        <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[10px] font-bold text-white ring-2 ring-background">
          {typeof badge === "number" && badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  )
}
