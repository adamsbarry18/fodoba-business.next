"use client"

import { useState, useEffect, useMemo } from "react"
import { DocumentSnapshot } from "firebase/firestore"
import { UserService } from "@/services/user.service"
import { StoreService } from "@/services/store.service"
import { UserProfile, Role, Store } from "@/lib/types"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  UserPlus,
  Edit,
  UserX,
  UserCheck,
  Loader2,
  Mail,
  Shield,
  Search,
  RefreshCw,
  Users,
  UserRound,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useAuth } from "@/lib/contexts/AuthContext"
import {
  getRoleMeta,
  getUserDisplayName,
  getUserInitials,
  ROLE_ORDER,
} from "@/lib/user-utils"
import { cn } from "@/lib/utils"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { USER_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { useT } from "@/i18n/context"
import { matchesAnySearchField } from "@/lib/search-utils"

const PAGE_SIZE = 50

const USER_COLUMN_LABEL_KEYS: Record<string, string> = {
  user: "users.colUser",
  role: "users.colRole",
  stores: "users.colStores",
  status: "users.colStatus",
  actions: "users.colActions",
}

type ToggleTarget = {
  uid: string
  name: string
  active: boolean
}

export default function UsersAdminPage() {
  const t = useT()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [toggleTarget, setToggleTarget] = useState<ToggleTarget | null>(null)
  const { userProfile: currentUser } = useAuth()

  const storeMap = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores]
  )

  const loadData = async (options?: { loadMore?: boolean; reset?: boolean }) => {
    const loadMore = options?.loadMore ?? false
    if (loadMore) setLoadingMore(true)
    else setLoading(true)

    try {
      const [usersResult, storesResult] = await Promise.all([
        UserService.listUsers(
          PAGE_SIZE,
          loadMore && !options?.reset ? lastDoc : undefined
        ),
        loadMore ? Promise.resolve({ stores }) : StoreService.listStores(100),
      ])

      if (loadMore) {
        setUsers((prev) => [...prev, ...usersResult.users])
      } else {
        setUsers(usersResult.users)
        setStores(storesResult.stores)
      }

      setLastDoc(usersResult.lastVisible)
      setHasMore(usersResult.users.length === PAGE_SIZE)
    } catch {
      toast.error(t("users.errorLoading"))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const fetchInitial = async () => {
      setLoading(true)
      try {
        const [usersResult, storesResult] = await Promise.all([
          UserService.listUsers(PAGE_SIZE),
          StoreService.listStores(100),
        ])
        if (cancelled) return
        setUsers(usersResult.users)
        setStores(storesResult.stores)
        setLastDoc(usersResult.lastVisible)
        setHasMore(usersResult.users.length === PAGE_SIZE)
      } catch {
        if (!cancelled) toast.error(t("users.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchInitial()
    return () => {
      cancelled = true
    }
  }, [t])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch = matchesAnySearchField(
        [getUserDisplayName(user), user.email, user.role],
        searchTerm
      )
      const matchesRole = roleFilter === "all" || user.role === roleFilter
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? user.active : !user.active)
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.active).length,
      suspended: users.filter((u) => !u.active).length,
      admins: users.filter((u) => u.role === "admin").length,
    }),
    [users]
  )

  const { isVisible, toggleColumn, resetColumns, columns: tableColumns } =
    useTranslatedTableColumns("users", USER_TABLE_COLUMNS, USER_COLUMN_LABEL_KEYS)

  const listDescription =
    searchTerm || roleFilter !== "all" || statusFilter !== "all"
      ? t("users.listDescription", { filtered: filteredUsers.length, total: users.length })
      : t("users.listDescriptionNoFilter", { filtered: filteredUsers.length, total: users.length })

  const handleRefresh = async () => {
    setLastDoc(undefined)
    setHasMore(true)
    await loadData({ reset: true })
  }

  const confirmToggleStatus = async () => {
    if (!toggleTarget) return
    if (toggleTarget.uid === currentUser?.uid) {
      toast.error(t("users.cannotSuspendSelf"))
      setToggleTarget(null)
      return
    }

    setToggling(true)
    try {
      await UserService.toggleUserStatus(toggleTarget.uid, !toggleTarget.active)
      toast.success(
        toggleTarget.active
          ? t("users.suspended", { name: toggleTarget.name })
          : t("users.reactivated", { name: toggleTarget.name })
      )
      setToggleTarget(null)
      await loadData({ reset: true })
    } catch {
      toast.error(t("users.statusError"))
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("users.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("users.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("users.refresh")}
          </Button>
          <Button asChild className="rounded-xl font-semibold">
            <Link href="/admin/users/new">
              <UserPlus className="mr-2 h-4 w-4" />
              {t("users.newUser")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <Users className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("users.statTotal")}
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("users.statActive")}
              </p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <UserX className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("users.statSuspended")}
              </p>
              <p className="text-2xl font-bold">{stats.suspended}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/40">
              <ShieldCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("users.statAdmins")}
              </p>
              <p className="text-2xl font-bold">{stats.admins}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("users.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 rounded-xl border-border pl-9"
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v as Role | "all")}
          >
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-[180px]">
              <SelectValue placeholder={t("users.filterRole")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("users.filterRoleAll")}</SelectItem>
              {ROLE_ORDER.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(`badges.userRole.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as "all" | "active" | "inactive")
            }
          >
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-[160px]">
              <SelectValue placeholder={t("users.filterStatus")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("users.filterStatusAll")}</SelectItem>
              <SelectItem value="active">{t("users.filterStatusActive")}</SelectItem>
              <SelectItem value="inactive">{t("users.filterStatusInactive")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 p-4 sm:p-6">
          <div>
            <CardTitle className="text-base">{t("users.listTitle")}</CardTitle>
            <CardDescription className="text-xs">{listDescription}</CardDescription>
          </div>
          <TableColumnToggle
            columns={tableColumns}
            isVisible={isVisible}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-muted-foreground">
              <UserRound className="h-10 w-10 opacity-30" />
              <p className="font-medium">{t("users.noUsersFound")}</p>
              <p className="text-xs">
                {users.length === 0
                  ? t("users.noUsersDesc")
                  : t("users.noUsersFilterDesc")}
              </p>
              {users.length === 0 && (
                <Button asChild className="mt-2 rounded-xl">
                  <Link href="/admin/users/new">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("users.newUser")}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <VisibleTableColumn id="user" isVisible={isVisible}>
                      <TableHead className="pl-4 sm:pl-6">{t("users.colUser")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="role" isVisible={isVisible}>
                      <TableHead>{t("users.colRole")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="stores" isVisible={isVisible}>
                      <TableHead>{t("users.colStores")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="status" isVisible={isVisible}>
                      <TableHead>{t("users.colStatus")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="actions" isVisible={isVisible}>
                      <TableHead className="pr-4 text-right sm:pr-6">{t("users.colActions")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const isSelf = user.uid === currentUser?.uid
                    const assignedStores = (user.storeIds ?? [])
                      .map((id) => storeMap.get(id))
                      .filter(Boolean) as Store[]

                    return (
                      <TableRow
                        key={user.uid}
                        className="transition-colors hover:bg-muted/20"
                      >
                        <VisibleTableColumn id="user" isVisible={isVisible}>
                          <TableCell className="pl-4 sm:pl-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {getUserInitials(user)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                  {getUserDisplayName(user)}
                                  {isSelf && (
                                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                                      {t("users.you")}
                                    </span>
                                  )}
                                </p>
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="role" isVisible={isVisible}>
                          <TableCell>
                            <StatusBadge
                              preset="userRole"
                              value={user.role}
                              icon={(() => {
                                const Icon = getRoleMeta(user.role).icon
                                return <Icon className="h-3 w-3" />
                              })()}
                              className="text-[10px]"
                            />
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="stores" isVisible={isVisible}>
                          <TableCell>
                            {user.role === "admin" ? (
                              <StatusBadge tone="slate" className="text-[10px]">
                                {t("users.allStores")}
                              </StatusBadge>
                            ) : assignedStores.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {assignedStores.slice(0, 2).map((store) => (
                                  <StatusBadge
                                    key={store.id}
                                    hashFromLabel
                                    className="text-[9px]"
                                  >
                                    {store.code}
                                  </StatusBadge>
                                ))}
                                {assignedStores.length > 2 && (
                                  <StatusBadge tone="slate" className="text-[9px]">
                                    +{assignedStores.length - 2}
                                  </StatusBadge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs italic text-muted-foreground">
                                {t("users.noStoreAssigned")}
                              </span>
                            )}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="status" isVisible={isVisible}>
                          <TableCell>
                            <StatusBadge
                              preset="activeState"
                              value={user.active ? "active" : "inactive"}
                              className="text-[10px]"
                            />
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="actions" isVisible={isVisible}>
                          <TableCell className="pr-4 text-right sm:pr-6">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                className="h-8 w-8 rounded-lg"
                                title={t("users.edit")}
                              >
                                <Link href={`/admin/users/${user.uid}/edit`}>
                                  <Edit className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8 rounded-lg",
                                  user.active
                                    ? "text-destructive hover:text-destructive"
                                    : "text-primary hover:text-primary"
                                )}
                                onClick={() =>
                                  setToggleTarget({
                                    uid: user.uid,
                                    name: getUserDisplayName(user),
                                    active: user.active,
                                  })
                                }
                                title={user.active ? t("users.suspend") : t("users.reactivate")}
                                disabled={isSelf}
                              >
                                {user.active ? (
                                  <UserX className="h-4 w-4" />
                                ) : (
                                  <UserCheck className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {hasMore && !loading && filteredUsers.length > 0 && (
            <div className="flex justify-center border-t p-4">
              <Button
                variant="ghost"
                onClick={() => loadData({ loadMore: true })}
                disabled={loadingMore}
                className="rounded-xl font-semibold"
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("users.loadMore")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        key={toggleTarget?.uid ?? "closed"}
        open={toggleTarget !== null}
        onOpenChange={(open) => !open && setToggleTarget(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.active
                ? t("users.confirmSuspendTitle")
                : t("users.confirmReactivateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.active
                ? t("users.confirmSuspendDesc", { name: toggleTarget.name })
                : t("users.confirmReactivateDesc", { name: toggleTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={toggling}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "rounded-xl",
                toggleTarget?.active && "bg-destructive hover:bg-destructive/90"
              )}
              onClick={(e) => {
                e.preventDefault()
                confirmToggleStatus()
              }}
              disabled={toggling}
            >
              {toggling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("users.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
