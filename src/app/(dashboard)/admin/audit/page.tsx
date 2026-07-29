
"use client"

import { useState, useEffect, useMemo, Fragment, useCallback } from "react"
import { DocumentSnapshot } from "firebase/firestore"
import { AuditService } from "@/services/audit.service"
import { AuditLog, AuditCategory } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ShieldCheck,
  Loader2,
  Search,
  Download,
  RefreshCw,
  Activity,
  CalendarDays,
  Users,
  Coins,
} from "lucide-react"
import { format, isToday, startOfDay } from "date-fns"
import { toast } from "sonner"
import Papa from "papaparse"
import { getAuditActionConfig } from "@/lib/audit-utils"
import { cn } from "@/lib/utils"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { AUDIT_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { useT, useLocale } from "@/i18n/context"
import { matchesAnySearchField } from "@/lib/search-utils"
import { getDateLocale } from "@/i18n/get-date-locale"

const PAGE_SIZE = 50

const AUDIT_COLUMN_LABEL_KEYS: Record<string, string> = {
  date: "audit.colDate",
  action: "audit.colAction",
  user: "audit.colUser",
  details: "audit.colDetails",
  target: "audit.colTarget",
}

const AUDIT_CATEGORIES: AuditCategory[] = ["user", "currency", "system"]

function toDate(ts: AuditLog["timestamp"]): Date | null {
  if (!ts) return null
  if (typeof ts === "object" && ts !== null && "toDate" in ts && typeof ts.toDate === "function") {
    return ts.toDate()
  }
  return new Date(ts as Date | string)
}

export default function AuditLogsPage() {
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = getDateLocale(locale)

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<AuditCategory | "all">("all")

  const getActionLabel = useCallback(
    (action: AuditLog["action"]) => {
      const key = `badges.auditAction.${action}` as const
      try {
        return t(key)
      } catch {
        return action.replace(/_/g, " ").toLowerCase()
      }
    },
    [t]
  )

  const loadMoreLogs = async () => {
    if (!lastDoc) return
    setLoadingMore(true)
    try {
      const result = await AuditService.listLogs(PAGE_SIZE, lastDoc)
      setLogs((prev) => [...prev, ...result.logs])
      setLastDoc(result.lastVisible)
      setHasMore(result.logs.length === PAGE_SIZE)
    } catch {
      toast.error(t("audit.errorLoading"))
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const fetchInitial = async () => {
      setLoading(true)
      try {
        const result = await AuditService.listLogs(PAGE_SIZE)
        if (cancelled) return
        setLogs(result.logs)
        setLastDoc(result.lastVisible)
        setHasMore(result.logs.length === PAGE_SIZE)
      } catch {
        if (!cancelled) toast.error(t("audit.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchInitial()
    return () => {
      cancelled = true
    }
  }, [t])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const config = getAuditActionConfig(log.action)
      const actionLabel = getActionLabel(log.action)
      const matchesCategory =
        categoryFilter === "all" || config.category === categoryFilter
      const matchesSearch = matchesAnySearchField(
        [
          log.details,
          log.action,
          actionLabel,
          log.performedByName,
          log.targetId,
        ],
        searchTerm
      )
      return matchesCategory && matchesSearch
    })
  }, [logs, searchTerm, categoryFilter, getActionLabel])

  const stats = useMemo(() => {
    const todayStart = startOfDay(new Date())
    const todayCount = logs.filter((log) => {
      const date = toDate(log.timestamp)
      return date && date >= todayStart
    }).length

    const byCategory = logs.reduce(
      (acc, log) => {
        const cat = getAuditActionConfig(log.action).category
        acc[cat] = (acc[cat] ?? 0) + 1
        return acc
      },
      {} as Record<AuditCategory, number>
    )

    return {
      total: logs.length,
      today: todayCount,
      userActions: byCategory.user ?? 0,
      currencyActions: byCategory.currency ?? 0,
    }
  }, [logs])

  const {
    isVisible,
    toggleColumn,
    resetColumns,
    columns: tableColumns,
    visibleColumnCount,
  } = useTranslatedTableColumns("audit", AUDIT_TABLE_COLUMNS, AUDIT_COLUMN_LABEL_KEYS)

  const listDescription =
    searchTerm || categoryFilter !== "all"
      ? t("audit.listDescription", { filtered: filteredLogs.length, total: logs.length })
      : t("audit.listDescriptionNoFilter", { filtered: filteredLogs.length, total: logs.length })

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      toast.error(t("audit.exportError"))
      return
    }

    const data = filteredLogs.map((log) => {
      const config = getAuditActionConfig(log.action)
      const date = toDate(log.timestamp)
      return {
        [t("audit.csvDate")]: date ? format(date, "dd/MM/yyyy HH:mm:ss") : "-",
        [t("audit.csvAction")]: getActionLabel(log.action),
        [t("audit.csvCategory")]: t(`audit.category.${config.category}`),
        [t("audit.csvUser")]: log.performedByName ?? log.performedBy,
        [t("audit.csvDetails")]: log.details,
        [t("audit.csvTarget")]: log.targetId ?? "",
      }
    })

    const csv = Papa.unparse(data)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute(
      "download",
      `audit_fodoba_${format(new Date(), "yyyyMMdd_HHmm")}.csv`
    )
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(t("audit.exportSuccess"))
  }

  const handleRefresh = async () => {
    setLoading(true)
    setLastDoc(undefined)
    setHasMore(true)
    try {
      const result = await AuditService.listLogs(PAGE_SIZE)
      setLogs(result.logs)
      setLastDoc(result.lastVisible)
      setHasMore(result.logs.length === PAGE_SIZE)
    } catch {
      toast.error(t("audit.errorLoading"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t("audit.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("audit.subtitle")}</p>
            </div>
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
            {t("audit.refresh")}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {t("audit.exportCsv")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <Activity className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("audit.statTotal")}
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("audit.statToday")}
              </p>
              <p className="text-2xl font-bold">{stats.today}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("audit.statUserActions")}
              </p>
              <p className="text-2xl font-bold">{stats.userActions}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <Coins className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("audit.statCurrencyActions")}
              </p>
              <p className="text-2xl font-bold">{stats.currencyActions}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("audit.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 rounded-xl border-border pl-9"
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as AuditCategory | "all")}
          >
            <SelectTrigger className="h-10 w-full rounded-xl sm:w-[220px]">
              <SelectValue placeholder={t("audit.filterCategory")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("audit.filterCategoryAll")}</SelectItem>
              {AUDIT_CATEGORIES.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`audit.category.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 p-4 sm:p-6">
          <div>
            <CardTitle className="text-base">{t("audit.listTitle")}</CardTitle>
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
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-muted-foreground">
              <ShieldCheck className="h-10 w-10 opacity-30" />
              <p className="font-medium">{t("audit.noEventsFound")}</p>
              <p className="text-xs">
                {logs.length === 0
                  ? t("audit.noEventsDesc")
                  : t("audit.noEventsFilterDesc")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <VisibleTableColumn id="date" isVisible={isVisible}>
                      <TableHead className="pl-4 sm:pl-6">{t("audit.colDate")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="action" isVisible={isVisible}>
                      <TableHead>{t("audit.colAction")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="user" isVisible={isVisible}>
                      <TableHead>{t("audit.colUser")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="details" isVisible={isVisible}>
                      <TableHead>{t("audit.colDetails")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="target" isVisible={isVisible}>
                      <TableHead className="pr-4 sm:pr-6">{t("audit.colTarget")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log, index) => {
                    const date = toDate(log.timestamp)
                    const prevDate = index > 0 ? toDate(filteredLogs[index - 1]!.timestamp) : null
                    const showDateHeader =
                      date &&
                      (!prevDate ||
                        format(date, "yyyy-MM-dd") !== format(prevDate, "yyyy-MM-dd"))
                    const config = getAuditActionConfig(log.action)
                    const ActionIcon = config.icon
                    const performer = log.performedByName ?? log.performedBy
                    const isSystem = log.performedBy === "system"

                    return (
                      <Fragment key={log.id}>
                        {showDateHeader && date && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell
                              colSpan={visibleColumnCount}
                              className="py-2 pl-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:pl-6"
                            >
                              {isToday(date)
                                ? t("audit.today")
                                : format(date, "EEEE d MMMM yyyy", { locale: dateLocale })}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow className="group transition-colors hover:bg-muted/20">
                          <VisibleTableColumn id="date" isVisible={isVisible}>
                            <TableCell className="whitespace-nowrap pl-4 sm:pl-6">
                              {date ? (
                                <div>
                                  <p className="text-xs font-semibold">
                                    {format(date, "dd MMM yyyy", { locale: dateLocale })}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {format(date, "HH:mm:ss")}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="action" isVisible={isVisible}>
                            <TableCell>
                              <StatusBadge
                                preset="auditAction"
                                value={log.action}
                                tone={config.tone}
                                icon={<ActionIcon className="h-3 w-3" />}
                                className="text-[10px]"
                              />
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="user" isVisible={isVisible}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                                  {isSystem ? (
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                  ) : (
                                    performer.charAt(0)
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">
                                    {isSystem ? t("audit.systemPerformer") : performer}
                                  </p>
                                  {!isSystem && log.performedByName && (
                                    <p className="truncate font-mono text-[9px] text-muted-foreground">
                                      {log.performedBy.slice(0, 8)}…
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="details" isVisible={isVisible}>
                            <TableCell>
                              <p className="max-w-md text-xs leading-relaxed">{log.details}</p>
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="target" isVisible={isVisible}>
                            <TableCell className="pr-4 sm:pr-6">
                              {log.targetId ? (
                                <p className="font-mono text-[10px] text-muted-foreground">
                                  {log.targetId}
                                </p>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </VisibleTableColumn>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {hasMore && !loading && filteredLogs.length > 0 && (
            <div className="flex justify-center border-t p-4">
              <Button
                variant="ghost"
                onClick={loadMoreLogs}
                disabled={loadingMore}
                className="rounded-xl font-semibold"
              >
                {loadingMore ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t("audit.loadMore")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
