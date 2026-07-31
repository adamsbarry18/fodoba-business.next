
"use client"

import { useState, useEffect, useMemo } from "react"
import { ExpenseService } from "@/services/expense.service"
import { Expense } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Plus,
  Wallet,
  Loader2,
  User,
  Tag,
  Download,
  Search,
  FileText,
  TrendingDown,
  PieChart,
  RefreshCw,
  Receipt,
} from "lucide-react"
import { useStore } from "@/lib/contexts/StoreContext"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/contexts/AuthContext"
import { useCurrency } from "@/hooks/use-currency"
import Papa from "papaparse"
import { resolvePaymentMethodDisplay, PAYMENT_METHOD_OPTIONS } from "@/lib/constants/payment-methods"
import {
  EXPENSE_CATEGORIES,
  filterExpenses,
  getExpenseStats,
  toExpenseDate,
  type ExpenseCategoryFilter,
  type ExpenseMethodFilter,
} from "@/lib/expense-utils"
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog"
import { cn } from "@/lib/utils"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useTableColumns } from "@/hooks/use-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { TableListToolbar } from "@/components/ui/table-list-toolbar"
import { EXPENSE_TABLE_COLUMNS } from "@/lib/table-column-presets"

import { useT, useLocale } from "@/i18n/context"
import { getDateLocale } from "@/i18n/get-date-locale"

const PAGE_SIZE = 50

export default function ExpensesPage() {
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const { formatAmount } = useCurrency()
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = useMemo(() => getDateLocale(locale), [locale])

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategoryFilter>("all")
  const [methodFilter, setMethodFilter] = useState<ExpenseMethodFilter>("all")

  const loadExpenses = async () => {
    if (!activeStore) return
    setLoading(true)
    try {
      const data = await ExpenseService.listExpenses(activeStore.id)
      setExpenses(data)
    } catch {
      toast.error(t("common.error"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const storeId = activeStore?.id
    if (!storeId) {
      setExpenses([])
      setLoading(false)
      return
    }

    let cancelled = false

    const fetch = async () => {
      setLoading(true)
      try {
        const data = await ExpenseService.listExpenses(storeId)
        if (!cancelled) {
          setExpenses(data)
        }
      } catch {
        if (!cancelled) toast.error(t("common.error"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetch()
    return () => {
      cancelled = true
    }
  }, [activeStore?.id, t])

  const filteredExpenses = useMemo(
    () =>
      filterExpenses(expenses, {
        search: searchTerm,
        category: categoryFilter,
        method: methodFilter,
      }),
    [expenses, searchTerm, categoryFilter, methodFilter]
  )

  const filterKey = `${searchTerm}|${categoryFilter}|${methodFilter}`
  const {
    paginatedItems: visibleExpenses,
    page,
    setPage,
    totalPages,
    totalItems: filteredTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(filteredExpenses, { pageSize: PAGE_SIZE, resetKey: filterKey })

  const { isVisible, toggleColumn, resetColumns, columns: tableColumns } =
    useTableColumns("expenses", EXPENSE_TABLE_COLUMNS)

  const stats = useMemo(() => getExpenseStats(expenses), [expenses])

  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      toast.error(t("expenses.exportEmpty"))
      return
    }
    const data = filteredExpenses.map((e) => {
      const date = toExpenseDate(e.timestamp)
      return {
        [t("expenses.colDate")]: date ? format(date, "dd/MM/yyyy HH:mm") : "-",
        [t("expenses.colCategory")]: e.category,
        Label: e.label,
        [t("expenses.colAmount")]: e.amount,
        [t("expenses.colMethod")]: resolvePaymentMethodDisplay(e.method, (key) => t(key)),
        [t("expenses.colAuthor")]: e.performedByName,
        Notes: e.notes || "",
      }
    })
    const csv = Papa.unparse(data)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute(
      "download",
      `depenses_${activeStore?.code}_${format(new Date(), "yyyyMMdd")}.csv`
    )
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(t("expenses.exportSuccess"))
  }


  if (!activeStore) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <Wallet className="h-10 w-10 opacity-30" />
        <p>{t("expenses.selectStore")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("expenses.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("expenses.subtitle")}{" "}
              <strong className="text-foreground">{activeStore.name}</strong>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={loadExpenses}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={handleExportCSV}
            disabled={filteredExpenses.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {t("common.exportCsv")}
          </Button>
          <Button
            className="rounded-xl font-semibold"
            onClick={() => setDialogOpen(true)}
            disabled={!userProfile}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("expenses.newExpense")}
          </Button>
        </div>
      </div>

      {userProfile && (
        <ExpenseFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          storeId={activeStore.id}
          user={userProfile}
          onSuccess={loadExpenses}
        />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("expenses.statMonth")}
              </p>
              <p className="text-sm font-bold">
                {formatAmount(stats.totalThisMonth)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {t("expenses.statOperations", { count: stats.monthCount })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <PieChart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("expenses.statTopCategory")}
              </p>
              <p className="text-sm font-bold">{stats.topCategory}</p>
              <p className="text-[10px] text-muted-foreground">
                {formatAmount(stats.topCategoryAmount)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("expenses.statCount")}
              </p>
              <p className="text-2xl font-bold">{stats.count}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 rounded-2xl border bg-card shadow-sm lg:col-span-1">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <Receipt className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("expenses.statTotalCumulated")}
              </p>
              <p className="text-sm font-bold">{formatAmount(stats.totalAll)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("expenses.searchPlaceholder")}
              className="h-10 rounded-xl pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as ExpenseCategoryFilter)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder={t("expenses.filterCategory")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("expenses.filterCategoryAll")}</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={methodFilter}
            onValueChange={(v) => setMethodFilter(v as ExpenseMethodFilter)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder={t("expenses.filterMethod")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("expenses.filterMethodAll")}</SelectItem>
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {t(m.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardContent className="p-0">
          <TableListToolbar
            summary={
              !loading && filteredExpenses.length > 0
                ? t("expenses.countSummary", { count: filteredExpenses.length })
                : undefined
            }
            actions={
              <TableColumnToggle
                columns={tableColumns}
                isVisible={isVisible}
                onToggle={toggleColumn}
                onReset={resetColumns}
              />
            }
          />
          {loading ? (
            <div className="flex justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-semibold">{t("expenses.noExpensesFound")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {expenses.length === 0
                    ? t("expenses.emptyStateDesc")
                    : t("expenses.emptyStateFilterDesc")}
                </p>
              </div>
              {expenses.length === 0 && userProfile && (
                <Button
                  className="rounded-xl font-semibold"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("expenses.newExpense")}
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <VisibleTableColumn id="date" isVisible={isVisible}>
                      <TableHead>{t("expenses.colDate")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="category" isVisible={isVisible}>
                      <TableHead>{t("expenses.colCategory")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="method" isVisible={isVisible}>
                      <TableHead>{t("expenses.colMethod")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="author" isVisible={isVisible}>
                      <TableHead>{t("expenses.colAuthor")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="amount" isVisible={isVisible}>
                      <TableHead className="text-right">{t("expenses.colAmount")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleExpenses.map((e) => {
                    const date = toExpenseDate(e.timestamp)
                    return (
                      <TableRow key={e.id} className="group">
                        <VisibleTableColumn id="date" isVisible={isVisible}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {date
                              ? format(date, "dd/MM/yyyy HH:mm", { locale: dateLocale })
                              : "-"}
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="category" isVisible={isVisible}>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1.5 text-sm font-semibold">
                                <Tag className="h-3.5 w-3.5 text-primary" />
                                {e.category}
                              </span>
                              <span className="text-xs text-muted-foreground">{e.label}</span>
                              {e.notes && (
                                <StatusBadge tone="slate" className="mt-1 w-fit text-[10px]">
                                  {t("expenses.refLabel", { notes: e.notes })}
                                </StatusBadge>
                              )}
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="method" isVisible={isVisible}>
                          <TableCell>
                            <StatusBadge preset="paymentMethod" value={e.method} className="text-[10px]" />
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="author" isVisible={isVisible}>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <User className="h-3.5 w-3.5" />
                              {e.performedByName}
                            </div>
                          </TableCell>
                        </VisibleTableColumn>
                        <VisibleTableColumn id="amount" isVisible={isVisible}>
                          <TableCell className="text-right font-headline text-base font-bold text-destructive">
                            −{formatAmount(e.amount)}
                          </TableCell>
                        </VisibleTableColumn>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <TablePagination
                page={page}
                totalPages={totalPages}
                totalItems={filteredTotal}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
