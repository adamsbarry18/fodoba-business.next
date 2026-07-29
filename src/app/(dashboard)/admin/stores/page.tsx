"use client"

import { useState, useEffect, useMemo } from "react"
import { DocumentSnapshot } from "firebase/firestore"
import { StoreService } from "@/services/store.service"
import { Store } from "@/lib/types"
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
  Plus,
  Edit,
  Power,
  PowerOff,
  Loader2,
  MapPin,
  Phone,
  Search,
  RefreshCw,
  Store as StoreIcon,
  Building2,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useStore } from "@/lib/contexts/StoreContext"
import { formatStoreCreatedAt, getStoreInitials } from "@/lib/store-utils"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { STORE_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { useT, useLocale } from "@/i18n/context"
import { matchesAnySearchField } from "@/lib/search-utils"
import { getDateLocale } from "@/i18n/get-date-locale"

const PAGE_SIZE = 50

const STORE_COLUMN_LABEL_KEYS: Record<string, string> = {
  store: "stores.colStore",
  contact: "stores.colContact",
  created: "stores.colCreated",
  status: "stores.colStatus",
  actions: "stores.colActions",
}

type ToggleTarget = {
  id: string
  name: string
  code: string
  active: boolean
}

export default function StoresAdminPage() {
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = getDateLocale(locale)

  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [toggleTarget, setToggleTarget] = useState<ToggleTarget | null>(null)
  const { refreshStores } = useStore()

  const loadStores = async (options?: { loadMore?: boolean; reset?: boolean }) => {
    const loadMore = options?.loadMore ?? false
    if (loadMore) setLoadingMore(true)
    else setLoading(true)

    try {
      const result = await StoreService.listStores(
        PAGE_SIZE,
        loadMore && !options?.reset ? lastDoc : undefined
      )

      if (loadMore) {
        setStores((prev) => [...prev, ...result.stores])
      } else {
        setStores(result.stores)
      }

      setLastDoc(result.lastVisible)
      setHasMore(result.stores.length === PAGE_SIZE)
    } catch {
      toast.error(t("stores.errorLoading"))
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
        const result = await StoreService.listStores(PAGE_SIZE)
        if (cancelled) return
        setStores(result.stores)
        setLastDoc(result.lastVisible)
        setHasMore(result.stores.length === PAGE_SIZE)
      } catch {
        if (!cancelled) toast.error(t("stores.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchInitial()
    return () => {
      cancelled = true
    }
  }, [t])

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      const matchesSearch = matchesAnySearchField(
        [store.name, store.code, store.address, store.phone],
        searchTerm
      )
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? store.active : !store.active)
      return matchesSearch && matchesStatus
    })
  }, [stores, searchTerm, statusFilter])

  const stats = useMemo(
    () => ({
      total: stores.length,
      active: stores.filter((s) => s.active).length,
      inactive: stores.filter((s) => !s.active).length,
    }),
    [stores]
  )

  const { isVisible, toggleColumn, resetColumns, columns: tableColumns } =
    useTranslatedTableColumns("stores", STORE_TABLE_COLUMNS, STORE_COLUMN_LABEL_KEYS)

  const listDescription =
    searchTerm || statusFilter !== "all"
      ? t("stores.listDescription", { filtered: filteredStores.length, total: stores.length })
      : t("stores.listDescriptionNoFilter", { filtered: filteredStores.length, total: stores.length })

  const handleRefresh = async () => {
    setLastDoc(undefined)
    setHasMore(true)
    await loadStores({ reset: true })
    await refreshStores()
  }

  const confirmToggleStatus = async () => {
    if (!toggleTarget) return

    setToggling(true)
    try {
      await StoreService.toggleStoreStatus(toggleTarget.id, !toggleTarget.active)
      toast.success(
        toggleTarget.active
          ? t("stores.suspended", { name: toggleTarget.name })
          : t("stores.reactivated", { name: toggleTarget.name })
      )
      setToggleTarget(null)
      await loadStores({ reset: true })
      await refreshStores()
    } catch {
      toast.error(t("stores.statusError"))
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <StoreIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("stores.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("stores.subtitle")}</p>
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
            {t("stores.refresh")}
          </Button>
          <Button asChild className="rounded-xl font-semibold">
            <Link href="/admin/stores/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("stores.newStore")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <Building2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("stores.statTotal")}
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("stores.statActive")}
              </p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 rounded-2xl border bg-card shadow-sm lg:col-span-1">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("stores.statInactive")}
              </p>
              <p className="text-2xl font-bold">{stats.inactive}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("stores.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 rounded-xl border-border pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as "all" | "active" | "inactive")
            }
          >
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-[180px]">
              <SelectValue placeholder={t("stores.filterStatus")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("stores.filterStatusAll")}</SelectItem>
              <SelectItem value="active">{t("stores.filterStatusActive")}</SelectItem>
              <SelectItem value="inactive">{t("stores.filterStatusInactive")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 p-4 sm:p-6">
          <div>
            <CardTitle className="text-base">{t("stores.listTitle")}</CardTitle>
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
          ) : filteredStores.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-muted-foreground">
              <StoreIcon className="h-10 w-10 opacity-30" />
              <p className="font-medium">{t("stores.noStoresFound")}</p>
              <p className="text-xs">
                {stores.length === 0
                  ? t("stores.noStoresDesc")
                  : t("stores.noStoresFilterDesc")}
              </p>
              {stores.length === 0 && (
                <Button asChild className="mt-2 rounded-xl">
                  <Link href="/admin/stores/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("stores.newStore")}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <VisibleTableColumn id="store" isVisible={isVisible}>
                      <TableHead className="pl-4 sm:pl-6">{t("stores.colStore")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="contact" isVisible={isVisible}>
                      <TableHead>{t("stores.colContact")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="created" isVisible={isVisible}>
                      <TableHead>{t("stores.colCreated")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="status" isVisible={isVisible}>
                      <TableHead>{t("stores.colStatus")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="actions" isVisible={isVisible}>
                      <TableHead className="pr-4 text-right sm:pr-6">{t("stores.colActions")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStores.map((store) => {
                    const createdAt = formatStoreCreatedAt(store.createdAt)

                    return (
                      <TableRow
                        key={store.id}
                        className="transition-colors hover:bg-muted/20"
                      >
                        <VisibleTableColumn id="store" isVisible={isVisible}>
                          <TableCell className="pl-4 sm:pl-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[10px] font-bold text-primary">
                                {getStoreInitials(store)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{store.name}</p>
                                <StatusBadge hashFromLabel className="mt-1 font-mono text-[10px]">
                                  {store.code}
                                </StatusBadge>
                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground sm:hidden">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{store.address}</span>
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="contact" isVisible={isVisible}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="line-clamp-1">{store.address}</span>
                              </p>
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3 shrink-0" />
                                {store.phone}
                              </p>
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="created" isVisible={isVisible}>
                          <TableCell className="text-xs text-muted-foreground">
                            {createdAt
                              ? format(createdAt, "dd MMM yyyy", { locale: dateLocale })
                              : "-"}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="status" isVisible={isVisible}>
                          <TableCell>
                            <StatusBadge
                              preset="activeState"
                              value={store.active ? "active" : "inactive"}
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
                                title={t("stores.edit")}
                              >
                                <Link href={`/admin/stores/${store.id}/edit`}>
                                  <Edit className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8 rounded-lg",
                                  store.active
                                    ? "text-destructive hover:text-destructive"
                                    : "text-primary hover:text-primary"
                                )}
                                onClick={() =>
                                  setToggleTarget({
                                    id: store.id,
                                    name: store.name,
                                    code: store.code,
                                    active: store.active,
                                  })
                                }
                                title={store.active ? t("stores.suspend") : t("stores.reactivate")}
                              >
                                {store.active ? (
                                  <PowerOff className="h-4 w-4" />
                                ) : (
                                  <Power className="h-4 w-4" />
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

          {hasMore && !loading && filteredStores.length > 0 && (
            <div className="flex justify-center border-t p-4">
              <Button
                variant="ghost"
                onClick={() => loadStores({ loadMore: true })}
                disabled={loadingMore}
                className="rounded-xl font-semibold"
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("stores.loadMore")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        key={toggleTarget?.id ?? "closed"}
        open={toggleTarget !== null}
        onOpenChange={(open) => !open && setToggleTarget(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.active
                ? t("stores.confirmSuspendTitle")
                : t("stores.confirmReactivateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.active
                ? t("stores.confirmSuspendDesc", {
                    name: toggleTarget.name,
                    code: toggleTarget.code,
                  })
                : t("stores.confirmReactivateDesc", {
                    name: toggleTarget?.name ?? "",
                    code: toggleTarget?.code ?? "",
                  })}
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
              {t("stores.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
